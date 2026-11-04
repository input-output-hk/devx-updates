#!/bin/bash
set -euo pipefail

# Both host mounts are read-only. All project/cache writes stay in bounded tmpfs.
cp -a /source/. /work/source
cd "/work/source/$1"
export GRADLE_USER_HOME=/work/gradle-home
gradle --version >&2
if gradle --no-daemon --max-workers=2 -Dorg.gradle.jvmargs=-Xmx1024m \
  -PskipSigning -I /capture/gradle-resolution.init.gradle \
  -Dreadiness.root="$PWD" -Dreadiness.selection=/capture/selection.json \
  -Dreadiness.output=/work/resolution.json readinessResolution > /work/gradle.log 2>&1; then
  cat /work/gradle.log >&2
  # Do not return project-created symlinks, devices or unbounded output.
  test -f /work/resolution.json && test ! -L /work/resolution.json
  test "$(stat -c %s /work/resolution.json)" -le 33554432
  cat /work/resolution.json
else
  status=$?
  cat /work/gradle.log >&2
  exit "$status"
fi
