#!/usr/bin/env bash
# Run the released Ogmios and Kupo binaries against the devnet and print how each one ends.
set -uo pipefail
. "$(dirname "$0")/env.sh"
mkdir -p "$DEVNET_DIR/services" && cd "$DEVNET_DIR/services"
fetch() { # repo tag asset directory
  [ -x "$4/bin/$(basename "$1" | tr 'A-Z' 'a-z')" ] && return
  mkdir -p "$4" && gh release download "$2" -R "$1" -p "$3" -D "$4" --clobber && (cd "$4" && unzip -oq "$3" && rm "$3" && chmod +x bin/*)
}
fetch CardanoSolutions/ogmios v7.0.0 ogmios-v7.0.0-x86_64-linux.zip ogmios
fetch CardanoSolutions/kupo v2.12 kupo-v2.12.0-x86_64-linux.zip kupo
echo "ogmios $(ogmios/bin/ogmios --version)"
timeout 60 ogmios/bin/ogmios --node-socket "$SOCKET" --node-config "$E/configuration.yaml" --port 1337 > ogmios.log 2>&1
echo "ogmios exit $?; era at start: $(grep -o '"currentEra":"[a-z]*"' ogmios.log | head -1)"
grep -o 'DijkstraEra.*' ogmios.log | grep -o 'ServerHasAgency.*' | head -1
echo "kupo $(kupo/bin/kupo --version)"
timeout 120 kupo/bin/kupo --node-socket "$SOCKET" --node-config "$E/configuration.yaml" --in-memory --since origin --match '*' --port 1442 > kupo.log 2>&1
status=$?
last=$(jq -r 'select(.message.Consumer.tag? == "ConsumerRollForward") | .message.Consumer.slotNo' kupo.log | tail -1)
# Kupo logs roll-forwards periodically, so a fast failure can come before any is logged.
echo "kupo exit $status; last logged roll-forward slot: ${last:-none logged}"
jq -r 'select(.message.Kupo) | .message.Kupo.exception' kupo.log | grep -o 'ServerHasAgency.*' | head -1
