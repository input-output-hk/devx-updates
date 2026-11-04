export type Coverage = "complete" | "partial" | "unresolved" | "not-applicable";
export type Verification = "verified" | "suggested" | "disputed" | "rejected";
export type Scope = "runtime" | "build" | "development";
export const ECOSYSTEMS = ["npm", "cargo", "cabal", "gradle", "go", "python", "nix", "container", "other"] as const;
export type Ecosystem = typeof ECOSYSTEMS[number];
export const NATIVE_ADAPTERS = ["npm-lock", "cargo-metadata", "cabal-plan", "gradle-resolution", "pnpm-lock", "yarn-lock", "bun-lock", "poetry-lock", "go-packages", "uv-tree"] as const;
export type NativeAdapter = typeof NATIVE_ADAPTERS[number];
export type CollectAdapter = Exclude<NativeAdapter, "cabal-plan">;
export const COLLECT_ADAPTERS: readonly CollectAdapter[] = NATIVE_ADAPTERS.filter((adapter): adapter is CollectAdapter => adapter !== "cabal-plan");

export interface Evidence {
  id: string;
  digest: string;
  path: string;
  description: string;
  sourceUrl?: string;
}

export interface Gap {
  id: string;
  area: "artifact" | "resolution" | "integration" | "capability" | "discovery";
  reason: string;
  nextAction: string;
  profileId?: string;
  code?: string;
}

export interface Profile {
  id: string;
  toolId: string;
  release: string;
  revision: string;
  platform: string;
  features: string[];
  command: string;
  toolchain: string;
  origin: "release-build" | "source-reconstruction";
  roots: string[];
  inputDigest: string;
  evidenceIds: string[];
  nativeEvidenceId?: string;
  configurationEvidenceId?: string;
  coverage: Coverage;
}

export interface Tool {
  id: string;
  name: string;
  repo: string | null;
  catalogRepo?: string | null;
  maintainer: string;
  registryHint: string | null;
  packageHint: string | null;
  ecosystems: Ecosystem[];
  artifact: Coverage;
  resolution: Coverage;
  integration: Coverage;
  capability: Coverage;
  readiness: "unassessed";
  release?: string;
  revision?: string;
  releaseUrl?: string;
  manifests: string[];
  evidenceIds: string[];
  gaps: Gap[];
  lastAttempt?: string;
  lastSuccess?: string;
  discoveryError?: string;
}

export interface Artifact {
  id: string;
  ecosystem: string;
  name: string;
  version: string | null;
  source: string;
  integrity: string | null;
}

export interface Occurrence {
  id: string;
  artifactId: string;
  profileId: string;
  locator: string;
  evidenceIds: string[];
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  type: "package" | "service" | "protocol" | "bundled" | "code-generation";
  scope: Scope;
  optional: boolean;
  condition: string | null;
  constraint: string | null;
  verification: Verification;
  evidenceIds: string[];
}

export interface Decision {
  id: string;
  packetId: string;
  edgeId: string;
  verification: Verification;
  rationale: string;
  method: string;
  evidenceIds: string[];
}

export const CAPABILITY_LABELS = {
  "transaction-construction": "Transaction construction",
  serialization: "Serialization / deserialization",
  "script-compilation": "Script compilation",
  "script-evaluation": "Script evaluation",
  "chain-synchronization": "Chain synchronization",
  "chain-decoding": "Chain decoding",
  query: "Chain query",
  submission: "Transaction submission",
  "wallet-signing": "Wallet signing",
  "wallet-integration": "Wallet integration",
  governance: "Governance operations",
} as const;
export type CapabilityName = keyof typeof CAPABILITY_LABELS;

export interface CapabilityFinding {
  id: string;
  toolId: string;
  profileId: string;
  capability: CapabilityName;
  scope: Scope;
  condition: string | null;
  verification: Verification;
  rationale: string;
  evidenceIds: string[];
}

export interface CapabilityDecision extends Omit<Decision, "edgeId"> { capabilityId: string }

export interface Snapshot {
  schemaVersion: 1;
  catalogDigest: string;
  catalogRevision: string;
  semanticDigest: string;
  generatedAt: string;
  tools: Tool[];
  profiles: Profile[];
  artifacts: Artifact[];
  occurrences: Occurrence[];
  edges: Edge[];
  evidence: Evidence[];
  decisions: Decision[];
  capabilities?: CapabilityFinding[];
  capabilityDecisions?: CapabilityDecision[];
  reviewSubmissions?: { submissionEvidenceId: string; packetEvidenceId: string }[];
  collections?: { key: string; toolId: string; profileId: string; evidenceId: string }[];
}

export interface NativeInput {
  toolId: string;
  release: string;
  revision: string;
  platform: string;
  features: string[];
  command: string;
  toolchain: string;
  origin: Profile["origin"];
  adapter: NativeAdapter;
  rootNames: string[];
  rootPaths?: string[];
}

export interface Resolution {
  profile: Profile;
  artifacts: Artifact[];
  occurrences: Occurrence[];
  edges: Edge[];
  gaps: Gap[];
}

export interface Impact {
  artifactId: string;
  required: string[];
  optional: string[];
  build: string[];
  development: string[];
  potential: string[];
  paths: Record<string, string[]>;
}
