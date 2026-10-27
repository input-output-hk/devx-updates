# Shared settings for the Dijkstra devnet recipe. Source it; every script does.
# DEVNET_DIR must stay short: the node socket path has to fit in 108 bytes.
DEVNET_DIR=${DEVNET_DIR:-/tmp/dijkstra-devnet}
NODE_REVISION=34ae34db891105d2d17ad9b2704cb56423103da6
# Hydra build of the static Linux tarball for NODE_REVISION (cardano-node PR 6677, evaluation 126863).
NODE_TARBALL=https://ci.iog.io/build/15172667/download/1/cardano-node-11.1.1-linux.tar.gz
E=$DEVNET_DIR/env
B=$DEVNET_DIR/node/bin
SOCKET=$E/socket/node1/sock
M=(--testnet-magic 42)
export CARDANO_NODE_SOCKET_PATH=$SOCKET CARDANO_CLI=$B/cardano-cli CARDANO_NODE=$B/cardano-node
ADDR=$(cat "$E/utxo-keys/utxo1/utxo.addr" 2>/dev/null || true)
SKEY=$E/utxo-keys/utxo1/utxo.skey
cli() { "$B/cardano-cli" dijkstra "$@"; }
