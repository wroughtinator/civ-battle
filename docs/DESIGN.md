# Rules v4: discrete cities and committed pieces

## Board and economy

The globe has 642 adjacent hexagonal/pentagonal cells and eight equally equipped starting capitals. Every capital starts with a real guard, scout and settler. At most one unit occupies a cell. Air units also obey this occupancy rule. No troop populations grow on tiles.

One treasury pays all costs. Every five seconds a city earns 5/7/9 coins at production levels 1/2/3. Hostile neighboring ships halve this income. Production also shortens recruitment. Radius upgrades cost 80/140 and production upgrades cost 110/180. Radius supplies control, vision, repairs and unit capacity. Upkeep applies to forces beyond the first three units in the same currency. Capacity is 5 plus the sum of each city's radius plus one, capped at 16.

Research and recruitment compete directly with expansion. Refitting in friendly control costs the new unit's price minus half the old unit's price, with a minimum 30, and commits the piece for 20 seconds. Disbanding immediately frees its slot when it is not committed; friendly territory returns 25% of its price, and foreign territory returns nothing.

## Settlement and occupation

A settler costs 115 and has 40 health with no attack. Founding costs 35 plus 25 per owned city. A suitable land hex must be at least four graph edges from all cities and other active foundations. There is no limit on owned or founded city count; spacing, land availability and rising founding cost constrain expansion. Work takes 45 seconds, pauses under recent damage and consumes the surviving settler on completion. This places economic growth on an exposed, movable piece.

A city changes owner only after an enemy ground piece stands on its exact center without moving for 12 seconds, or six for a commando. Damage briefly interrupts progress. Leaving resets it. Cities have no abstract defenders. Capturing a city cancels its former training queue. Radius changes territory; moving across a border does not claim terrain.

## Movement and deliberate actions

Movement uses terrain-weighted Dijkstra paths over actual edges. Land forces can embark slowly; cavalry/tanks cannot cross mountains; ships/submarines/carriers stay on water; drones fly. Occupied known cells block routes. A hidden obstruction is discovered on arrival, not through the command validator. Friendly congestion can replan without free movement. Orders changed midway finish their committed edge.

Movement and attack are independent. A normal attack is an explicit command, with a visible range and a short windup. It fires once, then the unit must finish its recovery. Units do not automatically attack merely because another piece is nearby. Barbarians are explicitly hostile and act automatically. Movement can be planned during recovery but does not execute until the commitment ends. Other abilities and disbanding cannot bypass it. The server enforces a two-second player order interval in addition to the unit's commitment.

Artillery has a two-hex minimum, three-hex maximum and ten seconds of setup after movement. Its basic shell and stronger barrage splash adjacent hexes. Bow volleys, drone bombing runs and naval broadsides also splash; nearby allies can be hit. Cavalry shock knocks a victim into an empty hex. Bracing and hull-down trade attacks/movement for reduced incoming damage. Camouflage needs forest and breaks when moving. Sabotage halts a city's income and training for 24 seconds.

Submerged submarines are slower and deal less ordinary damage. Detection requires proximity or sonar. A ping extends vision/detection but reveals the source. Ballistic missiles require carrier research, 65 coins, a visible target within seven hexes, a 14-second warning and a 28-second commitment. Nuclear launchers cost 260; their attack costs 150, warns for 14 seconds, commits for 36, and damages a seven-cell area including allies.

Counters are asymmetric, not a universal damage ladder: guards stop cavalry; cavalry catches archers and exposed siege; archers punish guards; tanks overwhelm primitive forces; artillery and drones defeat armor; fleets/carriers counter drones; submarines counter large ships; local sonar counters submarine concealment. Splash, minimum ranges, forests, mountains, timing, scouting and production denial make the surrounding position matter.

## Research graph

