import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SnapshotComparison } from "./comparison";
import { readJson } from "./store";

/** Accept historical plain JSON, but never silently choose between two reports. */
export function readComparison(directory: string, targetDigest: string): SnapshotComparison | null {
  const paths = ["changes.json.gz", "changes.json"]
    .map((name) => join(directory, name)).filter((path) => existsSync(path));
  if (paths.length > 1) throw new Error("Both changes.json.gz and changes.json exist; keep only the intended comparison report");
  if (!paths.length) return null;
  const changes = readJson(paths[0]) as SnapshotComparison;
  return changes.schemaVersion === 2 && changes.to === targetDigest ? changes : null;
}
