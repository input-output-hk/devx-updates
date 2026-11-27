"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { forceX, forceY, forceCollide } from "d3-force";
import Nav from "@/components/Nav";
import rawGraph from "@/data/cardano-graph.json";
import {
    Graph,
    ToolNode,
    ToolLink,
    Status,
    LinkType,
    STATUS_COLORS,
    CATEGORY_COLORS,
    LINK_COLORS,
    READINESS_LABEL,
    AGENT_READINESS,
} from "@/lib/map-types";

function Prop({ k, v }: { k: string; v: string }) {
    return (
        <div className="prop">
            <span className="pk">{k}</span>
            <span className="pv">{v}</span>
        </div>
    );
}

const GRAPH = rawGraph as unknown as Graph;

const idOf = (x: string | ToolNode): string =>
    typeof x === "object" ? x.id : x;

function hexToRgba(hex: string, a: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
}

const LINK_VERB_OUT: Record<LinkType, string> = {
    compiles: "compiles to",
    depends: "builds on",
    backend: "uses as backend",
    successor: "supersedes",
    connects: "connects to",
};
const LINK_VERB_IN: Record<LinkType, string> = {
    compiles: "compilation target of",
    depends: "used by",
    backend: "backend for",
    successor: "superseded by",
    connects: "connected from",
};

// The graph is drawn on a <canvas>, so it can't inherit CSS variables — these
// theme-dependent colours mirror the design tokens (--background / --foreground)
// for each mode. Node/status/category hues stay the same (they read fine on
// both), but the background, halos and label text must flip with the theme.
type Mode = "light" | "dark";
const CANVAS: Record<Mode, {
    bg: string;
    nodeHalo: string;   // ring separating a node from the background / neighbours
    focusStroke: string; // outline on the selected/hovered node
    labelHalo: string;   // halo drawn behind node labels for legibility
    labelText: string;
    clusterAlpha: number; // opacity of the faint category labels behind clusters
}> = {
    light: {
        bg: "#f5f7fb",
        nodeHalo: "rgba(255,255,255,0.9)",
        focusStroke: "#0a1428",
        labelHalo: "rgba(245,247,251,0.92)",
        labelText: "#33425c",
        clusterAlpha: 0.16,
    },
    dark: {
        bg: "#0a1428",
        nodeHalo: "rgba(10,20,40,0.85)",
        focusStroke: "#e8edf7",
        labelHalo: "rgba(10,20,40,0.9)",
        labelText: "#cdd7ea",
        clusterAlpha: 0.3,
    },
};

function readMode(): Mode {
    if (typeof document === "undefined") return "light";
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Track the active theme, staying in sync with the toggle (which sets
// data-theme + dispatches "themechange"), the OS preference, and any direct
// attribute change.
// True while the viewport is too narrow for the force graph to be usable. Below
// this the graph is replaced with a pointer to the Table / Analysis views, which
// ARE built for small screens. 768px = Tailwind's `md` breakpoint.
function useIsNarrow(maxWidth = 767): boolean {
    const [narrow, setNarrow] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
        const update = () => setNarrow(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, [maxWidth]);
    return narrow;
}

function useThemeMode(): Mode {
    const [mode, setMode] = useState<Mode>("light");
    useEffect(() => {
        const update = () => setMode(readMode());
        update();
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", update);
        window.addEventListener("themechange", update);
        const mo = new MutationObserver(update);
        mo.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"],
        });
        return () => {
            mq.removeEventListener("change", update);
            window.removeEventListener("themechange", update);
            mo.disconnect();
        };
    }, []);
    return mode;
}

