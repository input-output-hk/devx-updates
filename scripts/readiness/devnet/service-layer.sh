#!/usr/bin/env bash
# Run cardano-db-sync 13.7.2.1 on Postgres 16 against the running devnet, then Blockfrost RYO v6.8.1 on its database,
# and print what each serves next to the node's tip. Needs docker and gh; start.sh must be running.
# Leaves the containers dijkstra-dbsync-pg and dijkstra-blockfrost running; `./service-layer.sh stop` removes them.
set -uo pipefail
. "$(dirname "$0")/env.sh"
S=$DEVNET_DIR/services/db-sync BF=$DEVNET_DIR/services/blockfrost
if [ "${1:-}" = stop ]; then
  pkill -x cardano-db-sync; docker rm -f dijkstra-blockfrost dijkstra-dbsync-pg >/dev/null 2>&1; exit 0
fi
mkdir -p "$S/state" "$BF/genesis"
if [ ! -x "$S/bin/cardano-db-sync" ]; then
  gh release download 13.7.2.1 -R IntersectMBO/cardano-db-sync -p 'cardano-db-sync-13.7.2.1-linux.tar.gz' -D "$S" --clobber
  tar xzf "$S/cardano-db-sync-13.7.2.1-linux.tar.gz" -C "$S" && rm "$S/cardano-db-sync-13.7.2.1-linux.tar.gz"
fi

# db-sync needs every genesis hash in the node config, and Shelley's systemStart equal to Byron's whole-second
# startTime; cardano-testnet writes it with the fraction, so db-sync gets a copy rounded to Byron's second (0.x s off).
byron_start=$(jq -r .startTime "$E/byron-genesis.json")
jq --arg st "$(date -u -d "@$byron_start" +%Y-%m-%dT%H:%M:%SZ)" '.systemStart = $st' "$E/shelley-genesis.json" > "$S/shelley-genesis.json"
h() { "$B/cardano-cli" hash genesis-file --genesis "$1"; }
jq --arg e "$E" --arg s "$S" \
   --arg by "$("$B/cardano-cli" byron genesis print-genesis-hash --genesis-json "$E/byron-genesis.json")" \
   --arg sh "$(h "$S/shelley-genesis.json")" --arg al "$(h "$E/alonzo-genesis.json")" \
   --arg co "$(h "$E/conway-genesis.json")" --arg dj "$(h "$E/dijkstra-genesis.json")" \
   '.ByronGenesisFile = $e + "/byron-genesis.json" | .ShelleyGenesisFile = $s + "/shelley-genesis.json"
    | .AlonzoGenesisFile = $e + "/alonzo-genesis.json" | .ConwayGenesisFile = $e + "/conway-genesis.json"
    | .DijkstraGenesisFile = $e + "/dijkstra-genesis.json"
    | .ByronGenesisHash = $by | .ShelleyGenesisHash = $sh | .AlonzoGenesisHash = $al | .ConwayGenesisHash = $co
    | .DijkstraGenesisHash = $dj' "$E/configuration.yaml" > "$S/node-config.json"
cat > "$S/config.yaml" <<YAML
NetworkName: devnet
EnableLogging: True
EnableLogMetrics: False
NodeConfigFile: $S/node-config.json
PrometheusPort: 8089
RequiresNetworkMagic: RequiresMagic
minSeverity: Info
setupBackends: [KatipBK]
defaultBackends: [KatipBK]
setupScribes: [{scKind: StdoutSK, scName: stdout, scFormat: ScText, scRotation: null}]
defaultScribes: [[StdoutSK, stdout]]
options: {mapBackends: {}, mapSubtrace: {}}
YAML
echo '127.0.0.1:5433:dbsync:postgres:devnet' > "$S/pgpass" && chmod 600 "$S/pgpass"

