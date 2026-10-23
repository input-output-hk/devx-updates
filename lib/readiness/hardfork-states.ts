import type { HardforkState } from "./dijkstra-site";
import type { LinkState } from "./tracking";

/** Labels and status colors for the per-tool Dijkstra states; shared by the server page and the client list. */
export const HARDFORK_STATES: Record<HardforkState, { label: string; text: string; dot: string; bar: string }> = {
  breaks: { label: "Breaks after HF", text: "text-status-blocked", dot: "bg-status-blocked", bar: "bg-status-blocked" },
  "in-progress": { label: "In progress", text: "text-status-progress", dot: "bg-status-progress", bar: "bg-status-progress" },
  ready: { label: "Ready for HF", text: "text-status-done", dot: "bg-status-done", bar: "bg-status-done" },
  unverified: { label: "Not verified", text: "text-muted", dot: "bg-muted", bar: "bg-muted" },
  dismissed: { label: "Dismissed", text: "text-muted", dot: "border border-muted", bar: "bg-border" },
};

export const LINK_STATES: Record<LinkState, string> = { open: "text-status-progress", merged: "text-status-done", closed: "text-muted" };
