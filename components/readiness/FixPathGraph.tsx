"use client";

import Link from "next/link";
import { useState } from "react";
import type { FixGraph, FixNode } from "@/lib/readiness/fix-graph";

/** Whether a blocking component has Dijkstra work on record (an issue, PR or branch), or is a provider to move off. */
export type FixWork = "tracked" | "none" | "retired";
/** What the page knows about each fix: display name, its page, tracked work, and the tools it adds in the order. */
export interface FixInfo {
  name: string; href: string; work: FixWork; added: { id: string; name: string }[];
  /** Share of developers using it (State of the Developer Ecosystem survey), when it counts as DApp-facing. */
  usage?: number;
  /** For a target (a tool DApps build on that is not a fix itself): its state, whether its own code must change too, and the state's colors. */
  target?: { state: string; own: boolean; color: string };
}

const COL = 240, NODE_W = 196, NODE_H = 46, ROW = 60, HEAD = 28, PAD = 2;
const WORK: Record<FixWork, { stroke: string; label: string; dash?: string }> = {
  none: { stroke: "var(--status-blocked)", label: "No Dijkstra work tracked" },
  tracked: { stroke: "var(--status-progress)", label: "Dijkstra work tracked (issue, PR or branch)" },
  retired: { stroke: "var(--muted)", label: "Deprecated provider: tools move off it", dash: "4 3" },
};
const COLUMN_TITLE = (c: number) => (c === 0 ? "Can start now" : `After ${c} ${c === 1 ? "fix" : "fixes"} upstream`);
export const TARGET_TITLE = "What DApps build on";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const tools = (n: number) => `${n} ${n === 1 ? "tool" : "tools"}`;

function Badge({ x, y, usage }: { x: number; y: number; usage: number }) {
  const label = `${usage}%`, w = 10 + label.length * 6.6;
  return <g aria-hidden>
    <rect x={x - w} y={y} width={w} height={17} rx={8.5} fill="var(--viz-1)" />
    <text x={x - w / 2} y={y + 12.5} fontSize={10.5} fontWeight={600} textAnchor="middle" fill="#fff">{label}</text>
  </g>;
}

function TargetNode({ node, x, y, info, selected, onSelect }: { node: FixNode; x: number; y: number; info: FixInfo; selected: boolean; onSelect: () => void }) {
  const t = info.target!;
  return <g role="button" tabIndex={0} aria-pressed={selected} className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[3]"
    onClick={onSelect} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}>
    <title>{`${info.name}: used by ${info.usage}% of surveyed developers. ${t.state}${t.own ? "; its own code must change too" : ""}. Select for details.`}</title>
    <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={NODE_H / 2} fill={selected ? "var(--surface-2)" : "var(--surface)"}
      stroke={t.color} strokeWidth={selected ? 3 : node.critical ? 2.5 : 1.5} />
    <circle cx={x + 16} cy={y + 15} r={4} fill={t.color} />
    <text x={x + 26} y={y + 19} fontSize={13} fontWeight={600} fill="var(--foreground)">{clip(info.name, 15)}</text>
    <text x={x + 16} y={y + 36} fontSize={11.5} fill="var(--muted)">{t.state}{t.own ? " · own code too" : ""}</text>
    {info.usage !== undefined && <Badge x={x + NODE_W - 8} y={y + 6} usage={info.usage} />}
  </g>;
}

function Node({ node, x, y, info, selected, onSelect }: { node: FixNode; x: number; y: number; info: FixInfo; selected: boolean; onSelect: () => void }) {
  if (node.kind === "target") return <TargetNode node={node} x={x} y={y} info={info} selected={selected} onSelect={onSelect} />;
  const w = WORK[info.work];
  return <g role="button" tabIndex={0} aria-pressed={selected} className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[3]"
    onClick={onSelect} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}>
    <title>{`${info.name}: step ${node.step}, frees ${tools(node.added)} (${node.unlocked} in total by then). ${w.label}. Select for details.`}</title>
    <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={8} fill={selected ? "var(--surface-2)" : "var(--surface)"} stroke={w.stroke}
      strokeWidth={selected ? 3 : node.critical ? 2.5 : 1.25} strokeDasharray={w.dash} />
    <text x={x + 10} y={y + 19} fontSize={13} fontWeight={600} fill="var(--foreground)">
      <tspan fill="var(--muted)" fontWeight={500}>{node.step}.</tspan> {clip(info.name, info.usage !== undefined ? 18 : 23)}
    </text>
    <text x={x + 10} y={y + 36} fontSize={11.5} fill="var(--muted)">
      {node.added > 0 ? `+${tools(node.added)} · ${node.unlocked} total` : `no tool on its own · ${node.unlocked} total`}
    </text>
    {info.usage !== undefined && <Badge x={x + NODE_W - 8} y={y + 6} usage={info.usage} />}
  </g>;
}

