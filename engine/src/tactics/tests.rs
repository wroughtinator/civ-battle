use super::*;

#[test]
fn smaller_lobbies_keep_the_full_globe_and_neighbouring_eight_player_starts() {
    for seed in [1, 42, 43, 6201, 12345, 4294967295] {
        let full = Game::new(seed, 1);
        let anchor = full.cities.iter().find(|c| c.owner == 0).unwrap().tile;
        let mut starts: Vec<_> = full.cities.iter().map(|c| c.tile).collect();
        starts.sort_by(|&a, &b| {
            crate::dot(full.tiles[b].p, full.tiles[anchor].p)
                .total_cmp(&crate::dot(full.tiles[a].p, full.tiles[anchor].p))
                .then_with(|| a.cmp(&b))
        });
        for count in 2..=8 {
            let g = Game::with_players(seed, count, 1);
            assert_eq!(g.tiles.len(), 642);
            assert_eq!(g.players.len(), count);
            assert_eq!(g.cities.len(), count);
            assert_eq!(g.tiles.iter().filter(|t| t.capital >= 0).count(), count);
            assert_eq!(g.capital_goal(), count.div_ceil(2).max(2));
            for (a, b) in g.tiles.iter().zip(&full.tiles) {
                assert_eq!(a.p, b.p);
                assert_eq!(a.terrain, b.terrain);
                assert_eq!(a.near, b.near);
            }
            for p in 0..count {
                let city = g.cities.iter().find(|c| c.owner == p).unwrap();
                assert_eq!(city.capital, p as i8);
                assert_eq!(g.squads.iter().filter(|u| u.owner == p).count(), 3);
                if count < 8 {
                    assert_eq!(city.tile, starts[p]);
                }
            }
            assert!(g.squads.iter().all(|u| u.owner < count || u.owner == 8));
        }
    }
}

#[test]
fn every_lobby_size_simulates_restores_and_rejects_nonexistent_players() {
    for count in 2..=8 {
        let mut g = Game::with_players(42, count, 1);
        for p in &mut g.players {
            p.bot = true;
        }
        g.step(90);
        let bytes = serde_json::to_vec(&g).unwrap();
        let mut restored: Game = serde_json::from_slice(&bytes).unwrap();
        restored.step(30);
        assert_eq!(restored.players.len(), count);
        assert_eq!(
            restored.view(count - 1)["players"]
                .as_array()
                .unwrap()
                .len(),
            count
        );
        assert!(restored.command(count, "research", 0, 0, 1).is_err());
        let view: Value = serde_json::from_slice(&execute(
            &serde_json::to_vec(&json!({"op":"view","state":restored,"player":count})).unwrap(),
        ))
        .unwrap();
        assert_eq!(view["error"], 99);
    }
}

#[test]
fn two_players_have_no_phantom_opponents_and_four_use_two_capitals_for_domination() {
    let mut duel = Game::with_players(42, 2, 1);
    for p in &mut duel.players {
        p.bot = false;
    }
    duel.step(1);
    assert_eq!(duel.winner, -1);
    assert!(duel.players.iter().all(|p| p.domination == 0));
    for c in &mut duel.cities {
        c.owner = 0;
    }
    duel.step(1);
    assert_eq!(duel.winner, 0);
    assert!(!duel.players[1].alive);

    let mut four = Game::with_players(42, 4, 1);
    for p in &mut four.players {
        p.bot = false;
    }
    four.squads.clear();
    four.cities.iter_mut().find(|c| c.owner == 1).unwrap().owner = 0;
    four.control();
    four.step(89);
    assert_eq!(four.winner, -1);
    four.step(1);
    assert_eq!(four.winner, 0);
}

#[test]
fn fifth_city_can_be_founded_with_normal_spacing_cost_and_construction() {
    let mut g = quiet();
    for c in g.cities.iter_mut().take(4) {
        c.owner = 0;
    }
    g.squads.clear();
    g.players[0].gold = 1000.;
    g.control();
    let tile = (0..g.tiles.len()).find(|&t| g.foundable(t)).unwrap();
    g.spawn(0, SETTLER, tile);
    let id = g.squads[0].id;
    g.command(0, "ability", id, 0, 0).unwrap();
    assert_eq!(g.players[0].gold, 865.);
    g.step(45);
    assert_eq!(g.cities.iter().filter(|c| c.owner == 0).count(), 5);
    assert!(!g.squads.iter().any(|u| u.id == id));
}

