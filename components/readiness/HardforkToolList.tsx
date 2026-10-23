"use client";

import Link from "next/link";
import { useState } from "react";
import type { HardforkState, ToolLink } from "@/lib/readiness/dijkstra-site";
import { HARDFORK_STATES } from "@/lib/readiness/hardfork-states";
import TrackingLinks from "./TrackingLinks";

export interface HardforkRow {
  tool: string; name: string; category: string; state: HardforkState; reason: string; dependents: number;
  computed?: HardforkState; links: ToolLink[];
}

const FIRST = 25;
const th = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted";

/** Tools touching a changed surface, most depended-on first, filterable by hardfork state. */
export default function HardforkToolList({ rows }: { rows: HardforkRow[] }) {
  const [state, setState] = useState<HardforkState | "">("");
  const [all, setAll] = useState(false);
  const filtered = rows.filter((r) => !state || r.state === state);
  const shown = all ? filtered : filtered.slice(0, FIRST);
  const filter = (value: HardforkState | "", label: string, count: number) => (
    <button key={label} type="button" onClick={() => setState(value)} aria-pressed={state === value}
      className={`rounded-full border px-3 py-1 text-sm ${state === value ? "border-foreground bg-surface-2 font-medium" : "border-border bg-surface text-muted hover:text-foreground"}`}>
      {label} <span className="tabular-nums">{count}</span>
    </button>
  );
  return <div className="mt-4">
    <div className="flex flex-wrap gap-2">
      {filter("", "All", rows.length)}
      {(Object.keys(HARDFORK_STATES) as HardforkState[]).map((s) => filter(s, HARDFORK_STATES[s].label, rows.filter((r) => r.state === s).length))}
    </div>
    <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead><tr>
          <th className={`${th} w-10`}>#</th><th className={th}>Tool</th><th className={th}>State</th><th className={th}>Why</th>
          <th className={`${th} whitespace-nowrap text-right`} title="Catalog tools that reach it through shipped code or a service call">Used by</th>
        </tr></thead>
        <tbody>{shown.map((r) => {
          const s = HARDFORK_STATES[r.state];
          return <tr key={r.tool} className="border-t border-border align-top">
            <td className="px-4 py-3 tabular-nums text-muted">{rows.indexOf(r) + 1}</td>
            <td className="px-4 py-3"><Link href={`/map/readiness/${r.tool}`} className="font-medium">{r.name}</Link><div className="text-xs text-muted">{r.category}</div></td>
            <td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex items-center gap-1.5 font-medium ${s.text}`}><span className={`size-2 rounded-full ${s.dot}`} />{s.label}</span></td>
            <td className="min-w-64 px-4 py-3 text-muted">
              {r.reason}
              {r.computed && <div className="mt-0.5 text-xs">Otherwise: {HARDFORK_STATES[r.computed].label}</div>}
              {r.links.length > 0 && <TrackingLinks links={r.links} compact />}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">{r.dependents || <span className="text-muted">–</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {filtered.length > FIRST && <button type="button" onClick={() => setAll(!all)} className="mt-3 text-sm text-muted hover:text-foreground">
      {all ? `Show the first ${FIRST}` : `Show all ${filtered.length}`}
    </button>}
  </div>;
}
