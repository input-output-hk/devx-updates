import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import { decodeSnapshot } from "./snapshot-storage";

/** Resolve the ref once so every chunk comes from the same immutable commit. */
export function readGitSnapshot(ref: string) {
  const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8", timeout: 30000, killSignal: "SIGKILL", maxBuffer: 128 * 1024 * 1024 });
  const commit = git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
  const path = "data/readiness/snapshot.json";
  return decodeSnapshot(JSON.parse(git(["show", `${commit}:${path}`])), (relative) => git(["show", `${commit}:${posix.join(posix.dirname(path), relative)}`]));
}
