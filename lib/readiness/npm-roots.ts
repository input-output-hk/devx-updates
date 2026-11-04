import { list, text } from "./core";

/** Paths are package keys relative to the selected npm lock; '.' denotes its root. */
export function npmRootPaths(value: unknown, adapter: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (adapter !== "npm-lock") throw new Error("Explicit root paths only apply to npm locks");
  const paths = list(value, "rootPaths").map((value) => text(value, "root path"));
  if (!paths.length || new Set(paths).size !== paths.length) throw new Error("Select nonempty, unique root paths");
  for (const path of paths) {
    if (path !== "." && (path.includes("\\") || path.split("/").some((p) => !p || p === "." || p === ".." || p === "node_modules"))) throw new Error("Root paths must name production workspace packages relative to the lock");
  }
  return paths;
}
