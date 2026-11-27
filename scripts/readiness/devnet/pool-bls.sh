#!/usr/bin/env bash
# Re-register the devnet's pool1 with its current parameters plus a fresh BLS key (Dijkstra pool registration
# carries the BLS key and its proof of possession). Writes $DEVNET_DIR/work/pool/{bls.vkey,dijkstra-pool-bls.signed}.
# Run after advanced.sh; `db-sync.sh report` then compares the key db-sync stored with bls.vkey.
set -uo pipefail
. "$(dirname "$0")/env.sh"
W=$DEVNET_DIR/work/pool; rm -rf "$W"; mkdir -p "$W"
P=$E/pools-keys/pool1
FEE=300000
POOL=$(cli stake-pool id --cold-verification-key-file "$P/cold.vkey")
params=$(cli query pool-state --stake-pool-id "$POOL" "${M[@]}" | jq -c 'to_entries[0].value.poolParams
  | {pledge: .spsPledge, cost: .spsCost, margin: .spsMargin, bls: .spsBlsKey}')
echo "pool1 $POOL before: $params"
cli node key-gen-BLS --verification-key-file "$W/bls.vkey" --signing-key-file "$W/bls.skey"
cli stake-pool registration-certificate --cold-verification-key-file "$P/cold.vkey" \
  --vrf-verification-key-file "$P/vrf.vkey" --bls-signing-key-file "$W/bls.skey" \
  --pool-pledge "$(jq -r .pledge <<<"$params")" --pool-cost "$(jq -r .cost <<<"$params")" \
  --pool-margin "$(jq -r .margin <<<"$params")" \
  --pool-reward-account-verification-key-file "$P/staking-reward.vkey" \
  --pool-owner-stake-verification-key-file "$P/staking-reward.vkey" \
  "${M[@]}" --out-file "$W/pool.cert"
IN=$(cli query utxo --address "$ADDR" "${M[@]}" --output-json | jq -r 'to_entries | max_by(.value.value.lovelace) | .key')
LOVE=$(cli query utxo --tx-in "$IN" "${M[@]}" --output-json | jq '.[].value.lovelace')
# A re-registration of a registered pool pays no deposit.
cli transaction build-raw --tx-in "$IN" --tx-out "$ADDR+$((LOVE - FEE))" --fee $FEE \
  --certificate-file "$W/pool.cert" --out-file "$W/dijkstra-pool-bls.tx"
cli transaction sign --tx-body-file "$W/dijkstra-pool-bls.tx" --signing-key-file "$SKEY" \
  --signing-key-file "$P/cold.skey" --signing-key-file "$P/staking-reward.skey" "${M[@]}" \
  --out-file "$W/dijkstra-pool-bls.signed"
cli transaction submit "${M[@]}" --tx-file "$W/dijkstra-pool-bls.signed" 2>&1 | grep -v 'called at\|CallStack' | head -6
TX=$(cli transaction txid --tx-file "$W/dijkstra-pool-bls.signed" | jq -r .txhash)
for _ in $(seq 1 60); do cli query utxo --tx-in "$TX#0" "${M[@]}" --output-json | jq -e 'length>0' >/dev/null && break; sleep 1; done
echo "pool1 re-registration $TX on chain: $(cli query utxo --tx-in "$TX#0" "${M[@]}" --output-json | jq 'length > 0')"
echo "bls.vkey: $(jq -r .cborHex "$W/bls.vkey")"
echo "pool1 after (node): $(cli query pool-state --stake-pool-id "$POOL" "${M[@]}" | jq -c 'to_entries[0].value | {bls: (.futurePoolParams // .poolParams).spsBlsKey, future: (.futurePoolParams != null)}')"
