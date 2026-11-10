#!/usr/bin/env bash
# Dijkstra-only transaction bodies that transactions.sh does not build: a direct deposit, a top-level transaction
# carrying a signed sub-transaction, and an output holding a PlutusV4 reference script. Run it after
# transactions.sh, which registers the stake key the direct deposit pays into. With MEMPOOL_PROBE set, the mempool
# is watched and written to $DEVNET_DIR/work/adv/mempool.hex, like transactions.sh does.
# The 11.2.0 CLI has no options for guards or balance intervals, so those stay untested.
set -uo pipefail
. "$(dirname "$0")/env.sh"
[ "$(cli query protocol-parameters "${M[@]}" | jq -r .protocolVersion.major)" = 12 ] || {
  echo "Dijkstra transaction checks require protocol version 12" >&2; exit 1;
}
T=$DEVNET_DIR/work/tx; W=$DEVNET_DIR/work/adv; rm -rf "$W"; mkdir -p "$W"
[ -f "$T/kd7.vkey" ] || { echo "run transactions.sh first: it registers the deposit target" >&2; exit 1; }
FEE=300000; AMT=50000000; DD=2000000
[ -n "${MEMPOOL_PROBE:-}" ] && { "$MEMPOOL_PROBE" mempool "$SOCKET" 60 > "$W/mempool.hex" & }

IN=$(cli query utxo --address "$ADDR" "${M[@]}" --output-json | jq -r 'to_entries | max_by(.value.value.lovelace) | .key')
outs=(); for _ in $(seq 0 3); do outs+=(--tx-out "$ADDR+$AMT"); done
cli transaction build "${M[@]}" --tx-in "$IN" "${outs[@]}" --change-address "$ADDR" --out-file "$W/split.tx" >/dev/null
cli transaction sign --tx-body-file "$W/split.tx" --signing-key-file "$SKEY" "${M[@]}" --out-file "$W/split.signed"
cli transaction submit "${M[@]}" --tx-file "$W/split.signed" >/dev/null
SPLIT=$(cli transaction txid --tx-file "$W/split.signed" | jq -r .txhash)
for _ in $(seq 1 60); do cli query utxo --tx-in "$SPLIT#0" "${M[@]}" --output-json | jq -e 'length>0' >/dev/null && break; sleep 1; done

submit() { # name: sign $W/name.tx with SKEY and submit it
  cli transaction sign --tx-body-file "$W/$1.tx" --signing-key-file "$SKEY" "${M[@]}" --out-file "$W/$1.signed"
  echo "envelope: $(jq -r '.type + " " + .cborHex[0:4]' "$W/$1.signed")"
  cli transaction submit "${M[@]}" --tx-file "$W/$1.signed" 2>&1 | grep -v 'called at\|CallStack' | head -6
  echo
}

echo "## dijkstra-direct-deposit (build-raw)"
STAKE=$(cli stake-address build --stake-verification-key-file "$T/kd7.vkey" "${M[@]}")
cli transaction build-raw --tx-in "$SPLIT#0" --tx-out "$ADDR+$((AMT - FEE - DD))" --fee $FEE \
  --direct-deposit "$STAKE+$DD" --out-file "$W/dijkstra-direct-deposit.tx" 2>&1 | head -3
[ -f "$W/dijkstra-direct-deposit.tx" ] && submit dijkstra-direct-deposit
before=$(cli query stake-address-info --address "$STAKE" "${M[@]}" | jq '.[0].rewardAccountBalance')
for _ in $(seq 1 30); do # wait for the block that includes it
  cli query utxo --tx-in "$SPLIT#0" "${M[@]}" --output-json | jq -e 'length==0' >/dev/null && break; sleep 1
done
echo "balance before inclusion: $before"
echo "account after deposit: $(cli query stake-address-info --address "$STAKE" "${M[@]}" 2>&1 | jq -c '.[0] | del(.stakeDelegation, .voteDelegation)' 2>&1)"
echo

echo "## dijkstra-sub-transaction (sub-transaction build-raw, embedded)"
# The sub-transaction moves one split output to a fresh output and pays no fee; the top level pays for both.
cli sub-transaction build-raw --tx-in "$SPLIT#1" --tx-out "$ADDR+$AMT" --out-file "$W/sub.tx" 2>&1 | head -3
cli sub-transaction sign --sub-tx-file "$W/sub.tx" --signing-key-file "$SKEY" --out-file "$W/sub.signed" 2>&1 | head -3
if [ -f "$W/sub.signed" ]; then
  echo "sub-transaction: $(jq -r '.type + " " + .cborHex[0:4]' "$W/sub.signed")"
  cli transaction build-raw --tx-in "$SPLIT#2" --tx-out "$ADDR+$((AMT - FEE))" --fee $FEE \
    --signed-sub-tx-file "$W/sub.signed" --out-file "$W/dijkstra-sub-transaction.tx" 2>&1 | head -3
  [ -f "$W/dijkstra-sub-transaction.tx" ] && submit dijkstra-sub-transaction
fi

echo "## dijkstra-plutusv4-reference-script (build-raw)"
# (program 1.1.0 (lam _ (con unit ()))): the usual always-succeeds program, here tagged as PlutusV4.
echo '{"type":"PlutusScriptV4","description":"","cborHex":"46450101002499"}' > "$W/v4.plutus"
cli transaction build-raw --tx-in "$SPLIT#3" --tx-out "$ADDR+$((AMT - FEE))" --tx-out-reference-script-file "$W/v4.plutus" \
  --fee $FEE --out-file "$W/dijkstra-plutusv4-reference-script.tx" 2>&1 | head -3
[ -f "$W/dijkstra-plutusv4-reference-script.tx" ] && submit dijkstra-plutusv4-reference-script
wait