#[test]
fn territory_projection_matches_actual_city_control_and_respects_fog() {
    let mut g = quiet();
    g.squads.clear();
    for t in &mut g.tiles {
        t.terrain = 1;
    }
    let a = 100;
    let d = g.distances(a);
    let b = (0..g.tiles.len()).find(|&t| d[t] == 2).unwrap();
    g.cities.truncate(2);
    g.cities[0].tile = a;
    g.cities[1].tile = b;
    for c in &mut g.cities {
        c.owner = 0;
        c.radius = 3;
    }
    g.control();
    let source = g.territory_sources();
    let db = g.distances(b);
    let tie = (0..g.tiles.len())
        .find(|&t| d[t] == db[t] && d[t] <= 3)
        .unwrap();
    assert_eq!(source[tie], Some(0));
    assert_eq!(source[b], Some(1));
    let view = g.view(0);
    for (i, src) in source.iter().enumerate() {
        assert_eq!(
            view["tiles"][i]["city"],
            json!(src.map(|n| g.cities[n].tile))
        );
        assert_eq!(g.tiles[i].owner == 0, src.is_some());
    }
    // Seeing a far edge of an enemy territory must not disclose its unseen centre.
    let observer_tile = (0..g.tiles.len())
        .find(|&t| d[t] == 5 && db[t] >= 5)
        .unwrap();
    g.spawn(1, 0, observer_tile);
    let enemy_view = g.view(1);
    assert!(enemy_view["tiles"]
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["visible"] == true && t["owner"] == 0));
    assert!(enemy_view["tiles"]
        .as_array()
        .unwrap()
        .iter()
        .all(|t| t["city"].is_null()));
}

#[test]
fn last_city_loss_eliminates_settlers_and_becomes_read_only_spectator() {
    let mut g = quiet();
    let tile = g.cities.iter().find(|c| c.owner == 0).unwrap().tile;
    let settler = g
        .squads
        .iter()
        .find(|u| u.owner == 0 && u.kind == SETTLER)
        .unwrap()
        .id;
    g.squads
        .iter_mut()
        .filter(|u| u.id == settler)
        .for_each(|u| {
            u.founding = true;
            u.work = 1;
        });
    g.cities.iter_mut().find(|c| c.tile == tile).unwrap().owner = 1;
    g.players[0].research = 2;
    g.players[0].launch_tile = Some(tile);
    g.players[0].mandate = INFLUENCE_GOAL;
    g.step(1);
    assert!(!g.players[0].alive);
    assert!(!g.squads.iter().any(|u| u.owner == 0));
    assert!(!g.cities.iter().any(|c| c.owner == 0));
    assert_eq!(g.players[0].research, -1);
    assert_eq!(g.players[0].launch_tile, None);
    assert_eq!(g.command(0, "ability", settler, 0, 0), Err(1));
    assert_ne!(g.winner, 0);
    let view = g.view(0);
    assert_eq!(view["spectator"], true);
    assert!(view["tiles"]
        .as_array()
        .unwrap()
        .iter()
        .all(|t| t["visible"] == true));
    assert!(view["players"][1].get("gold").is_none());
    assert!(view["players"][1].get("research").is_none());
    g.step(60);
    assert!(!g.players[0].alive);
    assert!(!g.squads.iter().any(|u| u.owner == 0));
}

#[test]
fn one_surviving_civilization_wins_without_waiting_for_influence() {
    let mut g = quiet();
    for c in &mut g.cities {
        c.owner = 3;
    }
    g.step(1);
    assert_eq!(g.winner, 3);
    assert_eq!(g.players.iter().filter(|p| p.alive).count(), 1);
}

