# Space and conquest balance candidate

This is an unfinished balance candidate, not a 50/50 certification. It is based
on main's focused orbital research ending (`dc2b7ad`) and includes the subsequent
audio fix through `428de41`. Orbital research still requires only its prerequisite
paths. Switching and cancelling unfinished research still refunds its cost, and
there is still no shared command cooldown. Archived releases are unchanged.

## Rules and decisions

- Ordinary research costs 30 / 60 / 90 coins across the three eras and takes
  10 / 16 / 22 seconds. Orbital research costs 600 and takes 60 seconds. Research
  competes with recruitment and city investment for the same treasury.
- Launching still costs 180 coins and requires an engineer in a production-three
  city. Supported launch time is six minutes. Damage interrupts support; missing
  support still drains progress at twice the accumulation rate.
- A launch broadcasts its pad to everyone, including the engineer on it. It does
  not reveal neighboring defenders. The scoreboard rocket locates the pad, and
  the map marks it with a rocket. Visible interface labels remain icons/numbers;
  accessible names and the manual explain the rules.
- City capacity remains five base slots plus radius + 1 per city, but no longer
  stops growing at sixteen. Captured income and recruitment can therefore keep
  supporting a larger army. This also permits larger late-game unit counts.

## Controller and audit coverage

Military policies buy their military branch and armies before considering a
surplus-funded space fallback. Their army budgets account for civilian/support
slots. City objectives value income gained and denied over an estimated occupation
window instead of always pursuing the nearest soldier. This is a heuristic, not
a solved continuation value or a change to the audit's leaf evaluator.

Bots focus exposed engineers, acquire missile counters, and move missile launchers
into range. Hidden-state rollouts retain the public launch and infer only its
required research ancestors. Previously those rollouts erased the pad, which
could erase an imminent loss from the planner's forecast. Focused tests exercise
actual engineer destruction and launch rollback rather than just order selection.

The design report separates active strategy, eight-player, idle, compute and input
cohorts. It excludes censored pairs and incomplete seat rotations. The new
`analyze:outcomes` diagnostic finishes fixed fixtures at a longer horizon so that
eight-player games do not disappear behind the ordinary audit's shorter cap.
It does not replace or weaken any certificate gate. Policy coverage changed, so
before/after differences combine rule and controller effects.

## Evidence and limits

The pure-main baseline and candidate use 120-second design runs with seed 42000,
and planning runs with seed 51000. Separate holdouts use 43000 and 61000. Summaries
with their configurations and source fingerprints are preserved in
`space-balance-evidence.json`; raw logs remain in the named artifact directories.

On 86 common active-strategy games in the bounded baseline/candidate runs, main
had 85 space wins, no conquest wins and one capped game. The candidate had 35
space wins, 29 conquest wins and 22 capped games. Longer matches are a material
regression against the unchanged completion gate, not draws or evidence of balance.

The fixed 7200-second diagnostic on seed 42000 completed 56 two-player games:
31 space and 25 conquest (55.4% space), averaging 26.0 minutes. Its complete
eight-seat rotation produced seven space wins, no conquest wins and one capped
game; completed games averaged 50.6 minutes. Simply increasing the horizon does
not resolve eight-player space dominance. Equal victory-route viability across
lobby sizes remains unmet.

The candidate's primary focused planning audit passes all four gates, including
peaceful space. Its primary full-game audit fails completion and lacks sufficient
evidence for several other claims. Focused planning PASS does not override that
failure. Do not deploy or describe this candidate as having achieved 50/50 on the
basis of its two-player result.

The full-game holdout also fails input restraint: the same-policy faster side
wins 93.5% of completed paired results, a decisive advantage under the unchanged
gate. Its completion gate records 133 capped games out of 377 resolved experiments.
The focused planning holdout is INCONCLUSIVE on breadth; foresight, restrained
combat and peaceful space pass. These are distinct tests, and the focused
restraint result does not cancel the full-game failure.

Earlier experiments preserved under `artifacts/design-audit/space-balance-*`
showed that raising research prices alone mainly lengthened matches. After merging
main, a three-minute launch still yielded 16/16 space wins in long eight-player
fixtures. Six minutes with the old capacity ceiling yielded 8/8. Removing the
ceiling without expanding bot army budgets also yielded 8/8. These unfavorable
results motivated the current controller changes; none establishes eight-player
conquest viability.

The larger fixed-fixture holdout (seed 43000, four rounds, 7200-second horizon)
records 115 space wins, 81 conquest wins and 28 unfinished two-player games.
Space is 58.7% of completions, averaging 27.8 minutes. All 32 eight-player games
finish through space, averaging 48.2 minutes. The first two-player sample was
therefore optimistic about completion, and the multiplayer failure persists
across additional maps and all seat rotations.

Verification: native tactics tests, audit regression tests, WASM build, client
controls/research/manual/engine/report tests, and a local deterministic browser
fixture for the merged research tree and public launch locator. The browser
fixture verifies rendering and interaction, not live network play.
