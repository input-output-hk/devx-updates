import { readComparison } from "./comparison-storage";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { calculateImpact } from "./impact";
import { readJson, Store } from "./store";
import type { Snapshot } from "./types";
import { reconcileReviewQueue, type ReviewQueueEntry } from "./review";
import { parseAssignments } from "./work";

let cached: Snapshot | undefined;
let impacts: ReturnType<typeof calculateImpact> | undefined;

export function readinessSnapshot() {
  cached ??= new Store(join(process.cwd(), "data/readiness")).load();
  return cached;
}

export function readinessImpacts() {
  impacts ??= calculateImpact(readinessSnapshot());
  return impacts;
}

export function readinessAssignments() {
  return parseAssignments(readJson(join(process.cwd(), "content/readiness/work-assignments.json")));
}

export function reviewQueue(): { packetId: string; toolIds: string[]; status: string }[] {
  const path = join(process.cwd(), "data/readiness/reviews.json");
  return existsSync(path) ? reconcileReviewQueue(readinessSnapshot(), readJson(path) as ReviewQueueEntry[]) : [];
}

export function readinessChanges() {
  return readComparison(join(process.cwd(), "data/readiness"), readinessSnapshot().semanticDigest);
}
