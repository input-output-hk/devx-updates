/** What the green dot means, for legends and screen readers. */
export const UNRELEASED_LABEL = "Unreleased Dijkstra work";
export const UNRELEASED_MEANING =
  "A branch, pull request or release candidate is done or nearly done, but tools downstream cannot use it yet: it is not released, only a prerelease, or in a fork.";

/**
 * Green dot for a tool with Dijkstra work done or nearly done that downstream cannot consume yet. With a `note` it
 * names itself; without one it sits next to its label (legends, the filter) and is decorative.
 */
export default function UnreleasedDot({ note }: { note?: string }) {
  const dot = "inline-block size-2.5 shrink-0 rounded-full align-middle bg-status-done ring-2 ring-status-done/25";
  if (!note) return <span aria-hidden className={dot} />;
  const title = `${UNRELEASED_LABEL}: ${note}`;
  return <span title={title} className={dot}><span className="sr-only">{title}</span></span>;
}
