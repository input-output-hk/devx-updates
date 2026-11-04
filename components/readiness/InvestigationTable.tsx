import Link from "next/link";
import { CAPABILITY_LABELS } from "@/lib/readiness/types";
import type { InvestigationSummary, ReportReference } from "@/lib/readiness/report-contract";
import ConsumerPaths from "./ConsumerPaths";

const td = "px-4 py-3 align-top text-sm";

export default function InvestigationTable({ items, references, names }: { items: InvestigationSummary[]; references: ReportReference[]; names: Record<string, string> }) {
  return <table className="w-full min-w-[850px]">
    <caption className="sr-only">Prioritized component investigations and consumer tasks</caption>
    <thead className="bg-surface-2"><tr>{["Component / consumer paths", "Ranking factors", "Evidence gaps", "Owner / next action"].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted">{label}</th>)}</tr></thead>
    <tbody className="divide-y divide-border">{items.map((item) => <tr key={item.taskId}>
      <td className={`${td} max-w-md`}><ConsumerPaths id={item.projectId} references={references} names={names} investigation summary={<>{item.name} <span className="font-normal text-muted">{item.versions.join(", ")}</span></>}>
        <p className="my-2 break-all text-xs text-muted">{item.ecosystem} · {item.source}</p>
        <p className="my-2 text-xs text-muted">Maintainer hints from exact collected roots: {item.maintainerHints.map((hint) => `${hint.name}: ${hint.maintainer}`).join("; ") || "Unresolved"}. Contact details still need verification.</p>
        {item.rootScopes.map((root) => <p key={root.profileId} className="my-2 text-xs"><Link href={`/map/readiness/${root.toolId}#dependencies`}>Collected root: {names[root.toolId]} · {root.release} · {root.platform}</Link><span className="block break-all text-muted">{root.profileId}</span></p>)}
      </ConsumerPaths></td>
      <td className={td}><div>{item.factors.verifiedCapabilities} verified capabilities</div><div>{item.factors.potentialCapabilities} suggested / disputed capabilities</div><div>{item.factors.verifiedConsumers} verified consumers</div><div>{item.factors.potentialConsumers} potential consumers</div><div>{item.factors.consumerGaps} consumer gaps</div>
        {!!item.capabilities.length && <ul className="mt-2 space-y-1 text-xs text-muted">{item.capabilities.map((finding) => <li key={finding.id}><Link href={`/map/readiness/${finding.toolId}#capabilities`}>{CAPABILITY_LABELS[finding.capability]}</Link> · {finding.verification} · {finding.current ? "current source" : "historical source"} · {finding.scope}{finding.attribution === "multiple-roots" ? " · multiple roots; component attribution unresolved" : ""}</li>)}</ul>}
      </td>
      <td className={`${td} max-w-sm`}><ul className="space-y-2">{item.uncertainties.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="mt-2 text-xs text-muted">Hardfork compatibility remains unassessed.</p></td>
      <td className={`${td} max-w-sm`}><p className="font-medium">{item.owner ?? "Unassigned"}</p>{item.issueUrl && <a href={item.issueUrl} target="_blank" rel="noreferrer" className="text-xs">Maintainer work item ↗</a>}<p className="mt-2">{item.nextAction}</p><div className="mt-2 break-all text-xs text-muted">Task: {item.taskId}</div></td>
    </tr>)}</tbody>
  </table>;
}
