#!/usr/bin/env bash
# Build pallas-probe/ against one Pallas revision: build-pallas-probe.sh REVISION OUTPUT [dijkstra].
# Dijkstra decoding sits on Pallas's dijkstra branch behind its unstable feature; main has neither. Pass
# dijkstra for a revision that has it: it turns on unstable and the probe's forced Dijkstra decode.
# Needs cargo and rustc >= 1.88 (on NixOS: nix shell nixpkgs#cargo nixpkgs#rustc).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/env.sh"
work=$DEVNET_DIR/pallas-build/$1; mkdir -p "$work/src"
cp "$here/pallas-probe/main.rs" "$work/src/"
cat > "$work/Cargo.toml" <<TOML
[package]
name = "pallas-probe"
version = "0.0.0"
edition = "2021"

[dependencies]
pallas-network = { git = "https://github.com/txpipe/pallas", rev = "$1" }
pallas-traverse = { git = "https://github.com/txpipe/pallas", rev = "$1" }
hex = "0.4"
tokio = { version = "1", features = ["rt", "macros"] }

[features]
dijkstra = ["pallas-traverse/unstable"]
TOML
(cd "$work" && CARGO_TARGET_DIR=$DEVNET_DIR/pallas-build/target cargo build --release -q ${3:+--features "$3"} && cp "$DEVNET_DIR/pallas-build/target/release/pallas-probe" "$2")
