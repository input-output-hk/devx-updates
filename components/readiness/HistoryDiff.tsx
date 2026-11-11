import Link from "next/link";
import { DIJKSTRA, ToolLink } from "@/components/readiness/DijkstraParts";
import type { Status } from "@/lib/readiness/boundary";
import { dependencyTarget } from "@/lib/readiness/dijkstra-site";
import type { compareDijkstra, RuntimeChange, RuntimeSubject } from "@/lib/readiness/dijkstra-history";
import { HARDFORK_STATES } from "@/lib/readiness/hardfork-states";

/** Visual diff of two Dijkstra assessments: tool-state counts, fix order, component statuses and devnet results. */

type Comparison = ReturnType<typeof compareDijkstra>;

/** Boundary statuses from worst to best, with the colors the grid uses. */
const STATUS: Record<Status, { label: string; cell: string }> = {
  gap: { label: "Gap", cell: "bg-status-blocked" },
  "no-evidence": { label: "No evidence", cell: "bg-status-todo/50" },
  tracked: { label: "Tracked", cell: "bg-(--viz-1)" },
  "in-progress": { label: "In progress", cell: "bg-status-progress" },
  released: { label: "Released", cell: "bg-status-done/45" },
  verified: { label: "Verified on devnet", cell: "bg-status-done" },
};

const SURFACE: Record<string, string> = {
  "era-identity": "Era", "block-encoding": "Blocks", "transaction-encoding": "Transactions", "transaction-rules": "Tx rules",
  "plutus-language": "Plutus", "plutus-script-context": "Script context", "protocol-parameters": "Parameters",
  "stake-pool-registration": "Pool registration", "consensus-participation": "Consensus",
  "node-to-client-protocol": "Node-to-client", "cardano-api-haskell": "cardano-api",
};
const surfaceLabel = (s: string) => SURFACE[s] ?? s;

const CHANGE: Record<RuntimeChange, { label: string; className: string }> = {
  "now-passes": { label: "Now passes", className: "text-status-done" },
  "now-fails": { label: "Now fails", className: "text-status-blocked" },
  "first-tested": { label: "First tested", className: "text-(--viz-1)" },
  "new-version": { label: "Newer version, same result", className: "text-muted" },
  "not-rerun": { label: "Not rerun", className: "text-muted" },
  unchanged: { label: "Unchanged", className: "text-muted" },
};

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");

function StateBar({ label, counts, total }: { label: string; counts: { state: keyof typeof HARDFORK_STATES; n: number }[]; total: number }) {
  return <div className="flex items-center gap-3">
    <span className="w-20 shrink-0 text-xs text-muted">{label}</span>
    <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${label}: ${counts.map((c) => `${HARDFORK_STATES[c.state].label} ${c.n}`).join(", ")}`}>
      {counts.map((c) => c.n > 0 && <div key={c.state} className={HARDFORK_STATES[c.state].bar} style={{ width: `${(c.n / total) * 100}%` }} />)}
    </div>
    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{total}</span>
  </div>;
}

/** Two stacked bars, earlier above later, and the change per state. */
export function StateShift({ comparison }: { comparison: Comparison }) {
  const { states, total } = comparison.states;
  const order = Object.keys(HARDFORK_STATES) as (keyof typeof HARDFORK_STATES)[];
  const sorted = [...states].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  return <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
    <h3 className="text-sm font-medium">Tools touching a changed surface, by state</h3>
    <div className="mt-3 space-y-2">
      <StateBar label={comparison.before.date} counts={sorted.map((s) => ({ state: s.state, n: s.before }))} total={total.before} />
      <StateBar label={comparison.after.date} counts={sorted.map((s) => ({ state: s.state, n: s.after }))} total={total.after} />
    </div>
    <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">{sorted.map((s) => (
      <li key={s.state} className="inline-flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${HARDFORK_STATES[s.state].dot}`} />
        <span className="text-muted">{HARDFORK_STATES[s.state].label}</span>
        <span className="tabular-nums">{s.before} → <span className="font-medium">{s.after}</span></span>
        {s.after !== s.before && <span className="text-xs tabular-nums text-muted">({signed(s.after - s.before)})</span>}
      </li>
    ))}</ul>
  </div>;
}

