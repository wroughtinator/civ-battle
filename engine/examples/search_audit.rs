//! Equal-opportunity paired evaluation: same planner/evaluator, only depth differs.
use meridian_engine::{audit, search, Game};
use std::time::Instant;
fn main() {
    let seeds: u32 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(2);
    let rotations: usize = std::env::args()
        .nth(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or(8);
    let seed_offset: u32 = std::env::args()
        .nth(3)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let mut games = vec![];
    let mut wins = [0; 3];
    let mut micros = [0u128; 2];
    let mut calls = [0u64; 2];
    let mut max_nodes = [0; 2];
    for seed_index in 0..seeds {
        let seed = 91731 + (seed_index + seed_offset) * 733;
        for rotation in 0..rotations {
            let started = Instant::now();
            let mut g = Game::new(seed, 8, 2);
            for x in &mut g.players {
                x.bot = false;
            }
            let mut commands = [0; 8];
            while g.winner < 0 && g.tick < 4800 {
                g.step(1);
                if g.winner >= 0 {
                    break;
                }
                for p in 0..8 {
                    if g.tick % search::DECISION_INTERVAL != p as u32 {
                        continue;
                    }
                    let role = (p + rotation) % 8;
                    let before = g.players[p].orders;
                    if role < 2 {
                        let clock = Instant::now();
                        let plan = search::plan(&g, p, if role == 0 { 1 } else { 3 });
                        micros[role] += clock.elapsed().as_micros();
                        calls[role] += 1;
                        max_nodes[role] = max_nodes[role].max(plan.nodes);
                        plan.action.apply(&mut g, p);
                    } else {
                        audit::policy(&mut g, p, 1 + (role - 2 + seed_index as usize) % 7);
                    }
                    if g.players[p].orders < before {
                        commands[role] += 1;
                    }
                }
            }
            let role = if g.winner >= 0 {
                (g.winner as usize + rotation) % 8
            } else {
                8
            };
            wins[role.min(2)] += 1;
            let row = serde_json::json!({"seed":seed,"rotation":rotation,"winner_role":role,"tick":g.tick,"victory":g.victory,"commands":commands,"players":g.players.iter().enumerate().map(|(p,x)|serde_json::json!({"role":(p+rotation)%8,"tech":x.tech,"launch":x.launch,"mandate":x.mandate,"industry":x.industry,"sites":g.tiles.iter().filter(|t|t.owner==p as i8&&t.site).count(),"capitals":g.tiles.iter().filter(|t|t.owner==p as i8&&t.capital>=0).count(),"provinces":g.tiles.iter().filter(|t|t.owner==p as i8).count()})).collect::<Vec<_>>()});
            eprintln!(
                "seed {seed} rotation {rotation}: role {role} won at {}, {:.1}s CPU/wall",
                g.tick,
                started.elapsed().as_secs_f32()
            );
            games.push(row);
        }
    }
    let report = serde_json::json!({"method":"Eight players: depth 1, depth 3, six of seven fixed style probes; identical 12-second action opportunities, identical resources and candidate/evaluation code; maps and seats rotated. Planning uses sanitized observations and estimated enemy state. Role 0=depth 1, role 1=depth 3, other roles=fixed policies. This is a finite empirical test, not a guarantee of superiority.","wins_shallow_deep_other":wins,"calls":calls,"mean_plan_ms":[micros[0] as f64/calls[0] as f64/1000.,micros[1] as f64/calls[1] as f64/1000.],"max_nodes":max_nodes,"games":games});
    std::fs::write(
        "docs/search-results.json",
        serde_json::to_string_pretty(&report).unwrap(),
    )
    .unwrap();
    println!(
        "{}",
        serde_json::json!({"wins":wins,"mean_ms":report["mean_plan_ms"],"max_nodes":max_nodes})
    );
}
