# ADR-150 — MetaHarness Integration Surfaces in `npx ruflo`

**Status**: Implemented (Phase 1 ✅ iters 1–3 · Phase 2 ✅ iters 4–12 · KRR retrain pending production data)
**Date**: 2026-06-16 (revised 2026-06-16 — twelve iterations of /loop)
**Related**: ADR-148 (cost-optimal router lifecycle via `@metaharness/router`), ADR-149 (per-model cost-optimal routing), ADR-026 (3-tier model routing), ADR-097 (federation budget circuit breaker), ADR-124 (optional native dependencies), ADR-144 (agent-authorization-propagation)
**External reference**: [`ruvnet/agent-harness-generator`](https://github.com/ruvnet/agent-harness-generator) — the upstream that publishes `metaharness` + `@metaharness/*`. Same author (rUv), explicitly designed around ruflo primitives.
**Research dossier**: published as a gist (linked from the tracking issue) with full graded-evidence sourcing.

## Context

We just shipped `ruflo@3.11.0` (also `@claude-flow/cli@3.11.0`, `claude-flow@3.11.0`). ADR-148/149 already wired `@metaharness/router` as an `optionalDependency` for cost-optimal model routing behind a triple gate. The remaining MetaHarness surface — twenty-plus `@metaharness/*` packages: kernel, host adapters (9), verticals (13), scaffold/eject CLI — is unused by ruflo despite being authored by the same maintainer specifically around ruflo's architecture.

Three signals make this the right time to commit a broader integration:

1. **MetaHarness is first-party.** Same author (`ruv@ruv.net`), same ADR numbering convention (kernel docs reference ADR-011/022/033/036/040/041/043), explicit framing: *"Scaffold your own focused AI agent harness — like ruflo, uniquely yours."* The `buildRegistryEntry()` doc comment says: *"Mirrors the ruflo plugin registry shape so the same UI can browse it."* The `@metaharness/host-claude-code` adapter emits `.claude/settings.json` in exactly ruflo's format.
2. **The router integration is already live but underutilized.** `@metaharness/router@^0.3.2` is in `optionalDependencies`; `neural-router.ts` imports it behind `CLAUDE_FLOW_ROUTER_NEURAL=1`. The bundled KRR is trained on hand-coded seed scores rather than measured routing outcomes — leaving the DRACO Pareto win unrealized.
3. **No ruflo skill exposes scaffolding/score/genome/threat-model to Claude Code today.** Users discover MetaHarness independently and are confused about the relationship.

### Evidence baseline (measured 2026-06-16)

| Fact | Source | Grade |
|---|---|---|
| `metaharness@0.1.11` ships 24 subcommands across two binaries (`metaharness` factory + `harness` lifecycle) | `dist/index.d.ts`, `dist/subcommands.d.ts`, all `*-cmd.d.ts` | HIGH |
| 20+ `@metaharness/*` packages published; full ecosystem (kernel + 5 host adapters + 13 verticals + 5 platform NAPI binaries) | `npm search @metaharness` | HIGH |
| `@metaharness/router@0.3.2` exports `Router` (k-NN), `TrainedRouter` (KRR), `NativeRouter` (FastGRNN via tiny-dancer), zero runtime deps, 53 kB unpacked | `dist/*.d.ts`, npm registry | HIGH |
| `@metaharness/kernel@0.1.0` exports `loadKernel`, `ToolDispatcher` (claims-checked), `SelfEvolvingRouter`, `TrajectoryStore`, `rankWithDecay` | `kernel-pkg/package/dist/*.d.ts` | HIGH |
| `metaharness` factory exports `buildRepoScorecard()`, `buildGenomeReport()`, `buildScorecard()`, `buildThreatModel()`, `scanMcp()`, `buildOiaManifest()`, `buildRegistryEntry()` — all pure reads, well-typed | `dist/repo-scorecard.d.ts` etc. | HIGH |
| Velocity: `metaharness` 0.1.0 → 0.1.11 in ~23h; `@metaharness/router` 0.1.0 → 0.3.2 in 2.7h on 2026-06-15 | npm `time` field | HIGH |
| Both packages MIT-licensed, same maintainer as ruflo | npm registry | HIGH |
| Existing benchmark proves `@metaharness/router` native backend loads on the test host: `mh_native_available: true` | `docs/benchmarks/runs/router-4way-seed99-2026-06-15T14-12-40Z.json` | HIGH |

## Architectural Constraint (load-bearing invariant)

**MetaHarness may augment ruflo. MetaHarness must never become a required runtime dependency for core orchestration, memory, routing, MCP dispatch, agent execution, or federation.**

Every integration in this ADR, and every future ADR that extends it, must satisfy:

1. **Removable**: ruflo's `npm ls` with all `@metaharness/*` packages removed must still produce a working CLI. The triple-gate pattern used for `@metaharness/router` (env flag + artifact + import success) is the reference implementation.
2. **Optional in `package.json`**: `@metaharness/*` packages MUST appear in `optionalDependencies` or `peerDependencies` (optional), never in `dependencies`.
3. **Graceful degradation**: every code path that imports a `@metaharness/*` symbol must catch `MODULE_NOT_FOUND` and fall back to a built-in path (or a clearly-degraded but functional state).
4. **CI coverage of the absent path**: at least one CI job must run `--ignore-optional` (or equivalent) and assert ruflo still passes its smoke contract. This is the only structural defense against accidentally promoting an optional dep to required.

The intent of this constraint is to prevent ruflo from becoming a hidden second orchestration framework wrapped around its sibling's runtime. Reviewer's framing: *"Ruflo remains operational if every MetaHarness package is removed."* That sentence is now part of the API surface contract — any PR that breaks it is a breaking change requiring its own ADR.

## Decision

Adopt MetaHarness as ruflo's downstream sibling tool, surfaced through three integration channels that match its three distinct contributions:

1. **Static-analysis MCP tools** — `harness-score`, `harness-genome`, `harness-threat-model`, `harness-mcp-scan` as a new `plugins/ruflo-metaharness/` plugin. Subprocess invocation of the `metaharness` / `harness` CLI binaries; no static library dependency added to ruflo's boot path. Read-only operations only.
2. **Live router data pipeline** — replace the hand-coded seed corpus for the bundled KRR with measured routing trajectories collected via the existing `CLAUDE_FLOW_ROUTER_TRAJECTORY=1` recorder; retrain `train-bundled-krr.mjs` against real data. This unlocks the Pareto win ADR-149 forecast but never measured.
3. **CI security gates** — add `harness mcp scan .` and `metaharness score . --json` to `v3-ci.yml`. Both are static, fast, and machine-readable. Asserts no HIGH MCP findings and a non-zero readiness score on every PR.

Three concrete things we ARE NOT doing in this ADR (deferred to Phase 2+):

- Wiring `@metaharness/kernel`'s `ToolDispatcher` into the MCP dispatch core. The kernel is v0.1.0 and the dispatch path is too high-blast-radius for an early-stage replacement.
- Promoting `@metaharness/router` from `optionalDependency` to `dependency`. The triple gate is the right posture until the API stabilizes at 1.0.
- Exposing `from-repo <git-url>` as an MCP tool callable by Claude Code without explicit user confirmation. Untrusted-Git-clone is a deliberate human-in-the-loop step.

### Phased rollout

**Phase 0 — Measurement spike (1–3 days, no code shipped to npm).**
- Run `npx metaharness score .` and `npx metaharness genome .` against the ruflo repo to establish baseline scorecards.
- Enable `CLAUDE_FLOW_ROUTER_TRAJECTORY=1` for ≥50 routing decisions; verify the `.swarm/model-router-trajectories.jsonl` shape matches what `train-bundled-krr.mjs` expects.
- Confirm `import('@metaharness/router')` succeeds from `v3/@claude-flow/cli` and exercise `Router.fromExamples(...)` with the existing benchmark corpus.
- Run `harness mcp scan .` to baseline ruflo's own MCP threat-model score.

Exit criteria: baseline numbers in hand; no surprises in trajectory format or `mcp scan` output.

**Phase 1 — MVP (3–7 days, one MINOR release: 3.12.0).**
1. **`plugins/ruflo-metaharness/`** with three skills (`harness-score`, `harness-genome`, `harness-mint`), conventional structure (`plugin.json`, `skills/*/SKILL.md` with `allowed-tools: Bash`, `scripts/smoke.sh`). Skills shell out to `npx metaharness` / `npx harness` — no library imports. Covered by the fleet meta-smoke and the three existing audits (exit-bypass, frontmatter, manifest).
2. **CI gates** in `v3-ci.yml`: `npx metaharness score . --json` (assert `exitCode === 0`) and `npx harness mcp scan .` (assert no HIGH findings). Both are additive jobs on the existing matrix.
3. **Real seed corpus**: collect trajectory data over Phase-0's recorder runs + a CI pass, retrain via `scripts/train-bundled-krr.mjs`, regenerate the bundled artifact. Validate `routedBy: 'metaharness-krr'` activates on real decisions in the next bench run.

Exit criteria: `plugins/ruflo-metaharness/scripts/smoke.sh` passes; meta-smoke shows 33/33 plugins green; CI score + mcp-scan jobs green on main; new bench run shows `routedBy: 'metaharness-krr'` for ≥ 1 routing decision driven by measured-seed KRR.

Semver: MINOR — additive plugin, additive CI gates, additive MCP tools. No breaking changes.

**Phase 2 — Expansion (1–4 weeks, one or two MINOR releases).**
- `npx ruflo eject` command wrapping `metaharness --from-existing ./` for one-shot harness extraction (attribution preserved via the `<!-- ruflo-attribution-block -->` convention).
- `SelfEvolvingRouter` (from `@metaharness/kernel`) parallel-logged alongside the Thompson bandit in `model-router.ts` for two weeks. **Promotion criteria (AND, not OR — must satisfy all three):**
  1. **Quality**: `qualityScore` improvement > 2% (where `qualityScore` is the existing per-task verdict-weighted reward used by the bandit)
  2. **Cost**: `usdPerDecision` increase < 1% (no expensive regressions hiding behind quality wins)
  3. **Latency**: p95 routing-decision latency increase < 5%
  Each metric measured over an identical workload between bandit-only and SelfEvolvingRouter-only periods, separated by a 24h washout window. Failing any one criterion blocks promotion; the bandit stays primary. This tightening is deliberate — the "OR" form would let quality gains mask cost or latency regressions, which is the exact failure mode ADR-149's Pareto framing was built to prevent.
- Harness entries in the ruflo plugin registry — accept `type: 'harness'` in `discovery.ts`; surface via `npx ruflo plugins list --type harness`.
- 13th background worker `oia-audit` that runs `buildOiaManifest()` + `buildThreatModel()` + `scanMcp()` on a schedule and stores results in the `metaharness-audit` memory namespace.

Each Phase-2 item is independently scoped and can ship as separate MINOR releases.

**Phase 3 — Harness Intelligence Layer (future, scope-only — separate ADR per item).**

A class of capability that exists nowhere else in the agent-framework space, made possible by `buildGenomeReport()` + `buildRepoScorecard()` + `buildRegistryEntry()`'s shared schema:

- **Genome similarity search** — given two harnesses (or one harness + a candidate repo), compute a similarity vector across the 7 genome sections + scorecard dimensions; surface the closest match in the registry.
- **Harness recommendation engine** — given a repo + a user description, recommend (a) the closest existing harness in the registry, (b) the closest template, and (c) the minimum delta to fork from either.
- **Fleet-wide architecture drift detection** — for organisations running multiple harnesses, track genome-section drift over time; alert when a harness diverges from its template lineage beyond a threshold.
- **Cross-harness capability graph** — `compare <a> <b>` already exists in `harness` CLI; lift it into a fleet-aware diff that answers "which harness in our fleet has the closest capability set to this task?".
- **Plugin compatibility analysis** — given a `plugins/X/` and a target harness, predict whether the plugin's `allowed-tools` requirements are satisfied by the harness's MCP server declarations.

These are scope-only in this ADR. Each item gets its own ADR before implementation. They are listed here so the architectural constraint (above) covers them up front — the Harness Intelligence Layer must also satisfy the four removable/optional/graceful/CI-coverage rules.

## Consequences

### Positive

- Closes the "what is the relationship between ruflo and MetaHarness?" question by answering it in the UX rather than the docs.
- Ruflo gains a continuous, machine-readable readiness score and MCP threat-model on every PR — the same primitives we use to score third-party repos for harness viability.
- The ADR-149 Pareto win (per-model cost-optimal routing) becomes measured rather than theoretical, because the KRR is finally trained on real trajectories.
- Phase 1 is entirely additive: no `model-router.ts` dispatch logic changes, no top-level command surface change, no IPFS registry change. Backward-compatible MINOR bump.
- Three integration channels match MetaHarness's three contributions — analysis, routing, hosts — without forcing the kernel's full surface into a position where its 0.x stability would block ruflo releases.

### Negative / risks

- **API stability**: both `metaharness` and `@metaharness/router` are 0.x and ship rapid patch releases. A breaking change in `@metaharness/router@0.4.x` would require immediate `neural-router.ts` updates. Mitigation: pin to `~0.3.2` in `optionalDependencies`; add `scripts/check-metaharness-compat.mjs` to CI exercising the `Router` constructor with a trivial example to catch runtime breakage before publishing.
- **Bus factor**: same maintainer as ruflo, MetaHarness, and ruvector. No change from today, but the dependency edge is now explicit.
- **Sandboxing**: `harness from-repo <url>` clones arbitrary Git URLs. Phase-1 skills NEVER expose this to Claude Code; only `analyze`/`score`/`genome` (pure reads) and `harness-mint` (writes to user-specified target dir, never project root).
- **GCP dependency**: `harness validate` uses GCP Secret Manager via `gcloud`. Ruflo CI must skip those subcommands (or mock them) — explicit `--skip-gcp` flag from the `harness validate` command surface handles this.
- **Phase-1 MCP plugin spawns subprocesses**: subprocess crashes, timeouts, and stdout-parsing edge cases are now in ruflo's failure surface. Mitigation: hard timeout (60s) per invocation, captured stderr in error responses, structured-JSON output enforced via `--json` flag everywhere.

### Neutral / accepted trade-offs

- Subprocess invocation in Phase 1 (rather than library import) adds ~200ms cold-start overhead per call vs. an embedded library. Acceptable for MCP tools that are not in the hot path; the router path (already library-imported) remains as-is.
- Maintaining a `ruflo-metaharness` plugin doubles documentation surface for two sibling tools. Mitigation: skill descriptions explicitly point to the upstream MetaHarness docs as canonical for the underlying functionality; the plugin only documents the ruflo-side adaptation.

## Alternatives Considered

**Alternative A: Ignore MetaHarness, build all scaffolding/score/genome natively in ruflo.**
Rejected. `buildRepoScorecard()`, `buildGenomeReport()`, `scanMcp()`, `buildThreatModel()` are already-tested implementations exposing clean TypeScript APIs. Reimplementing them in ruflo is pure duplication cost with no advantage. The eject path's `rewriteContent()` with attribution-block preservation is subtle.

**Alternative B: Use MetaHarness only as a CLI subprocess everywhere, never as a library import.**
Partially adopted (this is the Phase-1 plugin posture). Wrong for `@metaharness/router` — sub-ms routing latency demands a library import, which ADR-148/149 already accepted.

**Alternative C: Promote `@metaharness/router` from `optionalDependency` to `dependency`.**
Rejected for now. The triple gate (`CLAUDE_FLOW_ROUTER_NEURAL=1` + artifact + import success) is the right posture until the API stabilizes at 1.0.

**Alternative D: Wait for MetaHarness 1.0 before any further integration beyond ADR-148/149.**
Rejected. The static-analysis surface (`score`, `genome`, `mcp scan`, `threat-model`) is already mature (475 files, well-typed, pure reads). Waiting creates a window where users discover MetaHarness independently and are confused about its relationship to ruflo. The Phase-1 plugin answers that question without incurring API-stability risk because the integration is via CLI subprocess, not library import.

**Alternative E: Wire `@metaharness/kernel`'s `ToolDispatcher` as the primary MCP dispatch in Phase 1.**
Rejected. Touching the MCP dispatch core affects all 314 tools and is too high-blast-radius for an early-stage (v0.1.0) component. Deferred to a Phase-3 ADR after the kernel ships a 1.0 with API-stability commitments.

## Open Questions

- Should the Phase-1 plugin's `harness-mint` skill require explicit user confirmation in the Claude Code UI before writing any files? Lean yes — destructive-action-confirmation matches ruflo's "executing actions with care" principle.
- Should the seed-corpus retraining cadence be ad-hoc (Phase-1) or scheduled (e.g., monthly cron in a Phase-2 follow-up)? Defer to Phase-2 once we see the trajectory volume.
- Does the `oia-audit` background worker (Phase 2) belong in `ruflo-loop-workers` or in `ruflo-metaharness`? Probably the latter, since the audit output is MetaHarness-specific.
- How does the architectural constraint's CI gate (the `--ignore-optional` smoke run) interact with the existing `all-plugins-smoke.yml` workflow? Probably a new sibling workflow `no-metaharness-smoke.yml` that re-runs the same matrix with `--ignore-optional`; lighter than adding a second axis to the existing matrix.

## Implementation Notes (revised 2026-06-16)

The integration shipped across eight `/loop` iterations on branch
`feat/metaharness-integration-research`. Status of each Phase milestone:

### Phase 0 — Measurement spike ✅ DONE (iter 1)
- Ruflo baseline scorecard captured: harnessFit 82/100, compileConfidence
  100, taskCoverage 79, toolSafety 100, memoryUsefulness 40 (weakest —
  track), estCostPerRunUsd $0.048, archetype `typescript-sdk-harness`,
  template recommendation `vertical:coding`, scaffoldReady true.
- Ruflo genome: repo_type `node_mcp_ci`, risk_score 0.27 (low),
  publish_readiness 0.9, mcp_surface `remote`.

### Phase 1 — MVP ✅ DONE (iters 1–3)
- `plugins/ruflo-metaharness/` with 6 skills (one more than ADR-150
  originally proposed — `harness-oia-audit` was lifted forward from
  Phase 2 in iter 7): `harness-score`, `harness-genome`,
  `harness-mcp-scan`, `harness-threat-model`, `harness-oia-audit`,
  `harness-mint`.
- Shared `scripts/_harness.mjs` bridge — single subprocess
  invocation point, 60s hard timeout, JSON-mode default, graceful
  degradation via `emitDegradedJsonAndExit`.
- `npx ruflo metaharness <subcommand>` top-level dispatcher in
  `v3/@claude-flow/cli/src/commands/metaharness.ts` (iter 3).
- `metaharness@~0.1.11` and `@metaharness/router@~0.3.2` in
  optionalDependencies of BOTH `@claude-flow/cli/package.json` and
  `ruflo/package.json` (iter 3). Tilde pin, not caret — per
  review-round-1 (upstream had 5 releases in 2.7h).
- CI workflows (iter 2):
  - `metaharness-ci.yml` — score, mcp-scan, router-compat jobs
  - `no-metaharness-smoke.yml` — enforces architectural constraint rule
    #4 by greping every package.json for non-optional metaharness deps
    AND drilling each skill with an unresolvable npm registry
  - `scripts/check-metaharness-compat.mjs` — API-stability tripwire,
    9/9 against current @metaharness/router@0.3.2

### Phase 2 — Expansion (3 of 4 shipped)
- ✅ `npx ruflo eject` (iters 4–5) — Phase-2 differentiator wrapping
  `metaharness --from-existing`. Dry-run default; refuses in-repo
  target + existing-target overwrites. CI dry-run job in
  metaharness-ci.yml validates BOTH the plan output AND the safety
  refusal.
- ✅ `'harness'` PluginType in plugin registry (iter 6) — schema
  extension only, zero runtime overhead. `npx ruflo plugins list
  --type harness` filter works by construction.
- ✅ `harness-oia-audit` composite worker (iter 7–8) — bundles
  oia-manifest + threat-model + mcp-scan into one timestamped record;
  persistence to `metaharness-audit` memory namespace; weekly cron
  workflow `.github/workflows/oia-audit-weekly.yml` at Sundays 04:17 UTC.
- ✅ `SelfEvolvingRouter` parallel-logging — BOTH HALVES LANDED:
  - **Analyzer** (iter 10):
  `plugins/ruflo-metaharness/scripts/router-parallel-analyze.mjs` reads
  paired routing decisions from a JSONL trajectory file and computes
  the 3-criteria AND-gate from review-round-1. Verified end-to-end with
  synthetic fixtures (✓ PROMOTABLE / ⚠ NOT promotable paths both work,
  insufficient-data path exits cleanly at n<30). `@metaharness/kernel`
  added to `optionalDependencies` of `@claude-flow/cli` AND
  `ruflo/package.json` so the future Recording side can dynamic-import
  `SelfEvolvingRouter` without a static dep.
  - **Recorder primitive** (iter 11):
    `v3/@claude-flow/cli/src/ruvector/router-parallel-recorder.ts`
    exports `recordPair(task, bandit, ser)` + `recordPairOutcome(task,
    outcome)` + `parallelRecorderStatus()`. Env-gated via
    `CLAUDE_FLOW_ROUTER_PARALLEL_LOG=1` — no-op when unset (default).
    Every `appendFileSync` wrapped in try/catch with debug-only stderr
    logging; ADR-150 rule #3 satisfied (never throws from the routing
    path). 10MB rotation. Default output path
    `.swarm/router-parallel.jsonl` matches the iter-10 analyzer's
    default `--input`.

  - **Dispatch wiring** (iter 12 — LAST MILE):
    The one-line edit in `model-router.ts` route() shipped in iter 12.
    Fire-and-forget `recordPair({task, bandit, ser})` inside the
    existing `if (abEnabled)` block — same place the A/B disagreement
    counter already lives. Env-gated by
    `CLAUDE_FLOW_ROUTER_PARALLEL_LOG === '1'`; no-op when unset, which
    means ZERO overhead on the default routing path. The dynamic-import
    is lazy (one Promise per process); the recordPair call is wrapped
    in try/catch with `.catch(() => {})` on the import promise — the
    routing path NEVER throws, even when the optional kernel is
    completely absent.

    Both arms are attributed at the call site:
      bandit.backend = 'thompson-bandit'
      ser.backend    = neuralPrior ? 'metaharness-router-hybrid' : 'bandit-only'

    The pipeline is now end-to-end:
      route() → recordPair() → .swarm/router-parallel.jsonl
                              → router-parallel-analyze.mjs
                              → 3-criteria AND-gate verdict

