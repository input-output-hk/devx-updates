#!/usr/bin/env bash
# Run cardano-db-sync on Postgres 16 against the running devnet, then Blockfrost RYO on its database, and print what
# each serves next to the node's tip. Needs docker and gh; start.sh must be running.
# DBSYNC_VERSION (default 13.7.2.1) and BLOCKFROST_IMAGE (default the v6.8.2 digest) pick the versions under test;
# the defaults reproduce the 2026-11-01 run.
# Leaves the containers dijkstra-dbsync-pg and dijkstra-blockfrost running; `./service-layer.sh stop` removes them.
set -uo pipefail
. "$(dirname "$0")/env.sh"
DBSYNC_VERSION=${DBSYNC_VERSION:-13.7.2.1}
BLOCKFROST_IMAGE=${BLOCKFROST_IMAGE:-blockfrost/backend-ryo:v6.8.2@sha256:bb76e13e357ebb93a28bd6d2f56f0ca9b763f1e5f2e3f87eed6174fe7d79161a}
S=$DEVNET_DIR/services/db-sync-$DBSYNC_VERSION BF=$DEVNET_DIR/services/blockfrost
# The release asset was renamed in 13.8.0.0, which also replaced the iohk-monitoring logging keys with TraceOptions.
case $DBSYNC_VERSION in 13.[0-7].*) ASSET=cardano-db-sync-$DBSYNC_VERSION-linux.tar.gz NEW_LOGGING= ;;
  *) ASSET=cardano-db-sync-$DBSYNC_VERSION-linux-amd64.tar.gz NEW_LOGGING=1 ;; esac
if [ "${1:-}" = stop ]; then
  if [ -f "$S/pid" ]; then
    dbsync_pid=$(cat "$S/pid")
    if [ "$(readlink "/proc/$dbsync_pid/exe" 2>/dev/null)" = "$S/bin/cardano-db-sync" ]; then kill "$dbsync_pid"; fi
    rm -f "$S/pid"
  fi
  docker rm -f dijkstra-blockfrost dijkstra-dbsync-pg >/dev/null 2>&1; exit 0
fi
mkdir -p "$S/state" "$BF/genesis"
# BLOCKFROST_ONLY=1 skips db-sync and serves the database a previous run left in dijkstra-dbsync-pg.
if [ -z "${BLOCKFROST_ONLY:-}" ]; then
if [ ! -x "$S/bin/cardano-db-sync" ]; then
  gh release download "$DBSYNC_VERSION" -R IntersectMBO/cardano-db-sync -p "$ASSET" -D "$S" --clobber
  tar xzf "$S/$ASSET" -C "$S" && rm "$S/$ASSET"
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
    | .DijkstraGenesisHash = $dj
    | .["LastKnownBlockVersion-Major"] = 3 | .["LastKnownBlockVersion-Minor"] = 0
    | .["LastKnownBlockVersion-Alt"] = 0' "$SERVICE_CONFIG" > "$S/node-config.json"
if [ -n "$NEW_LOGGING" ]; then
cat > "$S/config.yaml" <<YAML
NetworkName: devnet
EnableLogging: True
EnableLogMetrics: False
NodeConfigFile: $S/node-config.json
PrometheusPort: 8089
RequiresNetworkMagic: RequiresMagic
TraceOptions:
  "": {severity: Info, detail: DNormal, backends: [Stdout HumanFormatUncoloured]}
  Mux: {severity: Error}
  Subscription: {severity: Error}
YAML
else
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
fi
echo '127.0.0.1:5433:dbsync:postgres:devnet' > "$S/pgpass" && chmod 600 "$S/pgpass"

docker rm -f dijkstra-dbsync-pg >/dev/null 2>&1
docker run -d --name dijkstra-dbsync-pg -e POSTGRES_PASSWORD=devnet -e POSTGRES_DB=dbsync -p 127.0.0.1:5433:5432 postgres:16@sha256:5db6dac2ef5dcff512f4f00a009c3c332b9f2f28f24277175bf3e4a3d02ef83a >/dev/null
until docker exec dijkstra-dbsync-pg pg_isready -U postgres -d dbsync >/dev/null 2>&1; do sleep 1; done; sleep 2
rm -rf "$S/state" && mkdir -p "$S/state"
(cd "$S" && PGPASSFILE="$S/pgpass" exec ./bin/cardano-db-sync --config config.yaml --socket-path "$SOCKET" \
   --state-dir state --schema-dir schema > dbsync.log 2>&1) &
