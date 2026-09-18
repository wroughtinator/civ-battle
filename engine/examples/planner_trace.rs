use meridian_engine::{audit, search, Game};
fn main() {
    let mut g = Game::new(100527, 8, 2);
    for p in &mut g.players {
        p.bot = false;
    }
    while g.winner < 0 && g.tick < 1300 {
        g.step(1);
        for p in 0..8 {
            if g.tick % 12 != p as u32 {
                continue;
            }
            if p < 2 {
                let plan = search::plan(&g, p, if p == 0 { 1 } else { 3 });
                if p == 1 {
                    println!("{} {:?} => {:.0}; own {} caps {} food {:.0} gold {:.0} sci {:.0} tech {:?}", g.tick, plan.action, plan.value, g.tiles.iter().filter(|t|t.owner == 1).count(), g.tiles.iter().filter(|t|t.owner == 1 && t.capital >= 0).count(),g.players[p].food,g.players[p].gold,g.players[p].science,g.players[p].tech);
                }
                plan.action.apply(&mut g, p);
            } else {
                audit::policy(&mut g, p, p - 1);
            }
        }
    }
}
