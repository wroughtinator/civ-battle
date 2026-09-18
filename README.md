# Meridian

Play: https://meridian-globe.camerons-nonsense.workers.dev/

Two to eight players on a full-size procedural WebGL2 globe, with an authoritative Rust/WASM simulation in a Cloudflare Durable Object. Choose the lobby size and invite friends before starting; bots fill only the remaining selected seats. Two humans can play alone, starting at neighbouring positions from the eight-player layout. Outside the on-demand icon manual, player names are the only visible words. Icons have descriptive accessibility labels.

## Current game: discrete pieces

- One unit per hex. Tap a unit, choose the first action (movement), then tap a destination to start its weighted hex route. Map taps without an armed action inspect the city or unit. Each step instantly changes the occupied hex and uses a short visual glide for every visible unit, including enemies. Speed controls the cooldown between steps. Ground units cross water aboard friendly carriers, which hold three passengers. Move onto a carrier to board; use Disembark to unload one passenger onto adjacent empty suitable land. Passengers cannot act and die with their transport. Moving never implicitly attacks.
- Select the crossed swords to show attack range, then tap a hex to fire immediately, without confirmation. Every attack fires once. Attacks and abilities commit the piece through windup and recovery; movement queued during that time waits. The highlighted hand clears the remaining path immediately, including during shared order recovery, while preserving the last step’s cooldown. The bin immediately disbands it, returning 25% of its cost only in friendly territory.
- Guard, scout and fragile settler are available initially. A settler must reach a viable site at least four hexes from another city, pay the founding cost, and work for 45 seconds. Completing the city consumes that settler. Occupy an enemy city center for 12 seconds to capture it; commandos take six. There is no population army or abstract garrison.
- Losing every city permanently eliminates a player, removes remaining units and foundations, and opens read-only full-map spectating. The last surviving civilization wins immediately.
- The book opens a searchable manual for every icon. Its picker explains any visible icon, including why a disabled action cannot execute, without activating it. Arrows and other projectiles, impact flashes and floating health loss follow server-issued, visibility-filtered events.
- Coins are the only spendable resource. Recruit units, research unit unlocks, expand city control, improve production, or pay for special operations. Friendly-territory refits provide another way to change composition.
- One connected research tree unlocks cavalry/tank/commando, archer/artillery/drone, fleet/submarine/carrier, then orbital engineer and nuclear launcher through visible prerequisites. The tree shows costs, statistics, counters and abilities.
- Cannons and bombing runs punish clumps, with friendly fire. Cavalry dislodges defenders. Commandos conceal themselves or sabotage production. Submarines submerge, ping sonar and launch ballistic missiles. Weather, range, setup time and commitment windows create positional tradeoffs.
- Eligible unexplored land has a seeded 25% chance of a discovery. Every discovery is the same large gold-banded treasure chest. Walking onto it automatically collects coins, a rescued unit, repairs, reconnaissance, weather protection or free cavalry, with wordless reward symbols and a bright pickup chime. Unit rewards that cannot fit and repairs at full health pay 35 coins instead. Production matches use independent secret randomness for each tile.
- A green circle means human control; the robot icon means AI control. Hidden tabs and disconnected players hand over to a bot. Returning to the tab or reconnecting restores the same human seat and name.

Win through a capital hold, accumulated territorial influence or an occupied orbital launch program. There is no 20-minute score timeout. Normal play targets 20–25 minutes; persistent territorial progress supplies a finite end condition. See `docs/DESIGN.md` for exact rules and `docs/BALANCE.md` for measured results and limitations.

## Run, test, deploy

Use Node and Rust with `wasm32-unknown-unknown`. `npm ci`, `npm run build`, `npm run dev` starts port 8793. `bash deploy.sh` builds and deploys to the configured Cloudflare account; add `--dry-run` to check without publishing. `npm run deploy` uses the same pipeline. Existing rooms keep their exact server rules and browser assets. See [deployment instructions](docs/DEPLOYMENT.md). Credentials are not stored in this repository.

`npm test` includes archived-engine regression tests plus current native, WASM and live network tests. Keep `npm run dev` running for network tests. Focused current checks: `cargo test --release --lib tactics::tests` and `node --test tests/*.test.mjs`.

`cargo run --release --example pieces_audit -- 8 101000` runs complete current-rule matches. Append `mixed` for fixed-composition opponents or `depth` for rotated forecasting comparisons. `node scripts/tactics-preview.mjs` provides a local-only visual QA scene on 8795; it is not deployed. `node scripts/size-report.mjs` measures bundle size.

## Source map

Current rules are in `engine/src/tactics.rs` and `engine/src/tactics/`. Earlier engines remain available only for old running matches. `worker/index.js` handles admission, names, credentials, sequence replay, presence, snapshots and SQLite persistence. `public` contains custom WebGL2 rendering, icon controls and Web Audio. `docs/ASSETS.md` and `docs/asset-manifest.json` preserve asset provenance.

The graphics combine a procedural 3D globe with authored CC0 skeletal characters, instanced textured trees, coastal beaches, alpine ridges and animated ocean shading. Models load on demand. `node scripts/graphics-preview.mjs` opens a focused local graphics and weapon-cue review on port 8796. Tests establish specific invariants and compare selected policies; they do not prove chess-level depth, universal dominance of a stronger bot, or that all cheating is impossible. Physical-device performance and prolonged real-player balance testing remain useful follow-up work.

## License

The source code is licensed under the [MIT License](LICENSE). Visual assets retain their existing CC0 dedication. The bundled 99Sounds audio is separately licensed and is not covered by MIT; it must not be redistributed as a standalone sound library. See [asset provenance and license details](docs/ASSETS.md).
