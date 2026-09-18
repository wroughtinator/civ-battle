# Meridian Planning Audit

Current research UI and removal of the shared order timer: [Research tree](RESEARCH_TREE.md). Historical results below retain their original rules.

Run `npm run analyze:planning` to check whether additional thinking helps in
combat and peaceful space development. The analysis takes at most 120 seconds,
plus separately reported Rust compilation and a three-second watchdog margin.
It needs Node and Rust, with no server, training job or GPU.

```sh
npm run analyze:planning -- --seconds 120 --seed 51000 --out artifacts/planning-audit/my-change --check
# Repeat on a separate seed family when accepting a change.
npm run analyze:planning -- --seconds 120 --seed 61000 --out artifacts/planning-audit/my-holdout --check
```

Choose a new output directory. It receives `report.md`, `summary.json` and raw
`events.jsonl`. `--check` returns 0 for PASS, 2 for FAIL/INCONCLUSIVE and 1 for
execution errors. Short runs are useful for debugging but may lack evidence.
The summary includes the source fingerprint and actual analysis/build times.

## Current three-era rules and results

The current roster has 33 researchable and three starting unit types. Automatic
weapons, healing and research plans keep working without a shared order timer.
Space requires orbital technology and an occupied three-minute launch. The orbital path may skip unrelated technology. The final
main/holdout results and full-game limitations are in [Three eras](THREE_ERAS.md).
The summaries are preserved as `era-planning-after.json` and
`era-planning-holdout.json`; `era-planning-before.json` preserves the baseline.

Schema 3 expands combat sampling to land and sea across three eras. Its pool contains
30 types: orbital/nuclear specialists, scout, settler, canoe and transport are excluded
from this combat-only experiment. The first two pieces are armed; the third can be
support. Both armies have matching type selections with their seats swapped. Legal
facing orders are included. The unchanged evaluator scores real health/cost outcomes;
thresholds are unchanged. The expanded scenarios make the pre-expansion scores a
historical baseline, not a controlled same-position estimate of the roster's effect.

## What the experiments actually do

Combat generates three-piece armies, terrain and approaches, across the 30-type
three-era combat pool. About a quarter of generated arenas use sea units. Every map runs with both assignments of the
larger thinking budget. Controllers use the same legal orders, visible
information and evaluation. Opening reconnaissance lasts 90 simulated seconds;
hidden enemies are removed from planning thereafter. Rollouts execute real
movement, automatic attacks, terrain effects and passive defenses. They forecast
automatic fire, not a tree of every possible enemy response. A fight lasts up to
180 simulated seconds or until an army is eliminated.

The breadth test holds foresight at 32 seconds. The foresight test holds the
candidate budget at 32. Both issue at most one order per eight seconds. The
restraint test compares 32 candidates and 32-second forecasts every eight seconds
against four candidates and eight-second forecasts every two seconds. This is
evidence against fast, shallow play in these skirmishes; the full-game frequency
and blind-repetition tests remain necessary.

Space uses one developing city and an inert distant rival, with no enemy attacks,
expansion or army purchases. Plans vary production/radius investment timing and
technology order. Both budgets simulate complete schedules through the real
engine, then replay their selected plan from a fresh state through actual space
victory. They have the same eight-second command interval and nested candidate
sequence. **With a deterministic perfect model, searching more candidates cannot
worsen the best known schedule.** The measured improvement demonstrates an
optimizable development tradeoff, not skill at defending a launch under pressure.

Each gate requires its conservative 95% lower confidence bound to exceed 50%.
Intervals are mean ± sqrt(log(40)/(2*n)), treating the two seat assignments as
one map sample. Unfinished space launches make the space gate inconclusive;
incomplete deadline pairs are discarded together. All four gates must pass.
Changing a metric or scenario requires a new baseline, not quietly relabeling
historical results. Keep raw unfavorable evidence and use separate holdout seeds.

## For future design changes

Run both audits before and after changes with the same configurations. Extend
controller coverage when adding mechanics; these combat controllers do not test
every unit, production decision or multiplayer interaction. Preserve failures
and compare overlapping seed samples when runtime changes the sample count.
The focused controller is an offline experiment, not a replacement for the live
Easy/Medium/Hard bots.

The [earlier 40-second focused run](planning-before.json) is historical: it used
schema 1 without the restraint gate, and mutual destruction handling was corrected
before the final runs. It already showed foresight and peaceful-space advantages.
It is not a controlled estimate of how much the new rules improved strategy.
The new result establishes the current rules' measured advantages; it does not
attribute all of them to this redesign.

## Historical 14-type planning baseline

Guards and tanks automatically dig in after holding position for eight seconds,
reducing incoming damage by 45%. Moving, queued departure or cavalry displacement
breaks this protection. There is no brace button or extra command to repeat.
Research requires its prerequisites and money, without fixed match-time gates.
Space still requires the complete technology tree, a developed city and the
occupied launch countdown. Conquest still requires eliminating every rival's
cities. Recruitment remains available; refitting an existing piece is absent.

The unit panel teaches the new passive with hold, clock, shield and number icons.
The in-game manual explains the rule and research changes. Terrain help and
navigation controls use icons with accessible labels.

Both two-minute runs passed all four focused gates:

| Comparison | Seed 51000 score (samples) | Seed 61000 score (samples) |
| --- | --- | --- |
| Combat: 32 versus 4 candidate simulations | 64.9% (267 pairs) | 60.5% (191 pairs) |
| Combat: 32 versus 8 seconds of foresight | 68.5% (267 pairs) | 68.5% (191 pairs) |
| Thoughtful orders every 8s versus shallow orders every 2s | 69.1% (266 pairs) | 69.2% (190 pairs) |
| Peaceful space: 32 versus 4 development schedules | 93.7% (395 maps) | 92.2% (370 maps) |

Space launched an average of **65.0 and 59.8 simulated seconds sooner**, with both
controllers completing every recorded launch. Analysis took 120.00 seconds per
run; compilation took 2.24 and 0.22 seconds on this machine. See the preserved
[main summary](planning-baseline.json) and [fresh-seed summary](planning-holdout.json).

These scores award 1 for a better outcome, 0.5 for equality and 0 for worse.
**Combat scores measure remaining army health weighted by unit cost, not full-game
win rates.** In the foresight comparison, deeper planning completely eliminated
the enemy army 167 versus 76 times in the main run and 126 versus 57 in the holdout;
many other fights remained unresolved. Space scores include ties, too.

At that baseline, the separate full-game [Meridian Strategy Audit](DESIGN_AUDIT.md) still returns
**FAIL**. The [historical full-game summary](strategy-planning-after.json) records
305 of 1,235 matches reaching the cap (24.7%), a failed consequences gate, and
inconclusive full-game thinking/input-restraint gates. Policy diversity, active
play against idle, and multiplayer gates passed. These focused passes do not
override that failure or certify chess-like depth or several robust human metas.