The three visible unit chains are cavalry → tank → commando, archer → artillery → drone, and fleet → submarine → carrier. Research prices are 65/145/235, taking 24/44/64 seconds. The second and third tiers become available at 4:00 and 9:00. The graph displays these gates as clock icons and numbers.

Orbital engineer research requires tank plus artillery, costs 300, takes 90 seconds and becomes available at 13:00. Nuclear research requires artillery plus drone, costs 310, takes 90 seconds and becomes available at 14:00. These are connected nodes in the same tree, not separate doctrine buttons or alternate currencies. An unlock adds a recruitable unit; it does not silently upgrade every existing piece.

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

Holding half the starting original capitals (rounded up, minimum two) for 90 consecutive seconds wins domination. The required number is shown beside the crown in the lobby. Alternatively 540 banked influence wins territorial control. Original capitals contribute one point every four seconds; founded cities one every twelve. Points cannot be reset through ownership cycling. Original capitals cannot be destroyed or neutralized, so the pigeonhole bound for even a pathological cycling game is 2,160 seconds (36 minutes). That is a consequence of the objective, not a score-at-time rule.

An orbital engineer on an owned production-3 city can pay 180 to begin a 360-second launch. It must remain there; damage interrupts progress and losing its position erodes progress. A city guard must physically make room for the engineer. There is no passive/automatic space victory. The engineering path is timed to compete around the intended 20–25-minute window; measured results are separate from that target.

## Presence and accessibility

The host chooses two to eight seats; the count cannot drop below the number of humans already joined. Bots fill only the selected vacancies, so a two-seat lobby with two humans has no filler bots. Every size retains the 642-hex globe. For fewer than eight seats, keep original start zero and select the nearest original eight-player starts by angular distance, remapping only the selected capitals to contiguous player IDs. Unused starts become ordinary land, not free cities. This preserves local eight-player spacing without placing two players at opposite poles. Names are generated, editable to 32 Unicode code points, persisted in a browser cookie and synchronized during the lobby. Vacant seats and away humans use bots. Hiding a tab or losing its socket hands control to AI; authenticated presence restores human control. A missing heartbeat also expires presence. The roster uses a robot icon or green human-control dot without additional visible words.

Phone controls use select → action → map target. Movement is the first action for every unit. Untargeted actions execute on their button tap; targeted actions execute on the next valid map tap. There are no confirmation or rejection panels. Research nodes buy research directly. Ordinary hex taps inspect cities before units, even while a unit is leaving that city; a unit marker selects that unit. Native disabled buttons show a reason icon or countdown. Settlers do not show military refits.

The always-available book opens a searchable, scrollable icon manual, the sole exception to the names-and-numbers-only live interface. Its picker intercepts input before game handlers, including pointer events over disabled controls, and explains the action's current availability. It does not issue commands. Text is escaped before rendering, minimum touch targets are 44 pixels, and the manual traps keyboard focus while open. The match continues while reading.

Presentation events originate in Rust. They carry source, target, unit type, windup or health lost, and an audience captured at event time. Arrows are visible geometry with heads and fletching; volleys have several arrows. Other attacks have shells, tracers or torpedoes; impacts flash health loss with numeric damage. Target pulses mark windup, rings and symbols acknowledge unit abilities, routes acknowledge movement, and ongoing founding, sonar, defence and refitting have distinct persistent effects. Client effects never apply damage. Repeated snapshots deduplicate events, and reconnects skip stale effects.

Losing every completed city immediately and permanently eliminates a civilization, even if it owns settlers or active foundations. Its units disappear, research and launches stop, and commands are rejected. A captured last city takes precedence over finishing a foundation in that tick. The player can inspect the full battlefield as a spectator while treasuries, research and queued orders remain private. The sole surviving civilization wins immediately.

Each visible territory hex names its controlling city in the authoritative view. Unknown enemy city locations are withheld. Coloured outlines separate cities, including friendly neighbours; selection strengthens the tint and boundary of that city alone. Overlaps use distance to the city, then stable founding order.