export default function GraphMap() {
    const fgRef = useRef<ForceGraphMethods<NodeObject<ToolNode>, LinkObject<ToolNode, ToolLink>> | undefined>(undefined);
    const stageRef = useRef<HTMLDivElement>(null);
    const firstFit = useRef(false);

    const mode = useThemeMode();
    const pal = CANVAS[mode];
    const narrow = useIsNarrow();

    const [dims, setDims] = useState({ w: 1200, h: 700 });
    const [query, setQuery] = useState("");
    const [lang, setLang] = useState("");
    const [selected, setSelected] = useState<string | null>(null);
    const [hovered, setHovered] = useState<string | null>(null);
    const [statusOn, setStatusOn] = useState<Set<Status>>(
        new Set(Object.keys(GRAPH.statuses) as Status[])
    );
    const [catOn, setCatOn] = useState<Set<string>>(
        new Set(GRAPH.categories.map((c) => c.key))
    );
    const READY_KEYS = ["high", "medium", "low", "unknown"];
    const [readyOn, setReadyOn] = useState<Set<string>>(new Set(READY_KEYS));

    // ---- stable graph data (force-graph mutates node/link objects) ----
    const data = useMemo(() => {
        const nodes = GRAPH.nodes.map((n) => ({ ...n }));
        const links = GRAPH.links.map((l) => ({ ...l }));
        return { nodes, links };
    }, []);

    const nodeById = useMemo(() => {
        const m = new Map<string, ToolNode>();
        data.nodes.forEach((n) => m.set(n.id, n));
        return m;
    }, [data]);

    // Node size is a weighted composite of three signals, normalized across the dataset:
    // community usage (State of the Developer Ecosystem survey) is weighted most, then GitHub
    // stars, then graph connectivity. Tools with no survey signal fall back to stars + degree.
    const radius = useMemo(() => {
        let maxS = 1, maxD = 1;
        data.nodes.forEach((n) => { maxS = Math.max(maxS, n.starsNum || 0); maxD = Math.max(maxD, n.degree || 0); });
        const maxSqrtS = Math.sqrt(maxS) || 1;
        const W_COMMUNITY = 0.5, W_STARS = 0.2, W_DEGREE = 0.3, MIN_R = 3.5, SPAN = 16.5;
        return (n: ToolNode) => {
            const c = (n.communityUsage ?? 0) / 100;                 // 0..1
            const s = Math.sqrt(n.starsNum || 0) / maxSqrtS;         // 0..1 (sqrt-scaled)
            const d = (n.degree || 0) / (maxD || 1);                 // 0..1
            return MIN_R + (W_COMMUNITY * c + W_STARS * s + W_DEGREE * d) * SPAN;
        };
    }, [data]);

    // adjacency + directed relations (from original id-based links)
    const { neighbors, relOut, relIn } = useMemo(() => {
        const neighbors = new Map<string, Set<string>>();
        const relOut = new Map<string, { id: string; type: LinkType }[]>();
        const relIn = new Map<string, { id: string; type: LinkType }[]>();
        GRAPH.nodes.forEach((n) => {
            neighbors.set(n.id, new Set());
            relOut.set(n.id, []);
            relIn.set(n.id, []);
        });
        GRAPH.links.forEach((l) => {
            const s = idOf(l.source);
            const t = idOf(l.target);
            neighbors.get(s)?.add(t);
            neighbors.get(t)?.add(s);
            relOut.get(s)?.push({ id: t, type: l.type });
            relIn.get(t)?.push({ id: s, type: l.type });
        });
        return { neighbors, relOut, relIn };
    }, []);

    const languages = useMemo(() => {
        const s = new Set<string>();
        GRAPH.nodes.forEach((n) =>
            n.languages.forEach((l) => {
                if (l && l.length < 22) s.add(l);
            })
        );
        return [...s].sort((a, b) => a.localeCompare(b));
    }, []);

    // category anchor positions on a circle -> cluster layout
    const anchors = useMemo(() => {
        const m: Record<string, { x: number; y: number }> = {};
        const R = 320;
        const cats = GRAPH.categories;
        cats.forEach((c, i) => {
            const ang = (i / cats.length) * 2 * Math.PI - Math.PI / 2;
            m[c.key] = { x: R * Math.cos(ang), y: R * Math.sin(ang) };
        });
        return m;
    }, []);

    // ---- responsive sizing ----
    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            setDims({ w: el.clientWidth, h: el.clientHeight });
        });
        ro.observe(el);
        setDims({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);

    // ---- configure forces once ----
    useEffect(() => {
        const fg = fgRef.current;
        if (!fg) return;
        fg.d3Force("center", null);
        fg.d3Force("charge")?.strength(-60).distanceMax(400);
        fg.d3Force("link")
            ?.distance((l: ToolLink) =>
                l.type === "compiles" ? 18 : l.type === "connects" ? 44 : 30
            )
            .strength(0.35);
        fg.d3Force(
            "x",
            forceX((d: ToolNode) => anchors[d.category].x).strength(0.14)
        );
        fg.d3Force(
            "y",
            forceY((d: ToolNode) => anchors[d.category].y).strength(0.14)
        );
        fg.d3Force(
            "collide",
            forceCollide((d: ToolNode) => radius(d) + 2.5)
        );
        fg.d3ReheatSimulation();
    }, [anchors, radius]);

    // ---- filtering ----
    const matches = (n: ToolNode): boolean => {
        if (!statusOn.has(n.status)) return false;
        if (!readyOn.has(n.agentReadiness || "unknown")) return false;
        if (!catOn.has(n.category)) return false;
        if (lang && !n.languages.some((l) => l.toLowerCase() === lang.toLowerCase()))
            return false;
        if (query) {
            const q = query.toLowerCase();
            const hay = (
                n.name +
                " " +
                n.description +
                " " +
                n.team +
                " " +
                n.languages.join(" ") +
                " " +
                n.usedBy +
                " " +
                n.categoryLabel
            ).toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    };
    const matchesId = (id: string) => {
        const n = nodeById.get(id);
        return n ? matches(n) : false;
    };

    const selNeighbors = selected ? neighbors.get(selected) : null;

    // ---- node painting ----
    const paintNode = (n: ToolNode, ctx: CanvasRenderingContext2D, scale: number) => {
        const r = radius(n);
        const vis = matches(n);
        let alpha = vis ? 1 : 0.07;
        if (selected && vis) {
            const on = n.id === selected || (selNeighbors?.has(n.id) ?? false);
            alpha = on ? 1 : 0.1;
        }
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
        ctx.fillStyle = STATUS_COLORS[n.status];
        ctx.fill();

        if (n.id === selected || n.id === hovered) {
            ctx.lineWidth = 2 / scale;
            ctx.strokeStyle = pal.focusStroke;
        } else {
            ctx.lineWidth = 1 / scale;
            ctx.strokeStyle = pal.nodeHalo;
        }
        ctx.stroke();

        const isFocus =
            n.id === selected ||
            n.id === hovered ||
            (selected && (selNeighbors?.has(n.id) ?? false));
        const showLabel =
            alpha > 0.45 && (isFocus || scale > 1.7 || n.degree >= 8);
        if (showLabel) {
            const fs = Math.max(11 / scale, 2.6);
            ctx.font = `${fs}px -apple-system, "Segoe UI", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const y = n.y! + r + 1.5 / scale;
            ctx.lineWidth = 3 / scale;
            ctx.strokeStyle = pal.labelHalo;
            ctx.strokeText(n.name, n.x!, y);
            ctx.fillStyle = pal.labelText;
            ctx.fillText(n.name, n.x!, y);
        }
        ctx.globalAlpha = 1;
    };

    const paintPointer = (n: ToolNode, color: string, ctx: CanvasRenderingContext2D) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, radius(n) + 2, 0, 2 * Math.PI);
        ctx.fill();
    };

    // faint category labels behind the clusters
    const paintClusterLabels = (ctx: CanvasRenderingContext2D, scale: number) => {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fs = Math.min(20, Math.max(11, 15 / scale));
        ctx.font = `600 ${fs}px "Iowan Old Style", Palatino, Georgia, serif`;
        GRAPH.categories.forEach((c) => {
            if (!catOn.has(c.key)) return;
            const a = anchors[c.key];
            ctx.fillStyle = hexToRgba(CATEGORY_COLORS[c.key], pal.clusterAlpha);
            ctx.fillText(c.label, a.x, a.y - 52);
        });
        ctx.restore();
    };

    const linkColor = (l: ToolLink): string => {
        const s = idOf(l.source);
        const t = idOf(l.target);
        const sv = matchesId(s);
        const tv = matchesId(t);
        let a = sv && tv ? 0.42 : 0.05;
        if (selected) {
            const on = s === selected || t === selected;
            a = on ? 0.8 : sv && tv ? 0.05 : 0.02;
        }
        return hexToRgba(LINK_COLORS[l.type], a);
    };
    const linkWidth = (l: ToolLink): number => {
        if (selected && (idOf(l.source) === selected || idOf(l.target) === selected))
            return 1.6;
        return 0.55;
    };
    const linkArrow = (l: ToolLink): number => {
        if (selected && (idOf(l.source) === selected || idOf(l.target) === selected))
            return 3.2;
        return 0;
    };

    const focusNode = (id: string) => {
        setSelected(id);
        const n = nodeById.get(id);
        const fg = fgRef.current;
        if (n && fg && n.x != null && n.y != null) {
            fg.centerAt(n.x, n.y, 500);
            const z = fg.zoom();
            if (z < 1.4) fg.zoom(1.8, 500);
        }
    };

    // ---- toggles ----
    const toggle = <T,>(set: Set<T>, val: T, apply: (s: Set<T>) => void) => {
        const next = new Set(set);
        if (next.has(val)) next.delete(val);
        else next.add(val);
        apply(next);
    };
    const resetAll = () => {
        setQuery("");
        setLang("");
        setSelected(null);
        setStatusOn(new Set(Object.keys(GRAPH.statuses) as Status[]));
        setCatOn(new Set(GRAPH.categories.map((c) => c.key)));
        setReadyOn(new Set(READY_KEYS));
        fgRef.current?.zoomToFit(500, 60);
    };

    const sel = selected ? nodeById.get(selected) : null;

    return (
        <div className="map-view app">
            <header className="masthead">
                <div className="mast-top">
                    <div className="wordmark">
                        <h1>Cardano Developer Tooling Map</h1>
                        <span className="sub">
                            {GRAPH.meta.toolCount} tools · {GRAPH.meta.edgeCount} links
                        </span>
                    </div>
                    <Nav />
                </div>
                {!narrow && (
                  <>
                <p className="mast-note" style={{ marginTop: 12 }}>
                    Nodes are tools, edges are dependencies. Colour shows <b>maintenance state</b>; size is a weighted blend of <b>community usage</b>, GitHub stars &amp; connectivity; clusters are categories.
                </p>

                <div className="controls">
                    <label className="search">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4.3-4.3" />
                        </svg>
                        <input
                            type="search"
                            placeholder="Search tools, teams, languages…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            aria-label="Search tools"
                        />
                    </label>

                    <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Filter by language">
                        <option value="">All languages</option>
                        {languages.map((l) => (
                            <option key={l} value={l}>
                                {l}
                            </option>
                        ))}
                    </select>

                    <div className="legend">
                        <span className="legend-label">Status</span>
                        {(Object.keys(GRAPH.statuses) as Status[]).map((s) => (
                            <button
                                key={s}
                                className="chip-btn"
                                aria-pressed={statusOn.has(s)}
                                onClick={() => toggle(statusOn, s, setStatusOn)}
                                title={`Toggle ${GRAPH.statuses[s]}`}
                            >
                                <span className="dot" style={{ background: STATUS_COLORS[s] }} />
                                {GRAPH.statuses[s]}
                            </button>
                        ))}
                    </div>

                    <div className="legend">
                        <span className="legend-label">Agent</span>
                        {READY_KEYS.map((k) => (
                            <button
                                key={k}
                                className="chip-btn"
                                aria-pressed={readyOn.has(k)}
                                onClick={() => toggle(readyOn, k, setReadyOn)}
                                title={`Toggle agent-readiness: ${AGENT_READINESS[k].label}`}
                            >
                                <span className="dot" style={{ background: AGENT_READINESS[k].color }} />
                                {AGENT_READINESS[k].label}
                            </button>
                        ))}
                    </div>

                    <button className="reset" onClick={resetAll}>
                        reset
                    </button>
                </div>
                  </>
                )}
            </header>

            {narrow ? (
                <div className="mobile-note">
                    <span className="mn-eyebrow">Interactive graph</span>
                    <p>
                        The dependency graph maps {GRAPH.meta.toolCount} tools and works best on a
                        wider screen, where you can pan, zoom and tap nodes to trace relationships.
                    </p>
                    <p>On a phone, these views cover the same data and are built for small screens:</p>
                    <div className="mn-actions">
                        <Link className="mn-btn" href="/map/table">
                            Browse the table →
                        </Link>
                        <Link className="mn-btn secondary" href="/map/analysis">
                            Overlaps &amp; gaps →
                        </Link>
                    </div>
                </div>
            ) : (
            <div className="stage" ref={stageRef}>
                <ForceGraph2D<ToolNode, ToolLink>
                    ref={fgRef}
                    width={dims.w}
                    height={dims.h}
                    graphData={data}
                    backgroundColor={pal.bg}
                    nodeLabel={(n) => `${n.name} · ${n.statusLabel}`}
                    nodeCanvasObject={paintNode}
                    nodePointerAreaPaint={paintPointer}
                    onRenderFramePre={(ctx, scale) => paintClusterLabels(ctx, scale)}
                    linkColor={linkColor}
                    linkWidth={linkWidth}
                    linkDirectionalArrowLength={linkArrow}
                    linkDirectionalArrowRelPos={1}
                    onNodeClick={(n) => focusNode(n.id)}
                    onNodeHover={(n) => setHovered(n ? n.id : null)}
                    onBackgroundClick={() => setSelected(null)}
                    cooldownTicks={120}
                    onEngineStop={() => {
                        if (!firstFit.current) {
                            firstFit.current = true;
                            fgRef.current?.zoomToFit(600, 60);
                        }
                    }}
                />

                <div className="graph-hint">
                    click a node to trace its dependencies · drag to pan · scroll to zoom · click empty space to clear
                </div>

                <div className="cat-legend" role="group" aria-label="Category filter">
                    {GRAPH.categories.map((c) => (
                        <button
                            key={c.key}
                            className="chip-btn row"
                            aria-pressed={catOn.has(c.key)}
                            onClick={() => toggle(catOn, c.key, setCatOn)}
                            style={{ border: "none", background: "transparent", padding: 0 }}
                            title={`Toggle ${c.label}`}
                        >
                            <span className="sw" style={{ background: CATEGORY_COLORS[c.key] }} />
                            <span style={{ opacity: catOn.has(c.key) ? 1 : 0.4 }}>
                                {c.label} <span style={{ color: "var(--faint)" }}>{c.count}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
            )}

            {/* detail panel — only on the interactive (non-mobile) graph */}
            {!narrow && (
            <aside className={`panel ${sel ? "open" : ""}`} aria-hidden={!sel}>
                {sel && (
                    <>
                        <button className="panel-close" onClick={() => setSelected(null)} aria-label="Close">
                            ×
                        </button>
                        <div className="panel-scroll">
                            <div className="eyebrow">{sel.categoryLabel}</div>
                            <h2>{sel.name}</h2>
                            <div className="badges">
                                <span className="badge" title={sel.statusReason || ""}>
                                    <span className="dot" style={{ background: STATUS_COLORS[sel.status] }} />
                                    {sel.statusLabel}
                                </span>
                                {sel.languages.map((l) => (
                                    <span key={l} className="badge lang">
                                        {l}
                                    </span>
                                ))}
                                {sel.stars && <span className="badge">★ {sel.stars}</span>}
                                {sel.onOfficialPortal && (
                                    <span className="badge" style={{ color: "var(--accent)" }}>
                                        ★ on portal
                                    </span>
                                )}
                                <span className="badge" style={{ color: AGENT_READINESS[sel.agentReadiness || "unknown"].color }}>
                                    <span className="dot" style={{ background: AGENT_READINESS[sel.agentReadiness || "unknown"].color }} />
                                    agent: {AGENT_READINESS[sel.agentReadiness || "unknown"].label}
                                </span>
                                {sel.llmsTxt && (
                                    <span className="badge lang" title="ships an llms.txt for LLMs">llms.txt</span>
                                )}
                                {sel.communityUsage != null && (
                                    <span className="badge" style={{ color: "var(--good)" }} title={`State of the Developer Ecosystem 2025 · rank #${sel.communityRank}`}>
                                        ▲ {sel.communityUsage}% of devs
                                    </span>
                                )}
                            </div>

                            <p className="desc">{sel.description}</p>

                            {sel.features.length > 0 && (
                                <div className="field">
                                    <div className="k">Features</div>
                                    <ul>
                                        {sel.features.map((f, i) => (
                                            <li key={i}>{f}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <div className="field">
                                <div className="k">Team</div>
                                <div className="v">{sel.team}</div>
                            </div>
                            <div className="field">
                                <div className="k">Dependencies</div>
                                <div className="v">{sel.dependencies}</div>
                            </div>
                            <div className="field">
                                <div className="k">Used by</div>
                                <div className="v">{sel.usedBy}</div>
                            </div>

                            <div className="prop-grid">
                                {sel.lastCommit && <Prop k="Last commit" v={sel.lastCommit} />}
                                {sel.license && <Prop k="License" v={sel.license} />}
                                {sel.latestVersion && (
                                    <Prop
                                        k="Latest release"
                                        v={`${sel.latestVersion}${sel.latestReleaseDate ? " · " + sel.latestReleaseDate : ""}`}
                                    />
                                )}
                                {sel.packageRegistry && (
                                    <Prop k="Package" v={sel.packageName ? `${sel.packageRegistry} · ${sel.packageName}` : sel.packageRegistry} />
                                )}
                                {sel.productionReadiness && (
                                    <Prop k="Readiness" v={READINESS_LABEL[sel.productionReadiness] || sel.productionReadiness} />
                                )}
                                {sel.maintainerType && <Prop k="Maintainer" v={sel.maintainerType} />}
                                {sel.fundingSource && <Prop k="Funding" v={sel.fundingSource} />}
                                {sel.cipSupport && sel.cipSupport.length > 0 && (
                                    <Prop k="CIP support" v={sel.cipSupport.join(", ")} />
                                )}
                                {sel.networkSupport && sel.networkSupport.length > 0 && (
                                    <Prop k="Networks" v={sel.networkSupport.join(", ")} />
                                )}
                                {sel.plutusVersions && sel.plutusVersions.length > 0 && (
                                    <Prop k="Plutus" v={sel.plutusVersions.join(", ")} />
                                )}
                            </div>

                            {sel.website && (
                                <a className="repo-link" href={sel.website} target="_blank" rel="noopener noreferrer" style={{ display: "flex" }}>
                                    ↗ {sel.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                </a>
                            )}

                            {sel.docsUrl && (
                                <a className="repo-link" href={sel.docsUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex" }}>
                                    ↗ docs: {sel.docsUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                </a>
                            )}

                            {sel.llmsTxtUrl && (
                                <a className="repo-link" href={sel.llmsTxtUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", color: "var(--good)" }}>
                                    ↗ {sel.llmsTxtUrl.replace(/^https?:\/\//, "")}
                                </a>
                            )}

                            {sel.repoUrl && sel.repoUrl.includes("github.com") && (
                                <a className="repo-link" href={sel.repoUrl} target="_blank" rel="noopener noreferrer">
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                                    </svg>
                                    {sel.repo}
                                </a>
                            )}

                            <div className="divider" style={{ marginTop: 22 }} />

                            {(relOut.get(sel.id)?.length ?? 0) > 0 && (
                                <div className="rel-group">
                                    <div className="k">Builds on →</div>
                                    <div className="rel-list">
                                        {relOut.get(sel.id)!.map((r, i) => {
                                            const other = nodeById.get(r.id);
                                            if (!other) return null;
                                            return (
                                                <button
                                                    key={i}
                                                    className="rel-pill"
                                                    onClick={() => focusNode(r.id)}
                                                    title={LINK_VERB_OUT[r.type]}
                                                >
                                                    {other.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {(relIn.get(sel.id)?.length ?? 0) > 0 && (
                                <div className="rel-group">
                                    <div className="k">← Depended on by</div>
                                    <div className="rel-list">
                                        {relIn.get(sel.id)!.map((r, i) => {
                                            const other = nodeById.get(r.id);
                                            if (!other) return null;
                                            return (
                                                <button
                                                    key={i}
                                                    className="rel-pill"
                                                    onClick={() => focusNode(r.id)}
                                                    title={LINK_VERB_IN[r.type]}
                                                >
                                                    {other.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {(relOut.get(sel.id)?.length ?? 0) === 0 &&
                                (relIn.get(sel.id)?.length ?? 0) === 0 && (
                                    <div className="field">
                                        <div className="k">Relationships</div>
                                        <div className="v" style={{ color: "var(--faint)" }}>
                                            Standalone in this map — no mapped dependency edges.
                                        </div>
                                    </div>
                                )}
                        </div>
                    </>
                )}
            </aside>
            )}
        </div>
    );
}
