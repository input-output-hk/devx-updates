# Bump solves for the bump-ready Haskell tools (2026-10-22)

Whether Marlowe and Marconi, the two tools the unlock report calls bump-ready, can move to cardano-api 11.8.0.0
(the first release with Dijkstra support) as far as the dependency solver is concerned. Nothing is compiled:
each run is `cabal build all --dry-run` with the project's own test settings (Marlowe's `tests: True`), except
the Marconi shipped-code solves, which pass `--disable-tests --disable-benchmarks`.

`Dockerfile` is the earlier Atlas pilot's worker (`.readiness/haskell/Dockerfile`) on GHC 9.6.7 instead of 9.6.6,
with blst 0.3.14 and liburing 2.5 added: `cardano-crypto-class` 2.3 and later needs `libblst >= 0.3.14`, and
`ouroboros-consensus` 3.0 and later reaches `blockio-uring`, which needs `liburing >= 2.0` (bullseye ships 0.7).
GHC 9.6.7 rather than 9.6.6 because the cardano-api 11.8 closure needs `filepath >= 1.4.301`, which only 9.6.7's
boot packages provide, and `plutus-tx-plugin` links the `ghc` library, so `filepath` cannot be reinstalled.

```sh
docker build -t readiness-haskell:9.6.7 scripts/readiness/bump-solve
git clone https://github.com/marlowe-lang/marlowe-cardano marlowe && git -C marlowe checkout 826b5fc5cf6ee77d40936d403301b5a65ec85ab9
scripts/readiness/bump-solve/solve.sh marlowe marlowe-baseline.log                 # resolves
git -C marlowe apply ../scripts/readiness/bump-solve/marlowe.diff
scripts/readiness/bump-solve/solve.sh marlowe marlowe-bump.log                     # resolves
```

## Marlowe (`826b5fc5`, GHC 9.6.7 as in its flake)

- Baseline resolves: cardano-api 11.0.0.0, cardano-ledger-dijkstra 0.2.0.1, ouroboros-consensus 3.0.1.0.
- `marlowe.diff` moves the pin to `cardano-api ==11.8.0.0` and both index states to 2026-10-07 (11.8.0.0 entered
  CHaP on 2026-10-06). That alone does not resolve; each further pin was moved only as far as the solver required:
  `cardano-crypto-class` ^>=2.3 to ^>=2.6, `plutus-core` and `plutus-ledger-api` ^>=1.63 to ^>=1.71, and
  `validation` <1.2 to ^>=1.2 (`ouroboros-consensus` 5.1 needs it).
- The bumped project resolves (562 units, tests included): cardano-api 11.8.0.0, cardano-ledger-core 1.22.0.0,
  cardano-ledger-conway 1.24.0.0, cardano-ledger-dijkstra 0.4.0.0, ouroboros-consensus 5.1.0.0,
  plutus-ledger-api 1.71.0.0, cardano-crypto-class 2.6.0.0, validation 1.2.2.
- So the bump is solvable but not a one-line change: four companion pins cross major versions, each a possible
  API break, and whether Marlowe compiles against them is not established here.

## Marconi (`d39923eb`, GHC 9.2.8 in its Nix project)

- Baseline does not resolve on GHC 9.6.7: the pinned `cardano-node-emulator` source repository holds
  `plutus-ledger-api` 1.17, which no cardano-api that builds on GHC 9.6 accepts. A GHC 9.2.8 baseline was not run.
- `marconi.diff` raises every `cardano-api ^>=8.20` bound to `^>=11.8`, moves both index states to 2026-10-07,
  and adds `constraints: cardano-api ==11.8.0.0` in `cabal.project.local` (git-ignored there). The solve then
  stops at the pinned `cardano-node-emulator`, which needs cardano-api's `internal` sub-library, gone in 11.8;
  the newest released emulator (1.4.1.0, 2026-02-13) still targets `cardano-api ^>=10.18`.
- The emulator and every other source-repository pin are used only by `*-test-lib` libraries and test suites.
  With those stanzas and pins removed (as in the diff) and `--disable-tests --disable-benchmarks`, the shipped code still does not resolve: the
  `cardano-api-extended` sub-library depends on `ouroboros-network-protocols` and `ouroboros-consensus-protocol`,
  and the main libraries on `ouroboros-consensus-cardano` and `ouroboros-consensus-diffusion`. Those standalone
  packages stopped on the consensus 0.2x and network 0.x lines; `ouroboros-consensus` 5.1 carries them as the
  `protocol`, `diffusion` and `cardano` sub-libraries, and cardano-api 11.8 takes the protocols from
  `ouroboros-network:protocols`. Swapping the one network dependency is in the diff; the consensus ones were not
  attempted.
- So Marconi is not bump-ready in dependency terms: its build files need rewiring to the merged consensus and
  network packages, its test infrastructure needs an emulator that does not exist for cardano-api 11.x, and
  the compiler moves from 9.2.8 to 9.6.7.
