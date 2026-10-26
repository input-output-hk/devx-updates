import type { Metadata } from "next";
import Link from "next/link";
import { DIJKSTRA, DijkstraFrame } from "@/components/readiness/DijkstraParts";
import { dijkstraSite, toolLinks, toolStates, toolUpgrade, waitingLinks, type HardforkState, type Waiting } from "@/lib/readiness/dijkstra-site";
import HardforkToolList, { type HardforkRow } from "@/components/readiness/HardforkToolList";
import FixPathGraph, { UnlockCurve, type FixInfo, type FixWork } from "@/components/readiness/FixPathGraph";
import { fixGraph } from "@/lib/readiness/fix-graph";
import { HARDFORK_STATES } from "@/lib/readiness/hardfork-states";
import rawGraph from "@/data/cardano-graph.json";
import type { Graph } from "@/lib/map-types";
import { resultsFor } from "@/lib/readiness/devnet";


/** What each state means, in the order the list's filters show them. */
const STATE_MEANING: Record<HardforkState, string> = {
  breaks: "A confirmed gap that nobody has shipped the fix for, in the tool or in what it uses.",
  "in-progress": "Dijkstra work exists but is not released.",
  ready: "Its own support is released and nothing it uses is open.",
  unverified: "No confirmed gap, which is not a pass.",
  dismissed: "Set aside by hand (abandoned, or too little use for a break to matter), with the reason and the state it would otherwise have.",
};
/** Survey usage (share of developers) above which a tool counts as one DApps build on. */
const DAPP_USAGE = 10;
const STATE_COLOR: Record<HardforkState, string> = {
  breaks: "var(--status-blocked)", "in-progress": "var(--status-progress)", ready: "var(--status-done)", unverified: "var(--viz-1)", dismissed: "var(--muted)",
};
const SHORT_STATE: Record<HardforkState, string> = { breaks: "Breaks", "in-progress": "In progress", ready: "Ready", unverified: "Not verified", dismissed: "Dismissed" };
/** How the gap card names each state in its breakdown. */
const GAP_WORDS: Record<HardforkState, string> = { breaks: "break", "in-progress": "in progress", ready: "ready", unverified: "not verified", dismissed: "dismissed" };
export const metadata: Metadata = {
  title: "Dijkstra hardfork readiness",
  description: "Which Cardano tools the Dijkstra hardfork breaks, through which dependency, and what each upstream fix unlocks.",
};

// A service rule that is itself a gap is a deprecated provider (Maestro): the fix is moving off it, on the provider's page.
const RETIRED = "service:";
const NODES = new Map((rawGraph as unknown as Graph).nodes.map((n) => [n.id, n]));

