# City manufacture

City controls keep the land and production upgrades and replace the embedded
unit list with one manufacture action. Its native modal lists every researched
unit the city can build, with the roster's purpose, counters, reverse-counter
weaknesses, and coin cost. Ships appear only in coastal cities. On narrow
screens the queue sits above the independently scrollable catalogue.

Each city stores up to 50 waiting units in FIFO order. Adding to an idle city
starts its first unit when affordable and within capacity; subsequent units
start automatically through the existing authoritative train validation. Money
is spent only when production starts. Lack of capacity, funds, deployment
space, or a disabled city delays work. Clearing removes waiting units and
preserves active production. Capture discards the former owner's queue.
Queues survive room persistence and are hidden from rival views. Old saves
default to an empty queue.

## Verification

Focused Rust tests cover FIFO completion, charging, serialization, funds,
capacity, clearing, capture, privacy, research/coastal restrictions and the
queue bound. Client tests cover the complete available roster and descriptions.
A live Worker test covers command authorization, sequence replay, reconnect and
clearing. Browser checks cover opening, adding units, clearing, native Escape,
and a 390 × 844 viewport with no horizontal catalogue overflow.

Both audits ran for 120 seconds before and after, with identical configuration:
design seed 42000, budgets 8/32, horizon 120; planning seed 51000. The design
baseline and result are **FAIL** (decision consequences and input restraint),
with thinking inconclusive. Planning is **INCONCLUSIVE** before and after:
breadth and peaceful space pass; foresight and restraint remain inconclusive.
These results do not certify strategic depth or queue balance.

The audit military policies now use one waiting replacement, and belief states
scrub rival queues. Evaluators, thresholds and input-restraint gates are
unchanged. This increases policy coverage, so the comparison includes that
policy change rather than isolating queue mechanics alone. Long queues and
optimal cancellation are outside the strategic audit's coverage; functional
tests cover their mechanics. Existing worktree changes to unit automation are
also part of the tested source.

Preserved results:

- [Design baseline](manufacture-design-baseline.json)
- [Design after](manufacture-design-after.json)
- [Planning baseline](manufacture-planning-baseline.json)
- [Planning after](manufacture-planning-after.json)

## Main integration verification

After merging the current space/conquest, combat-visual and manual-control
changes from main, all four queue engine tests and six focused client/lifecycle
tests pass. JavaScript syntax checks pass. The final 120-second design run
(seed 42000) reports **FAIL**, including input restraint and completion; the
planning run (seed 51000) reports **INCONCLUSIVE**. These are recorded in
[design integration results](manufacture-design-land.json) and
[planning integration results](manufacture-planning-land.json). The incoming
rule changes mean these runs are integration evidence, not an isolated
before/after estimate of the manufacture interface.
