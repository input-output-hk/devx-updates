# Shared settings for the Dijkstra devnet recipe. Source it; every script does.
# DEVNET_DIR must stay short: the node socket path has to fit in 108 bytes.
DEVNET_DIR=${DEVNET_DIR:-/tmp/dijkstra-11.2.0}
NODE_REVISION=dac0d7ab2dfdee1f9eda901589e3c6ac8eaa1899
# Official 11.2.0 prerelease; the digest is published with the GitHub release asset.
NODE_TARBALL=https://github.com/IntersectMBO/cardano-node/releases/download/11.2.0/cardano-node-11.2.0-linux-amd64.tar.gz
NODE_SHA256=8b287e300ffb2063522fc33d50da6ecee8fa10fc7445c906fae0ca9783db8e03
E=$DEVNET_DIR/env
B=$DEVNET_DIR/node/bin
SOCKET=$E/socket/node1/sock
SERVICE_CONFIG=$E/legacy-configuration.json
M=(--testnet-magic 42)
export CARDANO_NODE_SOCKET_PATH=$SOCKET CARDANO_CLI=$B/cardano-cli CARDANO_NODE=$B/cardano-node
ADDR=$(cat "$E/utxo-keys/utxo1/utxo.addr" 2>/dev/null || true)
SKEY=$E/utxo-keys/utxo1/utxo.skey
cli() { "$B/cardano-cli" dijkstra "$@"; }