dbsync_pid=$!
printf '%s\n' "$dbsync_pid" > "$S/pid"
sleep 2
kill -0 "$dbsync_pid" 2>/dev/null || { cat "$S/dbsync.log" >&2; exit 1; }
sleep 150
psql() { docker exec dijkstra-dbsync-pg psql -U postgres -d dbsync -tAc "$1"; }
echo "node tip: $(cli query tip "${M[@]}" | jq -c '{epoch, era, block}')"
echo "db-sync $(kill -0 "$dbsync_pid" 2>/dev/null && echo running || echo exited); blocks indexed: $(psql 'select count(*) from block where block_no is not null'), highest: $(psql 'select max(block_no) from block'), epoch_param rows: $(psql 'select count(*) from epoch_param')"
echo "db-sync $DBSYNC_VERSION chain-sync decoder failures: $(grep -c 'DecoderFailure' "$S/dbsync.log")"
grep -m1 'DecoderFailure' "$S/dbsync.log" | grep -oE 'ServerHasAgency.*'
echo "db-sync errors logged: $(grep -ciE '\b(error|exception)\b' "$S/dbsync.log")"; grep -m3 -iE '\b(error|exception)\b' "$S/dbsync.log" | cut -c1-300
echo "last db-sync log line at: $(tail -1 "$S/dbsync.log" | grep -oE '[0-9]{4}-[0-9-]+ [0-9:.]+ UTC|[0-9]{4}-[0-9-]+ [0-9:.]+Z')"
fi
psql() { docker exec dijkstra-dbsync-pg psql -U postgres -d dbsync -tAc "$1"; }

# Blockfrost's custom network reads its own genesis summary.
jq -n --slurpfile s "$E/shelley-genesis.json" --slurpfile b "$E/byron-genesis.json" '$s[0] as $s |
  {active_slots_coefficient: $s.activeSlotsCoeff, update_quorum: $s.updateQuorum,
   max_lovelace_supply: ($s.maxLovelaceSupply | tostring), network_magic: $s.networkMagic, epoch_length: $s.epochLength,
   system_start: $b[0].startTime, slots_per_kes_period: $s.slotsPerKESPeriod, slot_length: $s.slotLength,
   max_kes_evolutions: $s.maxKESEvolutions, security_param: $s.securityParam}' > "$BF/genesis/genesis.json"
jq -n --slurpfile b "$E/byron-genesis.json" '$b[0].protocolConsts.k as $k |
  {epoch_length: ($k * 10), slot_length: (($b[0].blockVersionData.slotDuration | tonumber) / 1000), safe_zone: ($k * 2), end_epoch: 0}' \
  > "$BF/genesis/byron_genesis.json"
# From v7 the image ships no config directory, so the BLOCKFROST_CONFIG_* variables are not read; mount the same
# settings as a config file instead. v6 images keep their own config directory and read the variables.
cfg=()
case $BLOCKFROST_IMAGE in *:v6.*) ;; *)
  mkdir -p "$BF/config"
  # The image's config loader has no YAML parser, so the file is JSON.
  jq -n '{server: {listenAddress: "127.0.0.1", port: 3100, debug: false},
    dbSync: {host: "127.0.0.1", port: 5433, user: "postgres", password: "devnet", database: "dbsync", maxConnections: 5},
    network: "custom", genesisDataFolder: "/genesis", tokenRegistryUrl: "https://tokens.cardano.org",
    tokenRegistryEnabled: false, mithril: {enabled: false}}' > "$BF/config/default.json"
  cfg=(-v "$BF/config:/app/config:ro") ;;
esac
docker rm -f dijkstra-blockfrost >/dev/null 2>&1
docker run -d --name dijkstra-blockfrost "${cfg[@]}" --network host -e BLOCKFROST_CONFIG_SERVER_LISTEN_ADDRESS=127.0.0.1 \
  -e BLOCKFROST_CONFIG_SERVER_PORT=3100 -e BLOCKFROST_CONFIG_DBSYNC_HOST=127.0.0.1 -e BLOCKFROST_CONFIG_DBSYNC_PORT=5433 \
  -e BLOCKFROST_CONFIG_DBSYNC_USER=postgres -e BLOCKFROST_CONFIG_DBSYNC_PASSWORD=devnet -e PGPASSWORD=devnet \
  -e BLOCKFROST_CONFIG_DBSYNC_DATABASE=dbsync -e BLOCKFROST_CONFIG_NETWORK=custom \
  -e BLOCKFROST_CONFIG_GENESIS_DATA_FOLDER=/genesis -v "$BF/genesis:/genesis:ro" "$BLOCKFROST_IMAGE" >/dev/null
echo "blockfrost image: $BLOCKFROST_IMAGE"
until curl -s -m 2 -o /dev/null http://127.0.0.1:3100/health; do sleep 2; done
for p in /blocks/latest /epochs/latest/parameters /network/eras; do
  echo "blockfrost $p: $(curl -s -m 15 http://127.0.0.1:3100$p | jq -c 'if type == "array" then map({end: .end.epoch}) else {height, slot, epoch, protocol_major_ver} | with_entries(select(.value != null)) end')"
done

# Each submitted test transaction: indexed by db-sync, and served by Blockfrost.
for f in "$DEVNET_DIR"/work/tx/*.signed "$DEVNET_DIR"/work/adv/*.signed; do
  [ -f "$f" ] || continue
  name=$(basename "$f" .signed); [ "$name" = sub ] && continue
  id=$(cli transaction txid --tx-file "$f" | jq -r .txhash)
  printf '%-36s db-sync %s; blockfrost %s\n' "$name" \
    "$(psql "select case when count(*) > 0 then 'indexed' else 'missing' end from tx where hash = '\\x$id'")" \
    "$(curl -s -m 15 "http://127.0.0.1:3100/txs/$id" | jq -r 'if .hash then "block \(.block_height)" else (.message // .error // "no answer") end')"
done