#[test]
fn shot_and_health_feedback_follow_authority_and_hide_unseen_origins() {
    let (mut g, a, b) = arena();
    g.squads[0].kind = 2;
    let id = g.squads[0].id;
    let before = g.squads[1].hp;
    g.command(0, "attack", id, b, 0).unwrap();
    let shot = g.feedback.iter().find(|e| e.action == "shot").unwrap();
    assert_eq!((shot.from, shot.to, shot.duration), (a, b, 2));
    assert_eq!(g.squads[1].hp, before);
    g.step(2);
    let hit = g.feedback.iter().find(|e| e.action == "hit").unwrap();
    assert!((before - g.squads[1].hp - hit.amount).abs() < 0.001);
    assert_eq!((hit.from, hit.to), (b, b));
    let encoded = serde_json::to_vec(&g).unwrap();
    let restored: Game = serde_json::from_slice(&encoded).unwrap();
    assert_eq!(g.next_feedback, restored.next_feedback);
    assert!(g.feedback.windows(2).all(|w| w[0].id < w[1].id));

    // Move an observer into sight only after the event. Historical shots stay hidden.
    let observer = (2..8)
        .find(|&p| g.feedback[0].audience & (1 << p) == 0)
        .unwrap();
    let hidden_shot_id = format!("{}:shot:{}", g.feedback[0].tick, id);
    g.spawn(observer, 12, g.tiles[a].near[1]);
    let view = g.view(observer);
    assert!(!view["feedback"]
        .as_array()
        .unwrap()
        .iter()
        .any(|e| e["id"] == hidden_shot_id));
    assert!(g.view(0)["feedback"]
        .as_array()
        .unwrap()
        .iter()
        .all(|e| e.get("audience").is_none()));
}
fn quiet() -> Game {
    let mut g = Game::new(42, 1);
    g.players.iter_mut().for_each(|p| p.bot = false);
    g.discoveries.clear();
    g.squads.retain(|u| u.owner < 8);
    g
}
fn arena() -> (Game, usize, usize) {
    let mut g = quiet();
    g.squads.clear();
    let a = 100;
    let b = g.tiles[a].near[0];
    for t in &mut g.tiles {
        t.terrain = 1;
    }
    g.spawn(0, 0, a);
    g.spawn(1, 1, b);
    (g, a, b)
}
#[test]
fn one_treasury_and_unit_unlocks() {
    let mut g = quiet();
    let c = g.cities.iter().find(|c| c.owner == 0).unwrap().tile;
    assert_eq!(g.command(0, "train", c, 0, 3), Err(6));
    g.command(0, "research", 0, 0, 1).unwrap();
    assert_eq!(g.players[0].gold, 105.);
    assert_eq!(g.command(0, "train", c, 0, 0), Err(2));
    g.step(2);
    g.command(0, "train", c, 0, 0).unwrap();
    assert_eq!(g.players[0].gold, 50.);
    g.step(24);
    assert!(g.players[0].unlocked.contains(&1));
    assert!(!g.players[0].unlocked.contains(&3));
}
#[test]
fn physical_capture_requires_occupation_and_can_be_interrupted() {
    let mut g = quiet();
    let tile = g.cities[1].tile;
    let former = g.cities[1].owner;
    g.squads.clear();
    let near = g.tiles[tile].near[0];
    g.spawn((former + 1) % 8, 0, near);
    g.step(20);
    assert_eq!(g.cities[1].owner, former);
    g.squads[0].tile = tile;
    g.squads[0].path = vec![tile];
    g.step(11);
    assert_eq!(g.cities[1].owner, former);
    g.squads[0].tile = near;
    g.step(1);
    assert_eq!(g.cities[1].capture, 0);
    g.squads[0].tile = tile;
    g.step(12);
    assert_ne!(g.cities[1].owner, former);
}
#[test]
fn settlers_found_over_time_and_consume_the_piece() {
    let mut g = quiet();
    g.squads.clear();
    let tile = (0..g.tiles.len()).find(|&t| g.foundable(t)).unwrap();
    g.spawn(0, SETTLER, tile);
    let id = g.squads[0].id;
    g.command(0, "ability", id, 0, 0).unwrap();
    g.step(44);
    assert_eq!(g.cities.len(), 8);
    assert!(g.squads.iter().any(|u| u.id == id));
    g.step(3);
    assert_eq!(g.cities.len(), 9);
    assert!(!g.squads.iter().any(|u| u.id == id));
    assert!(!g.foundable(g.tiles[tile].near[0]));
}
#[test]
fn rerouting_preserves_the_last_step_cooldown() {
    let (mut g, a, b) = arena();
    g.squads.truncate(1);
    let id = g.squads[0].id;
    g.command(0, "move", id, b, 0).unwrap();
    let committed = g.squads[0].left;
    g.step(2);
    let farther = g.tiles[b].near.iter().copied().find(|&t| t != a).unwrap();
    g.command(0, "move", id, farther, 0).unwrap();
    assert_eq!(&g.squads[0].path[..2], &[b, farther]);
    assert_eq!(g.squads[0].tile, b);
    assert_eq!(g.squads[0].left, committed - 2);
    g.step((committed - 3) as u32);
    assert_eq!(g.squads[0].tile, b);
    g.step(1);
    assert_eq!(g.squads[0].tile, farther);
}
#[test]
fn competing_movement_never_stacks() {
    let (mut g, a, b) = arena();
    g.squads[1].owner = 0;
    let dest = g.tiles[a]
        .near
        .iter()
        .copied()
        .find(|&t| t != b && g.tiles[b].near.contains(&t))
        .unwrap();
    for u in &mut g.squads {
        u.path = vec![u.tile, dest];
        u.left = 1;
        u.total = 7;
        u.to = dest;
    }
    g.step(1);
    assert_eq!(g.squads.iter().filter(|u| u.tile == dest).count(), 1);
    assert_ne!(g.squads[0].tile, g.squads[1].tile);
}
#[test]
fn counters_have_a_cycle_and_artillery_a_dead_zone() {
    let (mut g, a, b) = arena();
    let mut guard = g.squads[0].clone();
    let mut other = g.squads[1].clone();
    assert!(g.damage(&guard, &other) > g.damage(&other, &guard));
    guard.kind = 2;
    other.kind = 0;
    assert!(g.damage(&guard, &other) > g.damage(&other, &guard));
    guard.kind = 1;
    other.kind = 2;
    assert!(g.damage(&guard, &other) > g.damage(&other, &guard));
    g.squads[0].kind = 4;
    g.squads[0].hp = 200.;
    g.squads[1].kind = 0;
    g.squads[1].hp = 200.;
    g.command(1, "attack", g.squads[1].id, a, 0).unwrap();
    g.step(25);
    assert!(g.squads.iter().find(|u| u.tile == a).unwrap().hp < 200.);
    assert_eq!(g.squads.iter().find(|u| u.tile == b).unwrap().hp, 200.);
}
#[test]
fn invisible_submarines_and_enemy_intentions_are_filtered() {
    let (mut g, a, b) = arena();
    g.squads[1].kind = 8;
    g.squads[1].mode = 1;
    let t = g.distances(a).iter().position(|&d| d == 2).unwrap();
    g.squads[1].tile = t;
    g.squads[1].to = b;
    g.squads[1].path = vec![t, b];
    let view = g.view(0);
    assert_eq!(view["squads"].as_array().unwrap().len(), 1);
    assert!(view["players"][1]["gold"].is_null());
    g.squads[0].kind = 7;
    g.squads[0].mode = 2;
    g.squads[0].effect_until = 20;
    let view = g.view(0);
    let enemy = &view["squads"][1];
    assert_eq!(enemy["path"].as_array().unwrap().len(), 1);
    assert_eq!(enemy["to"], t);
}
#[test]
fn stale_or_foreign_commands_do_not_spend() {
    let mut g = quiet();
    let enemy = g.squads.iter().find(|u| u.owner == 1).unwrap().id;
    let before = g.players[0].gold;
    assert_eq!(g.command(0, "move", enemy, 0, 0), Err(3));
    assert_eq!(g.command(0, "ability", enemy, 0, 0), Err(3));
    assert_eq!(g.players[0].gold, before);
}
#[test]
fn deterministic_restore_and_occupancy_over_a_match() {
    let mut a = Game::new(7201, 0);
    a.players.iter_mut().for_each(|p| p.bot = true);
    a.step(120);
    let mut b: Game = serde_json::from_slice(&serde_json::to_vec(&a).unwrap()).unwrap();
    a.step(60);
    b.step(60);
    assert_eq!(
        serde_json::to_value(&a).unwrap(),
        serde_json::to_value(&b).unwrap()
    );
    let mut occupied = std::collections::BTreeSet::new();
    for u in &a.squads {
        assert!(occupied.insert(u.tile));
    }
    assert!(a.players.iter().all(|p| p.gold >= 0.));
}
#[test]
fn no_score_timeout_and_finite_territorial_objective() {
    let mut g = quiet();
    g.step(1200);
    assert_eq!(g.winner, -1);
    g.step(960);
    assert!(g.winner >= 0);
    assert_eq!(g.players[g.winner as usize].mandate, INFLUENCE_GOAL);
}
#[test]
fn discoveries_are_secret_single_use_and_do_not_stack() {
    let mut g = quiet();
    g.seed_discoveries(999);
    let p = 0;
    let v = g.vision(p);
    let view = g.view(p);
    assert!(view["discoveries"]
        .as_array()
        .unwrap()
        .iter()
        .all(|d| v[d["tile"].as_u64().unwrap() as usize]));
    let n = g.discoveries.iter().position(|d| d.kind == 2).unwrap();
    let tile = g.discoveries[n].tile;
    g.squads.clear();
    g.spawn(p, 0, tile);
    let id = g.squads[0].id;
    g.command(p, "explore", id, 0, 0).unwrap();
    assert_eq!(g.squads.len(), 2);
    assert_ne!(g.squads[0].tile, g.squads[1].tile);
    g.step(2);
    assert_eq!(g.command(p, "explore", id, 0, 0), Err(6));
}
#[test]
fn encounter_distribution_has_ten_types_and_quarter_density() {
    let mut counts = [0; 10];
    let mut eligible = 0;
    for seed in 1..25 {
        let mut g = quiet();
        g.seed_discoveries(seed);
        for t in 0..g.tiles.len() {
            if g.tiles[t].terrain > 0 && g.cities.iter().all(|c| g.distances(c.tile)[t] >= 4) {
                eligible += 1;
            }
        }
        for d in g.discoveries {
            counts[d.kind as usize] += 1;
        }
    }
    let total: usize = counts.iter().sum();
    assert!((0.21..0.29).contains(&(total as f32 / eligible as f32)));
    assert!(counts.iter().all(|&n| n > 0));
    assert!(counts[0] > counts[9] * 3);
}

