import { test } from "node:test";
import assert from "node:assert/strict";
import { dijkstraSite, toolState } from "./dijkstra-site";
import { githubRef, linkLabel, loadTracking, parseTrackingState, syncTracking } from "./tracking";

const known = new Set(["nami", "ogmios"]);
const yaml = (source: string) => loadTracking(source, known);

test("tracking accepts full and shorthand entries and rejects typos", () => {
  const register = yaml(`
tools:
  nami:
    dismissed: { reason: Archived, date: 2026-10-22 }
  ogmios:
    dismissed: Too little use
    links:
      - https://github.com/CardanoSolutions/ogmios/issues/1
      - url: https://github.com/CardanoSolutions/ogmios/pull/2
        note: Dijkstra support
`);
  assert.deepEqual(register.get("nami"), { dismissed: { reason: "Archived", date: "2026-10-22" }, links: [] }, "an unquoted YAML date is read as a date string");
  assert.deepEqual(register.get("ogmios")?.links, [
    { url: "https://github.com/CardanoSolutions/ogmios/issues/1" },
    { url: "https://github.com/CardanoSolutions/ogmios/pull/2", note: "Dijkstra support" },
  ]);
  assert.equal(yaml("tools: {}").size, 0);
  assert.equal(yaml("").size, 0, "an empty file is an empty register");
  assert.equal(yaml("# only comments\n#  tools:\n").size, 0, "so is a file of only comments");
  assert.throws(() => yaml("tools:\n  namii: { dismissed: x }"), /unknown tool namii/);
  assert.throws(() => yaml("tools:\n  nami: { dismised: x }"), /unknown field dismised/);
  assert.throws(() => yaml("tools:\n  nami: { dismissed: { date: 2026-10-22 } }"), /reason must be a nonempty string/);
  assert.throws(() => yaml("tools:\n  nami: { links: [http://example.com] }"), /https URL/);
  assert.throws(() => yaml("tools:\n  nami: { links: [https://a.io/x, https://a.io/x] }"), /listed twice/);
});

test("GitHub links get a short label; other links keep their address", () => {
  assert.deepEqual(githubRef("https://github.com/o/r/pull/12"), { repo: "o/r", kind: "pull", number: 12 });
  assert.equal(linkLabel("https://github.com/o/r/issues/3"), "o/r#3");
  assert.equal(linkLabel("https://forum.cardano.org/t/x"), "forum.cardano.org/t/x");
});

test("sync reads issue and PR state, skips non-GitHub links and keeps the last state on a failed lookup", async () => {
  const register = yaml(`
tools:
  ogmios:
    links: [https://github.com/o/r/issues/1, https://github.com/o/r/pull/2, https://github.com/o/r/pull/3, https://github.com/o/r/issues/4, https://example.com/x]
`);
  const answers: Record<string, unknown> = {
    "repos/o/r/issues/1": { title: "Bug", state: "open" },
    "repos/o/r/issues/2": { title: "Fix", state: "closed", pull_request: { merged_at: "2026-10-01T00:00:00Z" } },
    "repos/o/r/issues/3": { title: "Abandoned", state: "closed", pull_request: { merged_at: null } },
  };
  const previous = parseTrackingState({ schemaVersion: 1, links: { "https://github.com/o/r/issues/4": { kind: "issue", title: "Old", state: "open", checked: "2026-10-01" } } });
  const { state, failures } = await syncTracking(register, previous, async (e) => { if (!answers[e]) throw new Error("HTTP 404"); return answers[e]; }, "2026-10-22");
  assert.deepEqual(Object.fromEntries(Object.entries(state.links).map(([u, l]) => [u.split("/r/")[1], `${l.kind} ${l.state} ${l.title}`])), {
    "issues/1": "issue open Bug", "pull/2": "pull merged Fix", "pull/3": "pull closed Abandoned", "issues/4": "issue open Old",
  });
  assert.deepEqual(failures, ["https://github.com/o/r/issues/4: HTTP 404"]);
  assert.deepEqual(parseTrackingState(state), state, "the written file parses back");
});

test("a dismissal replaces the computed state and keeps it alongside", () => {
  const site = dijkstraSite();
  const ogmios = site.classification.tools.get("ogmios")!;
  const url = "https://github.com/CardanoSolutions/ogmios/issues/1";
  const tracked = { ...site, tracking: new Map([["ogmios", { dismissed: { reason: "Test" }, links: [{ url }] }]]), linkState: { [url]: { kind: "issue" as const, title: "T", state: "merged" as const, checked: "2026-10-22" } } };
  const state = toolState(tracked, ogmios);
  assert.equal(state.state, "dismissed");
  assert.equal(state.computed, "breaks");
  assert.equal(state.reason, "Test");
  assert.deepEqual(state.links, [{ url, label: "CardanoSolutions/ogmios#1", info: tracked.linkState[url] }]);
  assert.equal(toolState(site, ogmios).state, "breaks", "without an entry the computed state stands");
});
