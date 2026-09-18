# Current rules: conquest, complete-tree space and persistent combat

## Board and economy

The globe has 642 adjacent hexagonal/pentagonal cells and eight equally equipped starting capitals. Every capital starts with a real guard, scout and settler. At most one unit occupies a cell. Air units also obey this occupancy rule. No troop populations grow on tiles.

One treasury pays all costs. Every five seconds a city earns 8/12/16 coins, plus 0.25 per controlled farm, at production levels 1/2/3. Hostile neighboring ships halve this income. Production also shortens recruitment. Radius upgrades cost 80/140 and production upgrades cost 110/180. Radius supplies control, vision, repairs and unit capacity. Upkeep applies to forces beyond the first three units in the same currency. Capacity is 5 plus the sum of each city's radius plus one, capped at 16.

Research and recruitment compete directly with expansion. Unit types are permanent. Research unlocks recruitment in cities; there is no refit or conversion action. Disbanding immediately frees its slot when it is not committed; friendly territory returns 25% of its price, and foreign territory returns nothing.

## Settlement and occupation

A settler costs 115 and has 40 health with no attack. Founding costs 35 plus 25 per owned city. A suitable land hex must be at least four graph edges from all cities and other active foundations. There is no limit on owned or founded city count; spacing, land availability and rising founding cost constrain expansion. Work takes 25 seconds, pauses under recent damage and consumes the surviving settler on completion. This places economic growth on an exposed, movable piece.

A city changes owner only after an enemy ground piece stands on its exact center without moving for 12 seconds, or six for a commando. Damage briefly interrupts progress. Leaving resets it. Cities have no abstract defenders. Capturing a city cancels its former training queue. Radius changes territory; moving across a border does not claim terrain.

## Movement and deliberate actions

Movement uses terrain-weighted Dijkstra paths over actual edges. Land forces can board friendly canoes (capacity one), transports (four), or carriers (three) as the final step of a route; passengers cannot act and die with their transport. Disembark targets adjacent empty suitable land and unloads the first compatible passenger, applying its movement cooldown and stopping/committing the carrier for two seconds; cavalry/tanks cannot cross mountains; ships/submarines/carriers stay on water; drones fly. Occupied known cells block routes. A hidden obstruction is discovered on arrival, not through the command validator. Friendly congestion can replan without free movement. Orders changed midway finish their committed edge.

Stationary combat units automatically fire at visible enemies in range after movement cooldown and repeat after recovery. An explicit attack chooses a persistent preferred target; units hold position and never chase automatically. Shots commit to a hex, so a target can escape before impact. Move and Stop clear focus. Queued movement waits for commitment to end; repeated commands cannot accelerate firing. Automatic artillery avoids adjacent friendly splash, while an explicit attack may accept that risk. Special abilities remain deliberate orders. The server enforces a six-second player order interval in addition to unit commitment.

A guard blocks enemy ground movement from one of its adjacent hexes to another. Enemies can approach or withdraw, defeat the guard, or route around its zone. Aircraft and ships ignore this ground restriction. Planning uses visible guards; execution also stops queued routes at hidden or newly arrived guards. Boarded guards do not project a zone.

Artillery has a two-hex minimum, three-hex maximum and eight seconds of setup after movement. Its basic shell and stronger barrage splash adjacent hexes. Bow volleys, drone bombing runs and naval broadsides also splash; nearby allies can be hit. Guards and tanks automatically dig in after eight seconds on the same hex, once movement cooldown ends: 45% less incoming damage while holding position. They can still fire. Moving, queuing departure or cavalry displacement removes the protection. No stance button is needed. The icon sequence is hand → clock 8 → fort, with a blue ground ring when active. Cavalry shock knocks a victim into an empty hex and restarts its digging-in timer. Camouflage needs forest and breaks when moving. Sabotage halts a city's income and training for 24 seconds.

Submerged submarines are slower and deal less ordinary damage. Detection requires proximity or sonar. A ping extends vision/detection but reveals the source. Ballistic missiles require carrier research, 65 coins, a visible target within seven hexes, a 14-second warning and a 28-second commitment. Nuclear launchers cost 260; their attack costs 150, warns for 14 seconds, commits for 36, and damages a seven-cell area including allies.

Counters are asymmetric, not a universal damage ladder: guards stop cavalry; cavalry catches archers and exposed siege; archers punish guards; tanks overwhelm primitive forces; artillery and drones defeat armor; fleets/carriers counter drones; submarines counter large ships; local sonar counters submarine concealment. Splash, minimum ranges, forests, mountains, timing, scouting and production denial make the surrounding position matter.

## Research graph

There are 33 researchable unit types, eleven per colored era, plus the starting guard, scout and settler. The authoritative roster and research DAG live in `data/units.json`; `npm run build` generates the matching client metadata. See [the three-era roster](THREE_ERAS.md) for all eleven paths and utility roles.

Ordinary research costs 18/32/48 coins and takes 8/12/16 seconds by era. Orbital engineer costs 80 and takes 24 seconds, requiring all other 32 technologies. There are no elapsed-time gates. Set a goal to queue all missing prerequisites; a single research slot automatically starts the next affordable item. Changing or clearing a goal never refunds or cancels research already paid for. Research and recruitment compete for the same treasury. Unlocking a unit never upgrades existing pieces.

Palisades, bulwarks and floating chain booms protect a 120-degree front when stationary: 75% less ordinary damage, but only 20% less against siege. They block hostile crossings through their front between neighboring cells. Allies and aircraft pass freely. Turning commits for eight seconds. Shield trucks instead give adjacent allies 40% protection against attacks coming through their front; overlapping screens do not stack.

