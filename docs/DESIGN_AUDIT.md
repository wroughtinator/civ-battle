# Meridian Strategy Audit

Current research UI and removal of the shared order timer: [Research tree](RESEARCH_TREE.md). Historical results below retain their original rules.

Run from the repository root:

```sh
npm run analyze:design
```

The default **analysis budget is 120 wall-clock seconds**, not 20 minutes.
Compilation is separate, measured and normally cached. No npm dependencies,
server, browser, GPU, Python or training job are required; only Node and Rust.
The native `audit` build profile favors CPU throughput and does not change the
production release/WASM profile. Independent games run on up to 16 logical CPUs.
On a slower or busy machine the same deadline returns fewer samples, not a
longer analysis. The watchdog allows three seconds for deadline handling.

```sh
# Reproducible configuration; choose a NEW output folder each time.
npm run analyze:design -- --seconds 120 --seed 42000 --out artifacts/design-audit/my-baseline

# CI/agent gate: exit 0 only for PASS, 2 for FAIL or INCONCLUSIVE, 1 for execution errors.
npm run analyze:design -- --seconds 120 --seed 42000 --check

# A different compute ladder, still within the same total runtime.
npm run analyze:design -- --seconds 120 --budgets 8,32,128 --horizon 120
```

Budgets are simulations **per planning decision**, not difficulty levels.
More ladder entries divide the same runtime among more comparisons. `--horizon`
is simulated seconds, must be a multiple of six, and defaults to 120.
`--no-build` is available for debugging but deliberately cannot issue a PASS:
the tool cannot establish whether the existing binary matches current source.

## Output and interpretation

Every run writes a new directory under `artifacts/design-audit/`:

- `report.md`: readable verdict, matchup matrix, compute results and warnings.
- `summary.json`: schema-versioned gates, measurements and source fingerprint.
- `events.jsonl`: flushed raw match, search-probe and configuration evidence.
- `position-*.json`: generated game states for reproducing inspected positions.

Artifacts are ignored by Git. Preserve a small baseline summary in `docs/` when
accepting a deliberate design change. Never edit immutable archived releases.

The initial two-minute run is preserved in [the baseline report](STRATEGY_AUDIT_BASELINE.md)
and [its machine-readable summary](strategy-audit-baseline.json). Reproduce its
configuration with `--seconds 120 --seed 42000 --budgets 8,32 --horizon 120`.
Its raw events and position files remain in the original local artifacts folder;
rerun the command to generate raw evidence in a fresh checkout.

Current three-era rules and the preserved before/after/holdout evidence are in
[Three eras](THREE_ERAS.md). Both this full-game suite and
`npm run analyze:planning` still use 120-second analysis budgets. The focused
planning result supplements this report and cannot override its verdict.
[The earlier redesign report](STRATEGY_REDESIGN.md),
[strategy-planning-after.json](strategy-planning-after.json), and the initial
baseline are historical snapshots, not measurements of the 33-unit research tree.

**PASS is an operational certificate for the listed tests, not a mathematical
proof of strategic depth, a solved game, or proof of several human metas.**
FAIL means an explicit criterion failed in the tested portfolio; it does not
identify whether the rules or the controller are responsible. INCONCLUSIVE
means required evidence is missing or uncertain. Neither is permission to
claim the game is certified. A two-minute run can legitimately be inconclusive.

An idle policy is included deliberately. If doing nothing wins frequently,
that is a concrete warning about passive objectives, map access or weaknesses
in the active policies, not something to hide from the report.

## What actually runs

1. **20%: strategy tournament.** Seat-swapped two-player games in round-robin
   fixture order. Eight active policies: adaptive, guards, cavalry, archers,
   artillery, naval, space and an expansion-first stress policy. Idle is the
   ninth, negative-control policy. Repeated rounds use new map/discovery seeds.
2. **50%: compute and input/thinking comparisons.** Half the fixtures compare
   adjacent search budgets with identical two-second order opportunities. The
   other half compare low-budget search ordering every two seconds against
   high-budget search ordering every eight seconds. Both use full, seat-swapped
   games on matched seeds. Rules, information, evaluator, strategies and planning
   intervals are unchanged. Rollouts respect both players' experimental intervals.
