import type { ToolLink } from "@/lib/readiness/dijkstra-site";
import { LINK_STATES } from "@/lib/readiness/hardfork-states";

/** Issue/PR links from tracking.yaml, with the GitHub state synced into tracking-state.json when there is one. */
export default function TrackingLinks({ links, compact = false }: { links: ToolLink[]; compact?: boolean }) {
  return <ul className={compact ? "mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs" : "mt-1 space-y-1 text-sm"}>{links.map((l) => (
    <li key={l.url} className="min-w-0">
      <a href={l.url} target="_blank" rel="noreferrer" className="break-all" title={l.info?.title}>{l.label}</a>
      {l.info && <span className={`ml-1 ${LINK_STATES[l.info.state]}`}>{l.info.state}</span>}
      {!compact && l.info && <span className="text-muted"> · {l.info.title}</span>}
      {l.note && <span className="text-muted"> · {l.note}</span>}
    </li>
  ))}</ul>;
}
