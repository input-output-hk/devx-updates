import type { Edge, Scope } from "./types";

export const EXPOSURES = ["required", "optional", "build", "development", "potential"] as const;
export type Exposure = typeof EXPOSURES[number];
export interface ExposureState { scope: Scope; optional: boolean; potential: boolean }
export const ROOT_EXPOSURE: ExposureState = { scope: "runtime", optional: false, potential: false };
export function followExposure(current: ExposureState, edge: Edge): ExposureState {
  return {
    scope: current.scope === "development" || edge.scope === "development" ? "development" : current.scope === "build" || edge.scope === "build" ? "build" : "runtime",
    optional: current.optional || edge.optional,
    potential: current.potential || edge.verification !== "verified",
  };
}
export function exposureBucket(state: ExposureState): Exposure {
  return state.potential ? "potential" : state.scope === "development" ? "development" : state.scope === "build" ? "build" : state.optional ? "optional" : "required";
}
