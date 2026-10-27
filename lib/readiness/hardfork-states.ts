import type { HardforkState } from "./dijkstra-site";
import type { LinkState } from "./tracking";

/** Labels and status colors for the per-tool Dijkstra states; shared by the server page and the client list. */
export const HARDFORK_STATES: Record<HardforkState, { label: string; text: string; dot: string; bar: string }> = {
  breaks: { label: "Breaks after HF", text: "text-status-blocked", dot: "bg-status-blocked", bar: "bg-status-blocked" },
  "in-progress": { label: "In progress", text: "text-status-progress", dot: "bg-status-progress", bar: "bg-status-progress" },
  ready: { label: "Ready for HF", text: "text-status-done", dot: "bg-status-done", bar: "bg-status-done" },
  unverified: { label: "Not verified", text: "text-(--viz-1)", dot: "bg-(--viz-1)", bar: "bg-(--viz-1)" },
  dismissed: { label: "Dismissed", text: "text-status-todo", dot: "bg-status-todo", bar: "bg-status-todo" },
};

export const LINK_STATES: Record<LinkState, string> = { open: "text-status-progress", merged: "text-status-done", closed: "text-muted" };
