# Conquest / space redesign — 2026-09-18

Historical pre-expansion report. Current rules and evidence are in [Three eras](THREE_ERAS.md). These preserved measurements were locally verified, **not strategically certified and not deployed**.

## Rules in simple terms

- Win by being the only civilization with cities, or by completing a space launch.
  Taking the last city eliminates its owner and every remaining unit/foundation.
  Cities transfer ownership; there is no separate razing action.
- Space is the final technology. Research all three complete military branches
  and nuclear launchers before the orbital engineer. Researching alone is not a
  win: pay for a launch and protect an engineer in a production-three city for
  360 supported seconds. Interrupted support drains progress.
- No money victory, influence victory, partial-capital hold or score timeout.
- Stationary units automatically defend and repeat ordinary fire. Attack selects
  a preferred target; Move/Stop replaces it. They do not chase targets, shoot while
  travelling, or bypass recovery when orders are repeated. Artillery avoids
  automatic shots that would splash allies.
- Guards obstruct crossing between their adjacent ground hexes. Enemies can
  approach, withdraw, defeat the guard or go around. Aircraft and ships ignore
  the restriction. Routes use visible guards; hidden guards can stop a route.
- No refit button or unit conversion. Research unlocks new recruits in cities.
  Existing troops retain their type. Recruitment and disbanding remain.

This gives screens, firing lanes, siege dead zones and cavalry displacement more
importance using the existing units. It does not establish chess-like depth.
Bots now approach occupied cities through reachable firing positions, find
reachable settlement sites, prioritize visible launch threats, save for research
instead of spending every saving on replacement troops, and avoid unconditional
low-health movement that caused repeated route changes. Bots do not refit.

The in-game manual, research graph, lobby objectives and roster match these rules.
Previous rooms retain their immutable release. Local server verification captured
a new release through the normal preparation tooling; no publication occurred.

## Final bounded audits

Both runs used 120 seconds, budgets 8/32 and horizon 120. Build took 7–8 seconds
separately. They share source fingerprint
`8d71882e61b88664df0fa3104e257445e0a39ce800afc24a11d4a97db621c04b`.

| Measurement | Seed 42000 | Holdout seed 43000 |
|---|---:|---:|
| Overall verdict | FAIL | FAIL |
| Counted completed matches | 218 | 200 |
| Space / elimination victories | 172 / 46 | 164 / 36 |
| Unresolved at 2,200 simulated seconds | 44 / 292 (15.1%) | 52 / 288 (18.1%) |
| Idle win rate in counted comparisons | 0% | 0% |
| Higher-compute win rate | 33.3%, 3 seed pairs | 50%, 4 seed pairs |
| Same policy, frequent vs restrained orders: frequent wins | 66.7%, 15 pairs | 73.3%, 15 pairs |
| Same thinking, blind repeats vs none: repeat wins | 44.4%, 18 pairs | 53.1%, 16 pairs |
| Consequential sampled positions | 1 / 5 | 1 / 3 |
| Delayed ranking reversals | 0 | 1 |
| Covered active-policy matchups | 27 / 28 | 24 / 28 |

Both pass the idle and multiplayer gates, fail completion and decision
consequences, and remain inconclusive on thinking, diversity and input restraint.
Compute and input samples have broad confidence intervals: their percentages are
descriptions, not reliable skill estimates. Unresolved matches and interrupted
batches are not turned into draws or wins. Denominators differ because completed
seed pairs and complete batches are required for standings.

**Remaining collapse:** most victories are space races, conquest is uncommon,
and some bot matchups stall. The same-policy input test still suggests frequent
meaningful orders help; automatic firing only removes the need to keep clicking
Attack. Blind repetition does not show a consistent advantage. More search has
not demonstrated better full-game play. The portfolio shares a limited tactical
controller, so these failures do not isolate game rules from AI weaknesses.

The first redesign iteration had 67/272 capped experiments. Later iterations
reduced that observed fraction, but different completed coverage and machine load
mean this is not a controlled estimate of improvement. No thresholds were relaxed.
Schema 3 replaces obsolete influence evaluation/probes with launch progress and
adds a completion gate. Comparisons with the historical schema-2 report are
therefore descriptive, not controlled experiments.

Machine-readable evidence: [baseline](strategy-redesign-baseline.json) and
[holdout](strategy-redesign-holdout.json). Full reports, JSONL and replayable
positions are locally in `artifacts/design-audit/redesign-final` and
`artifacts/design-audit/redesign-holdout`. Reproduce with:

```sh
npm run analyze:design -- --seconds 120 --seed 42000 --check
npm run analyze:design -- --seconds 120 --seed 43000 --check
```

## Verification and next design work

47 native rules tests and four native audit tests passed. Targeted WASM/client
tests cover victory rules, full-tree launch requirements, guard-route agreement,
command commitment, transport and manual coverage. All six live network tests
passed after updating the harness to use release-scoped URLs like the browser;
the initial unversioned socket attempts correctly received a reload instruction.
Browser inspection verified the five-row tree, permanent unit types, city-count
roster, revised manual and a real local server match.

Do not label this game deep or low-APM based on this pass. Before adding more
units, inspect stalled replays and the shared controller's siege, launch defence
and transport decisions. Test whether a small number of persistent group orders
can reduce the meaningful-order advantage without hiding it by weakening the
audit. Add decision sampling near contested cities and launch threats as an
explicitly versioned audit experiment, then rerun both baseline and candidate.
The current early-game policy probes may miss those decisions. Keep the current
unfavourable results and distinguish AI improvements from rule improvements.
