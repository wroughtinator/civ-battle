# Branching research and unrestricted commands

Research now uses a prerequisite DAG with multiple steps inside Stone & Bronze,
Industry & Sail, and Modern & Space. The scrollable timeline renders its actual
connections, omitting redundant transitive edges. Orbital technology requires Rocket Battery and Radar Truck, allowing unrelated
branches to be skipped. The roster build rejects cycles, backward
prerequisites, misplaced eras, and overlapping nodes.

A tap replaces the entire research plan. The engine refunds the full cost of the
unfinished technology, discards its elapsed progress, and starts the first missing
prerequisite immediately if affordable. Every ancestor is queued exactly once;
with one serial research slot and fixed costs/times, no unnecessary technology or
command wait is introduced. Funds are charged as each project starts. Completed
research is retained. Empty space or a researched node cancels active and pending
work. Blue means queued; a gold pulse and progress bar mean actively researching.
The inspector, its manual button, and the completed/total counter are removed.

The authoritative global command cooldown and client cooldown gate are removed.
The serialized cooldown field and zero-valued order_interval remain for save and
consumer compatibility. Unit movement/attack commitments still apply. The client
queues commands behind outstanding acknowledgements without disabling all actions
or discarding rapid input. Bots wait for their current research to finish before
selecting another plan, while existing emergency cancellation policies remain.

## Verification and limits

- WASM build and roster validation passed.
- All 61 tactical Rust tests passed, including prerequisite reachability, replacement,
  refund, save restoration, and multiple commands in the same simulation tick.
- 29 focused client, WASM, network, research, manual and pathfinding tests passed.
- Nine strategy-audit reporting/input-restraint tests passed; no gates were weakened.
- Desktop and phone viewport inspected in the browser; target selection and empty
  background cancellation verified through the live local server.
- No production deployment. Local development snapshots use the normal immutable
  release capture; existing room archives are unchanged.

The required baseline and final runs use 120 seconds, design seed 41000 and
planning seed 51000. Raw events, summaries, source fingerprints, and reports are
preserved under artifacts/research-{before,final}-{design,planning}. Intermediate
after runs are preserved too. The prerequisite and bot behavior both changed, so
this comparison cannot isolate a causal effect of removing the input timer.
Runtime contention affects completed sample counts; raw counts are not ratings.

Baseline full-game verdict: FAIL (decision consequences); thinking and input
restraint INCONCLUSIVE. Final full-game verdict: FAIL (decision consequences);
thinking and input restraint INCONCLUSIVE. Baseline focused planning: PASS.
Final focused planning: INCONCLUSIVE (foresight); breadth, restraint and peaceful
space PASS. These outcomes do not certify strategic depth or absence of an APM
advantage. The input-restraint gate remains a design requirement.

Common completed full-game experiment pairs (mean duration is descriptive, not a
win-rate or strength estimate):

| Experiment | Common seed pairs | Before mean ticks | After mean ticks |
| --- | ---: | ---: | ---: |
| apm_frequency | 48 | 891.5 | 884.8 |
| apm_repeat | 49 | 889.6 | 872.5 |
| apm_thinking | 4 | 832.8 | 836.1 |
| compute | 4 | 948.9 | 913.0 |
| meta | 268 | 797.3 | 804.0 |

Holdout runs use seed 61000 and the same 120-second budget. Full-game holdout:
INCONCLUSIVE (thinking and input restraint; other gates PASS). Focused holdout:
INCONCLUSIVE (breadth; foresight, restraint and peaceful space PASS). Files are
under artifacts/research-holdout-{design,planning}. All failures and inconclusive
results are retained; no certificate of strategic depth is claimed.

## Orbital prerequisite correction

Orbital Engineer now requires Rocket Battery (35) and Radar Truck (33), using
normal AND prerequisites. The complete path has 19 technologies, leaving 14
optional: Commando, Drone, Frigate, Submarine, Carrier, Nuclear Launcher, Canoe,
Outrigger, Fireboat, Ironclad, Chain Boom, Transport, Anti-air and Shield Truck.
Launch eligibility, launch support, and victory resolution check the orbital
unlock, not completion of the roster. Existing city, engineer, payment and launch
countdown rules are unchanged. The focused peaceful planner now researches only
orbital ancestors, so this new route is exercised by the audit. This changes the
controller's action coverage; before/after planning scores are not a pure rule-only
causal comparison. No thresholds or input-restraint tests were weakened.

Verified with the WASM build, all 61 tactical Rust tests, five planning-audit
Rust tests, 23 focused client/WASM tests, and 12 audit-report tests. A full engine
regression researches only the 19-node path and wins while rivals remain alive
and nuclear/naval research remains locked. Current UI labels, manual, rules docs,
client metadata and audit descriptions have been updated. Historical results and
immutable room archives retain their original rules; no deployment was requested.

Orbital before/after audit runs use 120 seconds, design seed 41000 and planning
seed 51000. Both full-game verdicts are INCONCLUSIVE (thinking and input
restraint); both focused verdicts are INCONCLUSIVE (foresight). Peaceful-space,
combat breadth and combat restraint gates PASS. Reports, raw events and source
fingerprints are preserved in artifacts/orbital-{before,after}-{design,planning}.

On 569 common peaceful-space seeds, mean high-budget launch completion
changed from 747.7 to 574.8 simulated seconds. This describes the
combined prerequisite and planner-coverage change, not a competitive rating.

Orbital holdout seed 61000 (120 seconds): focused planning PASS on all four gates;
full-game INCONCLUSIVE on thinking/input restraint, with all other gates PASS.
Preserved in artifacts/orbital-holdout-{design,planning}. These results do not
certify strategic depth or universally rule out an input-frequency advantage.
