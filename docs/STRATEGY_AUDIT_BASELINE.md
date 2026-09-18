# Meridian Strategy Audit: FAIL

Operational tests of this policy portfolio, sampled maps, horizons and input rates; not a proof of strategic depth or distinct human metas.

Analysis budget: 120s. Measured analysis: 120.01s. Build: 7.83s.
Source fingerprint: `f9151a7fa4d3340c2350a8ff2c49009d2e2b05aa026c86ea8a6c82f8140d57ba`. Seed: 42000.

| Gate | Result |
|---|---|
| thinking | INCONCLUSIVE |
| policy diversity | FAIL |
| decision consequences | FAIL |
| multiplayer | PASS |
| active beats idle | FAIL |
| input restraint | INCONCLUSIVE |

## Thinking advantage

Same evaluator, policy portfolio, information and two-second order opportunities. Search chooses a three-policy plan, executes it over the fixed horizon, then replans. Each sample includes both seat assignments on one seed. Entire unfinished parallel batches are excluded to avoid selecting only fast-finishing games. The conservative 95% interval treats each seed pair as one sample.

| Higher vs lower compute | Complete seed pairs | Higher win rate | 95% interval | Verdict |
|---|---:|---:|---|---|
| mcts-32 vs mcts-8 | 4 | 37.5% | 0.0% – 100.0% | INCONCLUSIVE |

## Input frequency and spam penalty

The engine permits at most one normal order every 2 seconds (30 opportunities/minute). The restrained controller gets one every 8 seconds (7.5/minute). Actual successful orders/minute are measured below; these are not mouse clicks. Search rollouts respect the experimental order intervals. Repeated-command bots think every 8 seconds and blindly retry their last successful command at intervening 2-second opportunities.

| Test (fast side first) | Seed pairs | Fast win rate | 95% interval | Excess over 50% | Actual APM, fast / slow | Verdict |
|---|---:|---:|---|---:|---|---|
| Same policy: 2s vs 8s | 32 | 64.1% | 40.1% – 88.1% | 14.1 pp | 12.8 / 5.7 | INCONCLUSIVE |
| Same 8s thinking + repeated commands vs no repeats | 32 | 53.1% | 29.1% – 77.1% | 3.1 pp | 12.2 / 5.7 | INCONCLUSIVE |
| Fast/shallow 8@2s vs slow/deeper 32@8s | 4 | 75.0% | 7.1% – 100.0% | 25.0 pp | 17.1 / 6.8 | INCONCLUSIVE |

The descriptive penalty is excess fast-side wins above 50%, not an artificial change to match results. The same-policy/repeat gate allows at most 65% fast-side wins; the fast/shallow versus slow/deeper gate allows at most 50%. A confidence interval crossing the threshold remains INCONCLUSIVE. Passing also requires all eight policies represented in each same-policy test. No rate-limiting game rules were changed.

## Tested strategy portfolio

28/28 active matchups covered. Rates weight each tested opponent equally; idle is excluded. Shared tactical code means different policy names are not proof of different metas.

| Policy | Opponents | Seed pairs | Mean win rate | Worst matchup | Winning routes |
|---|---:|---:|---:|---:|---|
| space | 7/7 | 14 | 89.3% | 50.0% | {"space":18,"territory":7} |
| archers | 7/7 | 14 | 53.6% | 50.0% | {"capital_hold":3,"elimination":3,"territory":9} |
| adaptive | 7/7 | 14 | 46.4% | 25.0% | {"elimination":2,"space":3,"capital_hold":2,"territory":6} |
| artillery | 7/7 | 14 | 46.4% | 0.0% | {"territory":11,"capital_hold":2} |
| expansion | 7/7 | 14 | 46.4% | 0.0% | {"territory":13} |
| guards | 7/7 | 14 | 39.3% | 0.0% | {"territory":11} |
| cavalry | 7/7 | 14 | 39.3% | 0.0% | {"territory":10,"elimination":1} |
| naval | 7/7 | 14 | 39.3% | 0.0% | {"territory":11} |

### Matchup matrix

| Policy | adaptive | guards | cavalry | archers | artillery | naval | space | expansion |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| adaptive | — | 75.0% | 75.0% | 25.0% | 25.0% | 75.0% | 25.0% | 25.0% |
| guards | 25.0% | — | 50.0% | 50.0% | 50.0% | 50.0% | 0.0% | 50.0% |
| cavalry | 25.0% | 50.0% | — | 50.0% | 50.0% | 50.0% | 0.0% | 50.0% |
| archers | 75.0% | 50.0% | 50.0% | — | 50.0% | 50.0% | 50.0% | 50.0% |
| artillery | 75.0% | 50.0% | 50.0% | 50.0% | — | 50.0% | 0.0% | 50.0% |
| naval | 25.0% | 50.0% | 50.0% | 50.0% | 50.0% | — | 0.0% | 50.0% |
| space | 75.0% | 100.0% | 100.0% | 50.0% | 100.0% | 100.0% | — | 100.0% |
| expansion | 75.0% | 50.0% | 50.0% | 50.0% | 50.0% | 50.0% | 0.0% | — |

