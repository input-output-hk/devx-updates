import { canonical, list, object, text } from "./core";
import type { AdapterContext } from "./adapter-context";

/** Native Poetry has already matched names, constraints and source identities.
 * Preserve every alternative with markers; this is not an installed environment. */
export function resolvePoetry(data: Record<string, unknown>, ctx: AdapterContext) {
  if (data.formatVersion !== 1 || object(object(data.lock).metadata)["lock-version"] !== "2.1") throw new Error("Unsupported Poetry capture format");
  const metadata = list(object(data.lock).package).map((p) => object(p));
  const packages = list(data.packages).map((p) => object(p));
  const expected = metadata.flatMap((entry, i) => list(entry.groups).map((group) => `${i}:${text(group)}`)).sort();
  if (canonical(packages.map((pkg) => pkg.id).sort()) !== canonical(expected)) throw new Error("Poetry native/lock group count mismatch");
  const byId = new Map(packages.map((pkg) => [text(pkg.id), pkg]));
  const root = object(data.root);
  const directory = text(data.sourceDirectory);
  if (ctx.input.rootNames.some((name) => name !== root.name)) throw new Error("Selected Poetry root is absent");
  ctx.node("root", text(root.name), text(root.version), `source:${ctx.input.revision}:${directory}`, null);
  if (ctx.input.rootNames.includes(text(root.name))) ctx.root("root");
  for (const pkg of packages) {
    const entry = metadata[Number(pkg.lockIndex)];
    if (!entry || pkg.id !== `${pkg.lockIndex}:${pkg.group}` || !list(entry.groups).includes(pkg.group) || pkg.version !== entry.version || text(pkg.name) !== text(entry.name).toLowerCase().replace(/[-_.]+/g, "-")) throw new Error("Poetry native package identity differs from lock");
    const source = entry.source ? canonical(entry.source) : canonical({ registry: "https://pypi.org/simple" });
    // Hashes are for candidate wheels/sdists, never one installed distribution.
    ctx.node(`package:${text(pkg.id)}`, text(pkg.name), text(pkg.version), source, null);
  }
  function dependencies(from: string, pkg: Record<string, unknown>) {
    for (const raw of list(pkg.dependencies)) {
      const dep = object(raw);
      const targets = list(dep.targets).map((id) => text(id));
      if (!targets.length) ctx.gap(`Poetry dependency ${text(dep.name)} ${text(dep.constraint)} from ${from} has no locked match.`);
      for (const target of targets) {
        const targetPackage = byId.get(target);
        if (!targetPackage) throw new Error("Invalid Poetry dependency target");
        const entry = metadata[Number(targetPackage.lockIndex)];
        const markers = typeof entry.markers === "object" && entry.markers ? object(entry.markers)[text(targetPackage.group)] : entry.markers;
        const native = object(dep.condition);
        const conditions = [native.marker !== "" ? `marker:${text(native.marker)}` : null, native.python !== "*" ? `python:${text(native.python)}` : null, ...["extras", "inExtras"].filter((key) => list(native[key]).length).map((key) => `${key}:${canonical(native[key])}`), markers ? `locked markers:${canonical(markers)}` : null, entry["python-versions"] !== "*" ? `locked python:${text(entry["python-versions"])}` : null, targets.length > 1 ? "alternative locked selection" : null].filter(Boolean);
        for (const group of list(dep.groups).map((g) => text(g))) {
          if (targetPackage.group !== group || (from !== "root" && pkg.group !== group)) throw new Error("Poetry dependency crosses locked groups");
          const groupConditions = [...conditions, ...(group === "main" ? [] : [`dependency group:${group}`]), ...(dep.optional === true || entry.optional === true ? ["optional dependency / extra activation unverified"] : [])];
          ctx.edge(from, `package:${target}`, group === "main" ? "runtime" : "development", dep.optional === true || groupConditions.length > 0, groupConditions.join("; ") || null, text(dep.constraint));
        }
      }
    }
  }
  dependencies("root", root);
  packages.forEach((pkg) => dependencies(`package:${text(pkg.id)}`, pkg));
  ctx.gap("Poetry lock retains all packages, groups, markers, extras and candidate distribution hashes. Target Python/platform and extra activation are not evaluated; installed wheel/sdist selection, build-backend dependencies, native libraries and published artifact correspondence remain unverified.");
}
