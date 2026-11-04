#!/usr/bin/env bash
# Dependency solve of a Haskell tool for the bump readings: solve.sh CHECKOUT LOG [extra cabal flags...]
# Runs cabal update and `cabal build all --dry-run` inside the image built from ./Dockerfile
# (docker build -t readiness-haskell:9.6.7 scripts/readiness/bump-solve). CABAL_HOME keeps the index between runs.
# The container runs as the calling user so the index and dist-newstyle stay deletable without root.
set -uo pipefail
checkout=$(cd "$1" && pwd) log=$2; shift 2
cabal_home=${CABAL_HOME:-/tmp/dijkstra-devnet/haskell/cabal}; mkdir -p "$cabal_home"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e CABAL_DIR=/cabal -v "$cabal_home":/cabal -v "$checkout":/src -w /src readiness-haskell:9.6.7 \
  sh -c "cabal update >/dev/null 2>&1; cabal build all --dry-run $*; echo \"exit \$?\"" > "$log" 2>&1
tail -1 "$log"
