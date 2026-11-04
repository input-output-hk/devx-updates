import { list, object, text } from "./core";
import type { Scope } from "./types";

export interface GradleConfiguration { projectPath: string; configuration: string; scope: Scope }

export function gradleConfigurations(value: unknown, adapter: string): GradleConfiguration[] | undefined {
  if (adapter !== "gradle-resolution") {
    if (value !== undefined) throw new Error("Configurations only apply to Gradle collection");
    return undefined;
  }
  const selections = list(value, "Gradle configurations").map((entry) => {
    const v = object(entry);
    if (Object.keys(v).some((key) => !["projectPath", "configuration", "scope"].includes(key))) throw new Error("Unknown Gradle configuration option");
    const projectPath = text(v.projectPath); const configuration = text(v.configuration);
    if (!/^:(?:[\w.-]+(?::[\w.-]+)*)?$/.test(projectPath) || !/^[\w.-]+$/.test(configuration)) throw new Error("Invalid Gradle project/configuration selector");
    if (!["runtime", "build", "development"].includes(String(v.scope))) throw new Error("Invalid Gradle configuration scope");
    return { projectPath, configuration, scope: v.scope as Scope };
  });
  if (!selections.length || new Set(selections.map((s) => `${s.projectPath}/${s.configuration}`)).size !== selections.length) throw new Error("Select nonempty, unique Gradle configurations");
  return selections.sort((a, b) => `${a.projectPath}/${a.configuration}`.localeCompare(`${b.projectPath}/${b.configuration}`, "en"));
}
