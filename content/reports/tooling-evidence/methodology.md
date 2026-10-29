# Evaluation methodology

How the Cardano DevX tooling-evidence workstream scores the importance of Cardano developer
tools. The same method is applied to every project, including those Delta Lab maintains.
As of 2026-10-15.

## Source data

The [Cardano DevX tooling map](../../../data/cardano-graph.json): 269 projects in 12
categories. Figures below use the map at commit
[`fcacd30`](https://github.com/input-output-hk/devx-updates/blob/fcacd308d09bd7189314bacbb7af91fabffefa36/data/cardano-graph.json)
(project metadata generated 2026-07-20).

## Formula

The method extends the scoring formula already in this repository, the weighted sum behind
the map's node sizes
([`GraphMap.tsx` at commit `507e9b4`](https://github.com/input-output-hk/devx-updates/blob/507e9b410e076e2c3a2a7fdad27749a40962900d/components/GraphMap.tsx)).
It keeps the same three inputs and transforms and recalibrates the weights.

| Input | Transform | Upstream weight | Recalibrated weight | Why |
| --- | --- | --- | --- | --- |
| Developer-survey usage: share of respondents to the Cardano Foundation's 2025 developer survey who use the project | usage % ÷ 100 | 0.5 | **0.6** | The most direct evidence of what developers rely on, so it is weighted heaviest |
| GitHub stars | √stars ÷ √(most stars in the map) | 0.2 | **0.1** | Popularity rather than use; stars over-rank stale projects |
| Connectivity: links to other projects in the map | links ÷ (most links in the map) | 0.3 | **0.3** | Unchanged; the only input recorded for every project |

**Score** = 100 × (0.6 × usage + 0.1 × stars + 0.3 × connectivity), from 0 to 100.

- **Within category only.** Projects are ranked against others in the same category, never
  across categories: a debugger competes with debuggers.
- **Missing inputs are not zeros.** A project without a survey usage figure gets a score
  range (the lowest and highest score its missing input allows), not a rank. Missing usage
  never means low importance.
- **Ties share a rank.**
- **Candidates for further review** are the top 25% of ranked projects in each category,
  rounded up, with recorded usage above zero. Archived or abandoned projects are held for a
  human decision rather than selected.
- **Room for judgement.** Reviewers may add a project the rule misses, for example one that is
  clearly central to Cardano development but under-represented in the survey sample. Each
  addition is published with its written reason. Additions involving Delta Lab's own tools are
  decided by the Cardano DevX Initiative.

Alternatives compared before choosing 60/10/30: 50/20/30 (unchanged) and 70/10/20. On the map
above, 60/10/30 and 70/10/20 select the same 25 candidates.

## Data updates

Scores use the Cardano Foundation's 2025 developer survey
([report](https://cardano-foundation.github.io/state-of-the-developer-ecosystem/2025/)) as the
usage input, and the weights, formula and rules above stay fixed for the whole workstream.
When results of the Foundation's 2026 survey become available (its responses are recorded on
chain, so they can be read while it is still open), they are published as a dated addendum to
this analysis: response count, snapshot date and a comparison of 2026 usage with 2025 for the
tools both editions list. The addendum does not re-score projects.

## Assumptions

- Share of 2025 survey respondents using a project is a fair proxy for how widely developers
  use it.
- The node-size formula in `GraphMap.tsx` is the existing scoring formula to extend.
- Links in the map reflect real technical relationships between projects.

## Limitations

- **Survey coverage.** 73 of 269 projects have a survey usage figure, from 109 respondents.
  The other 196 are score ranges, not ranks. Weighting the survey heaviest widens those
  ranges. Interviews and the tooling-evidence survey add coverage over time.
- **Connectivity is not value.** Many end-user tools (explorers, debuggers, faucets) have no
  links in the map by nature, which is why ranking stays within category.
- **Stars are weak.** Against survey usage they correlate at Spearman 0.36.
- **Staleness.** The map reflects mid-2026. 46 projects have no recorded commit date; a
  missing date is a gap in the map, not evidence that a project is inactive.
- **Incumbency.** Survey and map both favour projects that are already visible. New work
  cannot appear in a map of existing work.

## Conflict of interest: Mesh, Whisky and Vodka

Delta Lab maintains Mesh, Whisky and Vodka. They are scored with exactly the same weights and
missing-data rules as every other project, with no bonus, penalty or manual adjustment, and
their scores are published alongside every other project's. Any bounty touching these tools is
adjudicated by the Cardano DevX Initiative, and Delta Lab staff take no bounty awards.

## Corrections

If a figure here is wrong about your project, open an issue on this repository.
