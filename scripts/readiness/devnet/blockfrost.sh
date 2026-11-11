#!/usr/bin/env bash
# What Blockfrost RYO serves for the Dijkstra-only transactions once db-sync gets past its PlutusV4 stop.
#
#   ./blockfrost.sh spend-sub   # live chain only: spend the sub-transaction's output in an ordinary payment
#   ./blockfrost.sh resume      # after service-layer.sh: add plutusV4 to db-sync's scripttype enum and restart db-sync
#   ./blockfrost.sh probe       # compare Blockfrost's answers for the advanced transactions with the node's
#
# Order: start.sh, hardfork.sh, transactions.sh, advanced.sh, `blockfrost.sh spend-sub`, then (on the live chain or
# under `forks.sh relay`) DBSYNC_VERSION=13.8.0.0 BLOCKFROST_IMAGE=<v7 digest> service-layer.sh, `blockfrost.sh resume`
# and `blockfrost.sh probe`. The enum value is this experiment's workaround to see past the first failure, not a fix.
set -uo pipefail
. "$(dirname "$0")/env.sh"
DBSYNC_VERSION=${DBSYNC_VERSION:-13.8.0.0}
S=$DEVNET_DIR/services/db-sync-$DBSYNC_VERSION W=$DEVNET_DIR/work/adv F=$DEVNET_DIR/work/follow
BF=http://127.0.0.1:3100
psql() { docker exec dijkstra-dbsync-pg psql -U postgres -d dbsync -tAc "$1"; }
txid() { cli transaction txid --tx-file "$1" | jq -r .txhash; }
# cardano-cli cannot read the signed sub-transaction envelope; txid.py hashes its body the same way.
subtx_id() { jq -r .cborHex "$W/sub.signed" | python3 -I "$(dirname "$0")/txid.py" | cut -c1-64; }

