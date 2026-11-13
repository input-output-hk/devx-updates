#!/usr/bin/env bash
# Build and run a JVM probe against one released version from Maven Central.
#   run.sh ccl VERSION  < labeled     cardano-client-lib (e.g. 0.8.0-pre7, 0.7.3) on "name hex" transaction lines
#   run.sh yaci VERSION < blocks.txt  yaci (e.g. 0.5.0-pre15) on "era hex" block lines from probe-<version> blocks
# Needs maven and java 21, or java 25 for yaci 0.5.x, whose classes target it
# (on NixOS: nix shell nixpkgs#jdk25 nixpkgs#maven). The resolved classpath is printed to
# stderr so the exact dependency set is part of the run's evidence.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
case "$1" in
  ccl) artifact=cardano-client-lib main=CclProbe ;;
  yaci) artifact=yaci main=YaciProbe ;;
  *) echo "usage: run.sh ccl|yaci VERSION" >&2; exit 1 ;;
esac
version=$2
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
cat > "$work/pom.xml" <<POM
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>probe</groupId><artifactId>probe</artifactId><version>0</version>
  <dependencies>
    <dependency><groupId>com.bloxbean.cardano</groupId><artifactId>$artifact</artifactId><version>$version</version></dependency>
  </dependencies>
</project>
POM
(cd "$work" && mvn -q dependency:build-classpath -Dmdep.outputFile=cp.txt >&2)
cp=$(cat "$work/cp.txt")
tr ':' '\n' <<<"$cp" | sed 's|.*/||' | sort >&2
mkdir -p "$work/classes"
javac -nowarn -cp "$cp" -d "$work/classes" "$here/$main.java" >&2
java -cp "$work/classes:$cp" "$main" "$version"
