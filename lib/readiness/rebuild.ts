import { parseNativeInput, resolveNative } from "./adapters";
import { finalize, object, upgradeOperationalGap } from "./core";
import { collectionKey, type CollectionSelection } from "./collection";
import { addEvidence, mergeResolution, Store } from "./store";
import type { Profile, Snapshot } from "./types";

export function nativeEvidence(profile: Profile, allowLegacy = false): { native: string; configuration: string; supporting?: string[] } {
  if (profile.nativeEvidenceId && profile.configurationEvidenceId) return { native: profile.nativeEvidenceId, configuration: profile.configurationEvidenceId, supporting: profile.evidenceIds.filter((id) => id !== profile.nativeEvidenceId && id !== profile.configurationEvidenceId) };
  // Only the explicit rebuild command upgrades the first snapshot's positional contract.
  if (allowLegacy && profile.evidenceIds.length >= 2) return { native: profile.evidenceIds[0], configuration: profile.evidenceIds[1] };
  throw new Error("Legacy evidence roles: run rebuild-native before replay");
}

export function rebuildNative(snapshot: Snapshot, store: Store): Snapshot {
  if (snapshot.decisions.length || snapshot.capabilities?.length || snapshot.capabilityDecisions?.length || snapshot.edges.some((e) => e.type !== "package")) throw new Error("Rebuild would invalidate manual relationships or capabilities. Export and reconcile their decisions before upgrading native graph records.");
  const next = structuredClone(snapshot);
  next.profiles = []; next.artifacts = []; next.occurrences = []; next.edges = []; next.collections = [];
  for (const tool of next.tools) tool.gaps = tool.gaps.filter((g) => !g.profileId).map(upgradeOperationalGap);
  const profileIds = new Map<string, string>();
  for (const profile of snapshot.profiles) {
    const roles = nativeEvidence(profile, true);
    if (!profile.nativeEvidenceId) roles.supporting = snapshot.evidence.filter((e) => e.description.startsWith(`Native input ${profile.toolId}/`) && object(store.readEvidence(e)).revision === profile.revision).map((e) => e.id);
    const evidence = (id: string) => store.readEvidence(snapshot.evidence.find((e) => e.id === id)!);
    const result = resolveNative(evidence(roles.native), parseNativeInput(evidence(roles.configuration)), roles);
    profileIds.set(profile.id, result.profile.id);
    mergeResolution(next, result);
  }
  const requestEvidence = snapshot.collections?.length ? snapshot.collections.map((c) => snapshot.evidence.find((e) => e.id === c.evidenceId)!) : snapshot.evidence.filter((e) => e.description.startsWith("Collection request "));
  for (const evidence of requestEvidence) {
    const request = object(store.readEvidence(evidence));
    const profileId = profileIds.get(String(request.profileId));
    if (!profileId) continue;
    const toolId = next.profiles.find((p) => p.id === profileId)!.toolId;
    const selection = object(request.selection);
    const key = snapshot.collections?.find((c) => c.evidenceId === evidence.id)?.key ?? collectionKey(selection as unknown as CollectionSelection);
    const updated = store.evidence({ selection, profileId }, `Collection request for ${toolId}`);
    addEvidence(next, updated);
    if (!next.collections.some((c) => c.key === key && c.toolId === toolId)) next.collections.push({ key, toolId, profileId, evidenceId: updated.id });
  }
  return finalize(next);
}
