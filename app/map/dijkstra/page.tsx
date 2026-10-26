import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import { citationUrl, componentStatus, dijkstraSite, toolStates, toolUpgrade, viaLabel, waitingLinks, type HardforkState, type Waiting } from "@/lib/readiness/dijkstra-site";
import HardforkToolList, { type HardforkRow } from "@/components/readiness/HardforkToolList";
import { HARDFORK_STATES } from "@/lib/readiness/hardfork-states";
import rawGraph from "@/data/cardano-graph.json";
import type { Graph } from "@/lib/map-types";
import type { Citation } from "@/lib/readiness/dijkstra";
import { resultsFor, type Result } from "@/lib/readiness/devnet";


/** What each state means, in the order the list's filters show them. */
const STATE_MEANING: Record<HardforkState, string> = {
  breaks: "A confirmed gap that nobody has shipped the fix for, in the tool or in what it uses.",
  "in-progress": "Dijkstra work exists but is not released.",
  ready: "Its own support is released and nothing it uses is open.",
  unverified: "No confirmed gap, which is not a pass.",
  dismissed: "Set aside by hand (abandoned, or too little use for a break to matter), with the reason and the state it would otherwise have.",
};
export const metadata: Metadata = {
  title: "Dijkstra hardfork readiness",
  description: "Which Cardano tools the Dijkstra hardfork breaks, through which dependency, and what each upstream fix unlocks.",
};

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] leading-tight text-muted">{children}</span>
);
const ToolLink = ({ id }: { id: string }) => <Link href={`/map/readiness/${id}`} className="font-medium">{id}</Link>;
// A service rule that is itself a gap is a deprecated provider (Maestro): the fix is moving off it, on the provider's page.
const RETIRED = "service:";
const FixLink = ({ id }: { id: string }) => id.startsWith(RETIRED)
  ? <Link href={`/map/readiness/${id.slice(RETIRED.length)}`} className="font-medium">move off {id.slice(RETIRED.length)}</Link>
  : <ToolLink id={id} />;

const HANDLING = {
  "own-work": ["Own code must change", "text-status-blocked"],
  prepared: ["Already has Dijkstra cases", "text-status-progress"],
  generic: ["Era-generic", "text-status-progress"],
  undetermined: ["Undetermined", "text-muted"],
} as const;

function WaitingList({ groups }: { groups: Waiting[] }) {
  return <div className="mt-4 space-y-2">{groups.map((g) => (
    <details key={`${g.via}:${g.unread}`} className="rounded-xl border border-border bg-surface px-4 py-3">
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">{g.via}</span> <span className="text-muted">· {g.status} · {g.tools.length} {g.tools.length === 1 ? "tool" : "tools"}</span>
      </summary>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">{g.tools.map((t) => (
        <li key={t.tool}><ToolLink id={t.tool} /> <span className="text-xs text-muted">{t.surfaces.join(", ")}</span></li>
      ))}</ul>
    </details>
  ))}</div>;
}

const NODES = new Map((rawGraph as unknown as Graph).nodes.map((n) => [n.id, n]));

const OUTCOME = { pass: "text-status-done", fail: "text-status-blocked" } as const;

function Subject({ result }: { result: Result }) {
  return result.kind === "change"
    ? <a href={`#change-${result.id}`} className="font-medium">{result.id}</a>
    : <ToolLink id={result.id} />;
}

function Evidence({ lead }: { lead: { evidence: Citation[] } }) {
  return <ul className="mt-1 space-y-1">{lead.evidence.map((c) => (
    <li key={`${c.path}:${c.line}`} className="text-xs">
      <a href={citationUrl(c)} target="_blank" rel="noreferrer" className="break-all">{c.path}:{c.line}</a>
      <code className="mt-0.5 block overflow-x-auto whitespace-pre text-muted">{c.quote}</code>
    </li>
  ))}</ul>;
}

