# Network trust model

## Authoritative boundary

The Cloudflare Durable Object owns the Rust simulation, wall-clock advancement, RNG seed, economy, visibility, travel, combat and victory. Clients send intentions (for example move a discrete piece, attack a hex, found a city or research a unit), never final resource counts, damage, ownership, elapsed time or winning claims. The Rust engine validates owner, range, route, terrain, era gates, cost, order budget and cooldown. Copying or modifying the browser WASM does not grant authority over a hosted match.

Each seat has a random 256-bit bearer credential; SQLite persists only its SHA-256 hash. WebSockets carry it in a subprotocol rather than in the invite URL. A random 80-bit room link permits lobby admission but does not expose existing seat credentials. The host alone starts/reconfigures a lobby. The host cannot command another player's civilization. Room joins are serialized across asynchronous hashing so concurrent requests cannot overbook the configured two-to-eight seats. Configuration cannot remove an admitted human. A browser stores its own seat credential locally for reconnect; treat browser profiles as trusted to that player.

Commands carry strict per-seat increasing sequence numbers. Results and the latest state are stored before acknowledgement; recent duplicate commands replay acknowledgements without reapplying effects. A gap requests sequence resynchronization. Reconnecting replaces the old socket and keeps the seat. The closure of a replaced socket does not mark its replacement disconnected. A hidden tab or closed socket hands control to a bot immediately. A missing heartbeat expires after 25 seconds. Authenticated foreground presence or reconnect restores human control. Presence messages cannot command another seat.

## Fog and intentional public facts

Each seat receives a separately generated Rust tactical projection. Hidden pieces, enemy resource totals and research are omitted or sent as unknown values. Enemy unit routes and destinations are removed; only an observed current position can be sent. Enemy equipment is filtered, including submarine stealth: ordinary surface vision does not reveal submerged boats without local detection. Unknown production queues and concealed destinations are not sent to the browser. A visible unit exposes its health and action commitment so opponents can predict a vulnerable interval.

The Worker remembers last-observed province ownership/buildings per seat for explored fog. This memory is not a live update from hidden territory. Public information includes the seeded map/terrain, original capital locations, player identities, victory progress and weather; strike warnings are shared with their owner and players who can see the target. These choices are deliberate game rules, not confidential information. Opponents may reason from public facts and past observations. Bot planning sanitizes the server state into this same information boundary before generating candidates or evaluating future positions. A regression perturbs hidden resources, technology and pieces and requires an identical selected order.

## Persistence and limits

One SQLite row stores a room atomically. A two-second alarm advances the simulation while the browser is idle or disconnected. Normal snapshots are two seconds apart; a command advances to current server time and triggers an immediate authoritative update. Visual movement interpolates for at most the snapshot interval and does not determine combat. Catch-up is capped at 60 simulated seconds per event to bound search CPU; subsequent alarms drain a larger backlog. Non-running rooms expire after one day.

Input types, integer ranges, action names and payload sizes are bounded. Cross-origin writes are rejected. WebSocket messages over 2 KiB are closed, and sustained messages over 50 per ten seconds close the socket. The engine's order/cooldown budget independently prevents action-rate advantages. Names are limited to 32 Unicode code points, control characters removed, and escaped at HTML insertion points. Browser policy disables third-party scripts, objects and framing.

## What this does not claim

No network design makes all cheating impossible. Bearer-token theft from a compromised browser, account sharing, multi-seat collusion, public-information bots, denial of service, malicious extensions and client screenshots remain outside these guarantees. There is no competitive anti-smurf identity system or global per-IP room-creation quota. This release is for invitation-based play, not an audited public ranked service. Browser accessibility labels are public interface descriptions, not a source of extra hidden state.

Tests cover private projections, foreign-owner orders, byte/integer validation, duplicate sequences, reconnect persistence, unauthorized host actions, cross-origin writes and concurrent admission. They are reproducible regression checks, not a penetration-test certificate. Physical mobile network loss, long-running production load and geographically distributed latency still need field testing.

## Discovery secrecy in v4

The public map seed generates terrain, not production discovery locations. The Worker supplies 642 independent cryptographic random rolls to Rust; neither rolls nor unseen encounters are included in the client projection. Revealed site kinds and variations do not enable reconstructing the remaining map. Sites are claimed atomically by the authoritative simulation. Unit rewards use actual occupancy and capacity checks. Attacks, splash, action commitments, disband refunds and queued movement are all computed on the server.

## Upgrade compatibility

New rooms use rules version 4. Active v1, v2 and v3 rooms remain pinned to their original WASM binaries. Unstarted lobbies upgrade while preserving human seat identities. A new browser opening an older active match is directed to the retained legacy frontend. Current tests check all four engine formats.

## Presentation events and elimination

Projectile events are shared only when source and target were observable at order time. Health-loss records describe the victim only; they contain no concealed attacker identity or source. An event-time audience prevents newly revealed terrain from disclosing past hidden actions. Public deduplication keys use the observed event's tick, action and unit, rather than a global counter that would expose the number of hidden orders. Own route destinations remain private. A client animation never changes health or occupancy.

Elimination is permanent when the last city falls; the authoritative engine removes surviving units and rejects future orders. Eliminated seats receive a full-map spectator view but no opponents' private economy, research, recruitment or movement plans. This intentionally allows spectators to watch all positions, so collusion by sharing that view remains possible in invite-based play. Reconnecting cannot restore an eliminated army.
