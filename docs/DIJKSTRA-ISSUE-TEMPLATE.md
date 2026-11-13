# Dijkstra issue template

Use this for every issue we open about a tool that needs changes for the Dijkstra hard fork.
Replace each `{{…}}`, delete sections that don't apply, and remove this header before posting.

Keep it short: what breaks, how to reproduce it, and one question the maintainers can answer.
Don't propose fixes; the maintainers know their code best, and our offer of help covers the rest.

---

## Title

`Dijkstra (PV12) support: {{one-line summary of the problem}}`

## Body

```markdown
Hi there! We're [AlwaysTrue](https://alwaystrue.io). IOG has brought us on to help the community prepare for the Dijkstra hard fork, which mostly means reviewing the tools people rely on and making the transition as smooth as possible. {{tool}} is a key piece of {{what it enables, e.g. "Ledger signing across the ecosystem"}}, so we tested it against cardano-node {{node version}} (PV12) and found a few things that will need attention.

**We'd be glad to help however works best for you. We can open PRs ourselves, work through the changes with you, or bring in IOG engineers who know this area well. If you already have plans for Dijkstra, we're happy to fit around them.**

In short:

1. {{finding 1}}
2. {{finding 2}}
3. {{finding 3}}

Checked on {{YYYY-MM-DD}} against {{tool}} {{version}} ([`{{short sha}}`]({{link}})), cardano-node {{node version}} and {{other pinned components}}. {{What was and wasn't executed, e.g. "Host-side tests only; nothing run on a device yet."}}

## {{What breaks, as a plain statement}}

{{What happens under Dijkstra, with links to the source lines.}}

Repro:

    {{minimal commands, no external dependencies if possible}}

{{What you see vs. what you'd expect, in one or two lines.}}

## {{Next thing that breaks …}}

{{Use a table when listing several fields or encodings: | Item | What breaks |}}

{{One direct question, e.g. "Is there already an issue or owner for Dijkstra on your side?"}}

Thanks for maintaining {{tool}}, and just let us know how we can help!
```

## Notes

- Only state what we checked. Say plainly what wasn't run (device, devnet, mainnet-like data).
- Pin versions with commit links so findings stay reproducible.
- Prefer one concrete repro over a long explanation.
- Skip the boilerplate caveats; one sentence of scope at the top is enough.
- Keep the intro and the bold help offer word for word across issues; only fill the placeholders.
- Link to alwaystrue.io rather than @-mentioning the org, so posting doesn't notify it.
- Use the Oxford comma ("A, B, and C").
- Published example: cardano-foundation/ledgerjs-hw-app-cardano#58.
