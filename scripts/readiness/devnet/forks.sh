#!/usr/bin/env bash
# Build the IntersectMBO forks of Ogmios and Kupo and run them against an existing devnet chain.
#
#   DEVNET_DIR=/tmp/dj-1110 ./forks.sh build           # nix build both forks at the pinned commits
#   DEVNET_DIR=/tmp/dj-1110 ./forks.sh relay [BLOCK]   # serve the chain with a plain node, optionally truncated after BLOCK
#   DEVNET_DIR=/tmp/dj-1110 ./forks.sh ogmios IDS      # chain sync + queries through Ogmios (ogmios-probe/probe.mjs)
#   DEVNET_DIR=/tmp/dj-1110 ./forks.sh kupo [IDS]      # index from origin; with IDS, report the outputs of each named tx
#   ./forks.sh ogmios-api                               # live chain or relay: evaluate, submit and watch a fresh payment
#                                                       # through Ogmios, resubmit it, and evaluate a PlutusV4 guard
#
# DEVNET_DIR holds a chain that start.sh, hardfork.sh, transactions.sh and advanced.sh produced. Restarting
# cardano-testnet on an old chain fails: the wall clock is past the forecast horizon, so no block can be forged and
# cardano-testnet stops after 60 s. `relay` runs cardano-node directly instead; it serves the chain without extending it,
# and its mempool still validates submissions. The forks' native builds are on cache.iog.io; the static musl builds are not.
set -euo pipefail
. "$(dirname "$0")/env.sh"
OGMIOS_COMMIT=${OGMIOS_COMMIT:-20c383a280ba7265a471ad6a7127aa63b3be00d8}
KUPO_COMMIT=${KUPO_COMMIT:-e9ef0be33abe5f702848536e70b75972011a9fa7}
OUT=$DEVNET_DIR/forks
mkdir -p "$OUT"
here=$(cd "$(dirname "$0")" && pwd)

