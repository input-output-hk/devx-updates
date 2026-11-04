import { digest, finalize, list, object, text, validate } from "./core";
import type { Snapshot } from "./types";

const TABLES = ["artifacts", "occurrences", "edges"] as const;
type Table = typeof TABLES[number];
type GraphRecord = Snapshot[Table][number];
export const MAX_SNAPSHOT_CHUNK_BYTES = 2 * 1024 * 1024;
interface ChunkReference { path: string; digest: string; records: number }
interface SnapshotManifest {
  storageVersion: 1;
  snapshot: Omit<Snapshot, Table>;
  tables: Record<Table, ChunkReference[]>;
}

function encodeChunk(kind: Table, group: string, records: GraphRecord[]): string {
  const evidenceSets: string[][] = [];
  const evidenceIndexes = new Map<string, number>();
  const rows = records.map((record) => {
    if (!("evidenceIds" in record)) return record;
    const { evidenceIds, ...fields } = record;
    const key = JSON.stringify(evidenceIds);
    let index = evidenceIndexes.get(key);
    if (index === undefined) { index = evidenceSets.length; evidenceIndexes.set(key, index); evidenceSets.push(evidenceIds); }
    return { ...fields, evidenceSet: index };
  });
  const header = JSON.stringify({ storageVersion: 1, kind, group, ...(kind !== "artifacts" ? { evidenceSets } : {}) }, null, 2);
  // One complete record per line keeps diffs readable without repeated indentation.
  return `${header.slice(0, -2)},\n  "records": [\n${rows.map((row) => `    ${JSON.stringify(row)}`).join(",\n")}\n  ]\n}\n`;
}

/** Physical storage changes never alter the logical Snapshot schema or digest. */
export function snapshotFiles(snapshot: Snapshot): { manifest: SnapshotManifest; chunks: { path: string; content: string }[] } {
  validate(snapshot);
  const { artifacts, occurrences, edges, ...metadata } = snapshot;
  const manifest: SnapshotManifest = { storageVersion: 1, snapshot: metadata, tables: { artifacts: [], occurrences: [], edges: [] } };
  const chunks: { path: string; content: string }[] = [];
  const profiles = new Map(occurrences.map((record) => [record.id, record.profileId]));
  function append(kind: Table, group: string, records: GraphRecord[]) {
    const content = encodeChunk(kind, group, records);
    if (Buffer.byteLength(content) > MAX_SNAPSHOT_CHUNK_BYTES) {
      if (records.length === 1) throw new Error(`Snapshot record exceeds chunk limit: ${records[0].id}`);
      const middle = Math.floor(records.length / 2);
      append(kind, group, records.slice(0, middle)); append(kind, group, records.slice(middle));
      return;
    }
    const hash = digest(content);
    const path = `snapshots/${kind}/${hash}.json`;
    chunks.push({ path, content });
    manifest.tables[kind].push({ path, digest: hash, records: records.length });
  }
  for (const [kind, records] of [["artifacts", artifacts], ["occurrences", occurrences], ["edges", edges]] as const) {
    const groups = new Map<string, GraphRecord[]>();
    for (const record of records) {
      const group = "from" in record ? profiles.get(record.from)! : "profileId" in record ? record.profileId : `artifacts:${digest(record.id).slice(0, 1)}`;
      const values = groups.get(group) ?? []; values.push(record); groups.set(group, values);
    }
    for (const [group, values] of [...groups].sort(([a], [b]) => a.localeCompare(b, "en"))) {
      append(kind, group, values.sort((a, b) => a.id.localeCompare(b.id, "en")));
    }
  }
  return { manifest, chunks };
}

/** readChunk receives only checked relative paths, including for historical Git reads. */
export function decodeSnapshot(raw: unknown, readChunk: (path: string) => string): Snapshot {
  const document = object(raw, "snapshot");
  let snapshot: Snapshot;
  if (document.storageVersion === undefined) {
    snapshot = document as unknown as Snapshot;
  } else {
    if (document.storageVersion !== 1) throw new Error("Unsupported snapshot storage version");
    const metadata = object(document.snapshot, "snapshot metadata");
    const tables = object(document.tables, "snapshot tables");
    const graph: Record<Table, GraphRecord[]> = { artifacts: [], occurrences: [], edges: [] };
    for (const kind of TABLES) {
      if (kind in metadata) throw new Error("Manifest metadata cannot contain graph tables");
      const paths = new Set<string>();
      for (const rawReference of list(tables[kind], `${kind} chunks`)) {
        const reference = object(rawReference, "chunk reference");
        const path = text(reference.path);
        if (typeof reference.digest !== "string" || !/^[a-f0-9]{64}$/.test(reference.digest) || path !== `snapshots/${kind}/${reference.digest}.json`) throw new Error("Invalid snapshot chunk path");
        if (paths.has(path)) throw new Error("Duplicate snapshot chunk reference");
        paths.add(path);
        const content = readChunk(path);
        if (digest(content) !== reference.digest) throw new Error(`Snapshot chunk checksum mismatch: ${path}`);
        const chunk = object(JSON.parse(content), "snapshot chunk");
        if (chunk.storageVersion !== 1 || chunk.kind !== kind) throw new Error("Snapshot chunk format mismatch");
        const rows = list(chunk.records, "chunk records");
        if (!Number.isSafeInteger(reference.records) || reference.records !== rows.length) throw new Error("Snapshot chunk record count mismatch");
        const evidenceSets = kind === "artifacts" ? [] : list(chunk.evidenceSets, "evidence sets").map((ids) => list(ids).map((id) => text(id)));
        for (const row of rows) {
          const record = object(row, "graph record");
          if (kind === "artifacts") { graph[kind].push(record as unknown as GraphRecord); continue; }
          const { evidenceSet, ...fields } = record;
          if ("evidenceIds" in fields || !Number.isSafeInteger(evidenceSet) || (evidenceSet as number) < 0 || (evidenceSet as number) >= evidenceSets.length) throw new Error("Invalid snapshot evidence-set reference");
          // Each record owns its array: a later review must not mutate its neighbors.
          graph[kind].push({ ...fields, evidenceIds: [...evidenceSets[evidenceSet as number]] } as unknown as GraphRecord);
        }
      }
    }
    snapshot = { ...metadata, ...graph } as Snapshot;
  }
  validate(snapshot);
  const expected = snapshot.semanticDigest;
  if (finalize(snapshot).semanticDigest !== expected) throw new Error("Snapshot semantic digest mismatch");
  return snapshot;
}
