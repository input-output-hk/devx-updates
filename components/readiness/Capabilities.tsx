import { CAPABILITY_LABELS, type CapabilityDecision } from "@/lib/readiness/types";
import type { CapabilityRow } from "@/lib/readiness/capabilities";

export default function Capabilities({ findings, decisions }: { findings: CapabilityRow[]; decisions: CapabilityDecision[] }) {
  return <section id="capabilities" className="scroll-mt-24 space-y-3">
    <h2 className="font-display text-xl font-semibold">Chain-facing capabilities</h2>
    <p className="text-sm text-muted">Findings describe behavior in a specific release and configuration. Suggestions need verification; historical findings do not establish behavior in the current source. None establishes hardfork compatibility.</p>
    {!findings.length && <p className="rounded-xl border border-border bg-surface p-4 text-sm">No capability findings have been returned. Behavior remains unresolved; an empty list does not mean this tool has no chain-facing capabilities.</p>}
    {findings.map((finding) => <article key={finding.id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{CAPABILITY_LABELS[finding.capability]}</h3><span className="rounded-full bg-surface-2 px-3 py-1 text-xs">{finding.verification} · {finding.current ? "current source" : "historical source"}</span></div>
      <p className="text-sm">{finding.rationale}</p>
      <p className="break-words text-xs text-muted">{finding.release} · {finding.revision.slice(0, 12)} · {finding.platform} · {finding.scope} · Features: {finding.features.join(", ") || "none selected"}</p>
      <p className="text-sm text-muted">Condition: {finding.condition ?? "Unconditional in this profile"}</p>
      <p className="break-all text-xs text-muted">Profile: {finding.profileId}</p>
      <div className="flex flex-wrap gap-3 text-xs">{finding.evidenceIds.map((id, i) => <a href={`#${id}`} key={id}>Evidence {i + 1}</a>)}</div>
      <details><summary className="cursor-pointer text-sm">Decision history</summary><ul className="mt-2 space-y-3">{decisions.filter((d) => d.capabilityId === finding.id).map((d) => <li key={d.id} className="text-sm"><strong>{d.verification}</strong> · {d.method}<p className="text-muted">{d.rationale}</p><p className="break-all text-xs text-muted">{d.packetId}</p><div className="flex flex-wrap gap-3 text-xs">{d.evidenceIds.map((id, i) => <a key={id} href={`#${id}`}>Decision evidence {i + 1}</a>)}</div></li>)}</ul></details>
    </article>)}
  </section>;
}