#[test]
fn refit_costs_the_same_currency_and_leaves_a_vulnerable_piece() {
    let mut g = quiet();
    let i = g
        .squads
        .iter()
        .position(|u| u.owner == 0 && u.kind == 0)
        .unwrap();
    let id = g.squads[i].id;
    g.players[0].unlocked.push(3);
    g.players[0].gold = 200.;
    g.command(0, "refit", id, 0, 3).unwrap();
    assert_eq!(g.players[0].gold, 62.5);
    assert_eq!(g.command(0, "move", id, 0, 0), Err(2));
    g.step(19);
    assert_eq!(g.squads.iter().find(|u| u.id == id).unwrap().kind, 0);
    g.step(1);
    assert_eq!(g.squads.iter().find(|u| u.id == id).unwrap().kind, 3);
}
#[test]
fn ballistic_strikes_warn_and_damage_friendly_pieces() {
    let (mut g, a, b) = arena();
    g.squads[0].kind = 11;
    g.squads[1].owner = 0;
    g.squads[1].kind = 13;
    g.players[0].gold = 500.;
    let id = g.squads[0].id;
    g.command(0, "ability", id, b, 0).unwrap();
    assert_eq!(g.strikes[0].left, 14);
    g.step(13);
    assert!(g.occupant(b).is_some());
    g.step(1);
    assert!(g.occupant(b).is_none());
    assert!(g.occupant(a).is_none());
}
#[test]
fn launch_needs_an_occupied_production_city_and_can_be_disrupted() {
    let mut g = quiet();
    let tile = g.cities.iter().find(|c| c.owner == 0).unwrap().tile;
    g.cities
        .iter_mut()
        .find(|c| c.tile == tile)
        .unwrap()
        .production = 3;
    g.squads.clear();
    g.spawn(0, 10, tile);
    g.players[0].gold = 500.;
    let id = g.squads[0].id;
    g.command(0, "ability", id, 0, 0).unwrap();
    g.step(30);
    assert_eq!(g.players[0].launch, 30);
    g.squads.clear();
    g.step(15);
    assert_eq!(g.players[0].launch, 0);
    assert_eq!(g.players[0].launch_tile, None);
}
#[test]
fn concealed_world_changes_do_not_change_the_bot_order() {
    let mut a = quiet();
    a.tick = 300;
    a.players[0].gold = 350.;
    let mut b = a.clone();
    let v = a.vision(0);
    b.squads.retain(|u| u.owner == 0 || v[u.tile]);
    b.discoveries.retain(|d| v[d.tile]);
    a.bot_policy(0, 0);
    b.bot_policy(0, 0);
    assert_eq!(a.last_order, b.last_order);
}

