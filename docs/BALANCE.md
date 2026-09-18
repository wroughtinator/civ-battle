# Rules v4 balance evidence — 2026-09-17

These measurements apply to the discrete-piece redesign, explicit one-shot attacks, committed abilities, settlers, one treasury and presence takeover. Earlier population-transfer reports describe different games and cannot substantiate this release. This audit is evidence of specific behavior, not proof of chess-level complexity, equal strategy strength, or universal superiority of a deeper planner.

## Final complete-match sample

Every match uses eight players, identical starting resources and the same two-second order opportunities. The current planner receives a fog-filtered world. Native results are saved without selecting only favorable matches:

| Experiment | Matches | Median duration | Range | Within 20–25 minutes |
|---|---:|---:|---:|---:|
| Eight hard planners, seeds 101000–101007 | 8 | 21:52 | 17:24–26:32 | 5/8 |
| One hard planner against fixed preferences, seeds 102000–102007 | 8 | 22:52 | 18:08–27:20 | 3/8 |
| One hard, one easy and six medium planners, seeds 103000–103007 | 8 | 22:48 | 19:16–27:20 | 5/8 |

Across all **24 matches**, median duration was **22:34**, range **17:24–27:20**. **13/24** were inside the target window. All ended through objectives, with **23 territorial wins and one space win**. The matches contained **50 physical city captures** in total. None ended through the four-capital continuous-hold condition. The target is therefore a typical duration, not a promise that every match lasts 20–25 minutes.

In the mixed experiment, the adaptive planner won **1/8**. Guard and cavalry preferences each won twice, archers once, and the space preference twice (one territorial and one launch victory). The fixed policies are deliberately narrow composition preferences, not competent representatives of every possible human strategy. Several policies occur more than once per game, so their raw shares are not an equal-entry tournament.

In the difficulty experiment, hard won **2/8**, easy **1/8**, and the six medium seats together **5/8**. These are small, correlated samples with unequal numbers of entrants per difficulty. They do **not** establish that deeper planning always wins or that no cheap dominant strategy exists. Better counterplay and human adversarial testing remain necessary.

The compiled browser/Worker WASM also completed seed 93001 at **20:52**, with eleven cities and a territorial winner. Its regression checks finite victory, nonnegative treasuries and unique cell occupancy. That separate check is not included in the 24-match statistics.

Reproduce the native samples with:

```sh
cargo run --release --example pieces_audit -- 8 101000
cargo run --release --example pieces_audit -- 8 102000 mixed
cargo run --release --example pieces_audit -- 8 103000 depth
```

Raw reports: [hard planners](../artifacts/redesign/current-planners.jsonl), [fixed preferences](../artifacts/redesign/current-mixed.jsonl), [difficulty comparison](../artifacts/redesign/current-depth.jsonl).

## Failures found during development

Earlier explicit-action diagnostics (`action-*.jsonl` in the same artifact directory) produced zero hard-planner wins in both eight-match comparisons. Inspection exposed investment starvation: repeated tactical orders postponed research and safe production upgrades despite large treasuries. The controller now reserves occasional decisions for development, avoids redundant movement orders, values observed clustering when buying counters, and treats alternative enemy replies as alternatives instead of simultaneous extra attacks. A focused regression preserves development during a standing battle.

The final maps differ from the diagnostic maps. The changed win counts must not be presented as a controlled causal estimate. The final results still show a meaningful weakness against narrow strategies; this remains documented rather than hidden behind favorable self-play.

## Verified rules and interface

Twenty-two current native regressions cover occupancy, weighted rerouting, physical captures, vulnerable settlement, shared currency and unlocks, counters and artillery dead zones, explicit attacks, action locks, queued movement, splash and friendly fire, disband refunds, refits, submarine concealment, hidden intentions, missile warnings, disrupted launch programs, discovery secrecy and memory, encounter distribution, planner information boundaries and finite objectives.

Eleven Node checks cover current WASM execution, independent discovery entropy, client/server route agreement, preserved v1–v3 engines, eight-seat admission, private views, ownership, command replay, Unicode names, reconnect and away/return/heartbeat control handoff. All five live network checks also passed against the deployed production Worker. Local browser checks exercised the connected research tree, mobile layouts, explicit range selection, route confirmation, submerging, action locks and confirmed disbanding. The all-units visual fixture deliberately exceeds normal unit capacity; it is a presentation test, not a match result or balance sample.

## Finite ending and remaining limits

Original capitals always retain an owner and cannot be destroyed. Every four seconds they bank eight total influence points, which never reset. Eight players can hold at most 539 each before a winner: 4,312 total. At 2,160 simulated seconds, 4,320 points force a winner by the pigeonhole principle, even with adversarial ownership cycling. Founded cities, sustained conquest and supported launches can end games earlier. This is an accumulating objective, not a score awarded at a timeout.

There is no human competitive sample, independent security audit, coalition analysis, physical-mobile GPU benchmark or public-scale load test. The planner uses bounded exchange forecasts and strategic heuristics, not full-game minimax. The two-second command limit and unit commitments constrain input throughput; they do not prove that faster input has no benefit. No finite tournament proves universal intelligence dominance in a fogged eight-player game.