case "${1:-}" in
  spend-sub)
    sub=$(subtx_id)
    mkdir -p "$F"
    cli transaction build-raw --tx-in "$sub#0" --tx-out "$ADDR+49700000" --fee 300000 --out-file "$F/spend-subtx-output.tx"
    cli transaction sign --tx-body-file "$F/spend-subtx-output.tx" --signing-key-file "$SKEY" "${M[@]}" --out-file "$F/spend-subtx-output.signed"
    cli transaction submit "${M[@]}" --tx-file "$F/spend-subtx-output.signed"
    echo "sub-transaction $sub; spent by $(txid "$F/spend-subtx-output.signed")" ;;
  resume)
    [ -f "$S/pid" ] && kill -0 "$(cat "$S/pid")" 2>/dev/null && { echo "db-sync is still running" >&2; exit 1; }
    echo "db-sync stopped at block $(psql 'select max(block_no) from block')"
    psql "ALTER TYPE scripttype ADD VALUE IF NOT EXISTS 'plutusV4'"
    (cd "$S" && PGPASSFILE="$S/pgpass" exec ./bin/cardano-db-sync --config config.yaml --socket-path "$SOCKET" \
       --state-dir state --schema-dir schema > dbsync-resumed.log 2>&1) &
    printf '%s\n' "$!" > "$S/pid"
    sleep 90
    echo "node tip: $(cli query tip "${M[@]}" | jq -c '{block}')"
    echo "db-sync $(kill -0 "$(cat "$S/pid")" 2>/dev/null && echo running || echo exited); highest block indexed: $(psql 'select max(block_no) from block')"
    grep -m2 -E '\] .*(Error|Exception)' "$S/dbsync-resumed.log" | cut -c1-400 ;;
  probe)
    top=$(txid "$W/dijkstra-sub-transaction.signed"); sub=$(subtx_id); split=$(txid "$W/split.signed")
    dd=$(txid "$W/dijkstra-direct-deposit.signed"); v4=$(txid "$W/dijkstra-plutusv4-reference-script.signed")
    follow=$(txid "$F/spend-subtx-output.signed")
    stake=$(cli stake-address build --stake-verification-key-file "$DEVNET_DIR/work/tx/kd7.vkey" "${M[@]}")
    indexed() { psql "select case when count(*) > 0 then 'indexed' else 'missing' end from tx where hash = '\\x$1'"; }
    echo "db-sync: top-level with sub-transaction $(indexed "$top"), sub-transaction $(indexed "$sub"), spend of its output $(indexed "$follow")"
    echo "## sub-transaction: top-level $top carries sub-transaction $sub (spends split#1, pays 50 ADA)"
    echo "/txs/<top>/utxos: $(curl -s "$BF/txs/$top/utxos" | jq -c '{inputs: [.inputs[] | "\(.tx_hash[0:8])#\(.output_index)"], outputs: [.outputs[] | .amount[0].quantity]}')"
    echo "/txs/<sub>: $(curl -s -o /dev/null -w '%{http_code}' "$BF/txs/$sub")"
    echo "node: split#1 unspent? $(cli query utxo --tx-in "$split#1" "${M[@]}" --output-json | jq 'length > 0'); sub#0 unspent? $(cli query utxo --tx-in "$sub#0" "${M[@]}" --output-json | jq 'length > 0')"
    echo "blockfrost /addresses/<addr>/utxos: split outputs listed $(curl -s "$BF/addresses/$ADDR/utxos?count=100" | jq -c --arg s "$split" '[.[] | select(.tx_hash == $s) | .output_index]'); sub#0 listed $(curl -s "$BF/addresses/$ADDR/utxos?count=100" | jq --arg s "$sub" 'any(.[]; .tx_hash == $s)')"
    echo "## direct deposit $dd into $stake"
    echo "node: rewardAccountBalance $(cli query stake-address-info --address "$stake" "${M[@]}" | jq '.[0].rewardAccountBalance')"
    echo "blockfrost /accounts/<stake>: $(curl -s "$BF/accounts/$stake" | jq -c '{active, controlled_amount, withdrawable_amount}')"
    echo "blockfrost /txs/<dd>: $(curl -s "$BF/txs/$dd" | jq -c '{fees, deposit, withdrawal_count}') utxos $(curl -s "$BF/txs/$dd/utxos" | jq -c '{in: [.inputs[].amount[0].quantity], out: [.outputs[].amount[0].quantity]}')"
    echo "## PlutusV4 reference script in $v4"
    h=$(curl -s "$BF/txs/$v4/utxos" | jq -r '[.outputs[].reference_script_hash | select(.)][0]')
    echo "blockfrost /scripts/<hash>: $(curl -s "$BF/scripts/$h" | jq -c '{type, serialised_size}') (OpenAPI enum: timelock, plutusV1, plutusV2, plutusV3)"
    echo "blockfrost /scripts/<hash>/cbor: $(curl -s "$BF/scripts/$h/cbor" | jq -c .)"
    echo "## protocol parameters"
    echo "node: $(cli query protocol-parameters "${M[@]}" | jq -c '{parameters: (keys | length), costModels: (.costModels | keys)}')"
    echo "blockfrost /epochs/latest/parameters: $(curl -s "$BF/epochs/latest/parameters" | jq -c '{protocol_major_ver, fields: (keys | length), cost_models_raw: (.cost_models_raw | keys), plutusV4_entries: (.cost_models_raw.PlutusV4 | length)}')"
    # Dijkstra's new parameters (keys 34-56): reference-script limits and pricing, pledge leverage, pool margin, Leios,
    # Peras and reference-input fees. Conway's minFeeRefScriptCostPerByte is not one of them.
    new=$(cli query protocol-parameters "${M[@]}" | jq -c '[keys[] | select(test("^(maxRefScriptSizePer|refScriptCost|maxPledgeLeverage|minPoolMargin|leios|maxEndorserBlock|peras|refInputsCost)"))]')
    served=$(curl -s "$BF/epochs/latest/parameters" | jq -c --argjson new "$new" '. as $p | [$new[] | gsub("(?<c>[A-Z])"; "_\(.c | ascii_downcase)") as $k | select($p | has($k))]')
    echo "node's new Dijkstra parameters: $(jq length <<<"$new") $new; served by Blockfrost: $served"
    echo "## era summary"
    echo "/network/eras: HTTP $(curl -s -o /dev/null -w '%{http_code}' "$BF/network/eras")"
    docker logs dijkstra-blockfrost 2>&1 | grep -m1 'Error in /network/eras' | cut -c1-200 ;;
  *) sed -n 2,10p "$0"; exit 1 ;;
esac