#[test]
fn moving_or_standing_near_an_enemy_never_implicitly_attacks() {
    let (mut g, _, _) = arena();
    let hp: Vec<_> = g.squads.iter().map(|u| u.hp).collect();
    g.step(40);
    assert_eq!(g.squads.iter().map(|u| u.hp).collect::<Vec<_>>(), hp);
}

#[test]
fn explicit_attack_commits_once_and_queued_movement_waits() {
    let (mut g, a, b) = arena();
    let id = g.squads[0].id;
    g.command(0, "attack", id, b, 0).unwrap();
    let until = g.squads[0].locked_until;
    assert_eq!(g.squads[1].hp, 85.);
    g.step(2);
    assert!(g.squads[1].hp < 85.);
    let damaged = g.squads[1].hp;
    assert_eq!(g.command(0, "disband", id, 0, 0), Err(2));
    assert_eq!(g.command(0, "ability", id, 0, 0), Err(2));
    let to = g.tiles[a].near.iter().copied().find(|&t| t != b).unwrap();
    g.command(0, "move", id, to, 0).unwrap();
    g.step(until - g.tick - 1);
    assert_eq!(g.squads[0].tile, a);
    g.step(30);
    assert_eq!(g.squads[0].tile, to);
    assert_eq!(g.squads[1].hp, damaged);
}

