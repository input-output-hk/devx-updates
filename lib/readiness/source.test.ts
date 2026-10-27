import { test } from "node:test";
import assert from "node:assert/strict";
import { githubSource } from "./source";

const revision = "a".repeat(40);
const sha = "b".repeat(40);

test("source capture reads inline files at an immutable revision", async () => {
  const content = '{"name":"wallet"}\n';
  const calls: string[] = [];
  const result = await githubSource("owner/repo", revision, "wallet app/package.json", async (endpoint) => {
    calls.push(endpoint);
    return { type: "file", encoding: "base64", content: Buffer.from(content).toString("base64") };
  });
  assert.equal(result, content);
  assert.deepEqual(calls, [`repos/owner/repo/contents/wallet%20app/package.json?ref=${revision}`]);
});

test("large lockfiles follow the pinned blob instead of a mutable download URL", async () => {
  const content = JSON.stringify({ lockfileVersion: 3, padding: "x".repeat(1024 * 1024) });
  const calls: string[] = [];
  const result = await githubSource("owner/repo", revision, "package-lock.json", async (endpoint) => {
    calls.push(endpoint);
    if (calls.length === 1) return { type: "file", encoding: "none", sha, content: "", download_url: "https://untrusted.example/main/lock" };
    return { sha, encoding: "base64", content: Buffer.from(content).toString("base64") };
  });
  assert.equal(result, content);
  assert.deepEqual(calls, [`repos/owner/repo/contents/package-lock.json?ref=${revision}`, `repos/owner/repo/git/blobs/${sha}`]);
});

test("source capture rejects unpinned inputs, non-files, and unavailable or mismatched blobs", async () => {
  const unexpected = async (): Promise<unknown> => { throw new Error("Must not request invalid inputs"); };
  await assert.rejects(githubSource("owner/repo", "main", "package.json", unexpected), /immutable/);
  await assert.rejects(githubSource("owner/repo", revision, "../package.json", unexpected), /relative/);
  await assert.rejects(githubSource("owner/repo", revision, "packages", async () => ({ type: "dir" })), /source file/);
  await assert.rejects(githubSource("owner/repo", revision, "lock", async () => ({ type: "file", encoding: "none" })), /blob identity/);
  for (const response of [{ sha: revision, encoding: "base64", content: "" }, { sha, encoding: "none" }]) {
    await assert.rejects(githubSource("owner/repo", revision, "lock", async (endpoint) => endpoint.includes("/contents/")
      ? { type: "file", encoding: "none", sha }
      : response), /identity mismatch|base64/);
  }
  await assert.rejects(githubSource("owner/repo", revision, "lock", async (endpoint) => {
    if (endpoint.includes("/contents/")) return { type: "file", encoding: "none", sha };
    throw new Error("Blob unavailable");
  }), /Blob unavailable/);
});
