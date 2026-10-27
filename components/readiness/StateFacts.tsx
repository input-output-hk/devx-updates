import Link from "next/link";
import type { Blocker, StateTag } from "@/lib/readiness/dijkstra-site";

const TONE: Record<StateTag["tone"], string> = {
  bad: "border-status-blocked/40 bg-status-blocked/10 text-status-blocked",
  work: "border-status-progress/40 bg-status-progress/10 text-status-progress",
  act: "border-border bg-surface-2 text-foreground",
};

/** A tool's state as chips: what blocks it first and most visibly, then short facts. Renders nothing when both are empty. */
export default function StateFacts({ blockedBy, tags }: { blockedBy: Blocker[]; tags: StateTag[] }) {
  if (!blockedBy.length && !tags.length) return null;
  return <div className="space-y-1.5">
    {blockedBy.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-status-blocked">Blocked by</span>
      {blockedBy.map((b) => {
        const chip = "rounded-md border border-status-blocked/50 bg-status-blocked/10 px-1.5 py-0.5 text-xs font-medium text-foreground";
        return b.href
          ? <Link key={b.id} href={b.href} className={`${chip} no-underline hover:border-status-blocked`}>{b.label}</Link>
          : <span key={b.id} className={chip}>{b.label}</span>;
      })}
    </div>}
    {tags.length > 0 && <div className="flex flex-wrap gap-1.5">{tags.map((t) => (
      <span key={t.label} className={`rounded-full border px-2 py-0.5 text-xs ${TONE[t.tone]}`}>{t.label}</span>
    ))}</div>}
  </div>;
}