## Decision consequences

6 complete sampled positions; 1 consequential choices; 0 delayed ranking reversals.
Values below are heuristic scores, not win probabilities. Counterfactuals use referee state; it is never supplied to the choosing bot. Each branch uses the same opponent continuation, commits the choice for one search interval, then continues adaptively for 240 seconds.

| Position | Immediate best → later best | Later value spread | Delayed gain | Real state consequence | More compute replay gain |
|---|---|---:|---:|---|---:|
| position-0.json (42000:700) | archers → guards | 0.016 | 0.006 | false | 0.002 |
| position-1.json (42000:700) | adaptive → adaptive | 0.044 | 0.000 | true | 0.000 |
| position-2.json (42000:700) | cavalry → cavalry | 0.021 | 0.000 | false | 0.000 |
| position-3.json (42000:700) | adaptive → adaptive | 0.000 | 0.000 | false | 0.000 |
| position-4.json (42000:700) | cavalry → adaptive | 0.008 | 0.008 | false | 0.000 |
| position-5.json (42000:700) | expansion → naval | 0.026 | 0.017 | true | 0.002 |

## Outcomes and collapse warnings

Counted 306 completed matches; excluded 24 incomplete pairs.
Victory routes: {"elimination":24,"territory":208,"capital_hold":23,"space":51}. Average captures: 0.24.
Eight-player games: 18; full rotations: 2. Wins: {"adaptive":1,"guards":3,"cavalry":0,"archers":5,"artillery":1,"naval":1,"space":6,"expansion":1}.
Idle control: 37.5% win rate across 16 seed pairs.
Issued training orders by unit kind: {"0":2727,"1":368,"2":862,"4":188,"7":182,"8":2,"10":104,"13":1428}. Rejected real-world orders: 27302 (including deliberate repeated-command attempts).

- Same policy: 2s vs 8s: fast/repeated-input side wins 64.1%; input penalty 14.1 percentage points above 50%. Evidence is not yet decisive; see the interval.
- Same 8s thinking + repeated commands vs no repeats: fast/repeated-input side wins 53.1%; input penalty 3.1 percentage points above 50%. Evidence is not yet decisive; see the interval.
- Fast/shallow 8@2s vs slow/deeper 32@8s: fast/repeated-input side wins 75.0%; input penalty 25.0 percentage points above 50%. Evidence is not yet decisive; see the interval.
- The tested meta concentrates on space: 89.3% mean win rate with no losing sampled matchup. This diagnoses this policy portfolio, not all possible human strategies.
- Fewer than one city capture per completed match on average: conquest is uncommon in this portfolio.
- No tested position demonstrates a delayed ranking reversal with a tangible consequence. Long-term depth is not established.
- A reliable advantage from additional thinking has not been established at every tested budget step. Inspect sample size, search horizon, evaluator and action coverage before blaming the rules.
- Idle control won 37.5% of its matched games; investigate passive victory or weak opponents.

## Interpretation and agent instructions

- PASS means the explicit experimental gates passed, not that the game is solved or universally deep.
- FAIL means this bounded suite observed a failed criterion. Do not automatically change balance: reproduce the problematic matchup or position and inspect the planner first.
- INCONCLUSIVE means at least one required claim lacks evidence. Never translate it into PASS, and do not mistake unfinished games for draws.
- Search is open-loop UCT over eight existing scripted policies. It cannot discover actions those policies never propose. Tactical control, transport, scouting and hidden-state priors remain limited.
- No neural-network training, belief memory, equilibrium solver, mechanical rule ablations or exhaustive human-meta coverage is included.
- Snapshot selection is the first six eligible non-idle match positions at tick 700, not an unbiased sample of all decisions. Budget and horizon probes are diagnostics, not full-game horizon win-rate evidence.
- Before accepting a game change, keep seeds, budgets, horizon and this tool fixed; compare baseline/candidate reports. Repeat with fresh seeds before accepting a claimed improvement.
- Raw evidence is in events.jsonl, machine-readable findings in summary.json, and replayable generated states in position-*.json. See docs/DESIGN_AUDIT.md for thresholds and extension points.
