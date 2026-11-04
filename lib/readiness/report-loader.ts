import { detailShard } from "./report-contract";
import type { ImpactDetail, ImpactIndexRow, ImpactRow, ReportEnvelope, ReportReference } from "./report-contract";

/** Cache successful and in-flight requests; failures must remain retryable. */
export function createReportLoader(fetcher: typeof fetch = (...args) => fetch(...args)) {
  const cache = new Map<string, Promise<unknown>>();
  return function load<T>(reference: ReportReference, basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""): Promise<T> {
    const url = `${basePath}/map/readiness/data/${reference.file}`;
    const key = `${url}:${reference.digest}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = (async () => {
        const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`Report unavailable (HTTP ${response.status}). Retry, or reload the page after deployment finishes.`);
        const report = await response.json() as ReportEnvelope<T>;
        if (!report || report.schemaVersion !== 1 || report.digest !== reference.digest || !("data" in report)) {
          throw new Error("Report does not match this page. Reload the page and try again.");
        }
        return report.data;
      })().catch((error) => { cache.delete(key); throw error; });
      cache.set(key, pending);
    }
    return pending as Promise<T>;
  };
}

export const loadReport = createReportLoader();

export async function loadImpactDetails(ids: string[], references: ReportReference[], load = loadReport) {
  const shards = [...new Set(ids.map(detailShard))];
  const details: Record<string, ImpactDetail> = {};
  // Bound concurrency for full exports; never emit a partially hydrated download.
  for (let start = 0; start < shards.length; start += 4) {
    const rows = await Promise.all(shards.slice(start, start + 4).map((shard) => load<Record<string, ImpactDetail>>(references[shard])));
    for (const row of rows) Object.assign(details, row);
  }
  for (const id of ids) if (!details[id]) throw new Error("Consumer paths are missing from this report. Reload the page and try again.");
  return details;
}

export async function hydrateImpacts(rows: ImpactIndexRow[], references: ReportReference[]): Promise<ImpactRow[]> {
  const details = await loadImpactDetails(rows.map((row) => row.artifactId), references);
  return rows.map((row) => ({ ...row, ...details[row.artifactId] }));
}
