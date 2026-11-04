import { mkdirSync, readFileSync, renameSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { canonical, digest, finalize, upgradeOperationalGap } from "./core";
import type { Evidence, Resolution, Snapshot } from "./types";
import { decodeSnapshot, snapshotFiles } from "./snapshot-storage";

export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  const content = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(temp, path.endsWith(".json.gz") ? gzipSync(content) : content);
  renameSync(temp, path);
}

export function readJson(path: string): unknown {
  const content = readFileSync(path);
  return JSON.parse((path.endsWith(".json.gz") ? gunzipSync(content) : content).toString("utf8"));
}

export function readSnapshot(path: string): Snapshot {
  return decodeSnapshot(readJson(path), (relative) => readFileSync(join(dirname(path), relative), "utf8"));
}

export function acquireLock(directory: string): () => void {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, ".writer-lock.json");
  if (existsSync(path)) {
    const lock = readJson(path) as { pid: number; host: string };
    if (lock.host !== hostname()) throw new Error("Collection directory is locked on another host");
    let running = true;
    try { process.kill(lock.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") running = false; }
    if (running) throw new Error(`Collection directory is in use by process ${lock.pid}`);
    unlinkSync(path);
  }
  writeFileSync(path, JSON.stringify({ pid: process.pid, host: hostname() }), { flag: "wx" });
  return () => unlinkSync(path);
}

export class Store {
  constructor(readonly directory: string) {}

  load(): Snapshot {
    return readSnapshot(join(this.directory, "snapshot.json"));
  }

  save(snapshot: Snapshot, options: { preserveTimestamp?: boolean } = {}) {
    if (!options.preserveTimestamp) snapshot.generatedAt = new Date().toISOString();
    finalize(snapshot);
    const { manifest, chunks } = snapshotFiles(snapshot);
    for (const chunk of chunks) {
      const path = join(this.directory, chunk.path);
      if (existsSync(path)) {
        if (readFileSync(path, "utf8") !== chunk.content) throw new Error(`Corrupt existing snapshot chunk: ${chunk.path}`);
      } else {
        mkdirSync(dirname(path), { recursive: true });
        const temporary = `${path}.${process.pid}.tmp`;
        writeFileSync(temporary, chunk.content); renameSync(temporary, path);
      }
    }
    writeJson(join(this.directory, "snapshot.json"), manifest);
  }

  evidence(value: unknown, description: string, sourceUrl?: string): Evidence {
    const content = canonical(value);
    const hash = digest(content);
    const relative = `evidence/${hash}.json.gz`;
    const path = join(this.directory, relative);
    mkdirSync(dirname(path), { recursive: true });
    const evidence = { id: `evidence:${hash}`, digest: hash, path: relative, description, ...(sourceUrl ? { sourceUrl } : {}) };
    if (!existsSync(path)) writeFileSync(path, gzipSync(content));
    else this.readEvidence(evidence);
    return evidence;
  }

  readEvidence(evidence: Evidence): unknown {
    if (!/^[a-f0-9]{64}$/.test(evidence.digest) || evidence.path !== `evidence/${evidence.digest}.json.gz`) throw new Error("Invalid evidence path");
    const content = gunzipSync(readFileSync(join(this.directory, evidence.path))).toString("utf8");
    if (digest(content) !== evidence.digest) throw new Error(`Evidence checksum mismatch: ${evidence.id}`);
    return JSON.parse(content);
  }

  verify(snapshot: Snapshot) {
    for (const evidence of snapshot.evidence) this.readEvidence(evidence);
  }
}

export function addEvidence(snapshot: Snapshot, evidence: Evidence) {
  if (!snapshot.evidence.some((e) => e.id === evidence.id)) snapshot.evidence.push(evidence);
}

export function mergeResolution(snapshot: Snapshot, result: Resolution) {
  const tool = snapshot.tools.find((t) => t.id === result.profile.toolId);
  if (!tool) throw new Error(`Unknown catalog tool: ${result.profile.toolId}`);
  if (snapshot.profiles.some((p) => p.id === result.profile.id)) return;
  snapshot.profiles.push(result.profile);
  for (const artifact of result.artifacts) if (!snapshot.artifacts.some((a) => a.id === artifact.id)) snapshot.artifacts.push(artifact);
  snapshot.occurrences.push(...result.occurrences);
  snapshot.edges.push(...result.edges);
  tool.resolution = "partial";
  tool.gaps = tool.gaps.map(upgradeOperationalGap).filter((g) => g.code !== "native-resolution-missing");
  tool.gaps.push(...result.gaps);
  tool.evidenceIds.push(...result.profile.evidenceIds);
}
