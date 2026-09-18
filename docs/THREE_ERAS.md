# Three eras expansion — 2026-09-18

Implemented in mutable source and locally verified. Not deployed. The final audit results below distinguish measured planning benefits from full strategic certification.

## What changed

Researchable units increased from **11 to 33**; the three starting types (guard, scout, settler) make **36 total unit types**. Eleven aligned branches run through three colored columns. Early units stay relevant through cost, special jobs and counters; research never converts an existing piece.

| Stone & Bronze | Industry & Sail | Modern & Space |
|---|---|---|
| Cavalry | Lancer | Tank |
| Archer | Musketeer | Commando |
| Slinger | Mortar | Rocket battery |
| Pikeman | Artillery | Nuclear launcher |
| Palisade | Bulwark | Anti-air |
| Herbalist | Field medic | Shield truck |
| Battering ram | Balloon | Drone |
| Canoe | Transport | Carrier |
| Outrigger | Frigate | Submarine |
| Fireboat | Ironclad | Radar truck |
| Supply cart | Chain boom | Orbital engineer |

Orbital engineer is the exception to the row arrows: it requires **all 32 other technologies**, including the nuclear launcher. The source of unit statistics, roles, icons, models and prerequisites is `data/units.json`.

## Added roles

| Unit | Job |
|---|---|
| Slinger | Cheap, fast volleys; vulnerable to mounted charges. |
| Pikeman | Long spears stop cavalry and pierce armour. |
| Palisade | Face the threat: strong front, exposed rear; blocks enemy crossings. |
| Herbalist | Automatically heals adjacent living ground troops after combat. |
| Battering ram | Breaks shields and walls; resistant to ordinary arrows. |
| Canoe | Fast boat with one passenger berth. |
| Outrigger | Ranged skirmisher that hunts light boats. |
| Fireboat | Explodes on its first hit; keep friendly ships apart. |
| Supply cart | Automatically repairs adjacent machines and ships after combat. |
| Musketeer | Slow powerful shots pierce armour; protect the firing line. |
| Lancer | Fast flanker that hunts exposed ranged troops. |
| Mortar | Lobs shells over mountains; minimum range and friendly splash. |
| Bulwark | Heavy directional wall; turn its strong front toward the threat. |
| Field medic | Heals adjacent ground troops sooner and faster than a herbalist. |
| Balloon | Flying lookout; reveals nearby concealed units automatically. |
| Ironclad | Armoured close-range ship; vulnerable to torpedoes and fireboats. |
| Chain boom | Directional floating barrier; blocks hostile ships across its front. |
| Transport | Four passenger berths; needs an escort. |
| Anti-air | Long-range anti-air; weak against ground armies. |
| Radar truck | Wide sight and automatic detection of concealed enemies. |
| Shield truck | Faces a threat and protects nearby allies against attacks from that direction. |
| Rocket battery | Very long range and splash; slow setup and exposed up close. |

The starting guard now carries a wooden/stone club, and the frigate uses sails. All 22 new types have distinct original low-poly models and idle, movement and action clips baked with the existing Rust Asset Forge. The 77-model catalog passed 79 rendered checks, including both strategic missile flights; all 36 units reached all three poses and no WebGL errors occurred. See [the asset evidence](era-asset-audit.json), [palisade](era-palisade.jpg), [fireboat](era-fireboat.jpg) and [rocket battery](era-rocket-battery.jpg).

## A few simple, persistent decisions

- A directional wall protects its front and blocks enemy crossings there. Allies pass through; enemies can flank or use siege. Rotate it with one arrow action. The model and blue ground marks show its facing.
- Put healers beside troops, repair carts beside machines, radar near hidden threats and shield trucks beside a formation. Their jobs run automatically. Healing and shield effects do not multiply by stacking identical support.
- Fast cheap boats scout and transport; fireboats trade themselves for an explosion, ironclads fight at close range, frigates fire from farther away, and submarines hunt large ships. Ships need ground troops to occupy cities.
- Automatic attacks and long movement routes continue between orders. The shared normal order interval is **six seconds**, with Stop still available immediately. Selecting a research goal queues its prerequisites and pays for them as funds arrive. Its button shows the total unpaid cost.
- Icons show counters, range, setup, transport berths, splash danger and utility effects. A selected unit repeats its role diagram. The searchable manual explains every symbol. Research has three colored era columns; recruitment uses a scrollable icon grid. The [390px layout review](era-phone.jpg) is a desktop browser rendering, not a physical-phone performance test.

## Faster development, with a contested finish

Ordinary research costs 18/32/48 coins and takes 8/12/16 seconds by era; orbital research costs 80 and takes 24 seconds. Cities earn 8/12/16 coins per five seconds by production level, plus farms. Recruitment times are about 30% shorter, and founding takes 25 seconds. A completed-tree launch costs 180 and needs **180 supported seconds** in a production-three city. The engineer is vulnerable throughout.

Only complete spaceflight or elimination of every rival civilization wins. Capturing the last city eliminates that civilization. No coin victory, passive score victory, forced timer ending or refitting was added.

## Verification results

Each final run used **120 seconds of analysis**, plus cached compilation. The main and holdout runs use the same frozen engine and controllers. The baseline is preserved, including its failures. Policy coverage and the combat scenario pool expanded with the roster, so before/after numbers are not a pure causal estimate of rule changes.

### Planning helps in the controlled tests

