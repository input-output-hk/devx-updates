"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { detailShard } from "@/lib/readiness/report-contract";
import type { ImpactDetail, ReportReference } from "@/lib/readiness/report-contract";
import ReportStatus, { useReport } from "./ReportStatus";

export default function ConsumerPaths({ id, references, names, summary, children, investigation = false }: { id: string; references: ReportReference[]; names: Record<string, string>; summary: ReactNode; children?: ReactNode; investigation?: boolean }) {
  const [open, setOpen] = useState(false);
  const report = useReport<Record<string, ImpactDetail>>(references[detailShard(id)], open);
  const detail = report.data?.[id];
  return <details onToggle={(event) => setOpen(event.currentTarget.open)}><summary className="cursor-pointer font-semibold">{summary}</summary>
    {open && <>{children}{!detail ? <ReportStatus error={report.error ?? (report.data ? "Consumer paths are missing from this report. Reload the page and try again." : undefined)} retry={report.retry} /> : <>
      {!detail.explainedPaths.length && <p className="my-2 text-xs text-muted">No downstream consumer path is recorded. Root coverage and behavior still require investigation.</p>}
      <ul className="space-y-3">{detail.explainedPaths.map((path, index) => <li key={index}>
        <Link href={`/map/readiness/${path.toolId}#dependencies`}>{names[path.toolId]} · {path.release}</Link>
        <div className="text-xs text-muted">{path.bucket} · {path.platform}</div>
        <div className="break-words text-xs text-muted">{path.labels.join(" → ")}</div>
        <div className="break-all text-xs text-muted">{path.profileId}</div>
        {investigation && <p className="mt-1 text-xs">Check applicability to this consumer’s required workflow before planning an upgrade or retest.</p>}
      </li>)}</ul>
    </>}</>}
  </details>;
}