3. **10%: consequence probes.** The first six eligible non-idle match positions
   at tick 700 are saved. All eight policies are tried for one policy interval,
   then the player switches to adaptive for 240 seconds. Opponents respond using
   adaptive, guards and expansion continuations. The same position also receives
   short/long-horizon searches at each compute budget.
4. **10%: input-frequency and repeated-command tests.** All eight active policies
   face themselves at two-second versus eight-second decision intervals. Another
   comparison gives both players eight-second decisions, but lets one blindly
   repeat its last successful command at intervening two-second opportunities.
   Every pair is seat-swapped, with a separate seed for each policy/pair. The two
   input tests share those seeds but are reported separately, never pooled.
5. **Remaining time: eight-player sanity tournament.** Every active policy is
   present once; assignments rotate across all eight seats. Only full rotations
   count toward the multiplayer gate. Completed games from partial rotations
   remain explicitly descriptive evidence.

Matches stop only at a real engine victory, the 2,200-tick diagnostic ceiling,
or their phase deadline. Unfinished games are never scored as draws or judged by
material. Entire deadline-interrupted parallel pair batches are excluded from standings;
otherwise shorter winning games could be selectively counted at the deadline.
JSONL retains these exclusions for inspection. Timing affects how many scheduled
batches finish, so compare identical seeds/configuration and completed samples,
not arbitrary raw win totals. These are screening tests, not a competitive rating.

## Search implementation and limits

`engine/examples/design_audit/search.rs` implements **open-loop portfolio UCT**:

- Each edge commits to a scripted policy for one third of the horizon.
- Each simulation traverses three policy decisions through the actual Rust
  simulator, including normal movement, attacks, production and victory rules.
- UCT balances exploring policies and revisiting promising sequences.
- Each simulation samples hidden-state assumptions and opponent policy choices.
- The selected three-policy sequence executes over one horizon before replanning.
  Controllers still attempt orders every two seconds; the engine rejects attempts during shared recovery. This fixed commitment schedule
  is shared by both budgets and reduces the cost of the audit substantially.
- Terminal victory dominates the leaf evaluator. Nonterminal evaluation uses
  cities, production, army health/cost, treasury, research and objective progress.
  Its scores are **not calibrated win probabilities**.

This is real tree search, but not full-action MCTS, a learned AlphaZero agent,
an equilibrium solver or a complete ISMCTS implementation. Strategies share the
existing tactical bot. There is no neural training, opponent memory, exhaustive
unit-order exploration, robust naval invasion planner or mechanic-ablation suite.
The current policies do include simple coastline reachability, boarding/unloading,
directional facing, support positioning and situational recruitment.
Increasing the budget cannot discover an action absent from the policy portfolio.

The root observation removes concealed units and private economy/research/orders.
The independent prior samples possible troops near unseen known cities and
estimates resources/technology from elapsed time and visible units. It does not
read the true hidden army. Unknown cities and unexplored discoveries are omitted;
uncollected known chests use a fixed coin-reward approximation. These are material
model limitations, especially for scouting and hidden expansion. Regression tests
mutate hidden armies, economy and discovery rewards and require identical search.

Counterfactual **measurement** uses the referee's actual world, so branches start
from the same true position. That world is not passed to the search choosing the
action. Rollout opponents react through observation-filtered policies. Probes
measure one committed policy interval, not the entire selected three-policy plan.

Schema 3 removes obsolete influence/capital-hold terms from evaluation and uses launch progress in consequence probes. It also adds the completion gate because passive victory no longer guarantees a finite match. These changes invalidate controlled comparisons with the schema-2 historical baseline; the thresholds of the existing gates have not been relaxed. Capped pairs remain unscored, but do not discard other resolved pairs from their batch.

## Explicit certificate gates (schema 3)

All gates must PASS. Any FAIL makes the overall verdict FAIL; otherwise missing
evidence makes it INCONCLUSIVE. Thresholds are versioned screening choices, not
natural constants or claims of human enjoyment.

