use meridian_engine::{Game, MANDATE_GOAL};
fn peaceful() -> Game {
    let mut g = Game::new(73, 8, 2);
    for p in &mut g.players {
        p.bot = false;
    }
    g
}

#[test]
fn protected_construction_survives_repeated_conventional_strikes() {
    use meridian_engine::Strike;
    let mut exposed = peaceful();
    let at = exposed.tiles.iter().position(|t| t.capital == 0).unwrap();
    exposed.tiles[at].work = 90;
    exposed.tiles[at].next = 6;
    exposed.tiles[at].army = 100.;
    let mut defended = exposed.clone();
    let guard = defended.tiles[at].near[0];
    defended.tiles[guard].owner = 0;
    defended.tiles[guard].building = 4;
    for _ in 0..2 {
        for g in [&mut exposed, &mut defended] {
            g.strikes.push(Strike {
                owner: 1,
                kind: 1,
                from: at,
                to: at,
                left: 1,
                total: 1,
            });
            g.step(60);
        }
    }
    assert_eq!(
        defended.tiles[at].building, 6,
        "a fort network must enable completing a launch site under periodic missiles"
    );
    assert!(defended.players[0].launch > 0);
    assert!(
        exposed.tiles[at].work > 0,
        "exposed construction suffers the longer interruption"
    );
    assert_eq!(
        exposed.tiles[at].next, 6,
        "a conventional strike cannot delete a paid project"
    );
}

#[test]
fn regenerated_worlds_always_have_eight_distinct_frontier_hubs() {
    for seed in 0..64 {
        let g = Game::new(911 + seed * 733, 8, 1);
        let hubs: Vec<_> = g.tiles.iter().filter(|t| t.site).collect();
        assert_eq!(hubs.len(), 8, "seed {seed}");
        assert!(hubs
            .iter()
            .all(|t| t.capital < 0 && t.owner < 0 && t.terrain > 0));
    }
}

#[test]
fn frontier_control_changes_the_territorial_race_and_remains_public() {
    let mut g = peaceful();
    assert_eq!(g.tiles.iter().filter(|t| t.site).count(), 8);
    let hub = g.tiles.iter().position(|t| t.site).unwrap();
    g.step(8);
    assert_eq!(g.players[0].mandate, 2);
    g.tiles[hub].owner = 0;
    g.tiles[hub].army = 73.;
    g.step(8);
    assert_eq!(g.players[0].mandate, 5);
    let cap = g.tiles.iter().position(|t| t.capital == 1).unwrap();
    g.tiles[cap].owner = 0;
    g.step(8);
    assert_eq!(g.players[0].mandate, 10);
    assert_eq!(g.players[1].mandate, 4);
    assert!(g.tactical_view(7)["sites"]
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["tile"] == hub && s["owner"] == 0));
    assert!(g.players.iter().all(|p| p.launch == 0));
}

#[test]
fn rotating_capital_ownership_cannot_reset_banked_control_progress() {
    let mut g = peaceful();
    while g.winner < 0 && g.tick < MANDATE_GOAL as u32 * 4 {
        let shift = (g.tick / 4) % 8;
        for t in &mut g.tiles {
            if t.capital >= 0 {
                t.owner = ((t.capital as u32 + shift) % 8) as i8;
            }
        }
        let before: Vec<_> = g.players.iter().map(|p| p.mandate).collect();
        g.step(4);
        assert!(g.players.iter().zip(before).all(|(p, n)| p.mandate >= n));
    }
    assert!(g.winner >= 0);
    assert_eq!(g.victory, 1);
    assert_eq!(g.players[g.winner as usize].mandate, MANDATE_GOAL);
}

#[test]
fn industrial_centers_reward_position_and_blockade_denies_their_output() {
    let mut g = peaceful();
    let cap = g.tiles.iter().position(|t| t.capital == 0).unwrap();
    let hub = g.tiles.iter().position(|t| t.site).unwrap();
    g.tiles[hub].owner = 0;
    g.tiles[hub].building = 7;
    g.tiles[cap].building = 7;
    let start = g.players[0].industry;
    g.step(5);
    let supplied = g.players[0].industry - start;
    g.tiles[hub].unrest = 20;
    let start = g.players[0].industry;
    g.step(5);
    let denied = g.players[0].industry - start;
    assert!(
        supplied - denied > 4.5,
        "disrupting the industrial frontier must matter economically"
    );
    assert!(g.tactical_view(1)["players"][0].get("industry").is_none());
}

#[test]
fn space_requires_a_supplied_industrial_program() {
    let mut g = peaceful();
    let cap = g.tiles.iter().position(|t| t.capital == 0).unwrap();
    g.tiles[cap].building = 6;
    g.players[0].launch = 120;
    g.players[0].industry = 0.;
    g.tiles[cap].unrest = 120;
    g.step(60);
    assert_eq!(g.players[0].launch, 120);
    g.tiles[cap].unrest = 0;
    g.players[0].gold = 500.;
    g.players[0].science = 500.;
    g.players[0].industry = 100.;
    g.step(60);
    assert_eq!(g.players[0].launch, 180);
    assert!(g.players[0].industry < 80.);
}

#[test]
fn strike_and_ground_attack_require_a_coordinated_suppression_window() {
    let mut g = peaceful();
    let from = g.tiles.iter().position(|t| t.capital == 0).unwrap();
    let to = *g.tiles[from]
        .near
        .iter()
        .find(|&&i| g.tiles[i].terrain > 0 && g.tiles[i].capital < 0)
        .unwrap();
    g.tiles[to].owner = 1;
    g.tiles[to].terrain = 1;
    g.tiles[to].building = 0;
    g.tiles[to].army = 100.;
    g.players[0].tech = [3, 2, 3];
    g.players[0].gold = 1000.;
    g.players[0].science = 1000.;
    g.players[0].industry = 200.;
    let mut march_only = g.clone();
    march_only.tiles[from].army = 45.;
    march_only.command(0, "march", from, to, 1).unwrap();
    march_only.step(30);
    assert_eq!(march_only.tiles[to].owner, 1);
    g.command(0, "strike", from, to, 1).unwrap();
    g.step(12);
    let mut strike_only = g.clone();
    strike_only.step(30);
    assert_eq!(strike_only.tiles[to].owner, 1);
    g.tiles[from].army = 45.;
    g.command(0, "march", from, to, 1).unwrap();
    let mut expired = g.clone();
    for _ in 0..18 {
        expired.step(1);
        expired.tiles[to].suppression = 0;
    }
    g.step(18);
    assert_eq!(
        expired.tiles[to].owner, 1,
        "damage without its suppression window is insufficient"
    );
    assert_eq!(
        g.tiles[to].owner, 0,
        "a coordinated follow-up converts suppression into control"
    );
}
