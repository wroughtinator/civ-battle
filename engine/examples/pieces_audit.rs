use meridian_engine::tactics::Game;
use serde_json::json;
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let count: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(8);
    let base: u32 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(88000);
    let mixed = args.get(3).is_some_and(|s| s == "mixed");
    let depths = args.get(3).is_some_and(|s| s == "depth");
    for run in 0..count {
        let start = std::time::Instant::now();
        let mut g = Game::new(base + run as u32, 2);
        for p in &mut g.players {
            p.bot = !mixed && !depths;
        }
        let mut captures = 0;
        let mut last: Vec<_> = g.cities.iter().map(|c| c.owner).collect();
        let mut max_units = 0;
        while g.winner < 0 && g.tick < 2200 {
            if mixed || depths {
                for p in 0..8 {
                    if (g.tick + p as u32) % 2 == 0 {
                        if depths {
                            g.difficulty = if p == run % 8 {
                                2
                            } else if p == (run + 4) % 8 {
                                0
                            } else {
                                1
                            };
                        }
                        g.bot_policy(
                            p,
                            if depths || p == run % 8 {
                                0
                            } else {
                                1 + ((p + run) % 6) as u8
                            },
                        );
                    }
                }
            }
            g.step(1);
            max_units = max_units.max(g.squads.iter().filter(|u| u.owner < 8).count());
            for (i, c) in g.cities.iter().enumerate() {
                if let Some(old) = last.get_mut(i) {
                    if *old != c.owner {
                        captures += 1;
                        *old = c.owner;
                    }
                } else {
                    last.push(c.owner);
                }
            }
        }
        println!(
            "{}",
            json!({"seed":g.seed,"mixed":mixed,"depths":depths,"planner_slot":run%8,"winner":g.winner,"victory":g.victory,"mandate":g.players[g.winner.max(0) as usize].mandate,"hold":g.players[g.winner.max(0) as usize].domination,"launch":g.players[g.winner.max(0) as usize].launch,"seconds":g.tick,"cities":g.cities.len(),"captures":captures,"max_units":max_units,"unlocks":g.players.iter().map(|p|p.unlocked.len()).collect::<Vec<_>>(),"found":g.discoveries.iter().filter(|d|d.used).count(),"wall_ms":start.elapsed().as_millis()})
        );
    }
}
