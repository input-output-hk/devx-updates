import { posix } from "node:path";
import { canonical, digest, list, object, text } from "./core";
import type { AdapterContext } from "./adapter-context";
import type { Scope } from "./types";

function variant(value: unknown): string {
  const v = object(value, "Gradle variant");
  text(v.name, "Gradle variant name");
  for (const entry of Object.values(object(v.attributes, "Gradle variant attributes"))) text(entry);
  for (const value of list(v.capabilities, "Gradle variant capabilities")) {
    const capability = object(value);
    text(capability.group); text(capability.name);
    if (capability.version !== null) text(capability.version);
  }
  return canonical(v);
}

export function gradleHasFailures(data: unknown): boolean {
  return list(object(data).graphs).some((graph) => list(object(graph).nodes).some((node) => list(object(node).dependencies).some((dependency) => object(dependency).failure !== undefined)));
}

/** Import the variant graph emitted by our pinned Gradle init script, without executing a build. */
export function resolveGradle(data: Record<string, unknown>, ctx: AdapterContext) {
  if (data.formatVersion !== 1 || data.gradleVersion !== "7.5.1") throw new Error("Unsupported Gradle capture version");
  const environment = object(data.environment, "Gradle environment");
  for (const key of ["javaVersion", "javaVendor", "os", "arch"]) text(environment[key]);
  if (ctx.input.platform !== `${environment.arch}-${environment.os}`) throw new Error("Gradle capture platform differs from profile");
  list(data.repositories, "Gradle repositories");
  const sourceDirectory = data.sourceDirectory === undefined ? "." : text(data.sourceDirectory);
  if (posix.isAbsolute(sourceDirectory) || sourceDirectory.includes("\\") || posix.normalize(sourceDirectory) !== sourceDirectory || sourceDirectory === ".." || sourceDirectory.startsWith("../")) throw new Error("Gradle source directory escapes checkout");
  const graphs = list(data.graphs, "Gradle graphs").map((value) => object(value));
  if (!graphs.length) throw new Error("Gradle capture has no selected configurations");
  // ResolutionResult identifies selected coordinates, but not their repository or binary digest.
  // Keep those identities local to this capture rather than merging unproven registry artifacts.
  const externalSource = `unverified-gradle-capture:${digest({ revision: ctx.input.revision, capture: data })}`;
  const graphIds = new Set<string>();
  const rootNames = new Set<string>();
  for (const graph of graphs) {
    const projectPath = text(graph.projectPath, "Gradle project path");
    const configuration = text(graph.configuration, "Gradle configuration");
    if (!/^:(?:[^:\s]+(?::[^:\s]+)*)?$/.test(projectPath)) throw new Error("Invalid Gradle project path");
    if (!["runtime", "build", "development"].includes(String(graph.scope))) throw new Error("Invalid Gradle configuration scope");
    const scope = graph.scope as Scope;
    const graphId = canonical([projectPath, configuration]);
    if (graphIds.has(graphId)) throw new Error("Duplicate Gradle configuration graph");
    graphIds.add(graphId);
    const nodes = new Map<string, { raw: Record<string, unknown>; name: string; locator: string; condition: string }>();
    for (const value of list(graph.nodes, "Gradle nodes")) {
      const raw = object(value); const id = text(raw.id, "Gradle node id");
      if (nodes.has(id)) throw new Error("Duplicate Gradle node id");
      const component = object(raw.component, "Gradle component");
      const name = `${text(component.group, "Gradle group")}:${text(component.name, "Gradle module name")}`;
      const version = text(component.version, "Gradle version");
      const selectedVariant = variant(raw.variant);
      const reasons = list(raw.selectionReasons, "Gradle selection reasons").map((value) => {
        const reason = object(value); text(reason.cause); text(reason.description); return reason;
      });
      list(raw.dependencies, "Gradle dependencies");
      let source: string;
      if (component.kind === "project") {
        text(component.projectPath, "Gradle local project path");
        const path = text(component.path, "Gradle source path");
        if (posix.isAbsolute(path) || path.includes("\\") || posix.normalize(path) !== path || path === ".." || path.startsWith("../")) throw new Error("Gradle project source lies outside the pinned checkout");
        source = `source:${ctx.input.revision}:${posix.join(sourceDirectory, path)}`;
      } else if (component.kind === "module") source = externalSource;
      else throw new Error("Unsupported Gradle component kind");
      if (version === "unspecified") ctx.gap(`Gradle project ${name} has no declared version.`);
      const locator = canonical([projectPath, configuration, digest(id)]);
      ctx.node(locator, name, version === "unspecified" ? null : version, source, null);
      nodes.set(id, { raw, name, locator, condition: `Gradle ${projectPath} ${configuration}; variant ${selectedVariant}; selection ${canonical(reasons)}` });
    }
    const root = nodes.get(text(graph.root, "Gradle graph root"));
    if (!root || object(root.raw.component).kind !== "project" || object(root.raw.component).projectPath !== projectPath || !ctx.input.rootNames.includes(root.name)) throw new Error("Gradle root must match the selected local project and named package");
    ctx.root(root.locator); rootNames.add(root.name);
    for (const node of nodes.values()) for (const value of list(node.raw.dependencies)) {
      const dependency = object(value, "Gradle dependency");
      const requested = text(dependency.requested, "Gradle requested selector");
      if (typeof dependency.constraint !== "boolean") throw new Error("Gradle constraint flag must be boolean");
      if ((dependency.target !== undefined) === (dependency.failure !== undefined)) throw new Error("Gradle dependency needs exactly one target or failure");
      if (dependency.failure !== undefined) {
        ctx.gap(`Gradle ${projectPath} ${configuration}: ${requested} failed: ${text(dependency.failure)}`);
        continue;
      }
      const target = nodes.get(text(dependency.target));
      if (!target) throw new Error("Gradle dependency references a missing captured node");
      // Constraints influence selection; they do not introduce a dependency/exposure path.
      if (!dependency.constraint) ctx.edge(node.locator, target.locator, scope, false, target.condition, requested);
    }
  }
  for (const name of ctx.input.rootNames) if (!rootNames.has(name)) throw new Error(`Gradle selected root ${name} has no configuration graph`);
  ctx.gap("Gradle selected-variant metadata graph does not identify downloaded binary checksums or the repository that supplied each external module. External identities are capture-local; published artifacts and dependency verification require separate evidence.");
  ctx.gap("Only explicitly selected Gradle configurations are captured. File dependencies, build/plugin/annotation-processor classpaths, native bundles, generated outputs, tests and deployed integrations outside those configurations remain unexamined. No successful build or hardfork compatibility is established.");
}
