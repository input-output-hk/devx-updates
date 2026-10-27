# Native Gradle graph fixture

`resolution.json` is unmodified output from `gradle-resolution.init.gradle`, run
with the adjacent project and explicit `selection.json`. Empty included project
directories need no build files; the root configures them. No Java compilation
or tests ran. The native resolver selected SLF4J 1.7.36 against competing 1.7.32
and 1.7.36 requests and a platform constraint. The local diamond, shared main and
test-fixture variants, and separate annotation-processor configuration exercise
relationships that a flattened dependency list would lose.

Worker: `gradle@sha256:deb7b59256192aed1f463ab5e698c509cc77ce5d4e421d8b89b5d99eb0b24538`,
Gradle 7.5.1, Eclipse Adoptium JDK 17.0.5, Linux amd64. Command from the fixture
project directory (adjust absolute input/output paths for the disposable worker):

```sh
gradle --no-daemon --max-workers=2 -Dorg.gradle.jvmargs=-Xmx768m \
  -I /capture/gradle-resolution.init.gradle \
  -Dreadiness.selection=/work/selection.json \
  -Dreadiness.output=/work/resolution.json readinessResolution
```

Run project evaluation in a disposable worker with no publishing credentials,
host home directory, or container socket. The ordinary TypeScript tests consume
the recorded output offline and do not start Gradle or contact Maven Central.
