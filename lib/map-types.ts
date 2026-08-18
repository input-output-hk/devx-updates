export type Status = "active" | "maintenance" | "abandoned" | "archived" | "experimental" | "research";
export type LinkType = "compiles" | "depends" | "backend" | "successor" | "connects";

export interface ToolNode {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  role?: string;
  roleLabel?: string;
  roles?: string[];
  rolesLabels?: string[];
  devLangs?: string[];
  status: Status;
  statusLabel: string;
  languages: string[];
  languageRaw?: string;
  team: string;
  stars: string | null;
  starsNum: number;
  description: string;
  features: string[];
  dependencies: string;
  usedBy: string;
  repo: string | null;
  repoUrl: string | null;
  degree: number;
  // enrichment fields (optional)
  license?: string | null;
  packageRegistry?: string | null;
  packageName?: string | null;
  latestVersion?: string | null;
  latestReleaseDate?: string | null;
  cipSupport?: string[];
  networkSupport?: string[];
  plutusVersions?: string[];
  maintainerType?: string | null;
  fundingSource?: string | null;
  docsUrl?: string | null;
  productionReadiness?: string | null;
  onOfficialPortal?: boolean;
  website?: string | null;
  llmsTxt?: boolean;
  llmsTxtUrl?: string | null;
  agentReadiness?: string;
  reviewed?: boolean;
  reviewedAt?: string | null;
  notes?: string | null;
  communityUsage?: number | null;
  communityRank?: number | null;
  lastCommit?: string | null;
  statusReason?: string | null;
  // contact handles for the node's team (see the top-level `teams` map for maintainers)
  teamGithub?: string | null; // GitHub org/owner handle
  teamX?: string | null; // verified X/Twitter handle
  // added at runtime by force-graph
  x?: number;
  y?: number;
}

export interface ToolLink {
  source: string | ToolNode;
  target: string | ToolNode;
  type: LinkType;
}

export interface Category {
  key: string;
  label: string;
  count: number;
}

export interface TeamMaintainer {
  login: string; // GitHub username
  x: string | null; // verified X/Twitter handle, if known
}

// Contact info for a team, keyed by team name in Graph.teams.
export interface TeamContact {
  githubOrg: string | null; // GitHub org/owner handle
  x: string | null; // verified X/Twitter handle for the org/team
  maintainers: TeamMaintainer[]; // top human contributors to @-mention (GitHub @org does not notify)
}

export interface Graph {
  meta: {
    title: string;
    generated: string;
    source: string;
    toolCount: number;
    edgeCount: number;
    note: string;
  };
  categories: Category[];
  statuses: Record<Status, string>;
  linkTypes: Record<LinkType, string>;
  nodes: ToolNode[];
  links: ToolLink[];
  teams?: Record<string, TeamContact>; // team name -> contact handles + maintainers
}

export const STATUS_COLORS: Record<Status, string> = {
  active: "#2f9e5f",
  maintenance: "#c98a00",
  abandoned: "#9c5a4d",
  archived: "#d0503b",
  experimental: "#8257c9",
  research: "#3f6ae0",
};

export const CATEGORY_COLORS: Record<string, string> = {
  sc: "#6b46c1",
  sdk: "#2563eb",
  api: "#0891b2",
  idx: "#0d9488",
  node: "#4f46e5",
  l2: "#db2777",
  wallet: "#ea580c",
  dev: "#b7791f",
  ops: "#65a30d",
  gov: "#dc2626",
  oracle: "#0e7490",
  infra: "#7c3aed",
};

export const READINESS_LABEL: Record<string, string> = {
  production: "Production",
  beta: "Beta",
  experimental: "Experimental",
};

// how ready a tool is for a coding agent to pick up (docs / llms.txt / typed / MCP)
export const AGENT_READINESS: Record<string, { label: string; color: string; rank: number }> = {
  high: { label: "High", color: "var(--good)", rank: 3 },
  medium: { label: "Medium", color: "var(--warn)", rank: 2 },
  low: { label: "Low", color: "var(--muted)", rank: 1 },
  unknown: { label: "Unknown", color: "var(--faint)", rank: 0 },
};

// Recognised open-source (OSI-approved) software licenses. A tool counts as
// "verified OSS" only when it carries one of these — a public repo with no
// license is all-rights-reserved by default, so `null`/`unknown` do NOT qualify.
// Content licenses (e.g. CC-BY) are intentionally excluded: they aren't OSS.
export const OSS_LICENSES: ReadonlySet<string> = new Set([
  "Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "MPL-2.0", "ISC",
  "GPL-2.0", "GPL-3.0", "LGPL-2.1", "LGPL-3.0", "AGPL-3.0", "Unlicense",
  "0BSD", "BSL-1.0", "EPL-2.0", "CC0-1.0",
]);

export const isOSS = (n: Pick<ToolNode, "license">): boolean =>
  !!n.license && OSS_LICENSES.has(n.license);

export const LINK_COLORS: Record<LinkType, string> = {
  compiles: "#8b8577",
  depends: "#a8a294",
  backend: "#7fa8c9",
  successor: "#d08bb0",
  connects: "#c9a87f",
};