| Gate | Requirement |
|---|---|
| Thinking | Every adjacent budget comparison has a conservative 95% lower bound above 50% higher-compute wins. A seed plus its two seat assignments is one bounded sample. The Hoeffding interval is mean ± sqrt(log(40)/(2*n)), clamped to [0,1]. An upper bound below 50% is FAIL; overlap is INCONCLUSIVE. |
| Policy diversity | All 28 active-policy matchups covered; at least three policies have ≥40% opponent-weighted wins; no policy has ≥80% mean wins with no losing tested matchup. Idle excluded. This is descriptive portfolio diversity, not an equilibrium result. |
| Decision consequences | At least three complete positions; at least two have a later heuristic spread ≥0.03 and a real difference in city count, terminal winner or ≥10 seconds of launch progress; at least one of those has a later-best choice outperforming the immediate-best choice by ≥0.02. Differences are checked within the same opponent continuation. |
| Multiplayer | At least one full eight-seat rotation; no policy wins more than 75% of games in complete rotations. |
| Active beats idle | At least four complete matched pairs involving idle; idle wins no more than 10% of those games. |
| Completion | At least eight resolved experiments; at most 10% reach the 2,200-second diagnostic cap without a legal victory. Runtime cutoffs are excluded from this denominator, reported separately and never scored as draws. |
| Input restraint | For same-policy frequency and repeated-command tests, all eight policies must be represented and the 95% upper bound on fast-side wins must be ≤65%. A lower bound above 65% is FAIL; an interval crossing 65% is INCONCLUSIVE. For each fast/shallow versus slow/deeper comparison the threshold is 50%, so slower, deeper thinking must overcome the input advantage. |

The input report also shows **excess fast-side wins above 50%** as a descriptive
penalty in percentage points. This does not alter real match outcomes and is not
a calibrated measure of enjoyment. The 65% screening tolerance permits some
benefit from responsiveness while rejecting a large dependence on constant
input. Changing that tolerance is a change to the certificate, not a balance fix.

The experiment attempts orders every two seconds (30 attempts/minute) or eight
seconds (7.5 attempts/minute). The current game permits one successful normal order
every six seconds (10/minute); immediate Stop is the exception. Cooldowns remain
authoritative in real games and rollouts. Actual successful orders/minute are
measured separately. These are
game orders, not mouse clicks. Repeated commands use the ordinary engine API,
including normal cooldowns/costs and rejected attempts. These tests cannot
establish that all possible spam exploits or human micro techniques are absent.

Consequence gates combine a heuristic and an actual state change, but still do
not prove a delayed *winning* advantage. Horizon-probe gains are diagnostic,
not full-match evidence that longer planning wins. Map samples, heuristic bias,
shared bot weaknesses and a short horizon can all limit conclusions.

## Instructions for future design agents

1. Run the two-minute baseline **before** editing rules. Record summary, source
   fingerprint, configuration and the specific failing matchup/position.
2. Inspect the evidence. A flat compute curve can be caused by inadequate search,
   a bad evaluator or missing actions; do not assume it proves shallow rules.
3. Add any new unit/action to the policy portfolio and observation/rollout model.
   Otherwise this suite may never exercise the feature and cannot certify it.
4. Change one design mechanism at a time. Keep the audit and thresholds fixed
   while comparing baseline and candidate, or explicitly invalidate comparison.
5. Repeat the same bounded command with the same seed/configuration. Compare
   the common completed seed pairs, objective distribution and decision probes.
   Preserve unfavorable results. Then use a fresh seed for a holdout run.
6. Treat FAIL/INCONCLUSIVE as a blocked certification, not an instruction to
   automatically add complexity. Explain whether the issue is observed collapse,
   missing coverage, uncertain compute advantage, or a known planner limitation.

Focused verification:

```sh
cargo test --profile audit --example design_audit
node --test tests/design-audit.test.mjs
```

The audit lives entirely outside production gameplay code. It does not deploy,
change unit statistics, rewrite bots in existing rooms, or modify saved releases.

## Three-era pacing and coverage diagnostics

The report lists completed two-player and eight-player mean, median, 80th-percentile
duration, share of completions within 15 minutes, and space-victory counts. The
completion gate separately retains 2,200-second stalls; the mean is never presented
as if capped games completed. Policies below 40% opponent-weighted wins, researchable
types never recruited, and a space share of at least 80% receive explicit warnings.
These descriptive warnings do not weaken or replace any gate.

The roster expansion deliberately extended native policies and legal action coverage.
Policy comparisons across that boundary mix rule and controller changes; they are not
pure causal balance estimates. Final main/holdout runs use the same frozen rules and
controllers. Consequence probes still use tick 700 and the original thresholds. In
shorter matches that can be close to the finish, so a failed late-choice probe must
remain visible even when earlier focused combat choices have demonstrable value.
