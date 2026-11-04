# Higher-level capability review handoff

Seven task-brief-v2 packets are prepared in `.readiness/reviews/capabilities/`.
The [retained index](./capability-reviews.json) records exact packet IDs, source
revisions, profile IDs and their captured production source files. Every packet remains
pending; no discovery/challenge task has been launched and no capability claims
have been imported. This is evidence preparation for plan sections 6.3 and 7.

Use [Run the prepared reviews](../../docs/RUN-PREPARED-REVIEWS.md) for copy-paste
LLM prompts, exact input/output paths, and the evidence-check/import procedure.

| Consumer | Review questions and explicit boundary |
| --- | --- |
| Lace mobile | Trace mobile module wiring into signing and submission APIs. Establish which behavior is enabled in the selected mobile profile. Shared SDK entry points alone do not prove mobile wiring; ask for additional source where needed. Browser extension, native device behavior and hosted deployments remain separate. |
| GovTool frontend | Trace voting form, wallet context and vote request behavior. Separate governance actions, signing delegated to connected wallets, and backend service calls. Frontend manifest 2.0.29 is retained at repository tag v2.0.36; do not equate those releases or infer backend coverage. |
| TyphonJS | Inspect exported transaction APIs, builder and serialization paths. Preserve library context; do not infer a deployed Typhon wallet. Both historical parser captures describe the same pinned v4.0.0 source; use the official-parser profile ending `5958bba13a88b8790661b312` for new findings and retain the first capture as history. |
| Cometa | Trace public exports, transaction builder and wallet wrappers into native/WASM boundaries. Separate direct JavaScript behavior, bindings and external providers. No runtime npm dependencies does not imply no native runtime. Source/build correspondence remains unverified. |
| Lucid Evolution | Trace transaction construction, signing, submission, governance helpers and provider/wallet wiring through the retained production TypeScript packages. Source manifest `@lucid-evolution/lucid` 0.8.3 is at the `@lucid-evolution/core-types@0.5.2` repository tag; publication correspondence is unverified. Use registered profile ending `82ef3bc2a8877a35a7fe4310` for new findings; retain the other native profile as history. CML/UPLC conditional node/browser/worker bindings and speed/size variants need explicit consumer context and separate native artifact provenance. Provider endpoints, network, wallet configuration and selected evaluator remain unknown. |
| Masumi | Trace backend startup, API routes and monitoring jobs into payment-source V1/V2 purchase processing, transaction construction, wallet signing and submission. Inspect provider selection and cost-model synchronization; comments describing a workaround do not prove correctness or target compatibility. Keep V1/V2 Mesh contexts and conditional L1/Hydra L2 behavior distinct. Trace admin transaction queries through its configured API client; backend signing is not evidence of frontend signing. Both selected roots are manifest 0.1.0 on default-branch source, not verified deployed artifacts. Contract/compiler, generated-client, native/WASM and Hydra image provenance remain separate boundaries. |
| Sokosumi | Trace web job actions through Core routes, job creation, purchase registration/synchronization and the configured payment/registry clients. Distinguish delegated payment requests from direct chain construction, signing or submission. Inspect payment-source/network conditions and x402 paths without attributing every payment protocol to Cardano. The web root is 0.1.0 and Core has no manifest version at the `macos-v1.1.1` repository tag; neither identifies a web/Core deployment. URLs and client names do not establish a service edge to the separately collected Masumi revision. Apple, CMO and CLI roots remain outside the selected profile; other agent, database and hosted services remain unreviewed. |

This Lucid Evolution packet refers to `Anastasia-Labs/lucid-evolution`.
Original Lucid (`spacebudz/lucid`) is excluded from active work at the owner's
request. `evolution-sdk` is a separate catalog project, not an alias for Lucid
Evolution. SundaeSwap is not yet a prepared capability packet: its pinned
manifest/lock mismatch must be resolved before native-profile-based findings.

These questions guide review; the packet's retained tool/profile/evidence context
defines importable scope. A selected file list is a starting point, not a claim
that every production behavior is covered. Return missing source as gaps. If more
evidence is captured, export a new packet and use its new ID; do not edit the
existing packet's evidence or reuse findings against changed inputs silently.

To reproduce a packet from the committed snapshot (no network required):

```sh
node --import tsx scripts/readiness/cli.ts export-review --tools lace --output .readiness/reviews/capabilities/lace
node --import tsx scripts/readiness/cli.ts export-review --tools govtool --output .readiness/reviews/capabilities/govtool
node --import tsx scripts/readiness/cli.ts export-review --tools typhonjs --output .readiness/reviews/capabilities/typhonjs
node --import tsx scripts/readiness/cli.ts export-review --tools cometa-js --output .readiness/reviews/capabilities/cometa-js
node --import tsx scripts/readiness/cli.ts export-review --tools lucid-evolution --output .readiness/reviews/capabilities/lucid-evolution
node --import tsx scripts/readiness/cli.ts export-review --tools masumi --output .readiness/reviews/capabilities/masumi
node --import tsx scripts/readiness/cli.ts export-review --tools sokosumi --output .readiness/reviews/capabilities/sokosumi
```

The owner can launch discovery with the template in
[`DEPENDENCY-REVIEW-TASKS.md`](../../docs/DEPENDENCY-REVIEW-TASKS.md#discovery),
substituting the packet directory and a separate result directory. Provide this
handoff alongside the packet. Launch the independent challenge pass after a
discovery result returns; neither pass edits canonical data. The actual import
format is JSON (`result-template.json` plus `CAPABILITIES.md`), even where the
conceptual task brief illustrates YAML. Verification still requires a separate
source, maintainer or native evidence decision.

All tools remain hardfork-unassessed. The next operational step is the owner-run
review handoff, followed by checked result import and explicit remaining gaps.
