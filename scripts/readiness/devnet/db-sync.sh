#!/usr/bin/env bash
# Run one cardano-db-sync build (any binary: a release, a nix build of master or a branch) against the Dijkstra devnet and report what it indexed.
#
#   db-sync.sh run    NAME BIN SCHEMA_DIR   # fresh Postgres + db-sync from genesis; waits until exit or WAIT secs
#   db-sync.sh resume NAME                  # add plutusV4 to scripttype by hand (workaround) and restart db-sync
#   db-sync.sh report NAME                  # per-transaction and per-feature results from the database
#   db-sync.sh stop   NAME
#
# Chain: start.sh, hardfork.sh 11/12, transactions.sh, advanced.sh, `blockfrost.sh spend-sub` (scripts/readiness/devnet).
# LEGACY_LOGGING=1 for builds older than 13.8.0.0 (iohk-monitoring config); PGPORT_HOST (default 5434) and WAIT (s).
set -uo pipefail
export DEVNET_DIR=${DEVNET_DIR:-/tmp/dijkstra-11.2.1}
R=$(cd "$(dirname "$0")" && pwd)
. "$R/env.sh"
cmd=${1:?}; NAME=${2:?}
S=$DEVNET_DIR/services/db-sync-$NAME PG=dj-dbsync-pg-$NAME
PORT=${PGPORT_HOST:-5434}
WAIT=${WAIT:-180}
psql() { docker exec "$PG" psql -U postgres -d dbsync -tAc "$1"; }
txid() { cli transaction txid --tx-file "$1" | jq -r .txhash; }
subtx_id() { jq -r .cborHex "$DEVNET_DIR/work/adv/sub.signed" | python3 -I "$R/txid.py" | cut -c1-64; }

start_dbsync() {  # LOGFILE
  (cd "$S" && PGPASSFILE="$S/pgpass" exec ./bin/cardano-db-sync --config config.yaml --socket-path "$SOCKET" \
     --state-dir state --schema-dir schema > "$1" 2>&1) &
  printf '%s\n' "$!" > "$S/pid"
  local pid=$!
  for _ in $(seq 1 "$WAIT"); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  echo "node tip: $(cli query tip "${M[@]}" | jq -c '{epoch, era, block, slot}')"
  echo "db-sync $(kill -0 "$pid" 2>/dev/null && echo "still running after ${WAIT}s" || echo exited)"
  echo "blocks indexed: $(psql 'select count(*) from block where block_no is not null'), highest block_no: $(psql 'select max(block_no) from block'), highest slot: $(psql 'select max(slot_no) from block')"
  echo "schema_version: $(psql 'select stage_one, stage_two, stage_three from schema_version' | tr '|' ' ')"
  echo "decoder failures: $(grep -c 'DecoderFailure' "$1")"
  echo "error/exception lines: $(grep -ciE '\b(error|exception)\b' "$1")"
  grep -m4 -iE '\b(error|exception)\b' "$1" | cut -c1-700
}

case $cmd in
  run)
    BIN=${3:?} SCHEMA=${4:?}
    mkdir -p "$S/bin"
    ln -sfn "$BIN" "$S/bin/cardano-db-sync"
    rm -rf "$S/schema" && cp -r "$SCHEMA" "$S/schema"
    "$S/bin/cardano-db-sync" --version | tee "$S/version.txt"
    # Same node/db-sync config as service-layer.sh: every genesis hash, Shelley systemStart rounded to Byron's second.
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
    if [ -n "${LEGACY_LOGGING:-}" ]; then  # db-sync before 13.8.0.0 (and branches cut from it) read iohk-monitoring keys
    cat > "$S/config.yaml" <<YAML
NetworkName: devnet
EnableLogging: True
EnableLogMetrics: False
NodeConfigFile: $S/node-config.json
PrometheusPort: 8090
RequiresNetworkMagic: RequiresMagic
minSeverity: Info
setupBackends: [KatipBK]
defaultBackends: [KatipBK]
setupScribes: [{scKind: StdoutSK, scName: stdout, scFormat: ScText, scRotation: null}]
defaultScribes: [[StdoutSK, stdout]]
options: {mapBackends: {}, mapSubtrace: {}}
YAML
    else
    cat > "$S/config.yaml" <<YAML
NetworkName: devnet
EnableLogging: True
EnableLogMetrics: False
NodeConfigFile: $S/node-config.json
PrometheusPort: 8090
RequiresNetworkMagic: RequiresMagic
TraceOptions:
  "": {severity: Info, detail: DNormal, backends: [Stdout HumanFormatUncoloured]}
  Mux: {severity: Error}
  Subscription: {severity: Error}
