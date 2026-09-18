use meridian_engine::{Game, March, Squad, Strike};
fn game() -> Game {
    let mut g = Game::new(42, 4, 2);
    for p in &mut g.players {
        p.bot = false;
        p.gold = 2000.;
        p.science = 1500.;
        p.food = 500.;
        p.industry = 500.;
        p.orders = 5.;
    }
    g
}
fn unit(id: usize, owner: usize, kind: u8, tile: usize, hp: f32) -> Squad {
    Squad {
        id,
        owner,
        kind,
        tile,
        to: tile,
        path: vec![tile],
        left: 0,
        total: 0,
        hp,
        ready: 0,
        revealed: 0,
    }
}
#[test]
fn hidden_information_is_removed_before_serialization() {
    let mut g = game();
    let hidden = g.tiles.iter().position(|t| t.capital == 1).unwrap();
    g.tiles[hidden].army = 133.;
    g.tiles[hidden].building = 4;
    g.players[1].tech = [4, 4, 4];
    let view = g.tactical_view(0);
    assert_eq!(view["tiles"][hidden]["army"], -1);
    assert_eq!(view["tiles"][hidden]["owner"], -2);
    assert_eq!(view["tiles"][hidden]["building"], 0);
    assert!(view["players"][1].get("tech").is_none());
    assert!(view["players"][1].get("gold").is_none());
}
#[test]
fn satellites_expire_and_do_not_reveal_submarines() {
    let mut g = game();
    let sea = g.tiles.iter().position(|t| t.terrain == 0).unwrap();
    g.players[0].tech[1] = 4;
    g.squads.push(unit(0, 1, 2, sea, 45.));
    assert!(g.command(0, "satellite", 0, 0, 0).is_ok());
    assert!(g.visible(0, sea));
    assert!(!g.squad_visible(0, &g.squads[0]));
    g.squads.push(unit(1, 0, 1, sea, 65.));
    assert!(g.squad_visible(0, &g.squads[0]));
    g.squads.clear();
    g.step(120);
    assert_eq!(g.players[0].satellite, 0);
}
#[test]
fn training_requires_owned_harbor_and_correct_tech() {
    let mut g = game();
    let harbor = g
        .tiles
        .iter()
        .position(|t| t.terrain > 0 && t.near.iter().any(|&i| g.tiles[i].terrain == 0))
        .unwrap();
    g.tiles[harbor].owner = 0;
    g.players[0].tech[2] = 2;
    assert_eq!(g.command(0, "train", harbor, 0, 1), Err(6));
    g.tiles[harbor].building = 5;
    assert!(g.command(0, "train", harbor, 0, 1).is_ok());
    assert_eq!(g.squads[0].left, 20);
    assert_eq!(g.tiles[g.squads[0].tile].terrain, 0);
    assert_eq!(g.players[0].gold, 1900.);
    g.step(20);
    let id = g.squads[0].id;
    assert_eq!(g.command(1, "maneuver", id, harbor, 0), Err(3));
    assert_eq!(g.command(0, "maneuver", id, harbor, 0), Err(4));
}
#[test]
fn submarines_counter_unescorted_surface_fleets() {
    let mut g = game();
    let at = g.tiles.iter().position(|t| t.terrain == 0).unwrap();
    g.squads.push(unit(0, 0, 2, at, 45.));
    g.squads.push(unit(1, 1, 1, at, 65.));
    g.step(15);
    assert!(g.squads.iter().any(|s| s.owner == 0));
    assert!(!g.squads.iter().any(|s| s.owner == 1));
}
#[test]
fn transport_losses_are_lower_with_a_surface_escort() {
    let mut g = game();
    let at = g.tiles.iter().position(|t| t.terrain == 0).unwrap();
    g.marches.push(March {
        owner: 0,
        from: at,
        to: at,
        army: 50.,
        path: vec![at],
        left: 60,
        total: 60,
    });
    g.squads.push(unit(0, 1, 2, at, 45.));
    let mut escorted = g.clone();
    escorted.squads.push(unit(1, 0, 1, at, 65.));
    g.step(5);
    escorted.step(5);
    assert_eq!(g.marches[0].army, 41.);
    assert_eq!(escorted.marches[0].army, 48.);
}
#[test]
fn storms_weaken_drones_and_satellites_counter_that_penalty() {
    let mut g = game();
    let at = (0..g.tiles.len())
        .max_by(|&a, &b| g.storm(a).total_cmp(&g.storm(b)))
        .unwrap();
    g.tiles[at].army = 100.;
    g.tiles[at].building = 0;
    for i in g.tiles[at].near.clone() {
        g.tiles[i].building = 0;
    }
    g.strikes.push(Strike {
        owner: 0,
        kind: 0,
        from: at,
        to: at,
        left: 1,
        total: 1,
    });
    let mut guided = g.clone();
    guided.players[0].satellite = 120;
    g.step(1);
    guided.step(1);
    assert!(g.tiles[at].army > guided.tiles[at].army + 10.);
    assert_eq!(guided.tiles[at].army, 70.);
}
#[test]
fn fort_network_reduces_missile_disruption() {
    let mut g = game();
    let at = g
        .tiles
        .iter()
        .position(|t| t.owner == 0 && t.capital == 0)
        .unwrap();
    g.tiles[at].building = 6;
    g.tiles[at].army = 100.;
    g.strikes.push(Strike {
        owner: 1,
        kind: 1,
        from: at,
        to: at,
        left: 1,
        total: 1,
    });
    let mut defended = g.clone();
    let near = defended.tiles[at].near[0];
    defended.tiles[near].owner = 0;
    defended.tiles[near].building = 4;
    g.step(1);
    defended.step(1);
    assert_eq!(g.tiles[at].unrest, 24);
    assert_eq!(defended.tiles[at].unrest, 11);
    assert!(defended.tiles[at].army > g.tiles[at].army);
}
#[test]
fn nuclear_strikes_are_late_expensive_and_have_friendly_fire() {
    let mut g = game();
    let from = g.tiles.iter().position(|t| t.capital == 0).unwrap();
    let to = g.tiles[from].near[0];
    g.tiles[to].owner = 1;
    g.players[0].tech = [4, 4, 2];
    g.tick = 839;
    assert_eq!(g.command(0, "strike", from, to, 2), Err(6));
    assert_eq!(g.players[0].gold, 2000.);
    g.tick = 840;
    g.tiles[from].army = 150.;
    g.tiles[to].army = 150.;
    assert!(g.command(0, "strike", from, to, 2).is_ok());
    assert_eq!(g.players[0].gold, 1450.);
    g.step(40);
    assert!(g.tiles[from].army < 100.);
    assert!(g.tiles[to].army < 40.);
    assert!(g.tiles[to].unrest > 80);
}
#[test]
fn click_spam_never_increases_the_command_budget() {
    let mut g = game();
    let from = g.tiles.iter().position(|t| t.capital == 0).unwrap();
    let to = g.tiles[from]
        .near
        .iter()
        .copied()
        .find(|&i| g.tiles[i].owner == 0)
        .unwrap();
    let mut successes = 0;
    for _ in 0..120 {
        g.step(1);
        g.tiles[from].army = 100.;
        for _ in 0..500 {
            if g.command(0, "march", from, to, 1).is_ok() {
                successes += 1;
            }
        }
    }
    assert!(
        successes <= 20,
        "{} accepted commands exceed 5 initial + 15 regenerated",
        successes
    );
}
#[test]
fn doctrine_pivots_have_a_paid_vulnerable_transition() {
    let mut g = game();
    assert_eq!(g.command(0, "doctrine", 0, 0, 1), Err(6));
    g.players[0].tech = [2, 3, 2];
    assert!(g.command(0, "doctrine", 0, 0, 1).is_ok());
    g.step(2);
    let gold = g.players[0].gold;
    let science = g.players[0].science;
    assert!(g.command(0, "doctrine", 0, 0, 2).is_ok());
    assert_eq!(g.players[0].gold, gold - 140.);
    assert_eq!(g.players[0].science, science - 60.);
    assert_eq!(g.players[0].doctrine, 1);
    assert_eq!(g.players[0].doctrine_left, 45);
    g.step(2);
    assert_eq!(g.command(0, "doctrine", 0, 0, 0), Err(6));
    let capital = g.tiles.iter().position(|t| t.capital == 0).unwrap();
    let gold = g.players[0].gold;
    assert!(g.command(0, "train", capital, 0, 0).is_ok());
    assert!((gold - g.players[0].gold - 132.).abs() < 0.01);
    g.step(43);
    assert_eq!(g.players[0].doctrine, 2);
    assert_eq!(g.players[0].doctrine_left, 0);
}
#[test]
fn supplied_units_repair_without_repeated_micro_commands() {
    let mut g = game();
    let at = g.tiles.iter().position(|t| t.capital == 0).unwrap();
    g.squads.push(unit(0, 0, 0, at, 30.));
    g.step(5);
    assert_eq!(g.squads[0].hp, 33.);
}

