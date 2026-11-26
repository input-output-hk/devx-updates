# Cardano developer tooling evidence survey

The survey instrument for the Cardano DevX tooling-evidence workstream, run by Delta Lab.
As of 2026-10-16.

## Purpose

This survey asks maintainers and contributors of Cardano developer tooling projects for
**project-level** dependency, reach and developer-experience evidence. It is not a census and does not estimate Cardano's total developer population.

- **Population:** one response per developer tooling project. A response from someone outside
  the project may inform follow-up but is not counted as the project's response.
- **Expected time:** 10–15 minutes.
- **Alongside the Cardano Foundation's developer survey.** The Foundation's yearly
  [State of the Cardano Developer Ecosystem](https://cardano-foundation.github.io/state-of-the-developer-ecosystem/)
  survey asks individual developers what they build with and what gets in their way. This
  survey asks only what that one does not: project-level dependencies, reach, onboarding and
  contribution readiness. Questions the Foundation's 2026 edition already asks are left out,
  and respondents are invited to answer the Foundation's survey when they finish this one.

**Continuity source.** Question families and answer labels marked `CF25` below are adapted from
the [Cardano Foundation's 2025 survey definition](https://github.com/cardano-foundation/state-of-the-developer-ecosystem/blob/1c25db955b5bd0f97f4924b10dbe744a6f1e4073/survey/public/survey.json)
(as of 2025-12-18).

## Consent and data policy

Results are reported in aggregate only. Naming the project (A1) and quoting an answer (A2) each
need a separate, explicit permission. Raw responses are stored privately, never published, and
deleted 12 months after submission; earlier deletion on request to hinson.wong@deltadefi.io or tszwai@deltadefi.io.

## Form introduction (shown before C1)

> We are mapping how Cardano developer tools depend on one another, where developers encounter
> friction, and which small improvements could have the greatest ecosystem effect. Your answers
> will inform the Cardano DevX tooling map, scoring methodology and future remediation work.
>
> This survey asks only about the project you maintain.
>
> Participation is voluntary. Please submit one response per project. By default, results are
> reported only in aggregate and identified by a response id. Your name, email and raw response
> will not be published. Separate optional questions let you permit project attribution or a
> direct quotation. Raw responses are deleted 12 months after submission; to have yours deleted
> sooner, email hinson.wong@deltadefi.io or tszwai@deltadefi.io. Do not include secrets, private customer information or
> personal data about anyone else.

## Section 1 — consent and response validity

| ID | Question shown to respondent | Type and options | Req. | Logic / use |
| --- | --- | --- | --- | --- |
| C1 | I have read the notice above and consent to my answers being collected, analysed and reported in aggregate for the Cardano DevX Initiative. | Single choice: `Yes`; `No` | Yes | If `No`, end without saving a response. |
| C2 | Are you responding for a specific Cardano developer tooling project? | Single choice: `Yes`; `No` | Yes | If `No`, end without saving a response. |
| C3 | Which best describes your relationship to this project? | Single choice: `Maintainer or project lead`; `Core contributor`; `Regular contributor`; `Integrator or downstream developer`; `User`; `Other — describe` | Yes | The first three count as a project response; others need verification. |
| C4 | Are you authorised or reasonably placed to answer on behalf of the project? | Single choice: `Yes`; `No`; `Unsure` | Yes | A project response requires `Yes`; otherwise flagged for follow-up. |

## Section 2 — project identity and response metadata

Each response also records its survey wave (`wave_id`, for example `survey-2026` or
`event-2026`). This is metadata, not a question.

| ID | Question shown to respondent | Type and options | Req. | Logic / use |
| --- | --- | --- | --- | --- |
| P1 | What project are you responding about? | Short text | Yes | Canonical public name. One response per project. |
| P2 | What is the project's canonical public URL? | URL | Yes | Source repository preferred; otherwise official site. |
| P3 | Which category best describes the project? | Single choice: `Smart Contracts`; `SDKs & Libraries`; `Nodes & RPC`; `Indexers & Data`; `APIs & Providers`; `Dev Tools & Testing`; `Wallets & Connectivity`; `Infrastructure & Integration`; `Layer 2 & Scaling`; `Node Operations`; `Governance`; `Oracles & Data Feeds`; `Other — describe` | Yes | Categories follow the Cardano DevX tooling map (`data/cardano-graph.json`). |
| P4 | What is the project's current status? | Single choice: `Active development`; `Maintained / stable`; `Early development / experimental`; `Maintenance only`; `Paused`; `Deprecated or archived`; `Other — describe` | Yes | Team-reported; checked against public evidence. |
| P5 | Approximately how many people have made a substantive contribution to the project in the last 90 days? | Single choice: `0`; `1`; `2–3`; `4–7`; `8–15`; `16+`; `Do not know / prefer not to say` | Yes | Team-reported capacity, not a GitHub-derived count. |

## Section 3 — dependency and ecosystem evidence

A dependency means software or a service the project needs to build, test, run or deliver its
core developer-facing function. Ordinary development utilities such as Git or a text editor
are omitted. For D1 and D5, one item per line.

**Compatibility context (checked 2026-10-16).** [Intersect's update of 2026-10-09](https://www.intersectmbo.org/news/intersect-weekly-update-132-oct-9-2026)
describes node 11.2 as planned to include the Dijkstra feature set except Leios. D10 concerns
the features relevant to the respondent's project; “within two weeks” means within 14 days
of responding. D7–D9 remain retired.

| ID | Question shown to respondent | Type and options | Req. | Logic / use |
| --- | --- | --- | --- | --- |
| D1 | Which Cardano libraries, tools, protocols or services does this project directly depend on? Enter one per line as `name \| public URL \| role in your project`. Write `None known` if applicable. | Long text | Yes | Primary project-level dependency evidence. |
| D2 | Which one of those dependencies would cause the greatest disruption if it became unavailable or incompatible? | Short text; `None`; `Do not know` allowed | Yes | The critical dependency; should also appear in D1. |
| D3 | How difficult would replacing that dependency be? | Five-point scale: `1 Trivial`; `2 Easy`; `3 Moderate`; `4 Difficult`; `5 No practical substitute`; plus `Not applicable / do not know` | Yes | Team judgement; reported separately from measured evidence. |
| D4 | What public evidence supports the dependencies listed above? | Long text: URLs, one per line | No | For example a manifest, imports, architecture docs or an integration guide. |
| D5 | Which projects, products or teams directly depend on this project, to your knowledge? Enter one per line as `name \| public URL \| relationship`. Write `None known` if applicable. | Long text | Yes | Downstream evidence; claims are verified publicly or in an interview. |
| D6 | What are the closest alternatives or complementary tools to this project? | Long text: one per line; `None known` allowed | No | Ecosystem coverage and interview sampling. |
| D10 | Is this project compatible with Cardano node 11.2, or will it be compatible within the next two weeks? | Single choice: `Compatible now`; `Not yet, but expected within two weeks`; `Not expected within two weeks`; `Unsure / not yet assessed`; `Not applicable to this project` | Yes | No preselected answer. Current readiness and expected readiness are reported separately; not a tooling score. |
| D11 | If this project is not ready yet, what needs to happen for it to become compatible? | Long text | Conditional | Required for D10 = expected within two weeks, not expected within two weeks, or unsure. Prompt for changes, dependency updates, documentation, testing access or support needed, and an expected readiness date if known. |

## Section 4 — usage and reach

Answers here are team-reported and are never presented as independently measured usage.

| ID | Question shown to respondent | Type and options | Req. | Logic / use |
| --- | --- | --- | --- | --- |
| U1 | Which signals can your team use to assess adoption or reach? | Checkboxes: `Known downstream projects`; `Package downloads`; `Active API keys or accounts`; `Production deployments`; `On-chain activity`; `GitHub dependents`; `Support/community activity`; `Survey data`; `Other — describe`; `No reliable signal` | Yes | Evidence inventory, not a usage score. |
| U5 | Compared with six months ago, how has meaningful project usage changed? | Single choice: `Decreased substantially`; `Decreased somewhat`; `About the same`; `Increased somewhat`; `Increased substantially`; `Too early / do not know` | Yes | Perception only; not converted to a growth rate. |

## Section 5 — developer experience and onboarding

| ID | Question shown to respondent | Type and options | Req. | Logic / use |
| --- | --- | --- | --- | --- |
| X1 | Who is the project's main developer audience? | Checkboxes, choose up to three: `New to software development`; `Experienced developers new to blockchain`; `Developers new to Cardano`; `Experienced Cardano developers`; `Infrastructure / node operators`; `Researchers`; `Enterprise integration teams`; `Other — describe` | Yes | Onboarding segmentation. |
| X2 | How can developers consume or install the project today? | Checkboxes: `Hosted service`; `Docker / container`; `Language package manager`; `OS package manager`; `Nix`; `Pre-compiled executable`; `Source code + build instructions`; `Other — describe` | Yes | Labels adapted from CF25 question 26. |
| X4 | For a developer in the project's intended audience, how long does a first successful result usually take? | Single choice: `<15 minutes`; `15–60 minutes`; `1–4 hours`; `4 hours–1 day`; `1–3 days`; `More than 3 days`; `No defined first result`; `Do not know` | Yes | Team estimate; the first result is defined in X5. |
| X5 | What counts as the first successful result for this project? | Short text | Yes | Makes X4 interpretable. |
| X6 | Overall, how satisfied are you with the project's current developer onboarding experience? | 0–10 scale: `0 Not at all satisfied`; `10 Completely satisfied` | Yes | Project self-assessment; not comparable with CF25 question 32. |
| X7 | What is the single biggest obstacle developers encounter when adopting this project? | Long text | Yes | Qualitative theme. |
| X12 | How well do AI coding assistants (for example Copilot, Claude, ChatGPT or Cursor) produce working code with this project today? | Single choice: `1 Rarely produce working code`; `2 Often need major fixes`; `3 Work with some fixes`; `4 Usually work`; `5 Reliably work`; `Not tried / do not know` | Yes | Baseline for AI-readiness; re-asked after improvements to show change. |

## Section 6 — peer suggestions

| ID | Question shown to respondent | Type and options | Req. | Logic / use |
| --- | --- | --- | --- | --- |
| E5 | Are there any other teams, besides your own, whose input you would highly value? | Long text: `team or project \| URL (optional) \| why`, one per line | No | Peer-suggested contacts; never implies inclusion. |

## Section 7 — reusable NPS module

This module is re-used unchanged in later waves. The wave is recorded
in `wave_id`; N1 never changes between waves and stays one unbroken 0–10 item.

The module can also be fielded on its own in a later wave, for example at a developer event:
C1 (consent), then N1–N2.

| ID | Question shown to respondent | Type and options | Req. | Logic / use |
| --- | --- | --- | --- | --- |
| N1 | How likely are you to recommend developing on Cardano to another developer? | 0–10 scale: `0 Not at all likely`; `10 Extremely likely` | Yes | Standard NPS: 0–6 detractors, 7–8 passives, 9–10 promoters. |
| N2 | What is the primary reason for your score? | Long text | No | Context for N1 only. |

## Section 8 — publication, follow-up and contribution

Each choice is independent and none is preselected. Answering `No` to A1 and A2 keeps the
response aggregate-only.

| ID | Question shown to respondent | Type and options | Req. | Logic / use |
| --- | --- | --- | --- | --- |
| A1 | May we name the project when publishing factual corrections or dependency relationships from this response? | Single choice: `Yes`; `No` | Yes | If `No`, only the response id is cited. A factual correction is not a quotation. |
| A2 | May we quote your written answers verbatim in a public report? | Single choice: `Yes, attributed to the project only`; `Yes, attributed to me and the project`; `No` | Yes | If named attribution is chosen, show A3. |
| A3 | What public name and role should accompany an approved quotation? | Short text | Conditional | Only for named quotation; kept private otherwise. |
| A4 | May we contact you to clarify this response or invite you to an interview? | Single choice: `Yes`; `No` | Yes | If `Yes`, show A5. |
| A5 | What contact address or public handle should we use? | Short text | Conditional | Used only for follow-up; never published. |
| A6 | Would your team review and merge an external contribution that makes this project easier for AI agents to use? | Single choice: `Yes, and we can review it`; `Yes`; `Depends on scope`; `No` | Yes | If `Yes, and we can review it`, show A8. |
| A7 | What, if anything, would block such a contribution? | Checkboxes: `CLA required`; `Limited review capacity`; `Conflicts with our roadmap`; `Licence constraints`; `Already planned internally`; `Other — describe`; `None` | Yes | `None` clears the other options. |
| A8 | Public GitHub handle of the person who would review it | Short text | Conditional | Kept private; never published. |

Question ids are stable. Ids missing from the sequence (X3, X8–X11, U2–U4, E1–E4) were removed after testing
and review, and are not reused.

## Completion page

> Thank you. Your response has been recorded under a response id. We may contact you only if
> you permitted follow-up. Project attribution and quotations will follow the permissions you
> selected. Public findings will be published in the Cardano DevX updates repository.
>
> One more thing: if you haven't yet, please also answer the Cardano Foundation's
> [State of the Cardano Developer Ecosystem](https://cardano-foundation.github.io/state-of-the-developer-ecosystem/)
> survey. It asks every Cardano developer, not only maintainers, about the tools they use.

A response that ends early because C1 or C2 is `No` sees the same invitation to the Foundation's
survey.

## How results are reported

- A response counts as the project's response only when C2 is `Yes`, C3 is maintainer, lead or
  contributor, and C4 is `Yes`; one response per project, with conflicts documented.
- Team-reported adoption (U1, U5) is kept separate from measured survey usage and map-derived
  dependency counts.
- D10 records team-reported readiness as of the response date. Compatibility now and expected
  compatibility within two weeks are reported separately; neither changes tooling scores.
- D3, U5, X4 and X6 are ordinal team judgements and are not averaged into tooling scores.
- Open-text themes are published with response counts; quotations and project names only with
  A2 and A1 permission.
- NPS is reported with its response count and wave.
