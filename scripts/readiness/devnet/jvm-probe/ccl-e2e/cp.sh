#!/usr/bin/env bash
# cp.sh VERSION OUTFILE: resolve cardano-client-lib VERSION's runtime classpath from Maven Central.
set -euo pipefail
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
cat > "$work/pom.xml" <<POM
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>probe</groupId><artifactId>probe</artifactId><version>0</version><dependencies>
<dependency><groupId>com.bloxbean.cardano</groupId><artifactId>cardano-client-lib</artifactId><version>$1</version></dependency>
</dependencies></project>
POM
(cd "$work" && mvn -q dependency:build-classpath -Dmdep.outputFile="$2")
