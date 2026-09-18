//! Reproducible adversarial play-style audit, excluded from production WASM.
//! These shallow heuristics are probes for exploits, not a proof of strategic depth.
use super::*;
pub const NAMES: [&str; 8] = [
    "mixed_builtin",
    "science_rush",
    "territory_swarm",
    "fortress",
    "naval_control",
    "strike_raider",
    "economy_first",
    "adaptive_denial",
];
fn act(g: &mut Game, p: usize, kind: &str, from: usize, to: usize, value: u8) -> bool {
    g.command(p, kind, from, to, value).is_ok()
}
pub fn policy(g: &mut Game, p: usize, id: usize) {
    if !g.players[p].alive || g.players[p].orders < 1. || g.tick < g.players[p].cooldown {
        return;
    }
    if g.players[p].doctrine < 0
        && act(
            g,
            p,
            "doctrine",
            0,
            0,
            if matches!(id, 1 | 6 | 7) {
                1
            } else if id == 4 {
                2
            } else {
                0
            },
        )
    {
        return;
    }
    let own: Vec<usize> = g
        .tiles
        .iter()
        .enumerate()
        .filter(|(_, t)| t.owner == p as i8)
        .map(|(i, _)| i)
        .collect();
    if own.is_empty() {
        return;
    }
    let player = g.players[p].clone();
    let buildings = |b: u8| {
        own.iter()
            .filter(|&&i| g.tiles[i].building == b || g.tiles[i].next == b)
            .count()
    };
    let academies = buildings(3);
    let farms = buildings(1);
    let markets = buildings(2);
    let forts = buildings(4);
    let empty = own
        .iter()
        .copied()
        .find(|&i| g.tiles[i].building == 0 && g.tiles[i].work == 0);
    let base = *own
        .iter()
        .max_by(|&&a, &&b| g.tiles[a].army.total_cmp(&g.tiles[b].army))
        .unwrap();
    // Every probe understands the new production rules; comparison does not rely
    // on starving old policies of a resource they were never taught to produce.
    let factory_target = if matches!(id, 4 | 5 | 7) { 2 } else { 1 };
    if !matches!(id, 2 | 3)
        && (player.tech[1] >= 3 || player.tech[2] >= 2)
        && buildings(7) < factory_target
        && player.industry < 220.
    {
        let factory = own
            .iter()
            .copied()
            .filter(|&i| g.tiles[i].work == 0 && g.tiles[i].building == 0)
            .max_by_key(|&i| {
                if g.tiles[i].site || g.tiles[i].terrain == 4 {
                    2
                } else {
                    1
                }
            });
        if let Some(i) = factory {
            if act(g, p, "build", i, 0, 7) {
                return;
            }
        }
    }
    if id == 0 {
        g.heuristic_bot(p);
        return;
    }
    let beacon = g
        .tiles
        .iter()
        .any(|t| t.owner >= 0 && t.owner != p as i8 && t.building == 6);
    if id == 7 && g.tick > 660 && g.tick % 180 < 8 && player.gold > 400. && player.science > 180. {
        let desired = if beacon { 0 } else { 1 };
        if player.doctrine != desired && act(g, p, "doctrine", 0, 0, desired as u8) {
            return;
        }
    }
    if (id == 4 || id == 5 || id == 7) && g.modern_bot(p) {
        return;
    }
    if !matches!(id, 2 | 3)
        && player.tech[1] >= 3
        && g.tick >= 660
        && !g.tiles[base].near.iter().any(|&i| {
            g.tiles[i].owner == p as i8 && (g.tiles[i].building == 4 || g.tiles[i].next == 4)
        })
    {
        if let Some(guard) = g.tiles[base].near.iter().copied().find(|&i| {
            g.tiles[i].owner == p as i8 && g.tiles[i].work == 0 && g.tiles[i].building != 6
        }) {
            if act(g, p, "build", guard, 0, 4) {
                return;
            }
        }
    }
    if !matches!(id, 2 | 3) && act(g, p, "build", base, 0, 6) {
        return;
    }
    // Adaptive play reacts to public launch beacons with an interrupt capability.
    let branches = match id {
        1 => [1, 2, 0],
        2 => [2, 0, 1],
        3 => [0, 2, 1],
        4 => [2, 0, 1],
        5 => [0, 1, 2],
        6 => [2, 1, 0],
        _ => {
            if beacon {
                [0, 1, 2]
            } else {
                [1, 2, 0]
            }
        }
    };
    let targets = match id {
        1 => [0, 4, 2],
        2 => [0, 0, 2],
        3 => [3, 1, 1],
        4 => [3, 4, 2],
        5 => [4, 4, 2],
        6 => [1, 4, 3],
        _ => {
            if beacon {
                [3, 4, 2]
            } else {
                [2, 4, 2]
            }
        }
    };
    // A pure swarm deliberately forgoes research until the first land expansion.
    if player.research < 0 && (id != 2 || own.len() > 8) {
        for b in branches {
            if player.tech[b] < targets[b] && act(g, p, "research", 0, 0, b as u8) {
                return;
            }
        }
    }
    if let Some(i) = empty {
        if (player.food < 70. || farms == 0 && g.tick > 90) && act(g, p, "build", i, 0, 1) {
            return;
        }
        let cap = [2, 6, 0, 1, 2, 3, 2, 4][id];
        if academies < cap && g.tick > 20 && act(g, p, "build", i, 0, 3) {
            return;
        }
        if id == 6 && markets < 6 && act(g, p, "build", i, 0, 2) {
            return;
        }
        if id == 3 && forts < 4 && act(g, p, "build", i, 0, 4) {
            return;
        }
    }
    let mut best = None;
    for &from in &own {
        if g.tiles[from].army < 12. {
            continue;
        }
        for to in 0..g.tiles.len() {
            let t = &g.tiles[to];
            if t.terrain == 0 || t.owner == p as i8 || !(g.visible(p, to) || t.site) {
                continue;
            }
            if let Some(path) = g.path(p, from, to) {
                let atk = g.tiles[from].army * 0.8 * (1. + player.tech[0] as f32 * 0.16);
                let observed = g.visible(p, to);
                let def = (if observed { t.army } else { 40. })
                    * (1.3
                        + if observed && t.building == 4 {
                            0.55
                        } else {
                            0.
                        })
                    * if observed && t.suppression > 0 {
                        0.7
                    } else {
                        1.
                    };
                if atk < def + 2. {
                    continue;
                }
                let score = (atk - def) / path.len() as f32
                    + if t.capital >= 0 { 35. } else { 0. }
                    + if t.site {
                        if matches!(id, 2 | 3 | 7) {
                            90.
                        } else {
                            45.
                        }
                    } else {
                        0.
                    }
                    + if t.building == 6 { 200. } else { 0. }
                    + if t.owner < 0 {
                        if id == 2 {
                            30.
                        } else {
                            9.
                        }
                    } else if id == 3 || id == 5 {
                        25.
                    } else {
                        0.
                    };
                if best.map_or(true, |(v, _, _)| score > v) {
                    best = Some((score, from, to));
                }
            }
        }
    }
    if let Some((_, from, to)) = best {
        if act(g, p, "march", from, to, 1) {
            return;
        }
    }
    let frontier: Vec<usize> = own
        .iter()
        .copied()
        .filter(|&i| {
            g.tiles[i]
                .near
                .iter()
                .any(|&j| g.tiles[j].terrain > 0 && g.tiles[j].owner != p as i8)
        })
        .collect();
    for &from in &own {
        if g.tiles[from].army < 30. || frontier.contains(&from) {
            continue;
        }
        if let Some(&to) = frontier
            .iter()
            .filter(|&&i| {
                g.tiles[i].army < 100.
                    && g.path(p, from, i).is_some()
                    && !g.marches.iter().any(|m| m.owner == p && m.to == i)
            })
            .min_by(|&&a, &&b| {
                dot(g.tiles[from].p, g.tiles[b].p).total_cmp(&dot(g.tiles[from].p, g.tiles[a].p))
            })
        {
            if act(g, p, "march", from, to, 1) {
                return;
            }
        }
    }
    if let Some(i) = empty {
        let b = if player.food < 150. {
            1
        } else if markets < 3 {
            2
        } else if id == 1 || id == 6 {
            3
        } else {
            4
        };
        act(g, p, "build", i, 0, b);
    }
}
pub fn tournament(seed_count: usize) -> serde_json::Value {
    let mut wins = [0u32; 8];
    let mut entries = [0u32; 8];
    let mut totals = [0u32; 8];
    let mut games = vec![];
    for seed_index in 0..seed_count {
        eprintln!("Balance seed {}/{}", seed_index + 1, seed_count);
        for rotation in 0..8 {
            let seed = hash(90001 + seed_index as u32 * 733);
            let mut g = Game::new(seed, 8, 2);
            for (p, x) in g.players.iter_mut().enumerate() {
                x.bot = false;
                x.civ = ((p + seed_index) % 8) as u8;
            }
            let mut commands = [0u32; 8];
            let mut modern = [0usize; 8];
            while g.winner < 0 {
                g.step(1);
                if g.winner >= 0 {
                    break;
                }
                for p in 0..8 {
                    if g.tick % 8 != p as u32 {
                        continue;
                    }
                    let id = (p + rotation) % 8;
                    let before = g.players[p].orders;
                    policy(&mut g, p, id);
                    if g.players[p].orders < before {
                        commands[id] += 1;
                    }
                    modern[id] = modern[id].max(g.squads.iter().filter(|s| s.owner == p).count());
                }
            }
            let winner = (g.winner as usize + rotation) % 8;
            wins[winner] += 1;
            for id in 0..8 {
                entries[id] += 1;
                totals[id] += commands[id];
            }
            games.push(serde_json::json!({"seed":seed,"rotation":rotation,"winner":NAMES[winner],"tick":g.tick,"victory":g.victory,"commands":commands,"max_units":modern,"scores":g.players.iter().map(|p|p.score).collect::<Vec<_>>()}));
        }
    }
    serde_json::json!({"rules":"Objective-only 20-25-minute target; no score timeout or free orbital progress; 420 funded orbital points or 720 banked territorial influence; frontier hubs and industrial supply; fort recruitment bonus 0.15 per economy pulse; identical 8-second decision opportunities; policies use observations and public beacons/hubs; 8 seat rotations per seed", "limitation":"A finite tournament of shallow heuristics cannot prove the absence of an undiscovered dominant strategy, nor chess-level complexity.","names":NAMES,"wins":wins,"entries":entries,"total_commands":totals,"games":games})
}
