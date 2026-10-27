import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { posix } from "node:path";
import { execute } from "./source";

export const GRADLE_IMAGE = "gradle@sha256:deb7b59256192aed1f463ab5e698c509cc77ce5d4e421d8b89b5d99eb0b24538";
export const GRADLE_WORKER_LIMITS = { timeoutMs: 360000, memory: "2g", cpus: "2", pids: "256", workBytes: 1073741824, temporaryBytes: 134217728 } as const;

type Executor = (file: string, args: string[], options: { timeout: number; killSignal: "SIGKILL"; maxBuffer: number }) => Promise<{ stdout: string; stderr: string }>;

/** A unique container is removed even when the Docker client times out or its output exceeds the bound. */
export async function runGradleWorker(checkout: string, captureDirectory: string, sourceDirectory: string, run: Executor = execute, timeoutMs: number = GRADLE_WORKER_LIMITS.timeoutMs) {
  const source = realpathSync(checkout); const capture = realpathSync(captureDirectory);
  if ([source, capture].some((path) => /[,\r\n]/.test(path))) throw new Error("Docker bind paths cannot contain commas or newlines");
  if (posix.isAbsolute(sourceDirectory) || sourceDirectory.includes("\\") || posix.normalize(sourceDirectory) !== sourceDirectory || sourceDirectory === ".." || sourceDirectory.startsWith("../")) throw new Error("Gradle source directory escapes checkout");
  const name = `devx-readiness-gradle-${randomUUID()}`;
  const args = ["create", "--name", name, "--pull=never", "--platform", "linux/amd64", "--user", "1000:1000",
    "--log-driver", "none",
    "--read-only", "--memory", GRADLE_WORKER_LIMITS.memory, "--memory-swap", GRADLE_WORKER_LIMITS.memory,
    "--cpus", GRADLE_WORKER_LIMITS.cpus, "--pids-limit", GRADLE_WORKER_LIMITS.pids, "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "--tmpfs", `/work:rw,nosuid,nodev,size=${GRADLE_WORKER_LIMITS.workBytes},uid=1000,gid=1000`,
    "--tmpfs", `/tmp:rw,nosuid,nodev,size=${GRADLE_WORKER_LIMITS.temporaryBytes},uid=1000,gid=1000`,
    // Mask the image's declared cache volume so project writes cannot escape the tmpfs limits.
    "--tmpfs", "/home/gradle/.gradle:rw,nosuid,nodev,size=16777216,uid=1000,gid=1000",
    "--mount", `type=bind,src=${source},dst=/source,readonly`, "--mount", `type=bind,src=${capture},dst=/capture,readonly`,
    "--workdir", "/work", "--entrypoint", "/bin/bash", GRADLE_IMAGE, "/capture/gradle-worker.sh", sourceDirectory];
  let result: { stdout: string; stderr: string } | undefined;
  let failure: unknown;
  try {
    try { await run("docker", ["image", "inspect", GRADLE_IMAGE], { timeout: 30000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }); }
    catch (error) {
      if (!/No such image|No such object/i.test(String(error) + String((error as { stderr?: string }).stderr ?? ""))) throw error;
      await run("docker", ["pull", "--platform", "linux/amd64", GRADLE_IMAGE], { timeout: 180000, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 });
    }
    // Establish the exact container before starting project code; a start timeout cannot lose its identity.
    await run("docker", args, { timeout: 30000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 });
    result = await run("docker", ["start", "--attach", name], { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 48 * 1024 * 1024 });
  }
  catch (error) { failure = error; }
  try { await run("docker", ["rm", "--force", "--volumes", name], { timeout: 30000, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }); }
  catch (error) {
    if (!/No such container/i.test(String(error) + String((error as { stderr?: string }).stderr ?? ""))) {
      const status = (failure ?? error) as { cmd?: string; code?: string | number; signal?: string };
      throw Object.assign(new Error(`Gradle worker cleanup failed for ${name}; inspect that exact container before retrying. ${String(error)}${failure ? `; collection failure: ${String(failure)}` : ""}`, { cause: failure ?? error }), {
        cmd: status.cmd, code: status.code, signal: status.signal,
        stdout: (failure as { stdout?: string } | undefined)?.stdout ?? result?.stdout ?? "",
        stderr: (failure as { stderr?: string } | undefined)?.stderr ?? result?.stderr ?? "",
      });
    }
  }
  if (failure) throw failure;
  return result!;
}