/** The current fix order with each step's earlier position; new steps are highlighted and dropped ones listed. */
export function FixOrderDiff({ comparison }: { comparison: Comparison }) {
  const { steps, removed, unlocked } = comparison.fixOrder;
  const added = steps.filter((s) => s.previousStep === null).length;
  return <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-medium">Fix order: {steps.length} steps{added ? `, ${added} new` : ""}{removed.length ? `, ${removed.length} dropped` : ""}</h3>
      <span className="text-xs text-muted">Tools unlocked when every step ships: {unlocked.before} → <span className="font-medium text-foreground">{unlocked.after}</span></span>
    </div>
    <ol className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">{steps.map((s) => {
      const moved = s.previousStep !== null && s.previousStep !== s.step;
      return <li key={s.component} className={`flex items-baseline gap-2 rounded-md px-2 py-1 ${s.previousStep === null ? "bg-status-progress/15" : ""}`}>
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">{s.step}</span>
        <ToolLink id={dependencyTarget(s.component)} />
        {s.component.startsWith("service:") && <span className="text-xs text-muted">(deprecated)</span>}
        {s.previousStep === null
          ? <span className="text-xs font-medium text-status-progress">new</span>
          : moved && <span className="text-xs text-muted">was {s.previousStep}</span>}
      </li>;
    })}</ol>
    {removed.length > 0 && <p className="mt-2 text-sm text-muted">Dropped: {removed.map((c, i) => <span key={c}>{i > 0 && ", "}<s>{c}</s></span>)}</p>}
  </div>;
}

function Cell({ before, after }: { before: Status | null; after: Status | null }) {
  if (!before && !after) return <td className="p-1" />;
  const title = before === after ? STATUS[after!].label : `${before ? STATUS[before].label : "Not assessed"} → ${after ? STATUS[after].label : "No longer assessed"}`;
  if (before === after) return <td className="p-1 text-center" title={title}><span className={`inline-block size-4 rounded-sm align-middle ${STATUS[after!].cell}`} aria-label={title} /></td>;
  const box = (s: Status | null) => s ? <span className={`inline-block size-4 rounded-sm ${STATUS[s].cell}`} /> : <span className="inline-block size-4 rounded-sm border border-dashed border-border" />;
  return <td className="p-1 text-center" title={title}>
    <span className="inline-flex items-center gap-0.5 rounded-md bg-surface-2 px-1 py-0.5 ring-1 ring-foreground/40" aria-label={title}>
      {box(before)}<span className="text-[10px] text-muted">→</span>{box(after)}
    </span>
  </td>;
}

/** Component × surface grid: one square when unchanged, before → after when the worst status moved. */
export function StatusGrid({ comparison }: { comparison: Comparison }) {
  const { surfaces, rows } = comparison.grid;
  const groups = [["On the critical path", rows.filter((r) => r.criticalPath)], ["Other components that changed", rows.filter((r) => !r.criticalPath)]] as const;
  const changedCells = rows.reduce((n, r) => n + r.cells.filter((c) => c.before !== c.after).length, 0);
  return <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
    <h3 className="text-sm font-medium">Component status by surface: {changedCells} {changedCells === 1 ? "change" : "changes"}</h3>
    <p className="mt-1 text-xs text-muted">Worst cited status per changed surface. Outlined cells changed between the two assessments; hover a cell for its label.</p>
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{(Object.keys(STATUS) as Status[]).map((s) => (
      <li key={s} className="inline-flex items-center gap-1.5"><span className={`inline-block size-3 rounded-sm ${STATUS[s].cell}`} />{STATUS[s].label}</li>
    ))}</ul>
    <div className="mt-3 overflow-x-auto">
      <table className="text-sm">
        <thead><tr className="border-b border-border">
          <th className="p-2 text-left font-medium">Component</th>
          {surfaces.map((s) => <th key={s} className="p-1 align-bottom text-[11px] font-normal leading-tight text-muted"><span className="block w-16">{surfaceLabel(s)}</span></th>)}
        </tr></thead>
        {groups.map(([label, group]) => group.length > 0 && <tbody key={label}>
          <tr><td colSpan={surfaces.length + 1} className="pt-3 pb-1 text-xs uppercase tracking-wider text-muted">{label}</td></tr>
          {group.map((r) => <tr key={r.component} className={`border-b border-border ${r.changed ? "" : "opacity-80"}`}>
            <td className="whitespace-nowrap p-2"><ToolLink id={r.component} /></td>
            {r.cells.map((c) => <Cell key={c.surface} before={c.before} after={c.after} />)}
          </tr>)}
        </tbody>)}
      </table>
    </div>
  </div>;
}