#[test]
fn cannons_punish_clusters_with_explicit_friendly_fire() {
    let (mut g, a, _) = arena();
    g.squads.clear();
    g.tick = 20;
    g.spawn(0, 4, a);
    g.squads[0].moved = 0;
    let target = g.distances(a).iter().position(|&d| d == 2).unwrap();
    g.spawn(1, 0, target);
    for (n, t) in g.tiles[target].near.clone().into_iter().take(3).enumerate() {
        g.spawn(if n == 0 { 0 } else { 1 }, 0, t);
    }
    let before: f32 = g.squads.iter().map(|u| u.hp).sum();
    let id = g.squads[0].id;
    g.command(0, "attack", id, target, 0).unwrap();
    g.step(5);
    let after: f32 = g.squads.iter().map(|u| u.hp).sum();
    assert!(before - after > 70.);
    assert!(g
        .squads
        .iter()
        .any(|u| u.owner == 0 && u.kind == 0 && u.hp < 110.));
}

#[test]
fn disband_frees_a_slot_and_only_refunds_in_friendly_territory() {
    let mut g = quiet();
    let u = g
        .squads
        .iter()
        .find(|u| u.owner == 0 && u.kind == 0)
        .unwrap()
        .clone();
    let before = g.players[0].gold;
    let n = g.squads.len();
    g.command(0, "disband", u.id, 0, 0).unwrap();
    assert_eq!(g.squads.len(), n - 1);
    assert_eq!(g.players[0].gold, before + 13.75);
    assert!(!g.squads.iter().any(|s| s.id == u.id));
}

#[test]
fn planner_keeps_investing_during_a_standing_battle() {
    let (mut g, tile, _) = arena();
    g.cities[0].tile = tile;
    g.tick = 240;
    g.players[0].gold = 900.;
    g.players[0].unlocked = vec![0, 1, 2, 7, 12, 13];
    g.bot_policy(0, 0);
    assert!(
        g.players[0].research >= 0,
        "repeated available attacks must not starve development"
    );
    assert!(g.players[0].gold < 900.);
}

#[test]
fn consumed_discoveries_stay_consumed_in_fog_memory() {
    let mut g = quiet();
    let tile = g.squads.iter().find(|u| u.owner == 0).unwrap().tile;
    g.discoveries.push(Discovery {
        tile,
        kind: 1,
        variant: 42,
        used: false,
        owner: -1,
        seen: 1,
        known_used: 0,
        until: 0,
    });
    let i = g.squads.iter().position(|u| u.owner == 0).unwrap();
    g.claim(i).unwrap();
    g.squads.retain(|u| u.owner != 0);
    g.cities.retain(|c| c.owner != 0);
    assert!(!g.vision(0)[tile]);
    assert_eq!(g.view(0)["discoveries"][0]["used"], true);
    // Another observer's earlier memory does not expose a claim made outside their sight.
    g.discoveries[0].seen |= 2;
    assert!(!g.vision(1)[tile]);
    assert_eq!(g.view(1)["discoveries"][0]["used"], false);
}

