#!/usr/bin/env bash
# Build cml-probe/ against one CML release from crates.io: build-cml-probe.sh VERSION OUTPUT (VERSION like 6.2.0).
# Needs cargo and rustc (on NixOS: nix shell nixpkgs#cargo nixpkgs#rustc).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
. "$here/env.sh"
work=$DEVNET_DIR/cml-build/$1; mkdir -p "$work/src"
cp "$here/cml-probe/main.rs" "$work/src/"
cat > "$work/Cargo.toml" <<TOML
[package]
name = "cml-probe"
version = "0.0.0"
edition = "2021"

[dependencies]
cml-chain = "=$1"
cml-core = "=$1"
cml-multi-era = "=$1"
hex = "0.4"
TOML
(cd "$work" && CARGO_TARGET_DIR=$DEVNET_DIR/cml-build/target cargo build --release -q && cp "$DEVNET_DIR/cml-build/target/release/cml-probe" "$2")
