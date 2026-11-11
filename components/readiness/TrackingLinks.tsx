import type { ToolLink } from "@/lib/readiness/dijkstra-site";
import type { LinkInfo } from "@/lib/readiness/tracking";
import { LINK_STATES } from "@/lib/readiness/hardfork-states";

/**
 * The state a link shows. Work merged only in a fork is not done: it reads "merged in fork" in the in-progress color,
 * and a fork branch reads as done only once none of its commits is missing upstream.
 */
function linkState(info: LinkInfo): { label: string; className: string } {
  if (info.kind === "fork") return info.state === "merged"
    ? { label: "all merged upstream", className: LINK_STATES.merged }
    : { label: `${info.ahead} ${info.ahead === 1 ? "commit" : "commits"} not upstream · last commit ${info.head?.date}`, className: LINK_STATES.open };
  if (info.forkOf && info.state === "merged") return { label: "merged in fork, not upstream", className: LINK_STATES.open };
  return { label: info.forkOf ? `${info.state} in fork` : info.state, className: LINK_STATES[info.state] };
}

/** Issue/PR and fork links from tracking.yaml, with the GitHub state synced into tracking-state.json when there is one. */
export default function TrackingLinks({ links, compact = false }: { links: ToolLink[]; compact?: boolean }) {
  return <ul className={compact ? "mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs" : "mt-1 space-y-1 text-sm"}>{links.map((l) => {
    const state = l.info && linkState(l.info);
    return <li key={l.url} className="min-w-0">
      <a href={l.url} target="_blank" rel="noreferrer" className="break-all" title={l.info?.title}>{l.label}</a>
      {state && <span className={`ml-1 ${state.className}`}>{state.label}</span>}
      {!compact && l.info && l.info.kind !== "fork" && <span className="text-muted"> · {l.info.title}</span>}
      {l.note && <span className="text-muted"> · {l.note}</span>}
    </li>;
  })}</ul>;
}
