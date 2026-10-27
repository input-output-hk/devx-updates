import type { Metadata } from "next";
import { Chip, DIJKSTRA, DijkstraFrame, Evidence, HANDLING, ToolLink, WaitingList } from "@/components/readiness/DijkstraParts";
import { dijkstraSite, toolUpgrade, viaLabel, waitingLinks, type Waiting } from "@/lib/readiness/dijkstra-site";

export const metadata: Metadata = {
  title: "Dijkstra readiness evidence",
  description: "Every Dijkstra lead decision with the quoted lines it rests on, the upgrades ready to take, and what is still to review.",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function EvidencePage() {
  const site = dijkstraSite();
  const { unlocks, leads } = site;
  const confirmed = leads.leads.filter((l) => l.decision === "confirmed");
  const others = leads.leads.filter((l) => l.decision !== "confirmed");
  // A decision is one tool/dependency/surface verdict; a lead entry can carry several surfaces.
  const decisions = (ls: typeof others) => ls.reduce((n, l) => n + l.surfaces.length, 0);
  const byTool = [...new Set(confirmed.map((l) => l.tool))].sort().map((tool) => ({ tool, leads: confirmed.filter((l) => l.tool === tool) }));
  const waiting = waitingLinks(site);
  const gapped = new Set(unlocks.blockers.filter((b) => b.blockers.length).map((b) => b.tool));
  const unread = waiting.filter((g) => g.unread), open = waiting.filter((g) => !g.unread);
  const count = (groups: Waiting[]) => new Set(groups.flatMap((g) => g.tools.map((t) => t.tool))).size;
  const jump = [
    ["upgrades", `Upgrades ready (${unlocks.bumpReady.length})`],
    ["review", `To review (${count(unread) + count(open)} tools)`],
    ["confirmed", `Confirmed gaps (${byTool.length} tools)`],
    ["others", `Not reached or undetermined (${decisions(others)})`],
  ] as const;
  return <DijkstraFrame title="Evidence" current={`${DIJKSTRA}/evidence`}>
    <p className="-mt-4 text-muted">
      What each verdict rests on. Every decision quotes the shipped code it was read from, at a pinned revision; quotes
      sit collapsed under each tool and link to the exact line. The same decisions appear on each tool&apos;s own page.
    </p>
    <nav aria-label="On this page" className="-mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {jump.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
    </nav>

    <section aria-labelledby="upgrades" className="scroll-mt-24">
      <h2 id="upgrades" className="font-display text-2xl font-semibold">Upstream fix released: the tool must upgrade</h2>
      <p className="mt-2 text-sm text-muted">
        Every confirmed gap of these tools has a released fix upstream, so the next move is theirs. Raising the pin is the
        minimum: a step across a breaking release changes the library&apos;s API, and code that names eras needs a Dijkstra
        case of its own. Inherited gaps nobody has read yet may add blockers.
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

    <section aria-labelledby="review" className="scroll-mt-24">
      <h2 id="review" className="font-display text-2xl font-semibold">To review</h2>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-lg font-semibold">Inherited gaps not read yet</h3>
          <p className="mt-1 text-sm text-muted">
            Tools that reach a component with a cited gap, but whose use of the gapped capability nobody has read yet: a
            likely blocker until a reading confirms or clears it. Hosted Blockfrost consumers inherit the self-hosted
            backend&apos;s verdict.
          </p>
          {unread.length ? <WaitingList groups={unread} /> : <p className="mt-3 text-sm">None: every inherited gap has a decision.</p>}
        </div>
        <div>
          <h3 className="text-lg font-semibold">Waiting on a component verdict</h3>
          <p className="mt-1 text-sm text-muted">
            {plural(count(open), "tool")} reach a component with no verdict on the surface they use: nothing found
            (no-evidence, never a pass), an acknowledged issue, or unreleased work. Most already break for another
            reason; for {count(open) - [...new Set(open.flatMap((g) => g.tools.map((t) => t.tool)))].filter((t) => gapped.has(t)).length} it
            is all that stands between them and a verdict. Assessing the component settles every tool under it.
          </p>
          {open.length ? <WaitingList groups={open} /> : <p className="mt-3 text-sm">None.</p>}
        </div>
      </div>
    </section>

    <section aria-labelledby="confirmed" className="scroll-mt-24">
      <h2 id="confirmed" className="font-display text-2xl font-semibold">Confirmed gaps</h2>
      <p className="mt-2 text-sm text-muted">
        {plural(decisions(confirmed), "decision")} on {plural(byTool.length, "tool")}: a shipped path uses the gapped capability,
        so the tool fails or misbehaves after the hardfork until it or its dependency moves. Open a row for the quotes.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="hidden grid-cols-[minmax(10rem,16rem)_1fr_11rem] gap-4 border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted sm:grid">
          <span>Tool</span><span>Through</span><span className="text-right">Read</span>
        </div>
        {byTool.map(({ tool, leads: ls }) => {
          const vias = [...new Set(ls.map((l) => viaLabel(l.via)))];
          return <details key={tool} className="group border-b border-border last:border-b-0">
            <summary className="grid cursor-pointer list-none gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2 sm:grid-cols-[minmax(10rem,16rem)_1fr_11rem] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <span aria-hidden className="text-xs text-muted transition-transform group-open:rotate-90">▶</span>
                <ToolLink id={tool} />
              </span>
              <span className="flex flex-wrap gap-1">{vias.map((v) => <Chip key={v}>{v}</Chip>)}</span>
              <span className="text-sm tabular-nums text-muted sm:text-right">{plural(decisions(ls), "decision")} · {plural(ls.reduce((n, l) => n + l.evidence.length, 0), "quote")}</span>
            </summary>
            <div className="space-y-4 px-4 pb-4 sm:pl-10">{ls.map((l) => (
              <div key={`${l.via}:${l.surfaces.join()}`}>
                <p className="flex flex-wrap items-center gap-1 text-sm"><span className="font-medium">{viaLabel(l.via)}</span>{l.surfaces.map((s) => <Chip key={s}>{s}</Chip>)}</p>
                <p className="mt-1 text-sm text-muted">{l.summary}</p>
                <Evidence lead={l} />
              </div>
            ))}</div>
          </details>;
        })}
      </div>
    </section>

    <section aria-labelledby="others" className="scroll-mt-24">
      <h2 id="others" className="font-display text-2xl font-semibold">Not reached or undetermined</h2>
      <p className="mt-2 text-sm text-muted">
        {plural(decisions(others), "decision")} where the reading found the gapped capability unused ({decisions(others.filter((l) => l.decision === "not-reached"))} not
        reached) or could not decide ({decisions(others.filter((l) => l.decision === "undetermined"))} undetermined), in {plural(others.length, "lead")}.
      </p>
      <details className="mt-4 rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer font-medium">Show all {others.length} leads</summary>
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
  </DijkstraFrame>;
}
