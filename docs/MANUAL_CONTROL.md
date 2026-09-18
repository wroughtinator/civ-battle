# Manual units and opt-in robot control

Human-controlled units spawn in manual mode. Each Attack order fires once; idle units do not acquire targets. The per-unit robot button enables movement toward visible enemies and known enemy cities, normal attacks, and conquest through occupation. Automatic artillery retains its friendly-fire restraint. Automation does not purchase units, spend ability fees, or manage other pieces.

Manual action buttons are disabled while the robot is enabled. The server enforces the same restriction. The toggle is an idempotent set operation and remains available during attack/movement recovery and while aboard a carrier. Turning it off clears the route and focus, while preserving already committed shots and cooldowns. Manual movement can then be queued immediately. Passive healing, dug-in protection, and city capture by deliberately occupying a city retain their rules. Computer-controlled seats and neutral defenders still defend automatically.

Old snapshots without the automation field default to manual. Archived releases are unchanged.

## Verification

- 64 tactical Rust tests pass, including new tests for manual one-shot attacks, robot command rejection, ownership, repeated toggle requests, recovery preservation, old saves, and automatic conquest.
- 134 JavaScript/WASM tests pass, including client/server agreement on disabled controls.
- The local browser confirmed the robot pressed state, disabled manual buttons, and immediate return to manual movement while an existing attack recovered. UI verification used the original local preview; engine and client suites ran in the isolated manual-unit-control worktree.

## Strategy evidence and limits

Reports use the unchanged 120-second budgets and seeds 42000 (full game) and 51000 (planning). Baseline and candidate summaries, configurations and source fingerprints are preserved in [manual-control-audit](manual-control-audit/). The baseline was captured before changing rules. Concurrent city-production edits were subsequently detected in the initial checkout, so the final candidate was isolated and tested separately. Comments were clarified after the candidate audit started; the holdout fingerprints include those comment-only edits.

Full-game baseline: FAIL (decision consequences), with inconclusive thinking and input restraint. Candidate: FAIL (decision consequences and input restraint). Fast same-policy orders won 75.4% in the candidate sample versus 52.3% in the baseline sample. These are screening measurements from the completed samples, not a causal estimate or a certification. Requiring explicit manual attacks can reward frequent input; this regression is retained rather than weakening the gate.

Planning baseline: PASS. Candidate: INCONCLUSIVE; combat breadth and peaceful space pass, but foresight and combat input restraint remain inconclusive. The candidate cannot be called strategically certified.

Coverage was extended: the guards portfolio explicitly enables robot control, and focused combat search can enable or disable it. Other full-game policies issue discrete manual shots. Consequently before/after results mix the intended rule change with necessary controller coverage changes; they are not a pure balance comparison. Evaluators and thresholds were not changed.

Fresh-seed holdouts: full game (43000) FAIL on policy diversity, with space winning 82.1% of its opponent-weighted matchups; input restraint remains inconclusive (70.3% fast-side wins), and no complete compute seed pairs were obtained within the deadline. Planning (61000) remains INCONCLUSIVE on foresight and input restraint, while breadth and peaceful space pass. These results do not override the candidate input-restraint failure.

## Landing integration

Merged the current space-balance and combat-visual changes from main. The launch-counter bot now issues each manual shot explicitly; its regression test runs the bot continuously instead of relying on automatic fire after one order. All 68 tactical Rust tests, 41 focused JavaScript/WASM tests, and the WASM build pass. No archived release was edited.

The post-merge 120-second full-game run (42000) remains FAIL: input restraint and completion fail; thinking, diversity and multiplayer are inconclusive. The same-policy fast side wins 98.6%, and 111 of 355 resolved experiments hit the diagnostic cap. This combined code does not satisfy the input-restraint design requirement or establish strategic depth. The exact summary is preserved in manual-control-audit/design-land.json.

The post-merge planning run (51000, 120 seconds) is INCONCLUSIVE: breadth and peaceful space pass, foresight and input restraint remain inconclusive. Its summary is preserved in manual-control-audit/planning-land.json.