| Experiment | Main seed 51000 | Holdout seed 61000 | Result |
|---|---:|---:|---|
| Combat: 32 versus 4 candidates | 66.3% (228 pairs) | 65.2% (227 pairs) | PASS both |
| Combat: 32-second versus 8-second foresight | 64.6% (228 pairs) | 64.4% (227 pairs) | PASS both |
| Combat: slower/deeper versus faster/shallow orders | 74.7% (228 pairs) | 72.4% (227 pairs) | PASS both |
| Peaceful space: 32 versus 4 development schedules | 88.4% (782 maps) | 87.7% (775 maps) | PASS both |

Combat percentages are **remaining-army advantage scores**, counting equality as half, after a bounded skirmish. They are not full-game win rates; many armies survived the time limit. All four conservative confidence bounds exceed 50% on both seed families. Space planning saved **13.4 / 12.9 seconds** on average, with both planners launching successfully on every counted map. That is a modest schedule-optimization benefit with a perfect peaceful model, not evidence of defending a launch against an active enemy.

### Pacing is close to the target; full strategic certification has not passed

| Full-game measurement | Main seed 42000 | Holdout seed 43000 |
|---|---:|---:|
| Overall verdict | **INCONCLUSIVE** | **FAIL** |
| Completed two-player games | 556 | 470 |
| Mean two-player duration | 14.6 min | 13.9 min |
| Two-player completions within 15 min | 66.0% | 71.3% |
| Completed eight-player games | 208 | 208 |
| Mean eight-player duration | 13.2 min | 13.2 min |
| Eight-player completions within 15 min | 93.8% | 92.3% |
| Diagnostic stalls across resolved experiments | 135/2368 (5.7%) | 180/2215 (8.1%) |
| Higher-compute full-game win rate | 64.6% (24 pairs) | 43.8% (32 pairs) |
| Faster input, same policy | 53.7%, PASS | 51.0%, PASS |
| Blind repeated commands | 25.6%, PASS | 26.0%, PASS |
| Faster/shallow versus slower/deeper | 47.7%, INCONCLUSIVE | 56.5%, INCONCLUSIVE |
| Space share of counted victories | 92.2% | 92.9% |

Duration averages exclude stalled games and runtime interruptions; neither is counted as a draw. The completion gate passes its existing 10% stall ceiling, improved descriptively from the baseline's 24.2%, but stalls still exist. Idle wins **0%** on both final runs. The full-game compute intervals are wide and disagree across seeds, so a reliable full-game thinking advantage remains unverified. The same-policy and blind-repeat tests pass their existing input-restraint thresholds; that does not certify every possible human micro technique.

The main consequence gate passed; the holdout failed because only **one of six** saved positions produced the required consequential choice, rather than two. Five positions led to the same terminal outcome across the measured branches. These are late positions at 11:40 on one sampled map, which limits the inference, but the failure remains a failure. The audit's sampling, evaluator and thresholds were not changed to erase it.

The most concrete remaining collapse is **military play tending to feed a space race**: every counted eight-player completion ended in space, and completed games averaged fewer than one city capture. All eight policies reached at least 40% opponent-weighted wins in the main run; cavalry fell to 38.8% in the holdout. The existing diversity gate passes, but this is not evidence that every style is competitive. Every researchable type was recruited in the main run; submarines were absent from the holdout, and several late types remain sparsely sampled. Recruitment is coverage, not mastery.

For the next design iteration, reproduce the holdout's late positions and inspect attack/transport behavior and contested launches before adding more units. Preserve the distinction between an actual weak rule and an action the portfolio fails to discover. Human playtesting is still needed for readability, enjoyment and composition diversity.

Evidence: [design before](era-design-before.json), [design after](era-design-after.json), [design holdout](era-design-holdout.json), [planning before](era-planning-before.json), [planning after](era-planning-after.json), [planning holdout](era-planning-holdout.json), and [iteration history](era-audit-history.json). Raw events and saved positions remain in the corresponding local `artifacts/` folders. The two tools hash different audit source files, so their fingerprints differ; each tool's main/holdout fingerprints match.

Implementation checks passed: **60 current-rules Rust tests**, **nine native audit tests**, and **107 JavaScript tests**, including current WASM, live local room commands/privacy, controls, archived-release compatibility and graphics. After the final material/animation polish, all 45 graphics tests and the 79-case actual-renderer audit passed again. Research goals were exercised through the real browser; the three-column tree and 390px layout were inspected. See [the research tree](era-tree.jpg). Local release snapshots were prepared for validation; nothing was published.

## Reusing the tools

Use **Meridian Strategy Audit** (`npm run analyze:design`) for full matches, strategy matchups, compute scaling, input frequency, blind repetition, consequences, pacing and coverage warnings. Use **Meridian Planning Audit** (`npm run analyze:planning`) for controlled combat breadth/foresight and peaceful full-tree development. Each defaults to **120 seconds of analysis**, with compilation separately measured. Keep both verdicts; a focused PASS cannot override a full-game FAIL or INCONCLUSIVE.

Before a future unit change, save both baselines. Update `data/units.json`, the Rust unit-count/branch declarations and roster validation when changing the catalog size, model authoring in `tools/asset-forge`, icons, abilities/manual entries, and policy/action coverage. Run `npm run assets` and `npm run build`, inspect actual animations, then repeat both audits with identical configurations and a separate holdout seed. Never relax thresholds to obtain PASS. Recruitment coverage means an action was exercised, not that the bot mastered it.