export default function DijkstraPage() {
  const site = dijkstraSite();
  const { unlocks, leads, changes, classification } = site;
  const confirmed = leads.leads.filter((l) => l.decision === "confirmed");
  const confirmedTools = [...new Set(confirmed.map((l) => l.tool))].sort();
  const touched = [...classification.tools.values()].filter((t) => t.surfaces.some((s) => s.channels.some((c) => c.scope === "shipped"))).length;
  const others = leads.leads.filter((l) => l.decision !== "confirmed");
  // A decision is one tool/dependency/surface verdict; a lead entry can carry several surfaces.
  const decisions = (ls: typeof others) => ls.reduce((n, l) => n + l.surfaces.length, 0);
  const waiting = waitingLinks(site);
  const unread = waiting.filter((g) => g.unread), open = waiting.filter((g) => !g.unread);
  const count = (groups: Waiting[]) => new Set(groups.flatMap((g) => g.tools.map((t) => t.tool))).size;
  const ownWork = unlocks.bumpReady.filter((b) => toolUpgrade(site, b.tool)?.eraHandling === "own-work").length;
  const { devnet } = site;
  const results = devnet.checks.flatMap((c) => c.results);
  const changeOutcomes = changes.changes.map((c) => resultsFor(devnet, "change", c.id).map((r) => r.result.outcome));
  const contradicted = changeOutcomes.filter((o) => o.includes("fail")).length;
  const confirmedChanges = changeOutcomes.filter((o) => o.length && !o.includes("fail")).length;
  const rows: HardforkRow[] = toolStates(site, (id) => NODES.get(id)?.starsNum ?? 0).map((t) => ({
    tool: t.tool, name: NODES.get(t.tool)?.name ?? t.tool, category: NODES.get(t.tool)?.categoryLabel ?? "", state: t.state, reason: t.reason, blockedBy: t.blockedBy, tags: t.tags, dependents: t.dependents.length, reachedBy: t.reachedBy.length,
    links: t.links, ...(t.computed && { computed: t.computed }),
  }));
  const states = (Object.keys(HARDFORK_STATES) as HardforkState[]).map((s) => [s, rows.filter((r) => r.state === s).length] as const);
  // A confirmed gap is a lead decision or, for a boundary component, a cited gap in its own code: both become blockers.
  const gapped = new Set(unlocks.blockers.filter((b) => b.blockers.length).map((b) => b.tool));
  const gapStates = (Object.keys(HARDFORK_STATES) as HardforkState[]).map((s) => [s, rows.filter((r) => r.state === s && gapped.has(r.tool)).length] as const).filter(([, n]) => n > 0);
  const listed = new Set(rows.map((r) => r.tool));
  // Tools DApps build on: more than DAPP_USAGE% of surveyed developers use them, they have a confirmed gap and are not
  // dismissed. Those that are not fixes themselves become targets at the end of the critical path.
  const usage = (id: string) => { const u = NODES.get(id)?.communityUsage; return u != null && u > DAPP_USAGE ? u : undefined; };
  const stateOf = new Map(rows.map((r) => [r.tool, r.state]));
  const dappFacing = rows.filter((r) => usage(r.tool) !== undefined && gapped.has(r.tool) && r.state !== "dismissed").map((r) => r.tool);
  const graph = fixGraph(unlocks, dappFacing);
  const usedName = (id: string) => NODES.get(id)?.name ?? id;
  const noSourceUsed = [...classification.tools.values()].filter((t) => usage(t.id) !== undefined && t.scan.status === "no-public-source").map((t) => usedName(t.id));
  const unconfirmedUsed = rows.filter((r) => usage(r.tool) !== undefined && !gapped.has(r.tool)).map((r) => usedName(r.tool));
  const targetIds = graph.nodes.filter((n) => n.kind === "target").map((n) => n.id);
  const fixIds = unlocks.fixOrder.map((f) => f.component);
  const fixNames = Object.fromEntries(fixIds.map((id) => [id, id.startsWith(RETIRED) ? `Move off ${NODES.get(id.slice(RETIRED.length))?.name ?? id.slice(RETIRED.length)}` : NODES.get(id)?.name ?? id]));
  const fixHref = Object.fromEntries(fixIds.map((id) => [id, `/map/readiness/${id.startsWith(RETIRED) ? id.slice(RETIRED.length) : id}`]));
  // Tools with a confirmed gap that no fix unlocks: the fixes themselves, tools with their own code to change, and
  // tools that only have to take a released fix.
  const freed = new Set(unlocks.fixOrder.flatMap((f) => f.added));
  const unfreed = unlocks.blockers.filter((b) => b.blockers.length && !freed.has(b.tool));
  const fixSet = new Set(fixIds);
  const ownCode = unfreed.filter((b) => !fixSet.has(b.tool) && b.blockers.some((x) => x.kind === "own-gap")).length;
  const rest = { fixes: unfreed.filter((b) => fixSet.has(b.tool)).length, own: ownCode, upgrade: unfreed.filter((b) => !fixSet.has(b.tool)).length - ownCode };
  const fixWork = Object.fromEntries(fixIds.map((id): [string, FixWork] => [id, id.startsWith(RETIRED) ? "retired" : toolLinks(site, id).length ? "tracked" : "none"]));
  const fixes: Record<string, FixInfo> = Object.fromEntries(unlocks.fixOrder.map((f) => [f.component, {
    name: fixNames[f.component], href: fixHref[f.component], work: fixWork[f.component],
    added: f.added.map((t) => ({ id: t, name: NODES.get(t)?.name ?? t })),
    ...(usage(f.component) !== undefined && { usage: usage(f.component) }),
  }]));
  const ownGap = (id: string) => unlocks.blockers.some((b) => b.tool === id && b.blockers.some((x) => x.kind === "own-gap"));
  for (const id of targetIds) {
    const state = stateOf.get(id)!;
    fixes[id] = {
      name: NODES.get(id)?.name ?? id, href: `/map/readiness/${id}`, work: "none", added: [], usage: usage(id),
      target: { state: SHORT_STATE[state], own: ownGap(id), color: STATE_COLOR[state] },
    };
  }
  const unlisted = [...classification.tools.values()].filter((t) => !listed.has(t.id));
  const noSource = unlisted.filter((t) => t.scan.status === "no-public-source").length;
  const testsOnly = unlisted.filter((t) => t.scan.status === "scanned" && t.surfaces.length > 0).length;
  return <DijkstraFrame title="Dijkstra hardfork readiness" current={DIJKSTRA}>
      <p className="text-muted">
        Which tools the Dijkstra hardfork breaks, through which dependency, and what each upstream fix unlocks. Every
        decision quotes the shipped code it rests on, read at a pinned revision. A devnet run of the 11.2 integration
        node checks the changes and a first set of components against a real chain; a tool without a confirmed gap is
        still not a pass unless it passed there.
      </p>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">State of the {rows.length} tools that touch a changed surface</h2>
          <span className="flex gap-4 text-sm"><a href="#plan">Critical path →</a><a href="#tools">All tools →</a></span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Of {classification.tools.size} catalog tools, {unlisted.length} are not listed: {noSource} have no public source to
          read, {unlisted.length - noSource - testsOnly} matched no changed surface, and {testsOnly} matched only in tests or examples.
        </p>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={states.map(([s, n]) => `${HARDFORK_STATES[s].label} ${n}`).join(", ")}>
          {states.map(([s, n]) => n > 0 && <div key={s} className={HARDFORK_STATES[s].bar} style={{ width: `${(n / rows.length) * 100}%` }} />)}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">{states.map(([s, n]) => (
          <li key={s} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${HARDFORK_STATES[s].dot}`} /><span className="font-medium tabular-nums">{n}</span> <span className="text-muted">{HARDFORK_STATES[s].label}</span></li>
        ))}</ul>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{([
        [gapped.size, "Tools with a confirmed gap", `${gapStates.map(([s, n]) => `${n} ${GAP_WORDS[s]}`).join(", ")}; of ${touched} tools touching a changed surface`],
        [unlocks.bumpReady.length, "Upstream fix released", `The tool must upgrade; ${ownWork} also need their own era work`],
        [unlocks.fixOrder.at(-1)?.unlocked ?? 0, "Unlocked by upstream fixes", `if all ${unlocks.fixOrder.length} blocking components ship the support`],
        [changes.changes.length, "Cited changes", `${changes.surfaces.length} surfaces; on the devnet ${confirmedChanges} confirmed, ${contradicted} contradicted`],
      ] as const).map(([count, label, detail]) => (
        <div key={label} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="font-display text-3xl font-semibold tabular-nums">{count}</div>
          <div className="mt-2 text-sm font-medium">{label}</div>
          <div className="mt-1 text-xs text-muted">{detail}</div>
        </div>
      ))}</div>

      <section aria-labelledby="plan" className="scroll-mt-24">
        <h2 id="plan" className="font-display text-2xl font-semibold">Critical path</h2>
        <p className="mt-2 text-muted">
          What has to be fixed upstream, and in what order, before the tools DApps build on can support Dijkstra. The bold
          boxes and arrows are the critical path: {graph.nodes.filter((n) => n.critical).length} components where each fix
          has to land before the next can.
        </p>
        <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-3">{([
          ["Columns", "How many upstream fixes must land before a box can start. Everything in one column can run in parallel."],
          ["Arrows", "From a fix to what waits on it. Links already implied through another fix are left out."],
          ["Last column", `Tools used by more than ${DAPP_USAGE}% of developers, with a confirmed gap. The blue badge is that share.`],
        ] as const).map(([title, text]) => (
          <li key={title} className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="font-medium">{title}</div>
            <div className="mt-1 text-muted">{text}</div>
          </li>
        ))}</ul>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted hover:text-foreground">How the order and the last column are chosen</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
            <li>
              The number in a box is its step in the fix order. Each step adds the fix that unlocks the most tools on top of
              the earlier ones; a tool is unlocked once all its upstream blockers are fixed, and a fix that waits on another
              is counted together with it.
            </li>
            <li>
              {unlocks.components.length} components have a confirmed gap; only these {unlocks.fixOrder.length} unlock another
              tool. The other {unlocks.components.length - unlocks.fixOrder.length} only repair themselves, and the widely used
              ones among them are in the last column.
            </li>
            <li>
              Usage comes from the State of the Developer Ecosystem 2025 survey (109 answers). Widely used but not shown:
              {noSourceUsed.length > 0 && <> no public source to read ({noSourceUsed.join(", ")});</>} no confirmed gap ({unconfirmedUsed.join(", ")}).
            </li>
          </ul>
        </details>
        <FixPathGraph graph={graph} fixes={fixes} />
        <UnlockCurve steps={unlocks.fixOrder.map((f) => ({ component: f.component, added: f.added.length, unlocked: f.unlocked }))} names={fixNames} rest={rest} />
      </section>

      <section aria-labelledby="tools" className="scroll-mt-24">
        <h2 id="tools" className="font-display text-2xl font-semibold">All tools</h2>
        <p className="mt-2 text-sm text-muted">
          Every tool whose shipped code touches a changed surface. Ranked by how many catalog tools reach it through
          shipped code or a service call, directly or through other tools; ties go to direct users, then GitHub stars.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[max-content_1fr]">
          {(Object.keys(STATE_MEANING) as HardforkState[]).map((s) => <div key={s} className="contents">
            <dt className={`inline-flex items-center gap-1.5 self-start font-medium ${HARDFORK_STATES[s].text}`}>
              <span className={`size-2 rounded-full ${HARDFORK_STATES[s].dot}`} />{HARDFORK_STATES[s].label}
            </dt>
            <dd className="mb-1.5 text-muted sm:mb-0">{STATE_MEANING[s]}</dd>
          </div>)}
        </dl>
        <HardforkToolList rows={rows} />
      </section>

      <section aria-labelledby="deeper" className="scroll-mt-24">
        <h2 id="deeper" className="font-display text-2xl font-semibold">Go deeper</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">{([
          ["devnet", "Devnet run", `${devnet.checks.length} checks on the 11.2 integration node; ${results.filter((r) => r.outcome === "fail").length} of ${results.length} results failed, ${confirmedChanges} changes confirmed, ${contradicted} contradicted.`],
          ["changes", "What Dijkstra changes", `${changes.changes.length} cited changes on ${changes.surfaces.length} surfaces, and ${changes.unchanged.length} areas checked and unchanged.`],
          ["evidence", "Evidence", `${decisions(confirmed)} confirmed decisions on ${confirmedTools.length} tools with their quotes, ${decisions(others)} not reached or undetermined, ${unlocks.bumpReady.length} upgrades ready, and ${count(unread) + count(open)} tools with a link still waiting on a component verdict.`],
        ] as const).map(([path, title, text]) => (
          <Link key={path} href={`${DIJKSTRA}/${path}`} className="group rounded-xl border border-border bg-surface p-4 no-underline hover:border-foreground sm:p-5">
            <div className="font-medium text-foreground">{title} <span aria-hidden className="text-muted group-hover:text-foreground">→</span></div>
            <div className="mt-1 text-sm text-muted">{text}</div>
          </Link>
        ))}</div>
      </section>
  </DijkstraFrame>;
}
