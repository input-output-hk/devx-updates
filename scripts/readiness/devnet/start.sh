#!/usr/bin/env bash
# Download the tagged 11.2.0 node, generate a one-pool testnet that forks to Dijkstra at epoch 2, and run it
# in the foreground. The fork trigger leaves the protocol version at 10; hardfork.sh raises it to 12.
set -euo pipefail
. "$(dirname "$0")/env.sh"
mkdir -p "$DEVNET_DIR"
if [ ! -x "$B/cardano-node" ]; then
  curl --fail --location --retry 3 -o "$DEVNET_DIR/node.tar.gz" "$NODE_TARBALL"
  printf '%s  %s\n' "$NODE_SHA256" "$DEVNET_DIR/node.tar.gz" | sha256sum --check --status
  mkdir -p "$DEVNET_DIR/node" && tar xzf "$DEVNET_DIR/node.tar.gz" -C "$DEVNET_DIR/node" && rm "$DEVNET_DIR/node.tar.gz"
fi
"$B/cardano-node" --version | grep -q "$NODE_REVISION" || { echo "unexpected node revision" >&2; exit 1; }
if [ ! -d "$E" ]; then
  "$B/cardano-testnet" create-env --output "$E" --num-pool-nodes 1 --epoch-length 200
  jq 'if .Configuration then .Configuration.Testing += {"ExperimentalHardForksEnabled": true, "TestDijkstraHardForkAtEpoch": 2}
      else . + {"ExperimentalHardForksEnabled": true, "TestDijkstraHardForkAtEpoch": 2} end' "$E/configuration.yaml" > "$E/configuration.tmp"
  mv "$E/configuration.tmp" "$E/configuration.yaml"
fi
# Older consumers need the flat dialect. Keep the actual node envelope as separate evidence.
jq 'if .Configuration then ([.Configuration[] | select(type == "object")] | add) + {Protocol: "Cardano"} else . end' \
  "$E/configuration.yaml" > "$E/legacy-configuration.json"
cd "$DEVNET_DIR" && exec "$B/cardano-testnet" cardano --node-env "$E"