### Phase-1 item #3 — Real seed corpus retraining 🔄 PENDING
Requires production trajectory data. The pipeline is wired:
`CLAUDE_FLOW_ROUTER_TRAJECTORY=1` writes JSONL;
`scripts/train-bundled-krr.mjs` rebuilds the artifact. The blocker is
data collection — needs a 50+ decision production sample. Plan: enable
the recorder on the next merged-to-main release; collect a week of
real routing data; retrain in a follow-up PR.

### Fleet status (post-iter-8)
- 33 plugins in `scripts/smoke-all-plugins.mjs` (was 32; +1 for
  ruflo-metaharness)
- 19 structural invariants in `plugins/ruflo-metaharness/scripts/smoke.sh`
- Three fleet audits green (exit-bypass / SKILL.md frontmatter /
  plugin.json manifest)
- 117 SKILL.md files across 34 plugins (was 117/32 — adding
  6 new SKILL.md files from this plugin pushed the count)

### Quote architecture invariant — no static metaharness imports

The single non-test ruflo source file that statically imports a
`@metaharness/*` package is:

```
v3/@claude-flow/cli/src/ruvector/neural-router.ts  ← @metaharness/router
                                                     (dynamic import,
                                                      triple-gated)
```

All other ruflo code reaches MetaHarness exclusively through the
`_harness.mjs` subprocess bridge. The `no-metaharness-smoke.yml`
workflow continually enforces this with both a static grep (every
package.json) and a runtime drill (each skill against an unresolvable
npm registry, asserting graceful degradation).

## References

- [Research dossier (gist)](https://gist.github.com/ruvnet/19d166ff9acf368c9da4172d91ac9113) — full graded-evidence sourcing.
- [Tracking issue #2399](https://github.com/ruvnet/ruflo/issues/2399) — phase checklist.
- ADR-148 — Cost-optimal router lifecycle via `@metaharness/router`.
- ADR-149 — Per-model cost-optimal routing (Pareto framing).
- ADR-097 — Federation budget circuit breaker (cost-spend telemetry pattern reused by metaharness plugin).
- `metaharness@0.1.11` on npm: <https://www.npmjs.com/package/metaharness>
- `@metaharness/router@0.3.2` on npm: <https://www.npmjs.com/package/@metaharness/router>
- `@metaharness/kernel@0.1.0` on npm: <https://www.npmjs.com/package/@metaharness/kernel>
- Upstream: <https://github.com/ruvnet/agent-harness-generator>
