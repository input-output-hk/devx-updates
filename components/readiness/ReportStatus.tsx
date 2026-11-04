"use client";

import { useEffect, useState } from "react";
import { loadReport } from "@/lib/readiness/report-loader";
import type { ReportReference } from "@/lib/readiness/report-contract";

export function useReport<T>(reference: ReportReference, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  const key = `${reference.file}:${reference.digest}:${attempt}`;
  const { file, digest } = reference;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadReport<T>({ file, digest }).then(
      (data) => { if (active) setResult({ key, data }); },
      (error) => { if (active) setResult({ key, error: error instanceof Error ? error.message : "Unable to load report." }); },
    );
    return () => { active = false; };
  }, [enabled, file, digest, key]);
  return { data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined, retry: () => setAttempt((value) => value + 1) };
}

export default function ReportStatus({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div role="alert" className="space-y-3 rounded-lg border border-border p-4 text-sm"><p>{error}</p><button className="rounded-lg border border-border px-3 py-2" onClick={retry}>Retry report</button></div>
    : <p role="status" className="p-4 text-sm text-muted">Loading report…</p>;
}
