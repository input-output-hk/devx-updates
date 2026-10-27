#!/usr/bin/env bash
# Build probe/ against one gouroboros release: build-probe.sh VERSION OUTPUT (VERSION like v0.213.9).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp "$here/probe/main.go" "$work/"
printf 'module probe\n\ngo 1.24\n\nrequire github.com/blinklabs-io/gouroboros %s\n' "$1" > "$work/go.mod"
(cd "$work" && GOFLAGS="-mod=mod -buildvcs=false" go mod tidy && GOFLAGS="-mod=mod -buildvcs=false" go build -o "$2" .)