#[test]
fn domination_requires_a_continuous_four_capital_hold() {
    let mut g = Game::new(123, 8, 1);
    for p in &mut g.players {
        p.bot = false;
    }
    let capitals: Vec<_> = g
        .tiles
        .iter()
        .enumerate()
        .filter(|(_, t)| t.capital >= 0)
        .map(|(i, _)| i)
        .collect();
    // Reset ownership before the fixture assigns exactly four capitals.
    for &i in &capitals {
        g.tiles[i].owner = g.tiles[i].capital;
    }
    let mut capitals = capitals;
    capitals.sort_by_key(|&i| g.tiles[i].capital);
    for &i in capitals.iter().take(4) {
        g.tiles[i].owner = 0;
    }
    g.step(89);
    assert_eq!(g.winner, -1);
    assert_eq!(g.players[0].domination, 89);
    g.tiles[capitals[3]].owner = 1;
    g.step(1);
    assert_eq!(g.players[0].domination, 0);
    g.tiles[capitals[3]].owner = 0;
    g.step(89);
    assert_eq!(g.winner, -1);
    g.step(1);
    assert_eq!(g.winner, 0);
    assert_eq!(g.victory, 1);
}
#[test]
fn cosmetic_emblems_never_change_gameplay() {
    let mut a = game();
    let mut b = a.clone();
    for p in &mut b.players {
        p.civ = (p.civ + 3) % 8;
    }
    a.step(120);
    b.step(120);
    for (p, q) in a.players.iter().zip(&b.players) {
        assert_eq!(p.gold, q.gold);
        assert_eq!(p.food, q.food);
        assert_eq!(p.science, q.science);
        assert_eq!(p.orders, q.orders);
    }
    for (t, u) in a.tiles.iter().zip(&b.tiles) {
        assert_eq!(t.army, u.army);
    }
}
#[test]
fn armor_breaks_plain_fortifications_but_mountains_counter_it() {
    let mut plain = game();
    plain.players[0].tech = [3, 3, 2];
    let at = plain.tiles.iter().position(|t| t.capital == 1).unwrap();
    plain.tiles[at].terrain = 1;
    plain.tiles[at].building = 4;
    plain.tiles[at].army = 90.;
    let mut tank = unit(0, 0, 0, at, 60.);
    tank.left = 1;
    tank.total = 1;
    plain.squads.push(tank);
    let mut mountain = plain.clone();
    mountain.tiles[at].terrain = 4;
    plain.step(1);
    mountain.step(1);
    assert_eq!(plain.tiles[at].owner, 0);
    assert!(plain.squads[0].hp > 0.);
    assert_eq!(mountain.tiles[at].owner, 1);
    assert!(mountain.squads.is_empty());
}
#[test]
fn repeated_sabotage_preserves_milestones_but_cannot_generate_free_launch_progress() {
    let mut g = game();
    let at = g.tiles.iter().position(|t| t.capital == 0).unwrap();
    g.players[0].launch = 125;
    g.tiles[at].building = 0;
    g.step(15);
    assert_eq!(g.players[0].launch, 120);
    g.tick = 1079;
    for _ in 0..400 {
        g.tiles[at].unrest = 90;
        g.step(1);
    }
    assert_eq!(g.players[0].launch, 120);
    assert_eq!(g.winner, -1);
}
#[test]
fn completed_space_milestones_survive_territorial_elimination() {
    let mut g = game();
    g.tick = 1080;
    g.players[0].launch = 137;
    for t in &mut g.tiles {
        if t.owner == 0 {
            t.owner = 1;
        }
    }
    g.step(30);
    assert_eq!(g.players[0].launch, 120);
}