const ToolLinks = ({ items }: { items: { id: string; name: string }[] }) => <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
  {items.map((t) => <li key={t.id}><Link href={`/map/readiness/${t.id}`} className="font-medium">{t.name}</Link></li>)}
</ul>;

/**
 * The fix order as a dependency graph: columns are how many upstream fixes must land first, arrows run from a fix to
 * what it lets proceed, and the bold chains are the longest. Selecting a box shows what that step unlocks; the whole
 * order is also available as a list.
 */
export default function FixPathGraph({ graph, fixes }: { graph: FixGraph; fixes: Record<string, FixInfo> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const width = (graph.columns - 1) * COL + NODE_W + PAD * 2;
  const at = new Map(graph.nodes.map((n) => [n.id, { x: PAD + n.column * COL, y: PAD + HEAD + n.row * ROW }]));
  // Independent fixes go in the free space under the later columns (or under everything when there is only one
  // column): they can start now like column one, but nothing else waits on them.
  const hasTargets = graph.nodes.some((n) => n.kind === "target");
  const fixColumns = graph.columns - (hasTargets ? 1 : 0);
  const firstCol = fixColumns > 1 ? 1 : 0, perRow = Math.max(1, fixColumns - firstCol);
  const freeRow = Math.max(0, ...graph.nodes.filter((n) => n.kind === "fix" && n.column >= firstCol).map((n) => n.row + 1));
  const groupTop = PAD + HEAD + freeRow * ROW + 6;
  graph.independent.forEach((n, i) => at.set(n.id, { x: PAD + (firstCol + (i % perRow)) * COL, y: groupTop + 24 + Math.floor(i / perRow) * ROW }));
  const height = Math.max(...[...at.values()].map((p) => p.y + NODE_H)) + PAD;
  const longest = graph.nodes.filter((n) => n.critical && !graph.edges.some((e) => e.to === n.id && graph.nodes.find((o) => o.id === e.from)?.critical)).map((n) => fixes[n.id].name);
  const everything = [...graph.nodes, ...graph.independent];
  const all = everything.filter((n) => n.kind === "fix").sort((a, b) => a.step - b.step);
  const current = everything.find((n) => n.id === selected);
  const select = (id: string) => setSelected((s) => (s === id ? null : id));
  const node = (n: FixNode) => <Node key={n.id} node={n} {...at.get(n.id)!} info={fixes[n.id]} selected={selected === n.id} onSelect={() => select(n.id)} />;
  return <figure className="mt-4">
    <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="max-w-none"
        aria-label={`Dependency graph of ${all.length} fixes${hasTargets ? ` and ${everything.length - all.length} tools DApps build on` : ""}; the longest chains end at ${longest.join(", ")}`}>
        <defs>
          {(["normal", "critical"] as const).map((k) => (
            <marker key={k} id={`fix-arrow-${k}`} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" fill={k === "critical" ? "var(--foreground)" : "var(--muted)"} />
            </marker>
          ))}
        </defs>
        {Array.from({ length: graph.columns }, (_, c) => (
          <text key={c} x={PAD + c * COL} y={PAD + 12} fontSize={11} fontWeight={600} letterSpacing="0.06em" fill={hasTargets && c === graph.columns - 1 ? "var(--viz-1)" : "var(--muted)"}>
            {(hasTargets && c === graph.columns - 1 ? TARGET_TITLE : COLUMN_TITLE(c)).toUpperCase()}
          </text>
        ))}
        {/* Non-critical edges first so the critical ones draw on top; a selected fix's arrows come last and darkest. */}
        {[...graph.edges].sort((a, b) => {
          const rank = (e: typeof a) => (selected && (e.from === selected || e.to === selected) ? 2 : Number(e.critical));
          return rank(a) - rank(b);
        }).map((e) => {
          const from = at.get(e.to)!, to = at.get(e.from)!;
          const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2, x2 = to.x - 2, y2 = to.y + NODE_H / 2;
          // An arrow that skips a column runs along the free gap between two rows, so it never passes behind a box.
          const skips = to.x - from.x > COL;
          const lane = to.y + (to.y > from.y ? -(ROW - NODE_H) / 2 : NODE_H + (ROW - NODE_H) / 2);
          const gap = COL - NODE_W, curve = (xa: number, ya: number, xb: number, yb: number) => `C${(xa + xb) / 2} ${ya} ${(xa + xb) / 2} ${yb} ${xb} ${yb}`;
          const d = skips
            ? `M${x1} ${y1} ${curve(x1, y1, x1 + gap * 0.6, lane)} H${x2 - gap * 0.6} ${curve(x2 - gap * 0.6, lane, x2, y2)}`
            : `M${x1} ${y1} ${curve(x1, y1, x2, y2)}`;
          const lit = selected !== null && (e.from === selected || e.to === selected);
          const strong = lit || (e.critical && !selected);
          return <path key={`${e.from}>${e.to}`} d={d} fill="none"
            stroke={strong || e.critical ? "var(--foreground)" : "var(--muted)"}
            strokeOpacity={lit ? 1 : selected ? 0.25 : e.critical ? 0.85 : 0.45} strokeWidth={lit || e.critical ? 2 : 1.25}
            markerEnd={`url(#fix-arrow-${strong || e.critical ? "critical" : "normal"})`} />;
        })}
        {graph.nodes.map(node)}
        {graph.independent.length > 0 && <>
          <text x={PAD + firstCol * COL} y={groupTop + 10} fontSize={11} fontWeight={600} letterSpacing="0.06em" fill="var(--muted)">
            ALSO CAN START NOW · NO OTHER FIX WAITS ON THESE
          </text>
          {graph.independent.map(node)}
        </>}
      </svg>
    </div>
    <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
      {(Object.keys(WORK) as FixWork[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <svg width="18" height="12" aria-hidden><rect x="1" y="1" width="16" height="10" rx="3" fill="none" stroke={WORK[k].stroke} strokeWidth="1.5" strokeDasharray={WORK[k].dash} /></svg>
          {WORK[k].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <svg width="22" height="12" aria-hidden><line x1="1" y1="6" x2="21" y2="6" stroke="var(--foreground)" strokeWidth="2" /></svg>
        Longest chain: bold box and arrow
      </span>
      {hasTargets && <span className="inline-flex items-center gap-1.5">
        <svg width="26" height="14" aria-hidden><rect x="1" y="1" width="24" height="12" rx="6" fill="var(--viz-1)" /></svg>
        Share of developers using it (State of the Developer Ecosystem 2025); pill boxes are tools DApps build on
      </span>}
    </figcaption>
    <div aria-live="polite" className="mt-4 rounded-xl border border-border bg-surface p-4">
      {current ? <FixDetail node={current} fixes={fixes} graph={graph} onClose={() => setSelected(null)} />
        : <p className="text-sm text-muted">Select a fix in the diagram to see the tools it unlocks, what it waits on and what waits on it.</p>}
    </div>
    <details className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Fix order as a list ({all.length} steps, with the tools each adds)</summary>
      <ol className="mt-3 divide-y divide-border">{all.map((n) => (
        <li key={n.id} className="py-2">
          <button type="button" onClick={() => select(n.id)} className="text-left text-sm">
            <span className="tabular-nums text-muted">{n.step}.</span> <span className="font-medium">{fixes[n.id].name}</span>{" "}
            <span className="text-muted">· +{n.added} → {n.unlocked} tools unlocked</span>
          </button>
          {fixes[n.id].added.length > 0 && <ToolLinks items={fixes[n.id].added} />}
        </li>
      ))}</ol>
    </details>
  </figure>;
}

function FixDetail({ node, fixes, graph, onClose }: { node: FixNode; fixes: Record<string, FixInfo>; graph: FixGraph; onClose: () => void }) {
  const info = fixes[node.id];
  if (node.kind === "target") {
    const t = info.target!;
    return <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{info.name}</h3>
        <div className="flex gap-4 text-sm">
          <Link href={info.href}>Tool page →</Link>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">Close</button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        Used by {info.usage}% of surveyed developers. {t.state}. {node.critical ? "At the end of the critical path. " : ""}
        {node.waitsOn.length ? `Waits on ${node.waitsOn.map((id) => fixes[id].name).join(", ")} (and what those wait on).` : "Waits on no fix in the order."}
        {t.own ? " Its own code must change too, so the upstream fixes are needed but not enough." : " Nothing in its own code is confirmed to change: once these fixes land, it is unlocked."}
      </p>
    </div>;
  }
  const waitedBy = graph.edges.filter((e) => e.to === node.id).map((e) => e.from);
  const usage = info.usage !== undefined ? ` Used by ${info.usage}% of surveyed developers.` : "";
  const names = (ids: string[]) => ids.map((id) => fixes[id].name).join(", ");
  return <div>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-semibold"><span className="text-muted">{node.step}.</span> {info.name}</h3>
      <div className="flex gap-4 text-sm">
        <Link href={info.href}>Component page →</Link>
        <a href={`#fix-${node.id}`}>Unlock details</a>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground">Close</button>
      </div>
    </div>
    <p className="mt-1 text-sm text-muted">
      {WORK[info.work].label}.{usage} {node.critical ? "On the critical path. " : ""}
      {node.waitsOn.length ? `Waits on ${names(node.waitsOn)}. ` : "Can start now. "}
      {waitedBy.length ? `${names(waitedBy)} ${waitedBy.length === 1 ? "waits" : "wait"} on it.` : "No other fix waits on it."}
    </p>
    <h4 className="mt-3 text-sm font-medium">
      {node.added ? `Unlocks ${tools(node.added)} at step ${node.step} (${node.unlocked} in total by then)` : `Unlocks no tool by itself at step ${node.step}`}
    </h4>
    {info.added.length > 0 && <ToolLinks items={info.added} />}
  </div>;
}

const CW = 1120, CH = 300, L = 36, R = 16, T = 14, B = 30;

/** Tools unlocked after each fix in the order; one series, with each step's component on hover. */
/** `rest`: tools with a confirmed gap that no fix unlocks, as the fixes themselves, own code to change, or a released fix to take. */
export function UnlockCurve({ steps, names, rest }: {
  steps: { component: string; added: number; unlocked: number }[]; names: Record<string, string>; rest: { fixes: number; own: number; upgrade: number };
}) {
  if (!steps.length) return null;
  const max = steps.at(-1)!.unlocked;
  const top = Math.ceil(max / 20) * 20;
  const x = (i: number) => L + (i / steps.length) * (CW - L - R);
  const y = (v: number) => T + (1 - v / top) * (CH - T - B);
  const path = steps.reduce((d, s, i) => `${d} H${x(i + 1)} V${y(s.unlocked)}`, `M${x(0)} ${y(0)}`);
  const half = steps.findIndex((s) => s.unlocked >= max / 2) + 1;
  const ticks = Array.from({ length: top / 20 + 1 }, (_, i) => i * 20);
  return <figure className="mt-4 rounded-xl border border-border bg-surface p-4">
    <figcaption className="text-sm font-medium">Tools unlocked as fixes ship, in the fix order</figcaption>
    <p className="mt-1 text-xs text-muted">
      The first {half} fixes unlock half of the {max}; the last {steps.length - steps.findIndex((s) => s.unlocked >= max * 0.8) - 1} add
      the final fifth. Of the other {rest.fixes + rest.own + rest.upgrade} tools with a confirmed gap, {rest.fixes} are
      the fixes themselves, {rest.own} also need their own code changed{rest.upgrade > 0 && <>, and {rest.upgrade} only need to upgrade to a fix already released</>}.
    </p>
    <div className="mt-2 overflow-x-auto">
      <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full min-w-[640px]" role="img" aria-label={`Step chart: ${steps.length} fixes unlock ${max} tools; the first ${half} unlock half`}>
        {ticks.map((t) => <g key={t}>
          <line x1={L} x2={CW - R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
          <text x={L - 6} y={y(t) + 4} fontSize={11} textAnchor="end" fill="var(--muted)">{t}</text>
        </g>)}
        {[1, 5, 10, 15, 20].filter((s) => s <= steps.length).map((s) => (
          <text key={s} x={x(s)} y={CH - B + 16} fontSize={11} textAnchor="middle" fill="var(--muted)">{s}</text>
        ))}
        <text x={CW - R} y={CH - 4} fontSize={11} textAnchor="end" fill="var(--muted)">fixes shipped</text>
        <path d={path} fill="none" stroke="var(--viz-1)" strokeWidth={2} strokeLinejoin="round" />
        {steps.map((s, i) => {
          return <g key={s.component}>
            <title>{`${i + 1}. ${names[s.component]}: +${s.added}, ${s.unlocked} unlocked`}</title>
            <rect x={x(i)} y={T} width={x(1) - x(0)} height={CH - T - B} fill="transparent" />
            <circle cx={x(i + 1)} cy={y(s.unlocked)} r={3.5} fill="var(--viz-1)" stroke="var(--surface)" strokeWidth={2} />
            {i + 1 === half && <text x={x(i + 1)} y={y(s.unlocked) - 10} fontSize={11} textAnchor="middle" fill="var(--foreground)">half at {half}</text>}
          </g>;
        })}
        <text x={x(steps.length) - 4} y={y(max) - 10} fontSize={11} textAnchor="end" fill="var(--foreground)">{max} after {steps.length}</text>
      </svg>
    </div>
  </figure>;
}
