import { isAbsolute, relative } from "node:path";
import { list, object, text } from "./core";
import type { AdapterContext } from "./adapter-context";

/** Go emits adjacent JSON objects rather than an array. Braces inside strings are data. */
export function parseJsonStream(content: string): unknown[] {
  const records: unknown[] = []; let start = -1; let depth = 0; let string = false; let escape = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (start < 0) { if (/\s/.test(char)) continue; if (char !== "{") throw new Error("Expected a JSON object in native stream"); start = i; }
    if (string) { if (escape) escape = false; else if (char === "\\") escape = true; else if (char === '"') string = false; continue; }
    if (char === '"') string = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) { records.push(JSON.parse(content.slice(start, i + 1))); start = -1; }
  }
  if (start >= 0) throw new Error("Truncated native JSON stream");
  return records;
}

export function resolveGo(data: Record<string, unknown>, ctx: AdapterContext) {
  if (data.formatVersion !== 1) throw new Error("Unsupported Go collection envelope");
  const environment = object(data.environment, "go environment");
  const sourceRoot = text(data.sourceRoot, "sourceRoot");
  const roots: string[] = [];
  const declaredRoots = new Set<string>();
  const graphs = [["runtime", list(data.packages, "Go packages")], ["test", list(data.tests, "Go test packages")]] as const;
  for (const [kind, rawPackages] of graphs) {
    const packages = rawPackages.map((p) => object(p));
    const paths = new Set<string>();
    for (const pkg of packages) {
      const importPath = text(pkg.ImportPath, "ImportPath");
      if (paths.has(importPath)) throw new Error(`Duplicate Go package ${importPath}`);
      paths.add(importPath);
      const mod = pkg.Module ? object(pkg.Module) : undefined;
      const selected = mod?.Replace ? object(mod.Replace) : mod;
      let source: string; let version: string | null;
      if (pkg.Standard === true || pkg.Goroot === true) { source = "go:standard-library"; version = text(environment.GOVERSION); }
      else if (selected && typeof selected.Version === "string") { source = `gomod:${text(selected.Path)}`; version = selected.Version; }
      else {
        const directory = typeof selected?.Dir === "string" ? selected.Dir : typeof pkg.Dir === "string" ? pkg.Dir : "";
        const path = directory ? relative(sourceRoot, directory) : "..";
        const pinned = !isAbsolute(path) && path !== ".." && !path.startsWith("../");
        source = pinned ? `source:${ctx.input.revision}:${path || "."}` : `unverified-local:${directory || importPath}`;
        version = mod?.Main === true ? ctx.input.release : null;
        if (!pinned) ctx.gap(`Local or missing source for Go package ${importPath} is outside the pinned checkout.`);
      }
      const name = importPath.replace(/ \[.*\]$/, "");
      ctx.node(`${kind}:${importPath}`, name, version, source, typeof selected?.Sum === "string" ? selected.Sum : null);
      if (kind === "runtime" && pkg.DepOnly !== true && mod?.Main === true) {
        const requested = ctx.input.rootNames.filter((root) => root === mod.Path || root === importPath);
        if (requested.length) { ctx.root(`${kind}:${importPath}`); roots.push(importPath); requested.forEach((root) => declaredRoots.add(root)); }
      }
      if (pkg.Incomplete || pkg.Error || list(pkg.DepsErrors ?? []).length) ctx.gap(`Go could not fully load ${importPath}: ${pkg.Error ? String(object(pkg.Error).Err) : "dependency errors or incomplete metadata"}`);
      if (list(pkg.CgoFiles ?? []).length) ctx.gap(`Go package ${importPath} uses cgo; native libraries and build tools need separate resolution.`);
    }
    for (const pkg of packages) {
      const from = `${kind}:${text(pkg.ImportPath)}`;
      const imports = list(pkg.Imports ?? [], "Go imports");
      for (const imported of imports) {
        const name = text(imported);
        if (name === "C") continue;
        const to = typeof object(pkg.ImportMap ?? {})[name] === "string" ? String(object(pkg.ImportMap)[name]) : name;
        ctx.edge(from, `${kind}:${to}`, kind === "test" ? "development" : "runtime");
      }
    }
  }
  const testPaths = new Set(list(data.tests).map((p) => text(object(p).ImportPath)));
  for (const root of roots) if (testPaths.has(`${root}.test`)) ctx.edge(`runtime:${root}`, `test:${root}.test`, "development", false, "native go test dependency graph");
  for (const root of ctx.input.rootNames) if (!declaredRoots.has(root)) ctx.gap(`Requested Go root ${root} is absent from the selected package patterns.`);
  if (!list(data.packages).length) ctx.gap("Go emitted no packages for the requested patterns.");
  // The package graph is complete only for the explicit GOOS/GOARCH, cgo mode, and patterns.
  for (const key of ["GOOS", "GOARCH", "CGO_ENABLED", "GOVERSION"]) text(environment[key], key);
}
