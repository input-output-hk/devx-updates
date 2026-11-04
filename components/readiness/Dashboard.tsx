"use client";

import Link from "next/link";
import { useState } from "react";
import type { Tool } from "@/lib/readiness/types";
import { CAPABILITY_LABELS, ECOSYSTEMS } from "@/lib/readiness/types";
import type { CapabilityRow } from "@/lib/readiness/capabilities";
import Download from "./Download";
import InvestigationTable from "./InvestigationTable";
import ConsumerPaths from "./ConsumerPaths";
import ReportStatus, { useReport } from "./ReportStatus";
import { hydrateImpacts, loadReport } from "@/lib/readiness/report-loader";
import type { ImpactIndexRow, ReportManifest, Reports } from "@/lib/readiness/report-contract";

const inputStyle = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const th = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted";
const td = "px-4 py-3 align-top text-sm";

export default function Dashboard({ tools, manifest, profileCounts, asOf }: { tools: Tool[]; manifest: ReportManifest; profileCounts: Record<string, number>; asOf: string }) {
  const [view, setView] = useState("coverage");
  const [search, setSearch] = useState("");
  const [ecosystem, setEcosystem] = useState("");
  const [coverage, setCoverage] = useState("");
  const [page, setPage] = useState(0);
  const [groupVersions, setGroupVersions] = useState(false);
  const [capability, setCapability] = useState("");
  const [verification, setVerification] = useState("");
  const [source, setSource] = useState("");
  const [scope, setScope] = useState("");
  const [ownership, setOwnership] = useState("");
  const [chainEvidence, setChainEvidence] = useState("");
  const impactReport = useReport<ImpactIndexRow[]>(manifest.reports[groupVersions ? "projects" : "impacts"], view === "impact");
  const queueReport = useReport<Reports["queue"]>(manifest.reports.queue, view === "queue" || view === "investigation");
  const investigationReport = useReport<Reports["investigations"]>(manifest.reports.investigations, view === "investigation");
  const capabilityReport = useReport<CapabilityRow[]>(manifest.reports.capabilities, view === "capabilities");
  const needed = view === "impact" ? [impactReport] : view === "investigation" ? [queueReport, investigationReport] : view === "queue" ? [queueReport] : view === "capabilities" ? [capabilityReport] : [];
  const ready = needed.every((report) => report.data !== undefined);
  const failed = needed.find((report) => report.error);
  const work = { coverage: queueReport.data?.coverage ?? [], investigations: investigationReport.data ?? [], unmatchedAssignments: queueReport.data?.unmatchedAssignments ?? [] };
  const capabilities = capabilityReport.data ?? [];
  const names = Object.fromEntries(tools.map((t) => [t.id, t.name]));
  const stale = (t: Tool) => !t.lastSuccess || Date.parse(asOf) - Date.parse(t.lastSuccess) > 14 * 86400000;
  const matching = tools.filter((t) => {
    const q = search.toLowerCase();
    return `${t.name} ${t.id} ${t.maintainer} ${t.repo ?? ""}`.toLowerCase().includes(q)
      && (!ecosystem || t.ecosystems.includes(ecosystem as typeof t.ecosystems[number]))
      && (!coverage || (coverage === "profiles" ? !!profileCounts[t.id] : coverage === "errors" ? !!t.discoveryError : coverage === "stale" ? stale(t) : t.resolution === coverage));
  }).sort((a, b) => a.name.localeCompare(b.name));
  const impactRows = (impactReport.data ?? []).filter((i) => `${i.artifact.name} ${i.artifact.version} ${i.artifact.ecosystem}`.toLowerCase().includes(search.toLowerCase()) && (!ecosystem || i.artifact.ecosystem === ecosystem));
  const matchingIds = new Set(matching.map((t) => t.id));
  const owned = (owner: string | null) => !ownership || (ownership === "assigned" ? !!owner : !owner);
  const gaps = work.coverage.filter((gap) => matchingIds.has(gap.toolId) && owned(gap.owner));
  const investigations = work.investigations.filter((item) => `${item.name} ${item.source} ${item.owner ?? ""} ${item.maintainerHints.map((hint) => hint.maintainer).join(" ")}`.toLowerCase().includes(search.toLowerCase())
    && (!ecosystem || item.ecosystem === ecosystem) && owned(item.owner)
    && (!chainEvidence || (chainEvidence === "verified" ? item.factors.verifiedCapabilities > 0 : chainEvidence === "potential" ? item.factors.potentialCapabilities > 0 : item.factors.verifiedCapabilities + item.factors.potentialCapabilities === 0)));
  const capabilityRows = capabilities.filter((c) => matchingIds.has(c.toolId) && (!capability || c.capability === capability) && (!verification || c.verification === verification) && (!source || c.current === (source === "current")) && (!scope || c.scope === scope));
  const length = view === "investigation" ? investigations.length : view === "capabilities" ? capabilityRows.length : view === "impact" ? impactRows.length : view === "queue" ? gaps.length : matching.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(length / 40) - 1));
  const start = currentPage * 40;
  async function exportData() {
    if (view === "impact") return hydrateImpacts(impactRows, manifest.details);
    if (view === "investigation") {
      const projects = await loadReport<Reports["projects"]>(manifest.reports.projects);
      const ids = new Set(investigations.map((item) => item.projectId));
      const selected = projects.filter((project) => ids.has(project.artifactId));
      if (selected.length !== ids.size) throw new Error("Investigation components are missing. Reload the page and try again.");
      const hydrated = await hydrateImpacts(selected, manifest.details);
      const projectMap = new Map(hydrated.map((project) => [project.artifactId, project]));
      return { snapshot: queueReport.data!.snapshot, catalogTools: tools.length, ranking: queueReport.data!.ranking, investigations: investigations.map((item) => ({ ...item, impact: projectMap.get(item.projectId) })), unmatchedAssignments: work.unmatchedAssignments };
    }
    return view === "capabilities" ? capabilityRows : view === "queue" ? gaps : matching;
  }

  function reset() { setPage(0); }
  return <section className="space-y-5" aria-label="Readiness explorer">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2" aria-label="Report view">
        {[["coverage", "Tool coverage"], ["impact", "Upstream impact"], ["queue", "Work queue"], ["investigation", "Investigations"], ["capabilities", "Capabilities"]].map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => { setView(id); setSearch(""); setEcosystem(""); setCoverage(""); setCapability(""); setVerification(""); setSource(""); setScope(""); setOwnership(""); setChainEvidence(""); reset(); }} className={`rounded-lg border px-4 py-2 text-sm font-medium ${view === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}>{label}</button>)}
      </div>
      {ready && <Download key={view} filename={`readiness-${view}.json`} getData={exportData} label="Export filtered results" />}
    </div>
    {!ready && <ReportStatus error={failed?.error} retry={() => { for (const report of needed) if (report.error) report.retry(); }} />}
    {ready && <>
    {view === "impact" && <p className="max-w-4xl text-sm text-muted">Counts are distinct cataloged tools in collected profiles, not ecosystem adoption. Required, optional, build, and test exposure are separate. Potential reach includes suggested or disputed edges. Expand a component to inspect paths; a high count is not a failure finding.</p>}
    {view === "queue" && <p className="text-sm text-muted">Unresolved evidence and next actions for every tool. Missing coverage is never treated as compatible.</p>}
    {view === "investigation" && <p className="max-w-4xl text-sm text-muted">Ordered by current component capability evidence (verified, then suggested or disputed), distinct verified runtime/build consumers, potential consumers, then consumer gaps. Factors are shown separately. Unknown behavior needs investigation; high reach is not a failure. Expand a component for version-specific consumer tasks and evidence links.</p>}
    {(view === "queue" || view === "investigation") && work.unmatchedAssignments.length > 0 && <details className="rounded-lg border border-border p-3 text-sm"><summary>{work.unmatchedAssignments.length} assignments need reconciliation</summary><ul className="mt-2 space-y-2">{work.unmatchedAssignments.map((assignment) => <li key={assignment.taskId} className="break-all">{assignment.taskId} · {assignment.owner ?? "Unassigned"} · No current task matches this retained assignment.</li>)}</ul><Download filename="unmatched-work-assignments.json" data={work.unmatchedAssignments} label="Export unmatched assignments" /></details>}
    {view === "capabilities" && <p className="text-sm text-muted">Behavior findings apply only to their release, profile and condition. Suggestions are not verified behavior. Historical findings do not describe the current source. Tools without findings remain unresolved; this list is not a readiness assessment.</p>}
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-muted">{view === "investigation" ? "Search component, owner or maintainer" : view === "impact" ? "Search component" : "Search tool or maintainer"}<input value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder={view === "impact" || view === "investigation" ? "e.g. pallas, serialization" : "e.g. Oura, TxPipe"} className={inputStyle} /></label>
      <label className="flex flex-col gap-1 text-xs text-muted">Ecosystem<select value={ecosystem} onChange={(e) => { setEcosystem(e.target.value); reset(); }} className={inputStyle}><option value="">All ecosystems</option>{ECOSYSTEMS.map((e) => <option key={e}>{e}</option>)}</select></label>
      {(view === "coverage" || view === "queue") && <label className="flex flex-col gap-1 text-xs text-muted">Coverage filter<select value={coverage} onChange={(e) => { setCoverage(e.target.value); reset(); }} className={inputStyle}><option value="">All tools</option><option value="profiles">Has native profiles</option><option value="unresolved">Needs native resolution</option><option value="errors">Discovery failed</option><option value="stale">No recent discovery (14 days)</option></select></label>}
      {view === "impact" && <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={groupVersions} onChange={(e) => { setGroupVersions(e.target.checked); reset(); }} />Group package versions</label>}
      {(view === "queue" || view === "investigation") && <label className="flex flex-col gap-1 text-xs text-muted">Ownership<select value={ownership} onChange={(e) => { setOwnership(e.target.value); reset(); }} className={inputStyle}><option value="">All tasks</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned</option></select></label>}
      {view === "investigation" && <label className="flex flex-col gap-1 text-xs text-muted">Component capability evidence<select value={chainEvidence} onChange={(e) => { setChainEvidence(e.target.value); reset(); }} className={inputStyle}><option value="">All evidence states</option><option value="verified">Verified</option><option value="potential">Suggested or disputed</option><option value="unknown">Unknown current behavior</option></select></label>}
      {view === "capabilities" && <>
        <label className="flex flex-col gap-1 text-xs text-muted">Capability<select className={inputStyle} value={capability} onChange={(e) => { setCapability(e.target.value); reset(); }}><option value="">All capabilities</option>{Object.entries(CAPABILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-muted">Verification<select className={inputStyle} value={verification} onChange={(e) => { setVerification(e.target.value); reset(); }}><option value="">All states</option>{["verified", "suggested", "disputed", "rejected"].map((v) => <option key={v}>{v}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-muted">Source applicability<select className={inputStyle} value={source} onChange={(e) => { setSource(e.target.value); reset(); }}><option value="">All retained sources</option><option value="current">Current source</option><option value="historical">Historical source</option></select></label>
        <label className="flex flex-col gap-1 text-xs text-muted">Behavior scope<select className={inputStyle} value={scope} onChange={(e) => { setScope(e.target.value); reset(); }}><option value="">All scopes</option>{["runtime", "build", "development"].map((v) => <option key={v}>{v}</option>)}</select></label>
      </>}
    </div>
    <p className="text-sm text-muted" role="status">{length.toLocaleString()} {view === "investigation" ? "investigations" : view === "capabilities" ? "findings" : view === "impact" ? "components" : view === "queue" ? "open gaps" : "tools"} shown · Full catalog: {tools.length} tools</p>
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      {view === "investigation" && <InvestigationTable items={investigations.slice(start, start + 40)} references={manifest.details} names={names} />}
      {view === "capabilities" && <table className="w-full min-w-[790px]"><caption className="sr-only">Capability findings by source and profile</caption><thead className="bg-surface-2"><tr>{["Tool / capability", "Release / profile", "Verification", "Scope / condition"].map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{capabilityRows.slice(start, start + 40).map((c) => <tr key={c.id}>
        <td className={td}><Link className="font-semibold" href={`/map/readiness/${c.toolId}#capabilities`}>{names[c.toolId]}</Link><div>{CAPABILITY_LABELS[c.capability]}</div></td>
        <td className={td}>{c.release}<div className="text-xs text-muted">{c.current ? "Current source" : "Historical source"} · {c.revision.slice(0, 12)}</div><div className="text-xs text-muted">{c.platform} · {c.features.join(", ") || "No selected features"}</div><div className="max-w-xs break-all text-xs text-muted">{c.profileId}</div></td>
        <td className={td}>{c.verification}</td><td className={td}>{c.scope}<div className="max-w-sm text-xs text-muted">{c.condition ?? "Unconditional in this profile"}</div></td>
      </tr>)}</tbody></table>}
      {view === "coverage" && <table className="w-full min-w-[790px]"><caption className="sr-only">Dependency coverage, separate from hardfork readiness</caption><thead className="bg-surface-2"><tr>{["Tool / maintainer", "Source release", "Native profiles", "Integration / capability review", "Readiness"].map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{matching.slice(start, start + 40).map((tool) => <tr key={tool.id}>
        <td className={td}><Link className="font-semibold" href={`/map/readiness/${tool.id}`}>{tool.name}</Link><div className="mt-1 text-xs text-muted">{tool.maintainer}</div><div className="mt-1 text-xs text-muted">{tool.ecosystems.join(" · ") || "Ecosystem unknown"}</div></td>
        <td className={td}><span className="break-all">{tool.release ?? "Unresolved"}</span><div className="mt-1 text-xs text-muted">{tool.discoveryError ? "Latest discovery failed" : tool.lastSuccess ? `Checked ${tool.lastSuccess.slice(0, 10)}` : "Not yet identified"}</div>{stale(tool) && <span className="text-xs text-status-progress">Needs discovery</span>}</td>
        <td className={td}>{profileCounts[tool.id] ? <><span className="font-semibold">{profileCounts[tool.id]} collected</span><div className="text-xs text-muted">Tool coverage: {tool.resolution}</div></> : <span className="text-status-progress">Unresolved</span>}</td>
        <td className={td}>Integrations: {tool.integration}<div className="text-xs text-muted">Capabilities: {tool.capability}</div><div className="text-xs text-muted">{tool.gaps.length} open gaps</div></td><td className={td}><span className="rounded-full bg-surface-2 px-2 py-1 text-xs">Unassessed</span></td>
      </tr>)}</tbody></table>}
      {view === "impact" && <table className="w-full min-w-[790px]"><caption className="sr-only">Upstream component impact by dependency scope</caption><thead className="bg-surface-2"><tr>{["Component / version", "Required", "Optional", "Build", "Test/dev", "Potential"].map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{impactRows.slice(start, start + 40).map((impact) => <tr key={impact.artifactId}>
        <td className={`${td} max-w-xl`}><ConsumerPaths id={impact.artifactId} references={manifest.details} names={names} summary={<>{impact.artifact.name} <span className="font-normal text-muted">{impact.artifact.version ?? "version unknown"}</span></>}><p className="my-2 text-xs text-muted">{impact.artifact.ecosystem} · Evidence applies to these collected profiles.</p></ConsumerPaths></td>
        {[impact.required, impact.optional, impact.build, impact.development, impact.potential].map((ids, i) => <td key={i} className={`${td} tabular-nums`}>{ids.length}</td>)}
      </tr>)}</tbody></table>}
      {view === "queue" && <table className="w-full min-w-[700px]"><caption className="sr-only">Coverage investigation work queue</caption><thead className="bg-surface-2"><tr>{["Tool", "Area", "Evidence gap", "Owner / next action"].map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{gaps.slice(start, start + 40).map((g) => <tr key={g.taskId}><td className={td}><Link href={`/map/readiness/${g.toolId}`}>{g.name}</Link><div className="text-xs text-muted">{g.maintainer}</div></td><td className={td}>{g.area}</td><td className={`${td} max-w-xl break-words`}>{g.reason}</td><td className={`${td} max-w-sm`}><p className="font-medium">{g.owner ?? "Unassigned"}</p>{g.issueUrl && <a href={g.issueUrl} target="_blank" rel="noreferrer">Maintainer work item ↗</a>}<p className="mt-2">{g.nextAction}</p><div className="mt-2 break-all text-xs text-muted">Task: {g.taskId}</div></td></tr>)}</tbody></table>}
      {length === 0 && <div className="p-10 text-center text-muted">No results match these filters. Try another search or ecosystem.</div>}
    </div>
    <div className="flex items-center justify-between gap-3 text-sm text-muted"><span>Page {currentPage + 1} of {Math.max(1, Math.ceil(length / 40))}</span><div className="flex gap-2"><button disabled={currentPage === 0} className={`${inputStyle} disabled:opacity-40`} onClick={() => setPage(currentPage - 1)}>Previous</button><button disabled={start + 40 >= length} className={`${inputStyle} disabled:opacity-40`} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
    </>}
  </section>;
}