docker rm -f dijkstra-dbsync-pg >/dev/null 2>&1
docker run -d --name dijkstra-dbsync-pg -e POSTGRES_PASSWORD=devnet -e POSTGRES_DB=dbsync -p 127.0.0.1:5433:5432 postgres:16 >/dev/null
until docker exec dijkstra-dbsync-pg pg_isready -U postgres -d dbsync >/dev/null 2>&1; do sleep 1; done; sleep 2
rm -rf "$S/state" && mkdir -p "$S/state"
(cd "$S" && PGPASSFILE="$S/pgpass" exec ./bin/cardano-db-sync --config config.yaml --socket-path "$SOCKET" \
   --state-dir state --schema-dir schema > dbsync.log 2>&1) &
sleep 150
psql() { docker exec dijkstra-dbsync-pg psql -U postgres -d dbsync -tAc "$1"; }
echo "node tip: $(cli query tip "${M[@]}" | jq -c '{epoch, era, block}')"
echo "db-sync $(pgrep -x cardano-db-sync >/dev/null && echo running || echo exited); blocks indexed: $(psql 'select count(*) from block where block_no is not null'), highest: $(psql 'select max(block_no) from block'), epoch_param rows: $(psql 'select count(*) from epoch_param')"
echo "db-sync chain-sync decoder failures: $(grep -c 'ChainSyncWithBlocksPtcl: DecoderFailure' "$S/dbsync.log")"
grep -m1 'ChainSyncWithBlocksPtcl: DecoderFailure' "$S/dbsync.log" | grep -oE 'ServerHasAgency.*'
echo "last db-sync log line at: $(tail -1 "$S/dbsync.log" | grep -oE '[0-9]{4}-[0-9-]+ [0-9:.]+ UTC')"

# Blockfrost's custom network reads its own genesis summary.
jq -n --slurpfile s "$E/shelley-genesis.json" --slurpfile b "$E/byron-genesis.json" '$s[0] as $s |
  {active_slots_coefficient: $s.activeSlotsCoeff, update_quorum: $s.updateQuorum,
   max_lovelace_supply: ($s.maxLovelaceSupply | tostring), network_magic: $s.networkMagic, epoch_length: $s.epochLength,
   system_start: $b[0].startTime, slots_per_kes_period: $s.slotsPerKESPeriod, slot_length: $s.slotLength,
   max_kes_evolutions: $s.maxKESEvolutions, security_param: $s.securityParam}' > "$BF/genesis/genesis.json"
jq -n --slurpfile b "$E/byron-genesis.json" '$b[0].protocolConsts.k as $k |
  {epoch_length: ($k * 10), slot_length: (($b[0].blockVersionData.slotDuration | tonumber) / 1000), safe_zone: ($k * 2), end_epoch: 0}' \
  > "$BF/genesis/byron_genesis.json"
docker rm -f dijkstra-blockfrost >/dev/null 2>&1
docker run -d --name dijkstra-blockfrost --network host -e BLOCKFROST_CONFIG_SERVER_LISTEN_ADDRESS=127.0.0.1 \
  -e BLOCKFROST_CONFIG_SERVER_PORT=3100 -e BLOCKFROST_CONFIG_DBSYNC_HOST=127.0.0.1 -e BLOCKFROST_CONFIG_DBSYNC_PORT=5433 \
  -e BLOCKFROST_CONFIG_DBSYNC_USER=postgres -e BLOCKFROST_CONFIG_DBSYNC_PASSWORD=devnet -e PGPASSWORD=devnet \
  -e BLOCKFROST_CONFIG_DBSYNC_DATABASE=dbsync -e BLOCKFROST_CONFIG_NETWORK=custom \
  -e BLOCKFROST_CONFIG_GENESIS_DATA_FOLDER=/genesis -v "$BF/genesis:/genesis:ro" blockfrost/backend-ryo:v6.8.1 >/dev/null
until curl -s -m 2 -o /dev/null http://127.0.0.1:3100/health; do sleep 2; done
for p in /blocks/latest /epochs/latest/parameters /network/eras; do
  echo "blockfrost $p: $(curl -s -m 15 http://127.0.0.1:3100$p | jq -c 'if type == "array" then map({end: .end.epoch}) else {height, slot, epoch, protocol_major_ver} | with_entries(select(.value != null)) end')"
done
