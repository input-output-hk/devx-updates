import { isAbsolute, relative, resolve } from "node:path";
import { canonical, list, object, text } from "./core";
import type { AdapterContext } from "./adapter-context";

export function resolveUv(data: Record<string, unknown>, ctx: AdapterContext) {
  if (object(data.schema, "uv schema").version !== "preview" || data.inverted !== false) throw new Error("Unsupported or inverted uv tree schema");
  const root = text(data.workspace_root);
  const resolution = object(data.resolution, "uv resolution");
  const members = new Set(list(data.members, "uv workspace members").map((m) => text(object(m).id)));
  const workspaceId = text(object(data.workspace).id);
  for (const [id, raw] of Object.entries(resolution)) {
    const pkg = object(raw);
    if (id === workspaceId && pkg.kind === "workspace") continue;
    const source = object(pkg.source, "uv source");
    const local = source.virtual ?? source.editable ?? source.directory;
    let origin = canonical(source);
    if (typeof local === "string") {
      const checkout = typeof data.collectionSourceRoot === "string" ? data.collectionSourceRoot : undefined;
      const path = checkout ? relative(checkout, resolve(root, local)) : "..";
      if (path === ".." || path.startsWith("../") || isAbsolute(path)) ctx.gap(`Python local source ${local} is outside the pinned checkout or its checkout identity is unavailable.`);
      else origin = `source:${ctx.input.revision}:${path || "."}`;
    }
    const version = typeof pkg.version === "string" ? pkg.version : null;
    const name = text(pkg.name);
    // A lock can enumerate many candidate wheels. None is claimed as the installed artifact.
    ctx.node(id, name, version, origin, null);
    if (members.has(id) && pkg.kind === "package" && ctx.input.rootNames.includes(name)) ctx.root(id);
    if (!Array.isArray(pkg.dependencies)) ctx.gap(`uv omitted dependency metadata for ${id}.`);
  }
  for (const [id, raw] of Object.entries(resolution)) {
    const pkg = object(raw);
    if (id === workspaceId && pkg.kind === "workspace") continue;
    for (const dependency of list(pkg.dependencies ?? [])) {
      const dep = object(dependency);
      const marker = typeof dep.marker === "string" ? dep.marker : null;
      const group = typeof pkg.kind === "object" && pkg.kind ? object(pkg.kind).group : undefined;
      ctx.edge(id, text(dep.id), group ? "development" : "runtime", !!marker, marker);
    }
    for (const dependency of list(pkg.optional_dependencies ?? [])) {
      const dep = object(dependency); ctx.edge(id, text(dep.id), "runtime", true, `extra:${text(dep.name)}`);
    }
    for (const dependency of list(pkg.dependency_groups ?? [])) {
      const dep = object(dependency); ctx.edge(id, text(dep.id), "development", true, `dependency-group:${text(dep.name)}`);
    }
  }
  ctx.gap("uv tree captures runtime, extra, and development metadata for the declared Python/platform. Build-backend dependencies and the installed wheel/sdist selection remain unverified.");
}
