#!/usr/bin/env bash
# Propose a hard-fork initiation to MAJOR and vote it through with the three DReps and the pool. The devnet has no
# constitutional committee and a committee minimum size of 0, so DRep and SPO votes ratify it.
# Usage: hardfork.sh MAJOR [PREVIOUS_ACTION_TXID]   (run 11, then 12 with the txid printed for 11)
set -euo pipefail
. "$(dirname "$0")/env.sh"
W=$DEVNET_DIR/work/hf$1; mkdir -p "$W" "$DEVNET_DIR/anchor"
# transaction build fetches the anchor, so serve one locally for the length of the run.
echo '{"title":"devnet hard fork"}' > "$DEVNET_DIR/anchor/hf.json"
python3 -I -m http.server 8765 --bind 127.0.0.1 --directory "$DEVNET_DIR/anchor" >/dev/null 2>&1 & server=$!
trap 'kill $server' EXIT
sleep 1
prev=(); [ -n "${2:-}" ] && prev=(--prev-governance-action-tx-id "$2" --prev-governance-action-index 0)
cli governance action create-hardfork --testnet --governance-action-deposit "$(cli query protocol-parameters "${M[@]}" | jq .govActionDeposit)" \
  --deposit-return-stake-verification-key-file "$E/stake-delegators/delegator1/staking.vkey" "${prev[@]}" \
  --anchor-url http://127.0.0.1:8765/hf.json --anchor-data-hash "$("$B/cardano-cli" hash anchor-data --file-text "$DEVNET_DIR/anchor/hf.json")" \
  --protocol-major-version "$1" --protocol-minor-version 0 --out-file "$W/hf.action"
pick() { cli query utxo --address "$ADDR" "${M[@]}" --output-json | jq -r 'to_entries | max_by(.value.value.lovelace) | .key'; }
cli transaction build "${M[@]}" --tx-in "$(pick)" --change-address "$ADDR" --proposal-file "$W/hf.action" --out-file "$W/prop.tx"
cli transaction sign --tx-body-file "$W/prop.tx" --signing-key-file "$SKEY" "${M[@]}" --out-file "$W/prop.signed"
cli transaction submit "${M[@]}" --tx-file "$W/prop.signed"
TXID=$(cli transaction txid --tx-file "$W/prop.signed" | jq -r .txhash)
echo "proposal $TXID"
for _ in $(seq 1 60); do cli query gov-state "${M[@]}" | jq -e --arg t "$TXID" '.proposals[] | select(.actionId.txId == $t)' >/dev/null && break; sleep 1; done
votes=(); signers=(--signing-key-file "$SKEY")
for d in 1 2 3; do
  cli governance vote create --yes --governance-action-tx-id "$TXID" --governance-action-index 0 --drep-verification-key-file "$E/drep-keys/drep$d/drep.vkey" --out-file "$W/drep$d.vote"
  votes+=(--vote-file "$W/drep$d.vote"); signers+=(--signing-key-file "$E/drep-keys/drep$d/drep.skey")
done
cli governance vote create --yes --governance-action-tx-id "$TXID" --governance-action-index 0 --cold-verification-key-file "$E/pools-keys/pool1/cold.vkey" --out-file "$W/pool.vote"
votes+=(--vote-file "$W/pool.vote"); signers+=(--signing-key-file "$E/pools-keys/pool1/cold.skey")
cli transaction build "${M[@]}" --tx-in "$(pick)" --change-address "$ADDR" "${votes[@]}" --witness-override 5 --out-file "$W/vote.tx"
cli transaction sign --tx-body-file "$W/vote.tx" "${signers[@]}" "${M[@]}" --out-file "$W/vote.signed"
cli transaction submit "${M[@]}" --tx-file "$W/vote.signed"
# Enactment takes two epoch boundaries (about 40 seconds at 200 slots of 0.1 s).
for _ in $(seq 1 30); do
  pv=$(cli query protocol-parameters "${M[@]}" | jq .protocolVersion.major)
  [ "$pv" = "$1" ] && { echo "protocol version $pv"; exit 0; }
  sleep 5
done
echo "protocol version still $pv" >&2; exit 1
