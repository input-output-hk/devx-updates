#!/usr/bin/env bash
# Submit Conway-built and Dijkstra-built transactions to the post-fork devnet and print what the node accepts.
# Each case spends its own output of a split transaction. With MEMPOOL_PROBE set to a built probe, the mempool is
# watched during the run and its raw transactions are written to $DEVNET_DIR/work/tx/mempool.hex.
set -uo pipefail
. "$(dirname "$0")/env.sh"
W=$DEVNET_DIR/work/tx; rm -rf "$W"; mkdir -p "$W"
FEE=200000; AMT=50000000
DEP=$(cli query protocol-parameters "${M[@]}" | jq .stakeAddressDeposit)
[ -n "${MEMPOOL_PROBE:-}" ] && { "$MEMPOOL_PROBE" mempool "$SOCKET" 60 > "$W/mempool.hex" & }

IN=$(cli query utxo --address "$ADDR" "${M[@]}" --output-json | jq -r 'to_entries | max_by(.value.value.lovelace) | .key')
outs=(); for _ in $(seq 0 7); do outs+=(--tx-out "$ADDR+$AMT"); done
cli transaction build "${M[@]}" --tx-in "$IN" "${outs[@]}" --change-address "$ADDR" --out-file "$W/split.tx" >/dev/null
cli transaction sign --tx-body-file "$W/split.tx" --signing-key-file "$SKEY" "${M[@]}" --out-file "$W/split.signed"
cli transaction submit "${M[@]}" --tx-file "$W/split.signed" >/dev/null
SPLIT=$(cli transaction txid --tx-file "$W/split.signed" | jq -r .txhash)
for _ in $(seq 1 60); do cli query utxo --tx-in "$SPLIT#0" "${M[@]}" --output-json | jq -e 'length>0' >/dev/null && break; sleep 1; done

for k in k0 k7 kd0 kd7; do cli stake-address key-gen --verification-key-file "$W/$k.vkey" --signing-key-file "$W/$k.skey"; done
hash() { cli stake-address key-hash --stake-verification-key-file "$1"; }
# A deposit-less registration (certificate type 0) is [0, [0, keyhash]]; the CLI only emits type 7, so write it by hand.
legacy() { printf '{"type":"%s","description":"","cborHex":"82008200581c%s"}\n' "$3" "$(hash "$1")" > "$2"; }
legacy "$W/k0.vkey" "$W/k0.cert" CertificateConway
legacy "$W/kd0.vkey" "$W/kd0.cert" Certificate
"$B/cardano-cli" conway stake-address registration-certificate --stake-verification-key-file "$W/k7.vkey" --key-reg-deposit-amt "$DEP" --out-file "$W/k7.cert"
cli stake-address registration-certificate --stake-verification-key-file "$W/kd7.vkey" --key-reg-deposit-amt "$DEP" --out-file "$W/kd7.cert"
REQ=$(hash "$W/k7.vkey")

run() { # name era split-index deposit build-raw-arguments...
  local name=$1 era=$2 n=$3 less=$4; shift 4
  echo "## $name ($era build-raw)"
  "$B/cardano-cli" "$era" transaction build-raw --tx-in "$SPLIT#$n" --tx-out "$ADDR+$((AMT - FEE - less))" --fee $FEE "$@" --out-file "$W/$name.tx" 2>&1 | grep -v 'called at' | head -3
  [ -f "$W/$name.tx" ] || { echo; return; }
  local keys=(--signing-key-file "$SKEY")
  for k in k0 k7 kd0 kd7; do [[ " $* " == *"/$k.cert"* ]] && keys+=(--signing-key-file "$W/$k.skey"); done
  [[ " $* " == *"--required-signer-hash"* ]] && keys+=(--signing-key-file "$W/k7.skey")
  "$B/cardano-cli" "$era" transaction sign --tx-body-file "$W/$name.tx" "${keys[@]}" "${M[@]}" --out-file "$W/$name.signed"
  echo "envelope: $(jq -r '.type + " " + .cborHex[0:4]' "$W/$name.signed")"
  "$B/cardano-cli" "$era" transaction submit "${M[@]}" --tx-file "$W/$name.signed" 2>&1 | grep -v 'called at\|CallStack' | head -6
  echo
}
run conway-payment conway 0 0
run conway-legacy-reg conway 1 "$DEP" --certificate-file "$W/k0.cert"
run conway-reg-with-deposit conway 2 "$DEP" --certificate-file "$W/k7.cert"
run conway-required-signer conway 3 0 --required-signer-hash "$REQ"
run conway-metadata conway 4 0 --metadata-json-file <(echo '{"674":{"msg":["devnet"]}}')
run dijkstra-payment dijkstra 5 0
run dijkstra-legacy-reg dijkstra 6 "$DEP" --certificate-file "$W/kd0.cert"
run dijkstra-reg-with-deposit dijkstra 7 "$DEP" --certificate-file "$W/kd7.cert"
wait