YAML
    fi
    echo "127.0.0.1:$PORT:dbsync:postgres:devnet" > "$S/pgpass" && chmod 600 "$S/pgpass"
    docker rm -f "$PG" >/dev/null 2>&1
    docker run -d --name "$PG" -e POSTGRES_PASSWORD=devnet -e POSTGRES_DB=dbsync -p "127.0.0.1:$PORT:5432" \
      postgres:16@sha256:5db6dac2ef5dcff512f4f00a009c3c332b9f2f28f24277175bf3e4a3d02ef83a >/dev/null
    until docker exec "$PG" pg_isready -U postgres -d dbsync >/dev/null 2>&1; do sleep 1; done; sleep 2
    rm -rf "$S/state" && mkdir -p "$S/state"
    start_dbsync "$S/dbsync.log" ;;
  resume)
    [ -f "$S/pid" ] && kill -0 "$(cat "$S/pid")" 2>/dev/null && { echo "db-sync is still running" >&2; exit 1; }
    echo "db-sync stopped at block $(psql 'select max(block_no) from block')"
    psql "ALTER TYPE scripttype ADD VALUE IF NOT EXISTS 'plutusV4'"
    start_dbsync "$S/dbsync-resumed.log" ;;
  report)
    indexed() { psql "select case when count(*) > 0 then 'indexed' else 'MISSING' end from tx where hash = '\\x$1'"; }
    echo "scripttype enum: $(psql "select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where typname = 'scripttype'")"
    echo "## every submitted transaction"
    for f in "$DEVNET_DIR"/work/tx/*.signed "$DEVNET_DIR"/work/adv/*.signed "$DEVNET_DIR"/work/follow/*.signed; do
      [ -f "$f" ] || continue
      n=$(basename "$f" .signed); [ "$n" = sub ] && continue
      case $n in dijkstra-balance-interval-unmet|dijkstra-legacy-reg) continue ;; esac  # rejected by the node, as intended
      id=$(txid "$f")
      printf '%-36s %s %s\n' "$n" "${id:0:16}" "$(indexed "$id")"
    done
    sub=$(subtx_id)
    printf '%-36s %s %s\n' "(sub-transaction itself)" "${sub:0:16}" "$(indexed "$sub")"
    echo "## sub-transaction"
    top=$(txid "$DEVNET_DIR/work/adv/dijkstra-sub-transaction.signed"); split=$(txid "$DEVNET_DIR/work/adv/split.signed")
    echo "node: split#1 unspent? $(cli query utxo --tx-in "$split#1" "${M[@]}" --output-json | jq 'length > 0'); sub#0 unspent? $(cli query utxo --tx-in "$sub#0" "${M[@]}" --output-json | jq 'length > 0')"
    echo "db-sync: tx_in rows of top-level tx: $(psql "select count(*) from tx_in i join tx t on t.id = i.tx_in_id where t.hash = '\\x$top'"), tx_out rows: $(psql "select count(*) from tx_out o join tx t on t.id = o.tx_id where t.hash = '\\x$top'")"
    echo "db-sync: split#1 consumed by any tx_in? $(psql "select count(*) > 0 from tx_in i join tx t on t.id = i.tx_out_id where t.hash = '\\x$split' and i.tx_out_index = 1")"
    echo "## direct deposit"
    dd=$(txid "$DEVNET_DIR/work/adv/dijkstra-direct-deposit.signed")
    stake=$(cli stake-address build --stake-verification-key-file "$DEVNET_DIR/work/tx/kd7.vkey" "${M[@]}")
    echo "node: $stake rewardAccountBalance $(cli query stake-address-info --address "$stake" "${M[@]}" | jq '.[0].rewardAccountBalance')"
    echo "db-sync: tx out_sum/fee/deposit $(psql "select out_sum, fee, deposit from tx where hash = '\\x$dd'" | tr '|' ' '); inputs $(psql "select coalesce(sum(o.value),0) from tx_in i join tx t on t.id = i.tx_in_id join tx_out o on o.tx_id = i.tx_out_id and o.index = i.tx_out_index where t.hash = '\\x$dd'")"
    echo "db-sync: tables with a deposit/direct column: $(psql "select coalesce(string_agg(distinct table_name, ','), 'none') from information_schema.columns where table_schema = 'public' and (column_name like '%direct%' or table_name like '%direct%')")"
    echo "## PlutusV4 reference script and guards"
    echo "db-sync script rows by type: $(psql "select string_agg(type || '=' || n, ' ') from (select type::text, count(*) n from script group by type) s")"
    g=$(txid "$DEVNET_DIR/work/adv/dijkstra-plutusv4-guard.signed")
    echo "db-sync redeemers of plutusv4-guard tx: $(psql "select coalesce(string_agg(purpose::text || ' script_hash=' || coalesce(encode(script_hash,'hex'),'NULL') || ' mem=' || unit_mem, '; '), 'none') from redeemer r join tx t on t.id = r.tx_id where t.hash = '\\x$g'")"
    echo "redeemer purpose enum: $(psql "select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where typname = 'scriptpurposetype'")"
    echo "## protocol parameters"
    echo "node protocolVersion: $(cli query protocol-parameters "${M[@]}" | jq -c .protocolVersion); db-sync latest epoch_param: $(psql 'select epoch_no, protocol_major, protocol_minor from epoch_param order by epoch_no desc limit 1' | tr '|' ' ')"
    new=$(cli query protocol-parameters "${M[@]}" | jq -r '[keys[] | select(test("^(maxRefScriptSizePer|refScriptCost|maxPledgeLeverage|minPoolMargin|leios|maxEndorserBlock|peras|refInputsCost)"))] | .[]')
    cols=$(psql "select column_name from information_schema.columns where table_name = 'epoch_param'")
    have=0 tot=0 miss=()
    for k in $new; do tot=$((tot+1)); c=$(sed -E 's/([A-Z])/_\L\1/g' <<<"$k"); grep -qx "$c" <<<"$cols" && have=$((have+1)) || miss+=("$k"); done
    echo "node's new Dijkstra parameters: $tot; with an epoch_param column: $have; missing: ${miss[*]}"
    echo "PlutusV4 cost model in epoch_param: $(psql "select coalesce((select (c.costs::jsonb ? 'PlutusV4')::text from epoch_param p join cost_model c on c.id = p.cost_model_id order by p.epoch_no desc limit 1), 'no row')")" ;;
  stop)
    [ -f "$S/pid" ] && kill "$(cat "$S/pid")" 2>/dev/null; docker rm -f "$PG" >/dev/null 2>&1; exit 0 ;;
esac