Herbalists heal adjacent nonmechanical ground troops by four, supply carts repair mechanical pieces by four, and field medics heal ground units by six every five seconds. They must be stationary; the patient must avoid damage for eight seconds (four with a medic). Only the strongest healer applies. Balloons and radar trucks passively reveal concealed enemies within three hexes. Anti-air is strong against aircraft and weak against ground targets. Fireboats explode on their first shot, consuming themselves and splashing allies as well as enemies. Mortars and rocket batteries fire indirectly with minimum-range dead zones; both require setup after moving.

## Exploration

Each eligible land hex outside the initial three-edge capital safety area independently has a 25% chance of a site. Production supplies private random rolls per tile, independent of the public terrain seed. A site's type uses the following conditional weights; overall per-eligible-hex probability is one quarter of the listed percentage.

| Discovery | Share of discoveries | Interaction |
|---|---:|---|
| Hostile camp | 24% | A real barbarian guard pursues locally and attacks. Defeat nearby guards, then claim 45 coins. |
| Buried treasury | 18% | Occupy and claim 35 coins. |
| Stranded scouts | 12% | Rescue an injured scout into an empty neighboring hex. |
| Abandoned guard post | 10% | Recover an injured guard into an empty neighboring hex. |
| Wrecked caravan | 10% | Salvage 55 coins. |
| Observatory | 7% | Reveal a five-hex region for 90 seconds. |
| Repair workshop | 6% | Restore up to 45 health to the occupying piece. |
| Supply depot | 5% | Restore 20 health and reset its special recharge. |
| Weather station | 5% | Permanently calm the local storm region. |
| Mercenary camp | 3% | Choose to spend 50 coins to hire injured cavalry. |

Every discovery has a distinct icon and 3D prop, with seeded visual variation. It is consumed once globally. Unit rewards require an empty deployment cell and spare capacity; a blocked reward is not silently lost. Fog filtering withholds unseen sites, future enemy paths, private research and treasury totals. Exploration can change a plan, but limited rewards cannot create an infinite resource loop.

## End conditions

There are exactly two victories. Conquest requires being the only civilization with cities. Taking a civilization's last city eliminates it immediately, including remaining units and foundations. Capitals and founded cities both count; capturing some capitals is insufficient. Cities transfer ownership rather than being razed. Legacy influence and capital-hold counters are reset and cannot win. The roster shows city count and space progress.

Space requires every research unlock and an orbital engineer on an owned production-3 city. Pay 180 to begin a 180-second launch. The engineer must remain there; damage interrupts progress and losing support erodes progress by two seconds per second. A defender must physically make room for it. Gold cannot substitute for the research or occupation. There is no score timeout, passive victory or guaranteed duration; a stalemate can continue. The bounded strategy audit reports capped matches as unresolved stalls, never invented wins.

## Presence and accessibility

The host chooses two to eight seats; the count cannot drop below the number of humans already joined. Bots fill only the selected vacancies, so a two-seat lobby with two humans has no filler bots. Every size retains the 642-hex globe. For fewer than eight seats, keep original start zero and select the nearest original eight-player starts by angular distance, remapping only the selected capitals to contiguous player IDs. Unused starts become ordinary land, not free cities. This preserves local eight-player spacing without placing two players at opposite poles. Names are generated, editable to 32 Unicode code points, persisted in a browser cookie and synchronized during the lobby. Vacant seats and away humans use bots. Hiding a tab or losing its socket hands control to AI; authenticated presence restores human control. A missing heartbeat also expires presence. The roster uses a robot icon or green human-control dot without additional visible words.

Phone controls use select → action → map target. Movement is the first action for every unit. Untargeted actions execute on their button tap; targeted actions execute on the next valid map tap. There are no confirmation or rejection panels. Research nodes open an icon inspector; its flask-to-unit action sets a research goal. Three colored columns keep corresponding branch stages aligned. Ordinary hex taps inspect cities before units, even while a unit is leaving that city; a unit marker selects that unit. Native disabled buttons show a reason icon or countdown. No unit shows a conversion palette.

The always-available book opens a searchable, scrollable icon manual, the sole exception to the names-and-numbers-only live interface. Its picker intercepts input before game handlers, including pointer events over disabled controls, and explains the action's current availability. It does not issue commands. Text is escaped before rendering, minimum touch targets are 44 pixels, and the manual traps keyboard focus while open. The match continues while reading.

Presentation events originate in Rust. They carry source, target, unit type, windup or health lost, and an audience captured at event time. Arrows are visible geometry with heads and fletching; volleys have several arrows. Other attacks have shells, tracers or torpedoes; impacts flash health loss with numeric damage. Target pulses mark windup, rings and symbols acknowledge unit abilities, routes acknowledge movement, and ongoing founding, sonar and defence have distinct persistent effects. Client effects never apply damage. Repeated snapshots deduplicate events, and reconnects skip stale effects.

Losing every completed city immediately and permanently eliminates a civilization, even if it owns settlers or active foundations. Its units disappear, research and launches stop, and commands are rejected. A captured last city takes precedence over finishing a foundation in that tick. The player can inspect the full battlefield as a spectator while treasuries, research and queued orders remain private. The sole surviving civilization wins immediately.

Each visible territory hex names its controlling city in the authoritative view. Unknown enemy city locations are withheld. Coloured outlines separate cities, including friendly neighbours; selection strengthens the tint and boundary of that city alone. Overlaps use distance to the city, then stable founding order.
