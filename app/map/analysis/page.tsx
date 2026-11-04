"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import rawGraph from "@/data/cardano-graph.json";
import { Graph, ToolNode, Status, STATUS_COLORS } from "@/lib/map-types";

const GRAPH = rawGraph as unknown as Graph;

// Health ranking (lower = better-off) used to flag cells that have tools but no
// actively-maintained (green) one. The flag takes the colour of the best-off
// tool present — e.g. 1 maintenance-only + 3 archived → maintenance colour.
const STATUS_HEALTH: Record<Status, number> = {
    active: 0,
    maintenance: 1,
    experimental: 2,
    research: 3,
    deprecated: 4,
    abandoned: 5,
    archived: 6,
};

// The best-off status among a cell's tools, or null if any is actively
// maintained (in which case the cell isn't flagged).
function bestOffStatus(tools: ToolNode[]): Status | null {
    if (tools.length === 0 || tools.some((t) => t.status === "active")) return null;
    return tools.reduce(
        (best, t) => (STATUS_HEALTH[t.status] < STATUS_HEALTH[best] ? t.status : best),
        tools[0].status
    );
}

// map a developer-facing language string to a display bucket
function bucket(langRaw: string): string {
    const l = langRaw.toLowerCase().trim();
    if (l.includes("typescript")) return "TypeScript";
    if (l === "javascript" || l === "js") return "JavaScript";
    if (l === "rust") return "Rust";
    if (l === "haskell") return "Haskell";
    if (l === "python") return "Python";
    if (l === "go") return "Go";
    if (l === "kotlin" || l === "java") return "Java/Kotlin";
    if (l === "scala" || l === "scala 3") return "Scala";
    if (l.includes("c#") || l.includes(".net")) return "C#/.NET";
    if (l === "c" || l.includes("c++")) return "C/C++";
    if (l.includes("purescript")) return "PureScript";
    if (l === "swift") return "Swift";
    if (l === "elixir") return "Elixir";
    if (l === "dart") return "Dart";
    if (l === "tx3") return "Tx3";
    if (l === "aiken") return "Aiken";
    if (l === "helios") return "Helios";
    if (l === "pebble") return "Pebble";
    if (l === "marlowe") return "Marlowe";
    if (l === "pluto") return "Pluto";
    if (l === "solidity") return "Solidity";
    if (l === "elm") return "Elm";
    return "Hosted / other";
}

// languages a developer actually writes when using the tool (falls back to impl languages)
function toolBuckets(t: ToolNode): string[] {
    const src = t.devLangs && t.devLangs.length ? t.devLangs : t.languages;
    const s = new Set<string>();
    (src || []).forEach((l) => s.add(bucket(l)));
    if (s.size === 0) s.add("Hosted / other");
    return [...s];
}

// a tool contributes to all of its roles (primary + secondary capabilities)
function rolesOf(t: ToolNode): string[] {
    return t.roles && t.roles.length ? t.roles : [t.role || "other"];
}

const dot = (s: Status) => (
    <span
        style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: STATUS_COLORS[s],
            marginRight: 5,
            flexShrink: 0,
        }}
    />
);

