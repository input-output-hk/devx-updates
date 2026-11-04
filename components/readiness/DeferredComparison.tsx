"use client";

import { useState } from "react";
import type { SnapshotComparison } from "@/lib/readiness/comparison";
import type { ReportReference } from "@/lib/readiness/report-contract";
import Comparison from "./Comparison";
import ReportStatus, { useReport } from "./ReportStatus";

export default function DeferredComparison({ reference, available }: { reference: ReportReference; available: boolean }) {
  const [open, setOpen] = useState(false);
  const report = useReport<SnapshotComparison | null>(reference, open && available);
  return <details className="rounded-xl border border-border bg-surface p-5" onToggle={(event) => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
    <summary className="cursor-pointer font-medium">Snapshot comparison</summary>
    {open && <div className="mt-4">{!available ? <p className="text-sm text-muted">No comparison has been retained for this snapshot. Generate one with the readiness diff command.</p> : report.data ? <Comparison changes={report.data} /> : <ReportStatus error={report.error ?? (report.data === null ? "Comparison is missing. Reload the page and try again." : undefined)} retry={report.retry} />}</div>}
  </details>;
}
