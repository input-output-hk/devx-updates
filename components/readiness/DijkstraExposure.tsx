import Link from "next/link";
import { citationUrl, componentStatus, devnetResults, dijkstraSite, toolLeads, toolState, toolUpgrade, viaLabel, waitingLinks } from "@/lib/readiness/dijkstra-site";
import { HARDFORK_STATES } from "@/lib/readiness/hardfork-states";
import TrackingLinks from "./TrackingLinks";

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] leading-tight text-muted">{children}</span>
);

/** A tool's Dijkstra exposure: touched surfaces and channels (R3), lead decisions (with quotes) and what its fix unlocks. */
export default function DijkstraExposure({ id }: { id: string }) {
  const site = dijkstraSite();
  const tool = site.classification.tools.get(id);
  const leads = toolLeads(site, id);
  const unlocks = site.unlocks.components.find((c) => c.component === id);
  const blockers = site.unlocks.blockers.find((b) => b.tool === id);
  const status = componentStatus(site, id);
  const shipped = tool?.surfaces.filter((s) => s.channels.some((c) => c.scope === "shipped")) ?? [];
  const bump = site.unlocks.bumpReady.find((b) => b.tool === id);
  const upgrade = toolUpgrade(site, id);
  const waiting = waitingLinks(site, id);
  const devnet = devnetResults(site, id);
  const state = tool && toolState(site, tool);
  return <section id="dijkstra" className="scroll-mt-24 space-y-4 rounded-xl border border-border bg-surface p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-xl font-semibold">Dijkstra hardfork</h2>
      <Link href="/map/dijkstra" className="text-sm">All tools →</Link>
    </div>
    {state && <div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 font-medium ${HARDFORK_STATES[state.state].text}`}><span className={`size-2 rounded-full ${HARDFORK_STATES[state.state].dot}`} />{HARDFORK_STATES[state.state].label}</span>
        <span className="text-sm text-muted">{state.reason}{state.dismissed?.date && ` (${state.dismissed.date})`}</span>
      </p>
      {state.computed && <p className="mt-1 text-xs text-muted">Otherwise: {HARDFORK_STATES[state.computed].label}</p>}
    </div>}
    {state && state.links.length > 0 && <div>
      <h3 className="text-sm font-medium">Issues and PRs</h3>
      <TrackingLinks links={state.links} />
    </div>}
    {!tool ? <p className="text-sm text-muted">Not classified.</p> : <>
      <p className="text-sm text-muted">
        Exposure <strong className="text-foreground">{tool.exposure}</strong> · inherited readiness <strong className="text-foreground">{tool.readiness}</strong>
        {status && <> · boundary component, R2 status <strong className="text-foreground">{status}</strong></>}
        {tool.activity?.archived && <> · <span className="text-status-progress">repository archived</span></>}
        {tool.revision && <> · scanned at <a href={`https://github.com/${tool.repo}/tree/${tool.revision}`} target="_blank" rel="noreferrer" className="font-mono">{tool.revision.slice(0, 10)}</a></>}
      </p>
      {shipped.length > 0 && <details>
        <summary className="cursor-pointer text-sm font-medium">Changed surfaces touched by shipped code ({shipped.length})</summary>
        <ul className="mt-2 space-y-1 text-sm">{shipped.map((s) => (
          <li key={s.surface} className="flex flex-wrap items-center gap-1"><Chip>{s.surface}</Chip><span className="text-muted">{s.readiness} · via {[...new Set(s.channels.filter((c) => c.scope === "shipped").map((c) => c.via))].join(", ")}</span></li>
        ))}</ul>
      </details>}
      {tool.scan.status !== "scanned" && <p className="text-sm text-muted">{tool.scan.note}</p>}
    </>}
    {devnet.length > 0 && <div>
      <h3 className="text-sm font-medium">On the devnet</h3>
      <ul className="mt-1 space-y-1 text-sm">{devnet.map(({ check, result }) => (
        <li key={`${check.id}:${result.kind}:${result.version ?? ""}`}>
          <span className={`font-medium ${result.outcome === "pass" ? "text-status-done" : "text-status-blocked"}`}>{result.outcome}</span>{" "}
          <Link href={`/map/dijkstra#devnet-${check.id}`}>{check.title}</Link>
          {result.version && <span className="text-xs text-muted"> · {result.version}</span>}
          {result.note && <span className="text-xs text-muted"> · {result.note}</span>}
        </li>
      ))}</ul>
    </div>}
    {blockers && blockers.blockers.length > 0 && <div>
      <h3 className="text-sm font-medium">Blocked by</h3>
      <ul className="mt-1 space-y-1 text-sm">{blockers.blockers.map((b) => (
        <li key={`${b.kind}:${b.via}`} className="flex flex-wrap items-center gap-1">
          <span className={b.kind === "own-bump" ? "text-status-progress" : "text-status-blocked"}>{b.kind === "own-bump" ? "upgrade" : b.kind === "own-gap" ? "own gap" : "upstream fix"}</span>
          <span>{b.kind === "own-bump" ? b.pin : viaLabel(b.via)}</span>{b.surfaces.map((s) => <Chip key={s}>{s}</Chip>)}
        </li>
      ))}</ul>
    </div>}
    {bump && <div>
      <h3 className="text-sm font-medium">Upstream fix released: upgrade</h3>
      <ul className="mt-1 space-y-1 text-sm">{bump.steps.map((st) => (
        <li key={st.package}><span className="font-mono text-xs">{st.package} {st.from} → {st.to}</span>{" "}
          <span className={`text-xs ${st.breaking ? "text-status-blocked" : "text-status-progress"}`}>{st.breaking ? "crosses a breaking release" : "same release line"}</span></li>
      ))}</ul>
      {upgrade ? <div className="mt-2 text-sm">
        <p><span className="font-medium">Own era handling: {upgrade.eraHandling}.</span> <span className="text-muted">{upgrade.summary}</span></p>
        <ul className="mt-1 space-y-1">{upgrade.evidence.map((c) => (
          <li key={`${c.path}:${c.line}`} className="text-xs">
            <a href={citationUrl(c)} target="_blank" rel="noreferrer" className="break-all">{c.path}:{c.line}</a>
            <code className="mt-0.5 block overflow-x-auto whitespace-pre text-muted">{c.quote}</code>
          </li>
        ))}</ul>
      </div> : <p className="mt-1 text-sm text-muted">Own era handling not read yet.</p>}
    </div>}
    {waiting.length > 0 && <div>
      <h3 className="text-sm font-medium">Waiting on</h3>
      <ul className="mt-1 space-y-1 text-sm">{waiting.map((g) => (
        <li key={`${g.via}:${g.unread}`} className="flex flex-wrap items-center gap-1">
          <Link href={`/map/readiness/${g.via}`}>{g.via}</Link>
          <span className={g.unread ? "text-status-blocked" : "text-muted"}>{g.unread ? "gap, not read yet" : `${g.status}, no verdict`}</span>
          {g.tools[0].surfaces.map((s) => <Chip key={s}>{s}</Chip>)}
        </li>
      ))}</ul>
    </div>}
    {unlocks && unlocks.unlocks.length > 0 && <p className="text-sm">
      Fixing this unlocks {unlocks.unlocks.map((u, i) => <span key={u.tool}>{i > 0 && ", "}<Link href={`/map/readiness/${u.tool}`}>{u.tool}</Link></span>)}.
    </p>}
    {leads.length > 0 && <div>
      <h3 className="text-sm font-medium">Lead decisions</h3>
      <ul className="mt-2 space-y-3">{leads.map((l) => (
        <li key={`${l.via}:${l.surfaces.join()}`} className="text-sm">
          <p className="flex flex-wrap items-center gap-1">
            <span className={l.decision === "confirmed" ? "font-medium text-status-blocked" : "font-medium text-muted"}>{l.decision}</span>
            <span>· {viaLabel(l.via)}</span>{l.surfaces.map((s) => <Chip key={s}>{s}</Chip>)}
          </p>
          <p className="mt-1 text-muted">{l.summary}</p>
          <ul className="mt-1 space-y-1">{l.evidence.map((c) => (
            <li key={`${c.path}:${c.line}`} className="text-xs">
              <a href={citationUrl(c)} target="_blank" rel="noreferrer" className="break-all">{c.path}:{c.line}</a>
              <code className="mt-0.5 block overflow-x-auto whitespace-pre text-muted">{c.quote}</code>
            </li>
          ))}</ul>
        </li>
      ))}</ul>
    </div>}
  </section>;
}