#[test]
fn stop_clears_intent_immediately_without_erasing_cooldown() {
    let (mut g, a, b) = arena();
    g.squads.truncate(1);
    let c = g.tiles[b].near.iter().copied().find(|&t| t != a && !g.tiles[a].near.contains(&t)).unwrap();
    let id = g.squads[0].id;
    g.command(0, "move", id, c, 0).unwrap();
    let tile = g.squads[0].tile;
    assert_ne!(tile, a);
    assert!(g.tiles[a].near.contains(&tile));
    let cooldown = g.squads[0].left;
    assert!(cooldown > 0);
    // Stop is available even in the shared order recovery window.
    g.command(0, "stop", id, 0, 0).unwrap();
    assert_eq!(g.squads[0].path, vec![tile]);
    assert_eq!(g.squads[0].to, tile);
    assert_eq!(g.squads[0].left, cooldown);
    g.step(cooldown as u32 + 2);
    assert_eq!(g.squads[0].tile, tile);
    assert_eq!(g.squads[0].left, 0);
}
#[test]
fn land_cannot_enter_water_even_with_an_injected_route() {
    let (mut g, a, b) = arena();
    g.squads.truncate(1);
    g.tiles[b].terrain = 0;
    for kind in [0,1,2,3,4,5,10,11,12,13] {
        g.squads[0].kind = kind;
        assert!(!g.can_enter(kind, b));
        assert!(g.path(&g.squads[0], b).is_none());
        g.squads[0].path = vec![a,b];
        g.movement();
        assert_eq!(g.squads[0].tile, a);
        assert_eq!(g.squads[0].path, vec![a]);
    }
    assert!(g.can_enter(6,b));
    assert!(g.can_enter(7,b));
}

#[test]
fn a_single_step_snaps_immediately_and_keeps_its_full_final_cooldown() {
    let (mut g, a, b) = arena();
    g.squads.truncate(1);
    let id = g.squads[0].id;
    let cost = g.move_cost(&g.squads[0], b);
    g.command(0, "move", id, b, 0).unwrap();
    assert_eq!(g.squads[0].tile, b);
    assert!(g.occupant(a).is_none());
    assert_eq!(g.squads[0].path, vec![b]);
    assert_eq!(g.squads[0].left, cost);
    g.step(cost as u32 - 1);
    assert_eq!(g.squads[0].left, 1);
    g.step(1);
    assert_eq!(g.squads[0].left, 0);
    assert_eq!(g.squads[0].tile, b);
}


fn transport_arena() -> (Game, usize, usize, usize) {
    let (mut g, land, sea) = arena();
    g.squads.truncate(1);
    g.tiles[sea].terrain = 0;
    g.spawn(0, 9, sea);
    let ship = g.squads[1].id;
    (g, land, sea, ship)
}

#[test]
fn transport_boards_all_ground_types_but_not_air_or_sea_and_is_friendly_only() {
    for kind in [0, 1, 2, 3, 4, 5, 10, 11, 12, 13] {
        let (mut g, land, sea, ship) = transport_arena();
        g.squads[0].kind = kind;
        let id = g.squads[0].id;
        assert_eq!(g.path(&g.squads[0], sea), Some(vec![land, sea]));
        g.command(0, "move", id, sea, 0).unwrap();
        assert_eq!(g.squads[0].boarded_on, Some(ship));
        assert_eq!(g.occupant(sea).unwrap().id, ship);
        g.players[0].cooldown = 0;
        for cmd in ["move", "stop", "attack", "ability", "explore", "refit", "disband", "disembark"] {
            assert!(g.command(0, cmd, id, land, 0).is_err(), "{cmd}");
        }
    }
    for kind in [6, 7, 8, 9] {
        let (mut g, _, sea, _) = transport_arena();
        g.squads[0].kind = kind;
        assert!(g.path(&g.squads[0], sea).is_none());
    }
    let (mut g, _, sea, _) = transport_arena();
    g.squads[1].owner = 1;
    assert!(g.path(&g.squads[0], sea).is_none());
    g.squads[1].owner = 0;
    for kind in [7, 8] {
        g.squads[1].kind = kind;
        assert!(g.path(&g.squads[0], sea).is_none());
    }
}

#[test]
fn transport_capacity_rechecks_queued_arrivals_and_never_forms_a_water_bridge() {
    let (mut g, land, sea, ship) = transport_arena();
    let beyond = g.tiles[sea].near.iter().copied().find(|&t| t != land && !g.tiles[land].near.contains(&t)).unwrap();
    // No land route exists: the carrier cannot be used as an intermediate step.
    for t in &mut g.tiles { t.terrain = 0; }
    g.tiles[land].terrain = 1;
    g.tiles[beyond].terrain = 1;
    assert!(g.path(&g.squads[0], beyond).is_none());
    for _ in 0..2 { g.spawn(0, 0, sea); g.squads.last_mut().unwrap().boarded_on = Some(ship); }
    let first = g.squads[0].id;
    g.squads[0].left = 1;
    g.command(0, "move", first, sea, 0).unwrap();
    g.spawn(0, 13, land);
    let last = g.squads.len()-1;
    g.squads[last].path = vec![land, sea];
    g.squads[last].to = sea;
    g.squads[0].left = 0;
    g.move_unit(0);
    g.move_unit(last);
    assert_eq!(g.passenger_count(ship), 3);
    assert_eq!(g.squads[last].tile, land);
    assert_eq!(g.squads[last].boarded_on, None);
}