export default function AnalysisPage() {
    const [focus, setFocus] = useState<{ role: string; lang: string } | null>(null);
    const [hover, setHover] = useState<{ role: string; lang: string } | null>(null);

    // Dismiss the tool pop-up with Escape.
    useEffect(() => {
        if (!focus) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setFocus(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [focus]);

    // aggregate by role (a tool counts toward each of its roles)
    const roles = useMemo(() => {
        const labelOf = new Map<string, string>();
        GRAPH.nodes.forEach((t) =>
            rolesOf(t).forEach((r, i) => {
                if (!labelOf.has(r)) labelOf.set(r, (t.rolesLabels && t.rolesLabels[i]) || t.roleLabel || r);
            })
        );
        const m = new Map<
            string,
            { key: string; label: string; tools: ToolNode[]; active: number; total: number }
        >();
        GRAPH.nodes.forEach((t) => {
            rolesOf(t).forEach((key) => {
                if (!m.has(key))
                    m.set(key, { key, label: labelOf.get(key) || "Other", tools: [], active: 0, total: 0 });
                const r = m.get(key)!;
                r.tools.push(t);
                r.total++;
                if (t.status === "active") r.active++;
            });
        });
        const arr = [...m.values()];
        arr.forEach((r) => r.tools.sort((a, b) => b.starsNum - a.starsNum));
        arr.sort((a, b) => b.total - a.total);
        return arr;
    }, []);

    // language buckets ordered by tool count
    const langs = useMemo(() => {
        const c = new Map<string, number>();
        GRAPH.nodes.forEach((t) => toolBuckets(t).forEach((b) => c.set(b, (c.get(b) || 0) + 1)));
        return [...c.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    }, []);

    // matrix[roleKey][lang] = tools
    const matrix = useMemo(() => {
        const m: Record<string, Record<string, ToolNode[]>> = {};
        let max = 0;
        roles.forEach((r) => {
            m[r.key] = {};
            langs.forEach((l) => (m[r.key][l] = []));
            r.tools.forEach((t) => toolBuckets(t).forEach((b) => m[r.key][b]?.push(t)));
            langs.forEach((l) => (max = Math.max(max, m[r.key][l].length)));
        });
        return { m, max };
    }, [roles, langs]);

    const overlaps = roles.filter((r) => r.total >= 4);
    const singleTool = roles.filter((r) => r.total === 1);
    const noMaintained = roles.filter((r) => r.active === 0 && r.total >= 1);
    const fragile = roles.filter((r) => r.active === 1 && r.total >= 3);

    const focusTools = focus ? matrix.m[focus.role]?.[focus.lang] || [] : [];
    const focusRoleLabel = focus ? roles.find((r) => r.key === focus.role)?.label : "";

    const cellColor = (n: number) => {
        if (n === 0) return "transparent";
        const a = 0.08 + (n / matrix.max) * 0.5;
        return `rgba(31,87,214,${a})`;
    };

    return (
        <div className="map-view table-page">
            <header className="masthead">
                <div className="mast-top">
                    <div className="wordmark">
                        <h1>Cardano Developer Tooling Map</h1>
                        <span className="sub">overlaps &amp; gaps</span>
                    </div>
                    <Nav />
                </div>
                <p className="mast-note" style={{ marginTop: 12 }}>
                    Tools grouped by <b>functional role</b> — the level at which they actually compete.
                    Crowded roles signal <b>overlap</b>; empty matrix cells and single-/zero-maintained roles
                    signal <b>gaps</b>. Based on {GRAPH.meta.toolCount} tools.
                </p>
            </header>

            <div className="table-wrap" style={{ padding: "22px 24px 60px" }}>
                {/* summary */}
                <div className="an-stats">
                    <div className="an-stat">
                        <div className="num">{roles.length}</div>
                        <div className="lbl">functional roles</div>
                    </div>
                    <div className="an-stat">
                        <div className="num">{overlaps.length}</div>
                        <div className="lbl">crowded roles (4+ tools)</div>
                    </div>
                    <div className="an-stat">
                        <div className="num" style={{ color: "var(--warn)" }}>{singleTool.length}</div>
                        <div className="lbl">single-tool roles</div>
                    </div>
                    <div className="an-stat">
                        <div className="num" style={{ color: "var(--crit)" }}>{noMaintained.length}</div>
                        <div className="lbl">roles with 0 maintained</div>
                    </div>
                </div>

                {/* matrix */}
                <section className="an-section">
                    <h2 className="an-h2">Coverage matrix (role × language)</h2>
                    <p className="an-sub">
                        Each cell counts tools of that role available in that language. Dense = crowded, blank = an unfilled niche. Click a cell to list its tools.
                    </p>
                    <div className="matrix-wrap">
                        <table className="matrix" onMouseLeave={() => setHover(null)}>
                            <thead>
                                <tr>
                                    <th className="corner">role \ language</th>
                                    {langs.map((l) => (
                                        <th key={l} className={`mcol ${hover?.lang === l ? "hl" : ""}`}>
                                            <span>{l}</span>
                                        </th>
                                    ))}
                                    <th className="mtot">Σ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roles.map((r) => {
                                    const rowHl = hover?.role === r.key;
                                    return (
                                        <tr key={r.key} className={rowHl ? "row-hl" : ""}>
                                            <th className={`mrow ${rowHl ? "hl" : ""}`} title={r.label}>
                                                {r.label}
                                                <span className="mrow-n">
                                                    {r.active}/{r.total}
                                                </span>
                                            </th>
                                            {langs.map((l) => {
                                                const cellTools = matrix.m[r.key][l];
                                                const cnt = cellTools.length;
                                                const isFocus = focus && focus.role === r.key && focus.lang === l;
                                                const inCol = hover?.lang === l;
                                                const cross = rowHl || inCol;
                                                // Flag a cell that has tools but no actively-maintained one;
                                                // the dot takes the colour of the best-off tool present.
                                                const flagStatus = bestOffStatus(cellTools);
                                                return (
                                                    <td
                                                        key={l}
                                                        className={`mcell ${cnt === 0 ? "gap" : ""} ${isFocus ? "focus" : ""} ${cross ? "cross" : ""} ${inCol ? "col-hl" : ""}`}
                                                        style={{ background: cnt === 0 ? undefined : cellColor(cnt) }}
                                                        onMouseEnter={() => setHover({ role: r.key, lang: l })}
                                                        onClick={() => cnt > 0 && setFocus(isFocus ? null : { role: r.key, lang: l })}
                                                        title={
                                                            cnt > 0
                                                                ? cellTools.map((t) => `${t.name} (${t.statusLabel})`).join(", ")
                                                                : "gap"
                                                        }
                                                    >
                                                        {cnt > 0 ? cnt : "·"}
                                                        {flagStatus && (
                                                            <span
                                                                className="mcell-flag"
                                                                style={{ background: STATUS_COLORS[flagStatus] }}
                                                            />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="mtot">{r.total}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {focus && (
                        <div
                            className="cell-modal-overlay"
                            role="presentation"
                            onClick={() => setFocus(null)}
                        >
                            <div
                                className="cell-modal"
                                role="dialog"
                                aria-modal="true"
                                aria-label={`${focusRoleLabel} · ${focus.lang}`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="cell-modal-head">
                                    <div>
                                        <div className="cm-eyebrow">{focus.lang}</div>
                                        <h3>{focusRoleLabel}</h3>
                                    </div>
                                    <button
                                        className="cell-modal-close"
                                        onClick={() => setFocus(null)}
                                        aria-label="Close"
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="cm-count">
                                    {focusTools.length} tool{focusTools.length !== 1 ? "s" : ""}
                                </div>
                                <div className="chip-row">
                                    {focusTools.map((t) => (
                                        <span key={t.id} className="tool-chip">
                                            {dot(t.status)}
                                            {t.name}
                                            {t.stars ? <span className="cs">★{t.stars}</span> : null}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* overlaps */}
                <section className="an-section">
                    <h2 className="an-h2">Overlaps — where tools compete</h2>
                    <p className="an-sub">
                        Roles served by four or more tools. High counts mean plenty of choice (and fragmentation).
                    </p>
                    <div className="overlap-grid">
                        {overlaps.map((r) => {
                            const byLang = new Map<string, number>();
                            r.tools.forEach((t) => toolBuckets(t).forEach((b) => byLang.set(b, (byLang.get(b) || 0) + 1)));
                            const topLangs = [...byLang.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
                            return (
                                <div key={r.key} className="overlap-card">
                                    <div className="oc-head">
                                        <span className="oc-title">{r.label}</span>
                                        <span className="oc-count">{r.total}</span>
                                    </div>
                                    <div className="oc-meta">
                                        {r.active}/{r.total} maintained ·{" "}
                                        {topLangs.map(([l, n]) => `${l} ${n}`).join(" · ")}
                                    </div>
                                    <div className="chip-row">
                                        {r.tools.slice(0, 12).map((t) => (
                                            <span key={t.id} className="tool-chip sm" title={`${t.statusLabel} · ${t.languageRaw}`}>
                                                {dot(t.status)}
                                                {t.name}
                                            </span>
                                        ))}
                                        {r.tools.length > 12 && <span className="more">+{r.tools.length - 12}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* gaps */}
                <section className="an-section">
                    <h2 className="an-h2">Gaps &amp; risks</h2>
                    <p className="an-sub">
                        Thinly served roles. These are where a new tool has the most room — or where relying on an
                        existing one carries risk.
                    </p>
                    <div className="gap-cols">
                        <GapList
                            title="No maintained option"
                            hint="every tool here is archived, experimental, or maintenance-only"
                            sev="crit"
                            rows={noMaintained.map((r) => ({
                                label: r.label,
                                detail: r.tools.map((t) => `${t.name} (${t.statusLabel})`).join(", "),
                            }))}
                        />
                        <GapList
                            title="Fragile — single maintained tool"
                            hint="3+ tools exist but only one is actively maintained"
                            sev="warn"
                            rows={fragile.map((r) => ({
                                label: r.label,
                                detail: `${r.active} of ${r.total} maintained · ${r.tools
                                    .filter((t) => t.status === "active")
                                    .map((t) => t.name)
                                    .join(", ")}`,
                            }))}
                        />
                        <GapList
                            title="Single-tool roles"
                            hint="only one tool covers this role at all"
                            sev="muted"
                            rows={singleTool.map((r) => ({
                                label: r.label,
                                detail: `${r.tools[0].name} (${r.tools[0].statusLabel})`,
                            }))}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}

function GapList({
    title,
    hint,
    sev,
    rows,
}: {
    title: string;
    hint: string;
    sev: "crit" | "warn" | "muted";
    rows: { label: string; detail: string }[];
}) {
    return (
        <div className={`gap-card sev-${sev}`}>
            <div className="gap-title">
                <span className="gap-bar" />
                {title} <span className="gap-n">{rows.length}</span>
            </div>
            <div className="gap-hint">{hint}</div>
            {rows.length === 0 ? (
                <div className="gap-empty">none — good coverage</div>
            ) : (
                <ul className="gap-list">
                    {rows.map((r, i) => (
                        <li key={i}>
                            <span className="gl-label">{r.label}</span>
                            <span className="gl-detail">{r.detail}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
