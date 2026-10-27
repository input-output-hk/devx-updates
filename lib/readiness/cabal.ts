import { posix } from "node:path";
import { canonical, list, object, text } from "./core";
import type { AdapterContext } from "./adapter-context";

type Unit = Record<string, unknown>;
interface Component { name: string; locator: string; details: Unit }
interface PlannedUnit { raw: Unit; components: Component[] }

function components(unit: Unit): Component[] {
  const entries: [string, unknown][] = unit.type === "pre-existing" ? [["lib", unit]]
    : unit.components !== undefined ? Object.entries(object(unit.components, "Cabal components"))
      : [[text(unit["component-name"], "Cabal component-name"), unit]];
  if (!entries.length) throw new Error("Cabal unit has no components");
  return entries.map(([name, details]) => {
    if (!/^(lib|setup|(lib|flib|exe|test|bench):[^\s]+)$/.test(name)) throw new Error(`Unsupported Cabal component ${name}`);
    return { name, locator: canonical([text(unit.id), name]), details: object(details) };
  });
}

/** Versioned Cabal 3.12 plan capture. Bare historical plans keep their original replay. */
export function resolveCabal(data: Unit, ctx: AdapterContext) {
  if (data.formatVersion !== 1) throw new Error("Unsupported Cabal capture format");
  const plan = object(data.plan, "Cabal plan");
  if (plan["cabal-version"] !== "3.12.1.0" || plan["cabal-lib-version"] !== "3.12.1.0") throw new Error("Unsupported Cabal plan version (expected 3.12.1.0)");
  const compiler = text(plan["compiler-id"]);
  const platform = `${text(plan.arch)}-${text(plan.os)}`;
  if (ctx.input.platform !== platform) throw new Error("Cabal plan platform differs from declared profile");
  const directory = posix.normalize(text(data.sourceDirectory, "Cabal sourceDirectory"));
  if (!posix.isAbsolute(directory) || directory === "/") throw new Error("Cabal sourceDirectory must be an absolute checkout directory");
  const units = new Map<string, PlannedUnit>();
  for (const value of list(plan["install-plan"], "Cabal install-plan")) {
    const raw = object(value); const id = text(raw.id);
    if (units.has(id)) throw new Error(`Duplicate Cabal unit ${id}`);
    if (!["configured", "installed", "pre-existing"].includes(String(raw.type))) throw new Error(`Unsupported Cabal unit type ${raw.type}`);
    units.set(id, { raw, components: components(raw) });
  }
  for (const [id, { raw, components }] of units) {
    const name = text(raw["pkg-name"]); const version = text(raw["pkg-version"]);
    let source: string;
    let integrity: string | null = null;
    if (raw.type === "pre-existing") source = `compiler:${compiler}:${platform}:${id}`;
    else {
      const flags = object(raw.flags, "Cabal flags");
      if (Object.values(flags).some((flag) => typeof flag !== "boolean")) throw new Error("Cabal flags must be boolean");
      const src = object(raw["pkg-src"], "Cabal pkg-src");
      source = canonical(src);
      if (raw["pkg-src-sha256"] !== undefined) {
        integrity = text(raw["pkg-src-sha256"]);
        if (!/^[a-f0-9]{64}$/.test(integrity)) throw new Error("Invalid Cabal source SHA256");
      }
      if (src.type === "local") {
        const path = posix.resolve(directory, text(src.path));
        const relative = posix.relative(directory, path);
        if (relative === ".." || relative.startsWith("../")) ctx.gap(`Cabal local source ${src.path} lies outside the pinned checkout; its identity is unverified.`);
        else source = `source:${ctx.input.revision}:${relative || "."}`;
      } else if (src.type === "source-repo") {
        const repo = object(src["source-repo"]);
        text(repo.location);
        if (repo.type !== "git" || !/^[a-f0-9]{40,64}$/.test(String(repo.tag))) ctx.gap(`Cabal source repository for ${name} lacks an immutable Git commit.`);
      } else if (["repo-tar", "remote-tar", "local-tar"].includes(String(src.type))) {
        if (!integrity) ctx.gap(`Cabal archive for ${name} has no source checksum.`);
      } else ctx.gap(`Unsupported Cabal source type ${src.type} for ${name}; source identity needs review.`);
      // A Hackage/CHaP metadata revision can change dependencies without changing the tarball.
      if (raw["pkg-cabal-sha256"] !== undefined) {
        const metadata = text(raw["pkg-cabal-sha256"]);
        if (!/^[a-f0-9]{64}$/.test(metadata)) throw new Error("Invalid Cabal metadata SHA256");
        source = canonical({ source, cabalSha256: metadata });
      }
    }
    for (const component of components) ctx.node(component.locator, name, version, source, integrity);
  }

  const dependency = (id: string, executable: boolean): string | undefined => {
    const target = units.get(id);
    const candidates = target?.components.filter((component) => executable ? component.name.startsWith("exe:") : component.name === "lib" || component.name.startsWith("lib:")) ?? [];
    if (candidates.length === 1) return candidates[0].locator;
    ctx.gap(`Cabal ${executable ? "executable" : "library"} dependency ${id} is missing or ambiguous in the plan.`);
  };
  for (const { raw, components } of units.values()) {
    const setup = components.find((component) => component.name === "setup");
    for (const component of components) {
      const scope = component.name === "setup" ? "build" : /^(test|bench):/.test(component.name) ? "development" : "runtime";
      const condition = `Cabal component ${component.name}; flags ${canonical(raw.flags ?? {})}`;
      for (const id of list(component.details.depends, "Cabal component depends")) {
        const to = dependency(text(id), false);
        if (to) ctx.edge(component.locator, to, scope, false, condition);
      }
      for (const id of list(raw.type === "pre-existing" ? [] : component.details["exe-depends"], "Cabal component exe-depends")) {
        const to = dependency(text(id), true);
        if (to) ctx.edge(component.locator, to, scope === "development" ? "development" : "build", false, condition);
      }
      if (setup && setup !== component) ctx.edge(component.locator, setup.locator, scope === "development" ? "development" : "build", false, "Cabal custom setup");
    }
  }
  for (const value of list(data.roots, "Cabal selected roots")) {
    const root = object(value); const unit = units.get(text(root.unitId)); const name = text(root.component);
    const component = unit?.components.find((component) => component.name === name);
    if (!unit || unit.raw.style !== "local" || !ctx.input.rootNames.includes(text(unit.raw["pkg-name"])) || !component || name === "setup") throw new Error("Cabal selected root must match a named local package component");
    ctx.root(component.locator);
  }
  ctx.gap("Cabal plan describes a source reconstruction, not a successful build or shipped artifact. Foreign libraries, compiler plugins, generated outputs and deployed integrations require separate evidence.");
}
