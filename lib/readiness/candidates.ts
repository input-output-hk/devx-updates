import { posix } from "node:path";
import type { CollectAdapter, Snapshot } from "./types";

/** Starting points require explicit root and configuration selection before collection. */
export function collectionCandidates(snapshot: Snapshot, toolIds?: string[]) {
  if (toolIds?.some((id) => !snapshot.tools.some((tool) => tool.id === id))) throw new Error("Unknown tool selection");
  return snapshot.tools.filter((tool) => !toolIds?.length || toolIds.includes(tool.id)).flatMap((tool) => {
    const manifests = new Set(tool.manifests);
    const candidates: { adapter: CollectAdapter; path: string; requirements: string[] }[] = [];
    for (const path of tool.manifests) {
      const file = posix.basename(path);
      const sibling = (name: string) => posix.join(posix.dirname(path), name);
      if (/^build\.gradle(\.kts)?$/.test(file) && (posix.dirname(path) === "." || manifests.has(sibling("settings.gradle")) || manifests.has(sibling("settings.gradle.kts")))) candidates.push({ adapter: "gradle-resolution", path, requirements: ["Docker with pinned Gradle 7.5.1 image", "official 7.5.1 wrapper distribution", "explicit project/configuration/scope selections and root names", "amd64-Linux"] });
      if (file === "package-lock.json") candidates.push({ adapter: "npm-lock", path, requirements: ["npm lockfile v2/v3", "root package names", "all-platform lock scope"] });
      if (file === "pnpm-lock.yaml") candidates.push({ adapter: "pnpm-lock", path, requirements: ["pnpm lockfile v9", "workspace root package names", "all-platform lock scope"] });
      if (file === "yarn.lock" && manifests.has(sibling("package.json"))) candidates.push({ adapter: "yarn-lock", path, requirements: ["Classic v1 or modern Yarn metadata v6/v8/v10", "production package/workspace manifests", "all-platform lock scope; peer bindings unresolved"] });
      if (file === "bun.lock" && manifests.has(sibling("package.json"))) candidates.push({ adapter: "bun-lock", path, requirements: ["Bun text lock v1", "production workspace names and manifests", "all-lockfile-targets"] });
      if (file === "poetry.lock" && manifests.has(sibling("pyproject.toml"))) candidates.push({ adapter: "poetry-lock", path, requirements: ["Poetry 2.1 lock and matching legacy manifest", "isolated Poetry/poetry-core 2.1.1 reader", "registry packages only; all-lockfile-targets"] });
      if (file === "Cargo.lock" && manifests.has(sibling("Cargo.toml"))) candidates.push({ adapter: "cargo-metadata", path: sibling("Cargo.toml"), requirements: ["Cargo toolchain", "workspace root package names", "target platform"] });
      if (file === "go.mod") candidates.push({ adapter: "go-packages", path, requirements: ["Go toolchain", "module/package roots", "GOOS/GOARCH", "package patterns and build tags"] });
      if (file === "uv.lock" && manifests.has(sibling("pyproject.toml"))) candidates.push({ adapter: "uv-tree", path: sibling("pyproject.toml"), requirements: ["uv with JSON tree support", "workspace root package names", "Python version and platform"] });
    }
    return candidates.length ? [{ toolId: tool.id, release: tool.release ?? null, revision: tool.revision ?? null, packageHint: tool.packageHint, candidates }] : [];
  });
}