export default function DijkstraPage() {
  const site = dijkstraSite();
  const { unlocks, leads, changes, classification } = site;
  const confirmed = leads.leads.filter((l) => l.decision === "confirmed");
  const confirmedTools = [...new Set(confirmed.map((l) => l.tool))].sort();
  const touched = [...classification.tools.values()].filter((t) => t.surfaces.some((s) => s.channels.some((c) => c.scope === "shipped"))).length;
  const others = leads.leads.filter((l) => l.decision !== "confirmed");
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
    tool: t.tool, name: NODES.get(t.tool)?.name ?? t.tool, category: NODES.get(t.tool)?.categoryLabel ?? "", state: t.state, reason: t.reason, dependents: t.dependents.length, reachedBy: t.reachedBy.length,
    links: t.links, ...(t.computed && { computed: t.computed }),
  }));
  const states = (Object.keys(HARDFORK_STATES) as HardforkState[]).map((s) => [s, rows.filter((r) => r.state === s).length] as const);
  return <div className="map-view" style={{ overflow: "visible" }}>
    <div className="mx-auto max-w-7xl space-y-9 px-4 py-7 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-muted">Cardano tooling · Protocol version 12 · Node 11.2</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Dijkstra hardfork readiness</h1>
        </div>
        <Nav />
      </div>
      <p className="text-muted">
        Which tools the Dijkstra hardfork breaks, through which dependency, and what each upstream fix unlocks. Every
        decision quotes the shipped code it rests on, read at a pinned revision. A devnet run of the 11.2 integration
        node checks the changes and a first set of components against a real chain; a tool without a confirmed gap is
        still not a pass unless it passed there.
      </p>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">State of the {rows.length} tools that touch a changed surface</h2>
          <a href="#tools" className="text-sm">Full list →</a>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={states.map(([s, n]) => `${HARDFORK_STATES[s].label} ${n}`).join(", ")}>
          {states.map(([s, n]) => n > 0 && <div key={s} className={HARDFORK_STATES[s].bar} style={{ width: `${(n / rows.length) * 100}%` }} />)}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">{states.map(([s, n]) => (
          <li key={s} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${HARDFORK_STATES[s].dot}`} /><span className="font-medium tabular-nums">{n}</span> <span className="text-muted">{HARDFORK_STATES[s].label}</span></li>
        ))}</ul>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{([
        [confirmedTools.length, "Tools with a confirmed gap", `of ${touched} tools touching a changed surface; ${confirmed.reduce((n, l) => n + l.surfaces.length, 0)} confirmed tool/dependency/surface decisions`],
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

      <section aria-labelledby="tools" className="scroll-mt-24">
        <h2 id="tools" className="font-display text-2xl font-semibold">Tools by impact</h2>
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

      <section aria-labelledby="unlocks" className="scroll-mt-24">
        <h2 id="unlocks" className="font-display text-2xl font-semibold">What a fix unlocks</h2>
        <p className="mt-2 text-sm text-muted">
          A tool is unlocked once every upstream blocker it has is fixed; unlocked components then count as fixed for
          their own consumers. Most SDKs wait on several services at once (for example Kupo for UTxOs, Ogmios for
          submission and Blockfrost for parameters), so single fixes understate the effect. The fix order adds, at each
          step, the component that unlocks the most tools on top of the earlier steps.
        </p>
        <ol className="mt-4 space-y-2">{unlocks.fixOrder.map((f, i) => (
          <li key={f.component} className="rounded-xl border border-border bg-surface px-4 py-3">
            <details>
              <summary className="cursor-pointer text-sm">
                <span className="tabular-nums text-muted">{i + 1}.</span> <span className="font-medium">{f.component.startsWith(RETIRED) ? `move off ${f.component.slice(RETIRED.length)}` : f.component}</span>{" "}
                <span className="text-muted">· +{f.added.length} → {f.unlocked} tools unlocked</span>
              </summary>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">{f.added.map((t) => <li key={t}><ToolLink id={t} /></li>)}</ul>
            </details>
          </li>
        ))}</ol>
        <h3 className="mt-6 text-lg font-semibold">Each fix on its own</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">{unlocks.components.map((c) => (
          <article key={c.component} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-semibold"><FixLink id={c.component} /></h3>
              <span className="text-xs text-muted">R2 status: {componentStatus(site, c.component) ?? (c.component.startsWith(RETIRED) ? "deprecated provider" : "not a boundary component")}</span>
            </div>
            {c.ownGap.length > 0 && <p className="mt-2 flex flex-wrap items-center gap-1 text-xs"><span className="text-status-blocked">Own gap:</span>{c.ownGap.map((s) => <Chip key={s}>{s}</Chip>)}</p>}
            <h4 className="mt-4 text-sm font-medium">Unlocks {c.unlocks.length} {c.unlocks.length === 1 ? "tool" : "tools"}</h4>
            <ul className="mt-2 space-y-1 text-sm">{c.unlocks.map((u) => (
              <li key={u.tool}>
                <ToolLink id={u.tool} />
                {u.depth > 1 && <span className="text-xs text-muted"> via {u.path.slice(1, -1).join(" → ")}</span>}
                {u.bumps.length > 0 && <span className="text-xs text-muted"> · then raise {u.bumps.join(", ")}</span>}
              </li>
            ))}</ul>
            {c.partial.length > 0 && <p className="mt-3 text-sm text-muted">Also needed by {c.partial.map((p, i) => <span key={p.tool}>{i > 0 && ", "}<ToolLink id={p.tool} /> (still waits on {p.stillBlockedBy.map(viaLabel).join(", ")})</span>)}</p>}
            {c.downstream.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted">{c.downstream.length} downstream {c.downstream.length === 1 ? "tool" : "tools"} with an unconfirmed link</summary>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{c.downstream.map((d) => <li key={d.tool}><ToolLink id={d.tool} /> <span className="text-xs text-muted">via {viaLabel(d.via)}</span></li>)}</ul>
            </details>}
          </article>
        ))}</div>
      </section>

      <section aria-labelledby="bump-ready" className="scroll-mt-24">
        <h2 id="bump-ready" className="font-display text-2xl font-semibold">Upstream fix released: the tool must upgrade</h2>
        <p className="mt-2 text-sm text-muted">
          Every confirmed gap of these tools has a released fix upstream, so the next move is theirs. Raising the pin is
          the minimum: a step across a breaking release changes the library&apos;s API, and code that names eras needs a
          Dijkstra case of its own. Inherited gaps nobody has read yet may add blockers.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted"><tr>
              <th className="px-4 py-3">Tool</th><th className="px-4 py-3">Upgrade</th><th className="px-4 py-3">Own era handling</th><th className="px-4 py-3">Not read yet</th>
            </tr></thead>
            <tbody>{unlocks.bumpReady.map((b) => {
              const upgrade = toolUpgrade(site, b.tool);
              const [label, tone] = upgrade ? HANDLING[upgrade.eraHandling] : ["Not read", "text-muted"];
              return <tr key={b.tool} className="border-t border-border align-top">
                <td className="px-4 py-3"><ToolLink id={b.tool} />{b.ownStatus && <div className="text-xs text-muted">R2 {b.ownStatus}</div>}</td>
                <td className="px-4 py-3"><ul className="space-y-1">{b.steps.map((st) => (
                  <li key={st.package} className="whitespace-nowrap"><span className="font-mono text-xs">{st.package} {st.from} → {st.to}</span>{" "}
                    <span className={`text-xs ${st.breaking ? "text-status-blocked" : "text-status-progress"}`}>{st.breaking ? "breaking" : "same line"}</span></li>
                ))}</ul></td>
                <td className="min-w-64 px-4 py-3">
                  <span className={`font-medium ${tone}`}>{label}</span>
                  {upgrade && <details className="mt-1"><summary className="cursor-pointer text-xs text-muted">{upgrade.summary}</summary><Evidence lead={upgrade} /></details>}
                </td>
                <td className="px-4 py-3 text-xs text-muted">{b.unread.length ? b.unread.join(", ") : "none"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="devnet" className="scroll-mt-24">
        <h2 id="devnet" className="font-display text-2xl font-semibold">Devnet run</h2>
        <p className="mt-2 text-sm text-muted">
          {devnet.run.date}: cardano-node <a href={`https://github.com/${devnet.run.node.repo}/tree/${devnet.run.node.revision}`} target="_blank" rel="noreferrer" className="font-mono">{devnet.run.node.revision.slice(0, 10)}</a>{" "}
          (11.2 integration branch) on a local one-pool devnet, forked to Dijkstra and raised to protocol version 12
          through governance. {results.filter((r) => r.outcome === "fail").length} of {results.length} results failed.
          The recipe is in scripts/readiness/devnet.
        </p>
        <details className="mt-2 max-w-3xl text-sm">
          <summary className="cursor-pointer text-muted">Setup</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{devnet.run.setup.map((line) => <li key={line}>{line}</li>)}</ul>
        </details>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">{devnet.checks.map((c) => (
          <article key={c.id} id={`devnet-${c.id}`} className="min-w-0 scroll-mt-24 rounded-xl border border-border bg-surface p-5">
            <h3 className="font-display text-lg font-semibold">{c.title}</h3>
            <ul className="mt-3 space-y-1 text-sm">{c.results.map((r) => (
              <li key={`${r.kind}:${r.id}:${r.version ?? ""}`} className="flex flex-wrap items-baseline gap-x-2">
                <span className={`font-medium ${OUTCOME[r.outcome]}`}>{r.outcome}</span>
                <Subject result={r} />
                {r.version && <span className="text-xs text-muted">{r.version}</span>}
                {r.note && <span className="text-xs text-muted">· {r.note}</span>}
              </li>
            ))}</ul>
            <p className="mt-3 text-sm text-muted">{c.summary}</p>
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted">Observed output</summary>
              <ul className="mt-2 space-y-1">{c.observed.map((o) => <li key={o}><code className="block overflow-x-auto whitespace-pre text-muted">{o}</code></li>)}</ul>
              <p className="mt-2 break-all text-muted">Recipe: {c.recipe.join(", ")}</p>
            </details>
          </article>
        ))}</div>
      </section>

      <section aria-labelledby="unread" className="scroll-mt-24">
        <h2 id="unread" className="font-display text-2xl font-semibold">Inherited gaps not read yet</h2>
        <p className="mt-2 text-sm text-muted">
          Tools that reach a component with a cited gap through shipped code or a service call, but whose use of the
          gapped capability nobody has read yet. Until a reading confirms or clears each one, the link is a likely
          blocker, not a confirmed one. Hosted Blockfrost consumers inherit the self-hosted backend&apos;s verdict.
        </p>
        {unread.length ? <WaitingList groups={unread} /> : <p className="mt-4 text-sm">None: every inherited gap has a decision.</p>}
      </section>

      <section aria-labelledby="no-verdict" className="scroll-mt-24">
        <h2 id="no-verdict" className="font-display text-2xl font-semibold">Waiting on a component verdict</h2>
        <p className="mt-2 text-sm text-muted">
          These {count(open)} tools reach a component that has no verdict on the surface they use: nothing found
          (no-evidence, never a pass), an acknowledged issue, or work toward the target that is not released. Assessing
          the component settles every tool listed under it.
        </p>
        <WaitingList groups={open} />
      </section>

      <section aria-labelledby="confirmed" className="scroll-mt-24">
        <h2 id="confirmed" className="font-display text-2xl font-semibold">Confirmed gaps and their evidence</h2>
        <p className="mt-2 text-sm text-muted">
          A shipped path uses the gapped capability, so the tool fails or misbehaves after the hardfork until the
          dependency moves. Quotes link to the exact line at the revision that was read.
        </p>
        <div className="mt-4 space-y-3">{confirmedTools.map((tool) => (
          <details key={tool} className="rounded-xl border border-border bg-surface p-4">
            <summary className="cursor-pointer"><ToolLink id={tool} /> <span className="text-sm text-muted">· {confirmed.filter((l) => l.tool === tool).map((l) => viaLabel(l.via)).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</span></summary>
            <div className="mt-3 space-y-4">{confirmed.filter((l) => l.tool === tool).map((l) => (
              <div key={`${l.via}:${l.surfaces.join()}`}>
                <p className="flex flex-wrap items-center gap-1 text-sm"><span className="font-medium">{viaLabel(l.via)}</span>{l.surfaces.map((s) => <Chip key={s}>{s}</Chip>)}</p>
                <p className="mt-1 text-sm text-muted">{l.summary}</p>
                <Evidence lead={l} />
              </div>
            ))}</div>
          </details>
        ))}</div>
        <details className="mt-4 rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer font-medium">Not reached or undetermined ({others.length} decisions)</summary>
          <ul className="mt-3 space-y-3">{others.map((l) => (
            <li key={`${l.tool}:${l.via}:${l.surfaces.join()}`} className="text-sm">
              <ToolLink id={l.tool} /> <span className="text-muted">· {viaLabel(l.via)} · {l.decision}</span>
              <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">{l.surfaces.map((s) => <Chip key={s}>{s}</Chip>)}</span>
              <p className="mt-1 text-muted">{l.summary}</p>
              {l.evidence.length > 0 && <Evidence lead={l} />}
            </li>
          ))}</ul>
        </details>
      </section>

      <section aria-labelledby="changes" className="scroll-mt-24">
        <h2 id="changes" className="font-display text-2xl font-semibold">What Dijkstra changes</h2>
        <p className="mt-2 text-sm text-muted">
          Read at the node 11.2 integration branch and the component versions it selects. Activation is either the
          node upgrade itself, the fork to protocol version 12, or a later intra-era step.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{changes.changes.map((c) => (
          <article key={c.id} id={`change-${c.id}`} className="scroll-mt-24 rounded-xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold">{c.title}</h3>
            <p className="mt-1 flex flex-wrap gap-1"><Chip>{c.activation}</Chip><Chip>{c.compatibility}</Chip>{c.surfaces.map((s) => <Chip key={s}>{s}</Chip>)}</p>
            {resultsFor(devnet, "change", c.id).map(({ check, result }) => (
              <p key={check.id} className="mt-2 text-xs">
                <span className={`font-medium ${OUTCOME[result.outcome]}`}>devnet {result.outcome === "pass" ? "confirmed" : "contradicted"}</span>{" "}
                <a href={`#devnet-${check.id}`}>{check.title}</a>{result.note && <span className="text-muted"> · {result.note}</span>}
              </p>
            ))}
            <p className="mt-2 text-sm text-muted">{c.summary}</p>
            <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted">{c.citations.length} citations</summary>
              <ul className="mt-2 space-y-1">{c.citations.map((q) => <li key={`${q.repo}:${q.path}:${q.line}`}><a href={citationUrl(q)} target="_blank" rel="noreferrer" className="break-all">{q.repo} {q.path}:{q.line}</a></li>)}</ul>
            </details>
          </article>
        ))}</div>
        <h3 className="mt-6 text-lg font-semibold">Checked and unchanged</h3>
        <ul className="mt-2 space-y-2 text-sm">{changes.unchanged.map((u) => <li key={u.id}><span className="font-medium">{u.title}.</span> <span className="text-muted">{u.summary}</span></li>)}</ul>
      </section>

      <p className="text-xs text-muted">
        Classification {classification.generatedAt.slice(0, 10)} · boundary register {site.boundary.retrieved} · leads reviewed {leads.reviewed} · devnet run {devnet.run.date}.
        Registers: content/readiness/dijkstra.
      </p>
    </div>
  </div>;
}
