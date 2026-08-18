"use client";

import { useMemo, useState } from "react";
import Nav from "@/components/Nav";
import rawGraph from "@/data/cardano-graph.json";
import { Graph, ToolNode, Status, STATUS_COLORS, CATEGORY_COLORS, READINESS_LABEL, AGENT_READINESS, isOSS } from "@/lib/map-types";

const GRAPH = rawGraph as unknown as Graph;

type SortKey = "name" | "categoryLabel" | "status" | "agentReadiness" | "license" | "starsNum" | "communityUsage" | "degree" | "team";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<Status, number> = {
  active: 0,
  maintenance: 1,
  abandoned: 2,
  archived: 3,
  experimental: 4,
  research: 5,
};

export default function TablePage() {
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("");
  const [cat, setCat] = useState("");
  const [statusOn, setStatusOn] = useState<Set<Status>>(
    new Set(Object.keys(GRAPH.statuses) as Status[])
  );
  const [sortKey, setSortKey] = useState<SortKey>("starsNum");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [portalOnly, setPortalOnly] = useState(false);
  const [ossOnly, setOssOnly] = useState(false);
  const READY_KEYS = ["high", "medium", "low", "unknown"];
  const [readyOn, setReadyOn] = useState<Set<string>>(new Set(READY_KEYS));
  const [reviewState, setReviewState] = useState<"all" | "reviewed" | "unreviewed">("all");

  const languages = useMemo(() => {
    const s = new Set<string>();
    GRAPH.nodes.forEach((n) =>
      n.languages.forEach((l) => {
        if (l && l.length < 22) s.add(l);
      })
    );
    return [...s].sort((a, b) => a.localeCompare(b));
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = GRAPH.nodes.filter((n) => {
      if (!statusOn.has(n.status)) return false;
      if (!readyOn.has(n.agentReadiness || "unknown")) return false;
      if (reviewState === "reviewed" && !n.reviewed) return false;
      if (reviewState === "unreviewed" && n.reviewed) return false;
      if (cat && n.category !== cat) return false;
      if (portalOnly && !n.onOfficialPortal) return false;
      if (ossOnly && !isOSS(n)) return false;
      if (lang && !n.languages.some((l) => l.toLowerCase() === lang.toLowerCase()))
        return false;
      if (q) {
        const hay = (
          n.name +
          " " +
          n.description +
          " " +
          n.team +
          " " +
          (n.teamGithub || "") +
          " " +
          (n.teamX || "") +
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
    });

    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "status") {
        av = STATUS_ORDER[a.status];
        bv = STATUS_ORDER[b.status];
      } else if (sortKey === "agentReadiness") {
        av = AGENT_READINESS[a.agentReadiness || "unknown"].rank;
        bv = AGENT_READINESS[b.agentReadiness || "unknown"].rank;
      } else if (sortKey === "starsNum" || sortKey === "degree") {
        av = a[sortKey];
        bv = b[sortKey];
      } else if (sortKey === "communityUsage") {
        av = a.communityUsage ?? -1;
        bv = b.communityUsage ?? -1;
      } else {
        av = ((a[sortKey] as string) || "~").toString().toLowerCase();
        bv = ((b[sortKey] as string) || "~").toString().toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      // tie-break by name asc
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [query, lang, cat, statusOn, readyOn, reviewState, sortKey, sortDir, portalOnly, ossOnly]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "name" || k === "team" || k === "categoryLabel" ? "asc" : "desc");
    }
  };

  const toggleStatus = (s: Status) => {
    const next = new Set(statusOn);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setStatusOn(next);
  };

  const reset = () => {
    setQuery("");
    setLang("");
    setCat("");
    setStatusOn(new Set(Object.keys(GRAPH.statuses) as Status[]));
    setReadyOn(new Set(READY_KEYS));
    setReviewState("all");
    setSortKey("starsNum");
    setSortDir("desc");
    setPortalOnly(false);
    setOssOnly(false);
  };
  const toggleReady = (k: string) => {
    const next = new Set(readyOn);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setReadyOn(next);
  };

  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="map-view table-page">
      <header className="masthead">
        <div className="mast-top">
          <div className="wordmark">
            <h1>Cardano Developer Tooling Map</h1>
            <span className="sub">
              {rows.length} of {GRAPH.meta.toolCount} tools
            </span>
          </div>
          <Nav />
        </div>

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

          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {GRAPH.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>

          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Filter by language">
            <option value="">All languages</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          <select value={reviewState} onChange={(e) => setReviewState(e.target.value as typeof reviewState)} aria-label="Filter by review state">
            <option value="all">All (reviewed?)</option>
            <option value="reviewed">✓ Reviewed</option>
            <option value="unreviewed">Unreviewed</option>
          </select>

          <div className="legend">
            <span className="legend-label">Status</span>
            {(Object.keys(GRAPH.statuses) as Status[]).map((s) => (
              <button
                key={s}
                className="chip-btn"
                aria-pressed={statusOn.has(s)}
                onClick={() => toggleStatus(s)}
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
                onClick={() => toggleReady(k)}
                title={`Toggle agent-readiness: ${AGENT_READINESS[k].label}`}
              >
                <span className="dot" style={{ background: AGENT_READINESS[k].color }} />
                {AGENT_READINESS[k].label}
              </button>
            ))}
          </div>

          <button
            className="chip-btn"
            aria-pressed={portalOnly}
            onClick={() => setPortalOnly((v) => !v)}
            title="Show only tools listed on developers.cardano.org/tools"
          >
            ★ on portal
          </button>

          <button
            className="chip-btn oss-toggle"
            aria-pressed={ossOnly}
            onClick={() => setOssOnly((v) => !v)}
            title="Show only verified open-source tools (a recognised OSS license)"
          >
            &lt;/&gt; OSS
          </button>

          <button className="reset" onClick={reset}>
            reset
          </button>
        </div>
      </header>

      <div className="table-wrap">
        <table className="tools-table">
          <thead>
            <tr>
              <th className="c-name sortable" onClick={() => setSort("name")}>
                Tool{arrow("name")}
              </th>
              <th className="sortable" onClick={() => setSort("categoryLabel")}>
                Category{arrow("categoryLabel")}
              </th>
              <th>Languages</th>
              <th className="sortable" onClick={() => setSort("status")}>
                Status{arrow("status")}
              </th>
              <th className="sortable" onClick={() => setSort("agentReadiness")} title="How ready the tool is for a coding agent (docs / llms.txt / typed / MCP)">
                Agent{arrow("agentReadiness")}
              </th>
              <th className="sortable" onClick={() => setSort("license")}>
                License{arrow("license")}
              </th>
              <th className="num sortable" onClick={() => setSort("starsNum")}>
                Stars{arrow("starsNum")}
              </th>
              <th className="num sortable" onClick={() => setSort("communityUsage")} title="Share of developers using it — State of the Developer Ecosystem 2025 (n=109)">
                Community{arrow("communityUsage")}
              </th>
              <th className="num sortable" onClick={() => setSort("degree")} title="Number of mapped relationships">
                Links{arrow("degree")}
              </th>
              <th className="sortable" onClick={() => setSort("team")}>
                Team{arrow("team")}
              </th>
              <th className="c-contact" title="GitHub org & X handle to reach the team">
                Contact
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => (
              <RowGroup
                key={n.id}
                n={n}
                open={expanded === n.id}
                onToggle={() => setExpanded(expanded === n.id ? null : n.id)}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No tools match those filters.</div>}
      </div>
    </div>
  );
}

function GhMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function ContactBlock({ n }: { n: ToolNode }) {
  const team = GRAPH.teams?.[n.team];
  const org = n.teamGithub || team?.githubOrg || null;
  const x = n.teamX || team?.x || null;
  const maintainers = team?.maintainers ?? [];
  if (!org && !x && maintainers.length === 0) return null;
  return (
    <div className="detail-block contact-block">
      <div className="k">Contact</div>
      <div className="contact-links">
        {org && (
          <a href={`https://github.com/${org}`} target="_blank" rel="noopener noreferrer">
            <GhMark /> @{org}
          </a>
        )}
        {x && (
          <a href={`https://x.com/${x}`} target="_blank" rel="noopener noreferrer">
            𝕏 @{x}
          </a>
        )}
      </div>
      {maintainers.length > 0 && (
        <div className="maintainers">
          <span className="mnt-label" title="Top human contributors — @-mention one of these, since a GitHub @org does not notify anyone">
            Ping
          </span>
          {maintainers.map((m) => (
            <span key={m.login} className="mnt">
              <a href={`https://github.com/${m.login}`} target="_blank" rel="noopener noreferrer">
                @{m.login}
              </a>
              {m.x && (
                <a className="mnt-x" href={`https://x.com/${m.x}`} target="_blank" rel="noopener noreferrer" title={`X: @${m.x}`}>
                  𝕏
                </a>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Prop({ k, v }: { k: string; v: string }) {
  return (
    <div className="prop">
      <span className="pk">{k}</span>
      <span className="pv">{v}</span>
    </div>
  );
}

function RowGroup({
  n,
  open,
  onToggle,
}: {
  n: ToolNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={`data-row ${open ? "open" : ""}`} onClick={onToggle}>
        <td className="c-name">
          {n.reviewed && <span className="rev-check" title={`manually reviewed${n.reviewedAt ? " " + n.reviewedAt : ""}`}>✓</span>}
          <span className="tw">{n.name}</span>
        </td>
        <td>
          <span className="cat-tag" style={{ color: CATEGORY_COLORS[n.category] }}>
            {n.categoryLabel}
          </span>
        </td>
        <td className="langs">
          {n.languages.slice(0, 3).map((l) => (
            <span key={l} className="lang-cell">
              {l}
            </span>
          ))}
        </td>
        <td>
          <span className="status-cell" title={n.statusReason || ""}>
            <span className="dot" style={{ background: STATUS_COLORS[n.status] }} />
            {n.statusLabel}
          </span>
        </td>
        <td>
          <span className="ar-pill" style={{ color: AGENT_READINESS[n.agentReadiness || "unknown"].color }}>
            <span className="ar-dot" style={{ background: AGENT_READINESS[n.agentReadiness || "unknown"].color }} />
            {AGENT_READINESS[n.agentReadiness || "unknown"].label}
            {n.llmsTxt ? <span className="ar-llms" title="ships an llms.txt">llms</span> : null}
          </span>
        </td>
        <td className="lic">{n.license || "—"}</td>
        <td className="num">{n.stars ?? "—"}</td>
        <td className="num" title={n.communityRank ? `rank #${n.communityRank} by community usage` : ""}>
          {n.communityUsage != null ? (
            <span className="comm-bar" style={{ ["--w" as any]: Math.min(100, n.communityUsage) + "%" }}>
              {n.communityUsage}%
            </span>
          ) : "—"}
        </td>
        <td className="num muted">{n.degree || "—"}</td>
        <td className="team-cell">{n.team}</td>
        <td className="contact-cell" onClick={(e) => e.stopPropagation()}>
          {n.teamGithub && (
            <a
              className="contact-ic gh"
              href={`https://github.com/${n.teamGithub}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`GitHub: @${n.teamGithub}`}
              aria-label={`GitHub org @${n.teamGithub}`}
            >
              <GhMark />
            </a>
          )}
          {n.teamX && (
            <a
              className="contact-ic x"
              href={`https://x.com/${n.teamX}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`X: @${n.teamX}`}
              aria-label={`X @${n.teamX}`}
            >
              𝕏
            </a>
          )}
          {!n.teamGithub && !n.teamX && <span className="muted">—</span>}
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={11}>
            <div className="detail-grid">
              <div className="detail-main">
                <p className="detail-desc">{n.description}</p>
                {n.features.length > 0 && (
                  <div className="detail-block">
                    <div className="k">Features</div>
                    <ul>
                      {n.features.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="prop-grid">
                  <Prop k="Team" v={n.team} />
                  {n.statusReason && <Prop k="Status basis" v={`${n.statusLabel} — ${n.statusReason}`} />}
                  {n.lastCommit && <Prop k="Last commit" v={n.lastCommit} />}
                  {n.latestVersion && (
                    <Prop
                      k="Latest release"
                      v={`${n.latestVersion}${n.latestReleaseDate ? " · " + n.latestReleaseDate : ""}`}
                    />
                  )}
                  {n.packageRegistry && (
                    <Prop k="Package" v={n.packageName ? `${n.packageRegistry} · ${n.packageName}` : n.packageRegistry} />
                  )}
                  {n.productionReadiness && (
                    <Prop k="Readiness" v={READINESS_LABEL[n.productionReadiness] || n.productionReadiness} />
                  )}
                  {n.maintainerType && <Prop k="Maintainer" v={n.maintainerType} />}
                  {n.fundingSource && <Prop k="Funding" v={n.fundingSource} />}
                  {n.cipSupport && n.cipSupport.length > 0 && (
                    <Prop k="CIP support" v={n.cipSupport.join(", ")} />
                  )}
                  {n.networkSupport && n.networkSupport.length > 0 && (
                    <Prop k="Networks" v={n.networkSupport.join(", ")} />
                  )}
                  {n.plutusVersions && n.plutusVersions.length > 0 && (
                    <Prop k="Plutus" v={n.plutusVersions.join(", ")} />
                  )}
                  <Prop
                    k="Agent-ready"
                    v={`${AGENT_READINESS[n.agentReadiness || "unknown"].label}${n.llmsTxt ? " · llms.txt" : ""}`}
                  />
                  {n.communityUsage != null && (
                    <Prop k="Community usage" v={`${n.communityUsage}% of devs · rank #${n.communityRank} (SotDE 2025)`} />
                  )}
                  <Prop k="On portal" v={n.onOfficialPortal ? "yes" : "no"} />
                </div>
              </div>
              <div className="detail-side">
                <ContactBlock n={n} />
                <div className="detail-block">
                  <div className="k">Dependencies</div>
                  <div className="v">{n.dependencies}</div>
                </div>
                <div className="detail-block">
                  <div className="k">Used by</div>
                  <div className="v">{n.usedBy}</div>
                </div>
                {n.website && (
                  <div className="detail-block">
                    <div className="k">Website</div>
                    <div className="v">
                      <a href={n.website} target="_blank" rel="noopener noreferrer">
                        {n.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    </div>
                  </div>
                )}
                {n.docsUrl && (
                  <div className="detail-block">
                    <div className="k">Docs</div>
                    <div className="v">
                      <a href={n.docsUrl} target="_blank" rel="noopener noreferrer">
                        {n.docsUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    </div>
                  </div>
                )}
                {n.llmsTxtUrl && (
                  <div className="detail-block">
                    <div className="k">llms.txt</div>
                    <div className="v">
                      <a href={n.llmsTxtUrl} target="_blank" rel="noopener noreferrer">
                        {n.llmsTxtUrl.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  </div>
                )}
                {n.repoUrl && (
                  <a className="repo-link" href={n.repoUrl} target="_blank" rel="noopener noreferrer">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                    </svg>
                    {n.repo}
                  </a>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