#[test]
fn transport_moves_restores_and_unloads_one_compatible_passenger_with_cooldown() {
    let (mut g, land, sea, ship) = transport_arena();
    g.squads[0].kind = 3;
    g.squads[0].hp = 53.;
    let tank = g.squads[0].id;
    g.command(0, "move", tank, sea, 0).unwrap();
    g.spawn(0, 13, land);
    let settler = g.squads.last().unwrap().id;
    g.players[0].cooldown = 0;
    g.command(0, "move", settler, sea, 0).unwrap();
    let next = g.tiles[sea].near.iter().copied().find(|&t| t != land).unwrap();
    g.tiles[next].terrain = 0;
    g.players[0].cooldown = 0;
    g.command(0, "move", ship, next, 0).unwrap();
    assert!(g.squads.iter().all(|u| u.tile == next));
    let saved = serde_json::to_vec(&g).unwrap();
    g = serde_json::from_slice(&saved).unwrap();
    assert_eq!(g.passenger_count(ship), 2);
    let landing = g.tiles[next].near.iter().copied().find(|&t| t != sea).unwrap();
    g.tiles[landing].terrain = 4;
    g.players[0].cooldown = 0;
    assert!(g.command(0, "disembark", ship, landing, 0).is_err());
    g.squads[1].left = 0;
    g.command(0, "disembark", ship, landing, 0).unwrap();
    let u = g.squads.iter().find(|u| u.id == settler).unwrap();
    assert_eq!(u.boarded_on, None);
    assert_eq!(u.tile, landing);
    assert!(u.left > 0);
    assert_eq!(g.squads[0].boarded_on, Some(ship));
    assert_eq!(g.squads[0].hp, 53.);
    assert_eq!(g.squads[1].locked_until, g.tick+2);
    g.players[0].cooldown = 0;
    g.squads[1].locked_until = 0;
    assert!(g.command(0, "disembark", ship, landing, 0).is_err());
    assert!(g.command(0, "disembark", ship, sea, 0).is_err());
    g.players[0].unlocked.push(7);
    g.tiles[next].owner = 0;
    assert!(g.command(0, "refit", ship, 0, 7).is_err());
}

#[test]
fn transport_cargo_is_protected_from_splash_but_dies_with_carrier_or_disband() {
    for disband in [false, true] {
        let (mut g, _, sea, ship) = transport_arena();
        let id = g.squads[0].id;
        g.command(0, "move", id, sea, 0).unwrap();
        g.strikes.push(Strike { owner: 1, kind: 1, from: sea, to: sea, left: 1, total: 1 });
        g.combat();
        assert_eq!(g.squads[0].hp, spec(0).hp);
        assert_eq!(g.squads[1].hp, spec(9).hp - 75.);
        assert!(g.view(1)["squads"].as_array().unwrap().iter().all(|u| u["id"] != id));
        if disband {
            g.players[0].cooldown = 0;
            g.command(0, "disband", ship, 0, 0).unwrap();
        } else {
            g.strikes.push(Strike { owner: 1, kind: 2, from: sea, to: sea, left: 1, total: 1 });
            g.combat();
        }
        assert!(g.squads.is_empty());
    }
}

#[test]
fn transport_moving_away_cancels_boarding_and_old_saves_default_to_unboarded() {
    let (mut g, land, sea, ship) = transport_arena();
    let mut old = serde_json::to_value(&g).unwrap();
    for u in old["squads"].as_array_mut().unwrap() { u.as_object_mut().unwrap().remove("boarded_on"); }
    g = serde_json::from_value(old).unwrap();
    assert!(g.squads.iter().all(|u| u.boarded_on.is_none()));
    g.squads[0].left = 1;
    let id = g.squads[0].id;
    g.command(0, "move", id, sea, 0).unwrap();
    let next = g.tiles[sea].near.iter().copied().find(|&t| t != land).unwrap();
    g.tiles[next].terrain = 0;
    g.players[0].cooldown = 0;
    g.command(0, "move", ship, next, 0).unwrap();
    g.squads[0].left = 0;
    g.move_unit(0);
    assert_eq!(g.squads[0].tile, land);
    assert_eq!(g.squads[0].path, vec![land]);
}
