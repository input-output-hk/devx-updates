#!/usr/bin/env bash
# Build and run the gouroboros consumers checked on the devnet, at the revisions the classification scanned.
#   tools.sh txtop             txtop at its pin (gouroboros 0.208.5) and upgraded to v0.213.0
#   tools.sh cardano-node-api  pinned (gouroboros 0.202.7), and upgraded to v0.213.9 with the patches in patches/;
#                              starts both, queries them, mints a token and submits a Dijkstra payment through the API
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/env.sh"
S=$DEVNET_DIR/src; mkdir -p "$S"
export GOFLAGS="-mod=mod -buildvcs=false"
checkout() { [ -d "$S/$1" ] || git clone -q "https://github.com/$2" "$S/$1"; git -C "$S/$1" checkout -q "$3"; }

case "$1" in
txtop)
  checkout txtop blinklabs-io/txtop 86a013e714aff6eb704326f7b646f9ab967e41db
  (cd "$S/txtop" && go build -o "$DEVNET_DIR/txtop-pinned" .)
  rm -rf "$S/txtop-up" && cp -r "$S/txtop" "$S/txtop-up"
  (cd "$S/txtop-up" && go get github.com/blinklabs-io/gouroboros@v0.213.0 && go build -o "$DEVNET_DIR/txtop-up" .)
  # txtop is a terminal UI; run each build under a pseudo-terminal and keep what it drew.
  for v in pinned up; do
    CARDANO_NODE_NETWORK_MAGIC=42 TERM=xterm script -qfc "timeout 20 $DEVNET_DIR/txtop-$v" /dev/null > "$DEVNET_DIR/txtop-$v.typescript" 2>&1 || true
    echo "txtop-$v: $(sed -e 's/\x1b\[[0-9;?>]*[a-zA-Z]//g' -e 's/\x1b[()][0-9A-Za-z]//g' "$DEVNET_DIR/txtop-$v.typescript" | LC_ALL=C grep -aoE 'Mempool capacity \(bytes\): [0-9]+|failed to connect to node: failed to connect after [0-9]+ attempts' | head -1 || echo 'nothing drawn')"
  done
  ;;
cardano-node-api)
  checkout cna blinklabs-io/cardano-node-api 136815536d9d5e6de09c5b1d206714f7ec7118b8
  (cd "$S/cna" && go build -o "$DEVNET_DIR/cna-pinned" ./cmd/cardano-node-api)
  # No adder release builds against gouroboros v0.213.x; patch v0.45.0 locally to get past it.
  rm -rf "$S/adder" && cp -r "$(go env GOMODCACHE)/github.com/blinklabs-io/adder@v0.45.0" "$S/adder" 2>/dev/null \
    || { (cd "$S/cna" && go mod download github.com/blinklabs-io/adder@v0.45.0); cp -r "$(go env GOMODCACHE)/github.com/blinklabs-io/adder@v0.45.0" "$S/adder"; }
  chmod -R u+w "$S/adder" && patch -s -p1 -d "$S/adder" < "$here/patches/adder-v0.45.0-gouroboros-v0.213.9.diff"
  rm -rf "$S/cna-up" && cp -r "$S/cna" "$S/cna-up"
  git -C "$S/cna-up" apply "$here/patches/cardano-node-api-gouroboros-v0.213.9.diff"
  (cd "$S/cna-up" && go mod edit -replace "github.com/blinklabs-io/adder=$S/adder" && go get github.com/blinklabs-io/gouroboros@v0.213.9 \
    && go build -o "$DEVNET_DIR/cna-up" ./cmd/cardano-node-api)
  pids=()
  for v in pinned up; do
    p=$([ $v = pinned ] && echo 0 || echo 1)
    CARDANO_NODE_NETWORK_MAGIC=42 CARDANO_NETWORK= API_LISTEN_ADDRESS=127.0.0.1 API_LISTEN_PORT=1808$p GRPC_LISTEN_ADDRESS=127.0.0.1 \
      GRPC_LISTEN_PORT=1909$p METRICS_LISTEN_ADDRESS=127.0.0.1 METRICS_LISTEN_PORT=1809$p DEBUG_PORT=0 "$DEVNET_DIR/cna-$v" > "$DEVNET_DIR/cna-$v.log" 2>&1 &
    pids+=($!)
  done
  trap 'kill "${pids[@]}"' EXIT
  sleep 3
  for v in pinned up; do
    p=$([ $v = pinned ] && echo 0 || echo 1)
    for e in localstatequery/current-era localstatequery/tip localtxmonitor/sizes; do
      echo "$v $e: $(curl -s -m 20 -w ' [HTTP %{http_code}]' "localhost:1808$p/api/$e" | head -c 300)"
    done
  done
  W=$DEVNET_DIR/work/cna; rm -rf "$W"; mkdir -p "$W"
  pick() { cli query utxo --address "$ADDR" "${M[@]}" --output-json | jq -r "to_entries | sort_by(.value.value.lovelace) | reverse | .[$1].key"; }
  KH=$(cli address key-hash --payment-verification-key-file "$E/utxo-keys/utxo1/utxo.vkey")
  printf '{"type":"sig","keyHash":"%s"}\n' "$KH" > "$W/policy.script"
  POL=$(cli transaction policyid --script-file "$W/policy.script"); NAME=$(printf devnet | od -An -tx1 | tr -d ' \n')
  cli transaction build "${M[@]}" --tx-in "$(pick 0)" --tx-out "$ADDR+5000000+1 $POL.$NAME" --mint "1 $POL.$NAME" \
    --mint-script-file "$W/policy.script" --change-address "$ADDR" --out-file "$W/mint.tx" >/dev/null
  cli transaction sign --tx-body-file "$W/mint.tx" --signing-key-file "$SKEY" "${M[@]}" --out-file "$W/mint.signed"
  cli transaction submit "${M[@]}" --tx-file "$W/mint.signed" >/dev/null
  MINT=$(cli transaction txid --tx-file "$W/mint.signed" | jq -r .txhash)
  for _ in $(seq 1 60); do cli query utxo --tx-in "$MINT#0" "${M[@]}" --output-json | jq -e 'length>0' >/dev/null && break; sleep 1; done
  echo "up utxos/search-by-asset after minting in a Dijkstra transaction: $(curl -s -m 60 "localhost:18081/api/localstatequery/utxos/search-by-asset?policy_id=$POL&asset_name=$NAME")"
  cli transaction build "${M[@]}" --tx-in "$(pick 1)" --tx-out "$ADDR+3000000" --change-address "$ADDR" --out-file "$W/pay.tx" >/dev/null
  cli transaction sign --tx-body-file "$W/pay.tx" --signing-key-file "$SKEY" "${M[@]}" --out-file "$W/pay.signed"
  jq -r .cborHex "$W/pay.signed" | xxd -r -p > "$W/pay.cbor"
  echo "up POST localtxsubmission/tx with a Dijkstra payment: $(curl -s -m 30 -w ' [HTTP %{http_code}]' -H 'Content-Type: application/cbor' --data-binary @"$W/pay.cbor" localhost:18081/api/localtxsubmission/tx)"
  # Submit the same payment directly and list the mempool through the API while it waits for a block.
  cli transaction submit "${M[@]}" --tx-file "$W/pay.signed" >/dev/null
  echo "up GET localtxmonitor/txs with that payment in the mempool: $(curl -s -m 10 localhost:18081/api/localtxmonitor/txs)"
  ;;
*) echo "usage: tools.sh txtop|cardano-node-api" >&2; exit 1 ;;
esac