case "${1:-}" in
  build)
    # Ogmios vendors hjsonpointer and hjsonschema as git submodules, which github: flake references leave out.
    nix build --accept-flake-config "git+https://github.com/IntersectMBO/ogmios?rev=$OGMIOS_COMMIT&submodules=1#ogmios" -o "$OUT/ogmios-fork"
    nix build --accept-flake-config "github:IntersectMBO/kupo/$KUPO_COMMIT#kupo" -o "$OUT/kupo-fork"
    "$OUT/ogmios-fork/bin/ogmios" --version; "$OUT/kupo-fork/bin/kupo" --version
    sha256sum "$OUT"/*-fork/bin/* ;;
  relay)
    db=$E/node-data/node1/db
    if [ -n "${2:-}" ]; then
      # Volatile blocks and ledger snapshots past the new tip would not connect; the node replays from the ImmutableDB.
      find "$db/volatile" "$db/ledger" -mindepth 1 -delete; rm -f "$db/clean" "$db/lock"
      "$B/db-truncater" --db "$db" --truncate-after-block "$2" --config "$E/configuration.yaml"
    fi
    rm -f "$SOCKET"
    exec "$B/cardano-node" run --config "$E/configuration.yaml" --topology "$E/node-data/node1/topology.json" \
      --database-path "$db" --socket-path "$SOCKET" --host-addr 127.0.0.1 --port 30998 ;;
  ogmios)
    "$OUT/ogmios-fork/bin/ogmios" --node-socket "$SOCKET" --node-config "$SERVICE_CONFIG" --port "${OGMIOS_PORT:-1337}" > "$OUT/ogmios.log" 2>&1 &
    pid=$!; sleep 6
    node "$here/ogmios-probe/probe.mjs" "ws://127.0.0.1:${OGMIOS_PORT:-1337}" "$2" "$OUT/ogmios-txs.json" || true
    kill "$pid"
    jq -c 'select(.severity == "Error") | .message' "$OUT/ogmios.log" | head -3 ;;
  ogmios-api)
    # Build two fresh transactions on the live chain: a payment (submitted through Ogmios) and a PlutusV4 guard spend
    # (evaluated only). They spend different outputs so neither depends on the other.
    W=$OUT/api; rm -rf "$W"; mkdir -p "$W"
    utxos=$(cli query utxo --address "$ADDR" "${M[@]}" --output-json | jq -r 'to_entries | sort_by(-.value.value.lovelace) | .[0:3] | .[].key')
    read -r PAY GIN GCOLL <<<"$(echo $utxos)"
    cli transaction build "${M[@]}" --tx-in "$PAY" --tx-out "$ADDR+5000000" --change-address "$ADDR" --out-file "$W/pay.tx" >/dev/null
    cli transaction sign --tx-body-file "$W/pay.tx" --signing-key-file "$SKEY" "${M[@]}" --out-file "$W/pay.signed"
    jq -r .cborHex "$W/pay.signed" > "$W/pay.hex"
    echo '{"type":"PlutusScriptV4","description":"","cborHex":"46450101002499"}' > "$W/v4.plutus"
    cli query protocol-parameters "${M[@]}" --out-file "$W/pparams.json"
    LOVE=$(cli query utxo --tx-in "$GIN" "${M[@]}" --output-json | jq '.[].value.lovelace')
    cli transaction build-raw --tx-in "$GIN" --tx-in-collateral "$GCOLL" --tx-out "$ADDR+$((LOVE - 1000000))" --fee 1000000 \
      --guard-script-file "$W/v4.plutus" --guard-redeemer-value 0 --guard-execution-units "(2000000, 20000)" \
      --protocol-params-file "$W/pparams.json" --out-file "$W/guard.tx"
    cli transaction sign --tx-body-file "$W/guard.tx" --signing-key-file "$SKEY" "${M[@]}" --out-file "$W/guard.signed"
    jq -r .cborHex "$W/guard.signed" > "$W/guard.hex"
    echo "payment id (cardano-cli): $(cli transaction txid --tx-file "$W/pay.signed" | jq -r .txhash)"
    "$OUT/ogmios-fork/bin/ogmios" --node-socket "$SOCKET" --node-config "$SERVICE_CONFIG" --port "${OGMIOS_PORT:-1337}" > "$OUT/ogmios-api.log" 2>&1 &
    pid=$!; sleep 6
    node "$here/ogmios-probe/api.mjs" "ws://127.0.0.1:${OGMIOS_PORT:-1337}" "$W/pay.hex" "$W/guard.hex" || true
    kill "$pid"
    jq -c 'select(.severity == "Error") | .message' "$OUT/ogmios-api.log" | head -3 ;;
  kupo)
    "$OUT/kupo-fork/bin/kupo" --node-socket "$SOCKET" --node-config "$SERVICE_CONFIG" --in-memory --since origin --match '*' \
      --port "${KUPO_PORT:-1442}" > "$OUT/kupo.log" 2>&1 &
    pid=$!
    tip=$(CARDANO_NODE_SOCKET_PATH=$SOCKET "$B/cardano-cli" query tip "${M[@]}" | jq .slot)
    for _ in $(seq 1 60); do
      kill -0 "$pid" 2>/dev/null || break
      [ "$(curl -s "http://127.0.0.1:${KUPO_PORT:-1442}/health" | awk '/^kupo_most_recent_checkpoint /{print $2}')" = "$tip" ] && break
      sleep 2
    done
    if kill -0 "$pid" 2>/dev/null && [ -n "${2:-}" ]; then
      jq -r 'to_entries[] | select(.key | startswith("mempool-") | not) | "\(.key) \(.value)"' "$2" | while read -r name id; do
        echo "$name: $(curl -s "http://127.0.0.1:${KUPO_PORT:-1442}/matches/*@$id" | jq length) outputs indexed"
      done
    fi
    kill "$pid" 2>/dev/null || true
    echo "last logged roll-forward slot: $(jq -r 'select(.message.Consumer.tag? == "ConsumerRollForward") | .message.Consumer.slotNo' "$OUT/kupo.log" | tail -1)"
    jq -c 'select(.severity == "Error") | .message' "$OUT/kupo.log" | head -3 ;;
  *) sed -n 2,13p "$0"; exit 1 ;;
esac
