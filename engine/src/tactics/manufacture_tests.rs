use super::*;

fn game() -> Game {
    let mut g=Game::with_players(42,2,1);
    g.squads.clear();
    for t in &mut g.tiles {t.terrain=1;}
    for p in &mut g.players {p.bot=false;p.gold=1000.;}
    g.control();g
}

#[test]
fn manufacture_queue_builds_in_order_and_survives_serialization() {
    let mut g=game();let tile=g.cities[0].tile;
    g.command(0,"enqueue",tile,0,0).unwrap();
    g.command(0,"enqueue",tile,0,12).unwrap();
    assert_eq!(g.cities[0].training,0);
    assert_eq!(g.cities[0].queue,vec![12]);
    let gold=g.players[0].gold;
    let mut restored:Game=serde_json::from_value(serde_json::to_value(&g).unwrap()).unwrap();
    restored.cities[0].left=1;restored.tick=1;restored.development();
    assert!(restored.squads.iter().any(|u|u.owner==0&&u.kind==0));
    assert_eq!(restored.cities[0].training,12);
    assert!(restored.cities[0].queue.is_empty());
    assert_eq!(restored.players[0].gold,gold-spec(12).cost as f32);
}

#[test]
fn manufacture_queue_waits_for_funds_and_clear_keeps_current_unit() {
    let mut g=game();let tile=g.cities[0].tile;g.players[0].gold=0.;
    g.command(0,"enqueue",tile,0,0).unwrap();
    assert_eq!(g.cities[0].training,-1);assert_eq!(g.cities[0].queue,vec![0]);
    g.players[0].gold=500.;g.tick=1;g.development();
    assert_eq!(g.cities[0].training,0);
    g.command(0,"enqueue",tile,0,12).unwrap();
    g.command(0,"clear_queue",tile,0,0).unwrap();
    assert!(g.cities[0].queue.is_empty());assert_eq!(g.cities[0].training,0);
}

#[test]
fn manufacture_queue_is_private_validated_and_bounded() {
    let mut g=game();let tile=g.cities[0].tile;g.players[0].gold=0.;
    assert_eq!(g.command(1,"enqueue",tile,0,0),Err(3));
    assert_eq!(g.command(1,"clear_queue",tile,0,0),Err(3));
    assert_eq!(g.command(0,"enqueue",tile,0,255),Err(6));
    assert_eq!(g.command(0,"enqueue",tile,0,35),Err(6));
    g.players[0].unlocked.push(19);
    assert_eq!(g.command(0,"enqueue",tile,0,19),Err(4));
    for _ in 0..50 {g.command(0,"enqueue",tile,0,0).unwrap();}
    assert_eq!(g.command(0,"enqueue",tile,0,0),Err(6));
    let rival=g.view(1);let c=rival["cities"].as_array().unwrap().iter().find(|c|c["tile"]==tile).unwrap();
    assert_eq!(c["queue"],serde_json::json!([]));
}

#[test]
fn manufacture_queue_waits_for_capacity_and_capture_clears_it() {
    let mut g=game();let tile=g.cities[0].tile;
    for i in 0..g.cap(0) {g.spawn(0,0,(tile+i+10)%g.tiles.len());}
    g.command(0,"enqueue",tile,0,0).unwrap();assert_eq!(g.cities[0].training,-1);
    g.squads.clear();g.tick=1;g.development();assert_eq!(g.cities[0].training,0);
    g.command(0,"enqueue",tile,0,12).unwrap();
    g.spawn(1,0,tile);g.cities[0].claimant=1;g.cities[0].capture=11;
    g.development();assert_eq!(g.cities[0].owner,1);assert!(g.cities[0].queue.is_empty());assert_eq!(g.cities[0].training,-1);
}