const Chips = ({ results }: { results: RuntimeSubject["before"] }) => results.length
  ? <span className="flex flex-wrap gap-1">{results.map((r, i) => (
    <span key={i} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-tight ${r.outcome === "pass" ? "border-status-done/50 text-status-done" : "border-status-blocked/50 text-status-blocked"}`}>
      {r.outcome === "pass" ? "✓" : "✗"} {r.version ?? "—"}
    </span>
  ))}</span>
  : <span className="text-xs text-muted">—</span>;

function SubjectRows({ subjects }: { subjects: RuntimeSubject[] }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead><tr className="border-b border-border text-xs text-muted">
      <th className="p-2 font-normal">Subject</th><th className="p-2 font-normal">Check</th><th className="p-2 font-normal">Before</th><th className="p-2 font-normal">After</th><th className="p-2 font-normal">Change</th>
    </tr></thead>
    <tbody>{subjects.map((s) => <tr key={`${s.check}/${s.kind}/${s.id}`} className="border-b border-border align-top">
      <td className="whitespace-nowrap p-2">{s.kind === "change" ? <Link href={`${DIJKSTRA}/changes#change-${s.id}`} className="font-medium">{s.id}</Link> : <ToolLink id={s.id} />}</td>
      <td className="p-2 text-muted"><Link href={`${DIJKSTRA}/devnet#devnet-${s.check}`} className="text-muted">{s.title}</Link></td>
      <td className="p-2"><Chips results={s.before} /></td>
      <td className="p-2"><Chips results={s.after} /></td>
      <td className={`whitespace-nowrap p-2 text-xs font-medium ${CHANGE[s.change].className}`}>{CHANGE[s.change].label}</td>
    </tr>)}</tbody>
  </table></div>;
}

/** Devnet results per subject and check: outcome flips and first tests first, repeats collapsed. */
export function RuntimeDiff({ comparison }: { comparison: Comparison }) {
  const notable = comparison.subjects.filter((s) => s.change === "now-passes" || s.change === "now-fails" || s.change === "first-tested");
  const rest = comparison.subjects.filter((s) => !notable.includes(s));
  const n = (c: RuntimeChange) => comparison.subjects.filter((s) => s.change === c).length;
  return <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
    <h3 className="text-sm font-medium">Devnet results</h3>
    <p className="mt-1 text-xs text-muted">
      {n("now-passes")} now pass, {n("now-fails")} now fail, {n("first-tested")} tested for the first time, {n("new-version")} retested
      on a newer version with the same result, {n("unchanged")} unchanged, {n("not-rerun")} not rerun. Each chip is one tested version.
    </p>
    {notable.length > 0 && <div className="mt-3"><SubjectRows subjects={notable} /></div>}
    {rest.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer">Same outcome or not rerun ({rest.length})</summary><div className="mt-2"><SubjectRows subjects={rest} /></div></details>}
  </div>;
}
