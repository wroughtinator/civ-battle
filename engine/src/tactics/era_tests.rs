use super::*;
fn world()->Game {let mut g=Game::with_players(51000,2,2);g.cache_distances();for p in &mut g.players{p.bot=false;p.gold=10000.;}g.discoveries.clear();g}
#[test]
fn three_eras_have_33_research_units_and_an_acyclic_optional_space_path(){
    let g=world();assert_eq!(technologies().count(),33);
    for era in 0..3{assert_eq!(technologies().filter(|&k|definition(k).era==era).count(),11);}
    let mut unlocked=vec![0,12,13];
    for _ in 0..33 {let k=technologies().find(|k|!unlocked.contains(k)&&definition(*k).prerequisites.iter().all(|p|unlocked.contains(p))).expect("acyclic graph");unlocked.push(k);}
    let mut path=vec![];g.research_path(0,10,&mut path);assert_eq!(path.len(),19);
    for k in technologies(){let (price,time,_,gate)=g.research_info(k).unwrap();assert!(price>0&&time>0);assert_eq!(gate,0);}
}
#[test]
fn research_plans_are_minimal_immediate_and_free_to_cancel() {
    let mut g=world();g.players[0].gold=0.;
    g.command(0,"plan",0,0,1).unwrap();
    assert_eq!(g.players[0].research_queue,vec![14,2,16,15,1]);
    assert_eq!(g.players[0].research,-1);
    g.players[0].gold=10000.;g.command(0,"plan",0,0,1).unwrap();
    assert_eq!(g.players[0].research,14);
    assert_eq!(g.players[0].gold,9982.);
    g.players[0].research_left=1;
    g.command(0,"plan",0,0,19).unwrap();
    assert_eq!(g.players[0].research,19);assert_eq!(g.players[0].gold,9982.);
    assert!(g.players[0].research_queue.is_empty());
    g.command(0,"plan",0,0,255).unwrap();
    assert_eq!(g.players[0].research,-1);assert_eq!(g.players[0].research_left,0);
    assert_eq!(g.players[0].gold,10000.);
    g.command(0,"plan",0,0,255).unwrap();assert_eq!(g.players[0].gold,10000.);
    g.command(0,"plan",0,0,10).unwrap();
    let remaining=std::iter::once(g.players[0].research as u8).chain(g.players[0].research_queue.iter().copied()).collect::<Vec<_>>();
    assert_eq!(remaining.len(),19);
    for &k in &remaining{assert_eq!(remaining.iter().filter(|&&q|q==k).count(),1);}
    for k in [5,6,7,8,9,11,19,20,21,29,30,31,32,34]{assert!(!remaining.contains(&k));}
    let restored:Game=serde_json::from_str(&serde_json::to_string(&g).unwrap()).unwrap();
    assert_eq!(restored.players[0].research_queue,g.players[0].research_queue);
    for _ in 0..600 {g.tick_one(false);}
    assert!(remaining.iter().all(|k|g.players[0].unlocked.contains(k)));
    assert!(!g.players[0].unlocked.contains(&11));
    g.command(0,"plan",0,0,10).unwrap();assert_eq!(g.players[0].research,-1);
}
#[test]
fn directional_front_protects_and_blocks_crossings_but_rear_air_and_allies_bypass(){
    let mut g=world();g.squads.clear();g.tick=100;
    let tile=g.cities[0].tile;for t in &mut g.tiles{t.terrain=1;}
    g.spawn(0,16,tile);let front=g.tiles[tile].near[0];g.squads[0].facing=Some(front);
    let wall=g.squads[0].clone();let rear=*g.tiles[tile].near.iter().find(|&&t|!g.in_front(&wall,t)).unwrap();
    g.spawn(1,2,front);let a=g.squads[1].clone();let mut flank=a.clone();flank.tile=rear;
    assert!((g.damage(&a,&wall)/g.damage(&flank,&wall)-0.25).abs()<0.001);
    assert!(g.guard_blocks(&a,front,rear,None));let mut ally=a.clone();ally.owner=0;assert!(!g.guard_blocks(&ally,front,rear,None));
    let mut flyer=a.clone();flyer.kind=6;assert!(!g.guard_blocks(&flyer,front,rear,None));
    g.command(0,"face",wall.id,rear,0).unwrap();assert_eq!(g.squads[0].locked_until,108);assert!(g.in_front(&g.squads[0],rear));
}
#[test]
fn support_healing_is_automatic_nonstacking_and_respects_unit_roles(){
    let mut g=world();g.squads.clear();g.tick=100;let center=g.cities[0].tile;let near=g.tiles[center].near.clone();
    g.spawn(0,0,center);g.squads[0].hp=40.;g.spawn(0,17,near[0]);g.spawn(0,17,near[1]);
    g.support_units();assert_eq!(g.squads[0].hp,44.);
    g.squads[0].kind=3;g.support_units();assert_eq!(g.squads[0].hp,44.,"herbs do not repair a tank");
    g.squads[1].kind=22;g.support_units();assert_eq!(g.squads[0].hp,48.);
    g.squads[0].hurt=99;g.support_units();assert_eq!(g.squads[0].hp,48.,"recent damage pauses repair");
}
#[test]
fn all_eras_have_real_naval_movement_and_transport_capacity(){
    let g=world();let sea=g.tiles.iter().position(|t|t.terrain==0).unwrap();let land=g.cities[0].tile;
    for k in (0..UNIT_COUNT).filter(|&k|naval(k)){assert!(g.can_enter(k,sea));assert!(!g.can_enter(k,land));}
    assert_eq!(spec(19).boarding_capacity,1);assert_eq!(spec(31).boarding_capacity,4);assert_eq!(spec(9).boarding_capacity,3);
    assert!(g.can_enter(28,sea));assert!(g.can_enter(28,land));
}
#[test]
fn settlers_wait_for_arrival_cooldown_then_found_instead_of_changing_sites(){
    let mut g=world();g.tick=200;g.squads.clear();
    let tile=(0..g.tiles.len()).find(|&t|g.foundable(t)).unwrap();g.spawn(0,SETTLER,tile);
    g.squads[0].left=4;g.squads[0].total=4;g.squads[0].moved=g.tick;
    for _ in 0..40 {g.bot_policy(0,7);g.tick_one(false);}
    assert!(g.cities.iter().any(|c|c.tile==tile&&c.owner==0));
}
#[test]
fn unrelated_orders_and_research_replacement_have_no_global_timer() {
    let mut g=world();let tick=g.tick;
    g.players[0].cooldown=tick+999; // Even a legacy saved cooldown cannot block commands.
    for k in [3,10,19,255,1] {g.command(0,"plan",0,0,k).unwrap();}
    let c=g.cities[0].tile;
    g.command(0,"upgrade",c,0,0).unwrap();g.command(0,"upgrade",c,0,1).unwrap();
    assert_eq!(g.tick,tick);
}
#[test]
fn shield_trucks_protect_allies_from_the_front_without_stacking(){
    let mut g=world();g.squads.clear();g.tick=100;
    let tile=g.cities[0].tile;let near=g.tiles[tile].near.clone();
    g.spawn(0,34,tile);g.squads[0].facing=Some(near[0]);
    g.spawn(0,2,near[1]);g.spawn(1,2,near[0]);
    let shield=g.squads[0].clone();let target=g.squads[1].clone();let shooter=g.squads[2].clone();
    let protected=g.damage(&shooter,&target);g.squads.remove(0);
    let exposed=g.damage(&shooter,&target);assert!((protected/exposed-0.6).abs()<0.001);
    g.squads.push(shield.clone());let mut duplicate=shield.clone();duplicate.id=999;g.squads.push(duplicate);
    assert_eq!(g.damage(&shooter,&target),protected);
    for u in g.squads.iter_mut().filter(|u|u.kind==34){u.left=1;}
    assert_eq!(g.damage(&shooter,&target),exposed);
}
#[test]
fn fireboats_are_consumed_and_their_explosion_can_hit_friends(){
    let mut g=world();g.squads.clear();g.tick=100;
    let tile=100;let target=g.tiles[tile].near[0];
    let friend=*g.tiles[target].near.iter().find(|&&t|t!=tile).unwrap();
    for t in &mut g.tiles{t.terrain=0;}
    g.spawn(0,21,tile);g.spawn(1,29,target);g.spawn(0,29,friend);
    let id=g.squads[0].id;let ally=g.squads[2].id;
    g.command(0,"attack",id,target,0).unwrap();g.step(2);
    assert!(!g.squads.iter().any(|u|u.id==id));
    assert!(g.squads.iter().find(|u|u.id==ally).unwrap().hp<spec(29).hp);
}
#[test]
fn military_and_space_policies_make_distinct_research_choices_under_city_pressure(){
    let mut g=world();g.tick=100;g.squads.clear();let tile=g.cities[0].tile;
    g.spawn(0,0,tile);g.spawn(1,1,g.tiles[tile].near[0]);
    g.players[0].research_queue=vec![1,24,3];g.players[0].gold=200.;
    let mut race=g.clone();g.bot_policy(0,1);race.bot_policy(0,6);
    assert!(g.players[0].research_queue.is_empty(),"military policy saves for an endangered city");
    assert_eq!(race.players[0].research_queue,vec![1,24,3],"space policy accepts the development risk");
}
