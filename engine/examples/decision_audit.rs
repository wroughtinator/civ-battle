//! Focused, bounded planning experiments; complements rather than replaces the
//! full-game strategy audit. No heuristic score is called a match victory.
#[allow(dead_code)]
#[path="design_audit/search.rs"] mod shared;
use meridian_engine::tactics::{Game,Unit,spec,SPACE_GOAL};
use serde_json::json;
use meridian_engine::tactics::roster::{definition,naval};
use std::time::{Instant,Duration};

#[derive(Clone,Debug)]
struct Order { kind: &'static str, from: usize, to: usize, value:u8 }
impl Order {
    fn new(kind:&'static str,from:usize,to:usize,value:u8)->Self {Self{kind,from,to,value}}
    fn apply(&self,g:&mut Game,p:usize)->bool {self.kind=="wait" || g.command(p,self.kind,self.from,self.to,self.value).is_ok()}
}
fn troop(g:&mut Game,p:usize,k:u8,t:usize) {
    let mut u=g.squads.first().cloned().unwrap_or_else(||serde_json::from_value::<Unit>(json!({
        "id":0,"owner":0,"kind":0,"tile":0,"hp":110.,"to":0,"path":[0],"left":0,"total":0,
        "ready":0,"moved":0,"hurt":0,"ability_ready":0,"mode":0,"effect_until":0,"revealed":0,"work":0,"founding":false
    })).unwrap());
    u.id=g.next_unit;g.next_unit+=1;u.owner=p;u.kind=k;u.tile=t;u.to=t;u.path=vec![t];u.hp=spec(k).hp;
    g.squads.push(u);
}
fn battle(seed:u32)->Game {
    let mut g=shared::fresh(seed,2);g.tick=100;g.discoveries.clear();g.squads.clear();
    // Procedural local skirmishes on the real hex graph. Mixed three-piece
    // forces, terrain and approach directions vary independently of budget.
    let center=(shared::mix(seed) as usize)%g.tiles.len();let d=g.distances(center);
    let sea=shared::mix(seed^0x71)%4==0;let era=(shared::mix(seed^0x91)%3) as usize;
    for (i,t) in g.tiles.iter_mut().enumerate(){if d[i]<7 {t.owner=-1;t.terrain=if sea{0}else if shared::mix(seed^i as u32)%5==0{2}else{1};}}
    let far:Vec<_>=(0..g.tiles.len()).filter(|&i|d[i]>8).take(2).collect();
    for p in 0..2 {g.cities[p].tile=far[p];g.discoveries.push(serde_json::from_value(json!({"tile":center,"kind":5,"variant":0,"used":true,"owner":p,"seen":3,"known_used":3,"until":190})).unwrap());}
    let a=g.tiles[center].near[0];let b=*g.tiles[center].near.last().unwrap();
    let mut spots:Vec<_>=(0..g.tiles.len()).filter(|&i|d[i]<=2).collect();
    spots.sort_by_key(|&i|shared::mix(seed^i as u32));
    for p in 0..2 {
        let dp=g.distances(if p==0{a}else{b});
        let mut locations=spots.clone();locations.sort_by_key(|&i|(dp[i],shared::mix(seed^i as u32)));
        for j in 0..3 {let t=*locations.iter().find(|&&t|g.occupant(t).is_none()).unwrap();
            let pool:Vec<_>=(0..36).filter(|&k|definition(k).era<=era&&naval(k)==sea&&(!matches!(k,10|11|12|13|19|31))&&(j==2||spec(k).damage>0.)).collect();
            let k=pool[(shared::mix(seed.wrapping_add(j)) as usize)%pool.len()];troop(&mut g,p,k,t);
            let enemy=if p==0{b}else{a};let de=g.distances(enemy);g.squads.last_mut().unwrap().facing=g.tiles[t].near.iter().copied().min_by_key(|&t|de[t]);}
    }
    // Cities are outside the arena; this experiment measures combat losses,
    // not conquest. No income can buy reinforcements in either controller.
    for p in &mut g.players {p.gold=0.;p.bot=false;}
    g
}
fn combat_value(g:&Game,p:usize)->f64 {
    let health=|q|g.squads.iter().filter(|u|u.owner==q).map(|u|spec(u.kind).cost as f64*(u.hp.max(0.)/spec(u.kind).hp) as f64).sum::<f64>();
    let a=health(p);let b=health(1-p);if a==0.&&b==0.{0.}else if a==0.{-10000.}else if b==0.{10000.}else{a-b}
}
fn orders(g:&Game,p:usize)->Vec<Order> {
    let mut out=vec![Order::new("wait",0,0,0)];let v=g.vision(p);
    for u in g.squads.iter().filter(|u|u.owner==p) {
        out.push(Order::new("auto",u.id,0,if u.automated {0}else{1}));
        if u.automated || u.left>0 || u.locked_until>g.tick {continue;}
        for &t in &g.tiles[u.tile].near {if g.can_enter(u.kind,t)&&g.occupant(t).is_none()&&!g.guard_blocks(u,u.tile,t,Some(&v)) {out.push(Order::new("move",u.id,t,0));}}
        if definition(u.kind).directional {for &t in &g.tiles[u.tile].near {if Some(t)!=u.facing{out.push(Order::new("face",u.id,t,0));}}}
        for e in g.squads.iter().filter(|e|e.owner!=p&&g.detected(p,e,&v)) {
            if g.distances(u.tile)[e.tile]<=spec(u.kind).range {out.push(Order::new("attack",u.id,e.tile,0));out.push(Order::new("ability",u.id,e.tile,0));}
        }
    }
    // Same deterministic ordering at every budget; never put the known answer
    // first. A larger budget considers more real commands, not stronger stats.
    out.sort_by_key(|o|shared::mix(g.seed ^ g.tick ^ (o.from as u32).wrapping_mul(7919) ^ o.to as u32 ^ (o.kind.as_bytes()[0] as u32).wrapping_mul(104729)));
    out
}
fn tactics(g:&Game,p:usize,budget:usize,horizon:u32,deadline:Instant)->Option<Order> {
    let mut best=None;let mut score=f64::NEG_INFINITY;let mut used=0;
    // Exact visible-state forward simulation. Hidden pieces are removed.
    let vision=g.vision(p);let mut observed=g.clone();observed.squads.retain(|u|g.detected(p,u,&vision));
    for order in orders(&observed,p) {
        if used>=budget || Instant::now()>=deadline {break;}
        let mut b=observed.clone();if !order.apply(&mut b,p){continue;}used+=1;
        for _ in 0..horizon {if Instant::now()>=deadline{return None;}b.tick_one(false);}
        let s=combat_value(&b,p);
        if s>score {score=s;best=Some(order);}
    }
    best
}
fn fight(seed:u32,swap:bool,comparison:u8,deadline:Instant)->Option<serde_json::Value> {
    let mut g=battle(seed);let initial=combat_value(&g,0);let mut spent=[0u32;2];
    let high=usize::from(swap);
    for t in 0..180 {
        if Instant::now()>=deadline{return None;}
        if t%2==0 {
            // Both choose from the same pre-order position; alternate submission
            // priority by tick. Cooldowns and collisions remain authoritative.
            let choices:Vec<_>=(0..2).map(|p|if t%if p!=high&&comparison==2{2}else{8}!=0{None}else{tactics(&g,p,if p==high||comparison==1{32}else{4},if p!=high&&comparison>0{8}else{32},deadline)}).collect();
            for p in [((t/8)%2) as usize,1-((t/8)%2) as usize] {if let Some(o)=&choices[p]{if o.apply(&mut g,p)&&o.kind!="wait"{spent[p]+=1;}}}
        }
        g.tick_one(false);
        if (0..2).any(|p|!g.squads.iter().any(|u|u.owner==p)){break;}
    }
    let delta=combat_value(&g,0)-initial;
    let outcome=if delta.abs()<0.001{0.5}else if (delta>0.)==(high==0){1.}else{0.};
    Some(json!({"seed":seed,"high_seat":high,"high_score":outcome,"remaining_health_value":combat_value(&g,high),"army_eliminated":(0..2).any(|p|!g.squads.iter().any(|u|u.owner==p)),"orders":spent}))
}

#[derive(Clone,Copy,Debug,serde::Serialize)]
struct SpacePlan {production:[usize;2],radius:[usize;2],order:u32}
fn program(seed:u32,index:u32)->SpacePlan {
    let r=shared::mix(seed ^ index.wrapping_mul(104729));
    SpacePlan{production:[(r%7) as usize,((r>>4)%9) as usize],radius:[((r>>9)%12) as usize,((r>>14)%12) as usize],order:r}
}
fn space_world(seed:u32)->Game {
    let mut g=shared::fresh(seed,2);g.discoveries.clear();g.squads.clear();
    for p in &mut g.players {p.bot=false;}
    g
}
fn orbital_path(k:u8, path:&mut Vec<u8>) {
    if path.contains(&k){return;}
    for &parent in &definition(k).prerequisites {orbital_path(parent,path);}
    path.push(k);
}
fn space_order(g:&mut Game,plan:SpacePlan) {
    let p=&g.players[0];if p.cooldown>g.tick{return;}
    let c=g.cities.iter().find(|c|c.owner==0).unwrap().clone();let count=p.unlocked.iter().filter(|&&k|definition(k).researchable).count();
    if let Some(u)=g.squads.iter().find(|u|u.owner==0&&u.kind==10).cloned(){
        if u.tile!=c.tile {if u.path.len()<2 {let _=g.command(0,"move",u.id,c.tile,0);}return;}
        if p.launch_tile.is_none(){let _=g.command(0,"ability",u.id,0,0);}return;
    }
    if p.unlocked.contains(&10)&&c.training<0 {let _=g.command(0,"train",c.tile,0,10);return;}
    if c.production<3&&count>=plan.production[c.production as usize-1] {let _=g.command(0,"upgrade",c.tile,0,1);return;}
    if c.radius<3&&count>=plan.radius[c.radius as usize-1] {let _=g.command(0,"upgrade",c.tile,0,0);return;}
    if p.research<0 {
        let mut path=vec![];orbital_path(10,&mut path);
        let mut tech:Vec<_>=path.into_iter().filter(|k|!p.unlocked.contains(k)).filter(|&k|g.research_info(k).is_some_and(|info|info.2.iter().all(|k|p.unlocked.contains(k))&&g.tick>=info.3)).collect();
        tech.sort_by_key(|&k|shared::mix(plan.order ^ k as u32));
        for k in tech {if g.command(0,"research",0,0,k).is_ok(){break;}}
    }
}
fn launch(mut g:Game,plan:SpacePlan,deadline:Instant)->Option<u32> {
    while g.winner<0&&g.tick<4000 {if Instant::now()>=deadline{return None;}if g.tick%8==0{space_order(&mut g,plan);}g.tick_one(false);}
    Some(if g.winner==0&&g.players[0].launch>=SPACE_GOAL{g.tick}else{4000})
}
fn race(seed:u32,deadline:Instant)->Option<serde_json::Value> {
    let g=space_world(seed);let mut low=(4000,None);let mut high=(4000,None);
    for i in 0..32 {let plan=program(seed,i);let time=launch(g.clone(),plan,deadline)?;
        if i<4&&(low.1.is_none()||time<low.0){low=(time,Some(plan));}if high.1.is_none()||time<high.0{high=(time,Some(plan));}}
    // Fresh execution of each selected plan. The result is actual spaceflight,
    // not the planner's predicted heuristic or gold at a timeout.
    let l=launch(space_world(seed),low.1?,deadline)?;let h=launch(space_world(seed),high.1?,deadline)?;
    Some(json!({"seed":seed,"low_seconds":l,"high_seconds":h,"saved_seconds":l as i64-h as i64,"low_plan":low.1,"high_plan":high.1,"both_launched":l<4000&&h<4000}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mutual_destruction_is_a_draw_and_hidden_pieces_do_not_change_choices() {
        let mut g=battle(51000);let p=0;let v=g.vision(p);let first=tactics(&g,p,32,32,Instant::now()+Duration::from_secs(5)).map(|o|format!("{o:?}"));
        let tile=(0..g.tiles.len()).find(|&t|!v[t]&&g.can_enter(1,t)&&g.occupant(t).is_none()).unwrap();troop(&mut g,1,1,tile);
        let second=tactics(&g,p,32,32,Instant::now()+Duration::from_secs(5)).map(|o|format!("{o:?}"));assert_eq!(first,second);
        g.squads.clear();assert_eq!(combat_value(&g,0),0.);assert_eq!(combat_value(&g,1),0.);
    }
    #[test]
    fn space_replay_uses_only_orbital_prerequisites_and_honours_deadlines() {
        let g=space_world(51000);let plan=program(51000,0);
        let mut path=vec![];orbital_path(10,&mut path);assert_eq!(path.len(),19);assert!(!path.contains(&11));
        assert_eq!(launch(g.clone(),plan,Instant::now()),None);
        let end=Instant::now()+Duration::from_secs(5);let a=launch(g.clone(),plan,end).unwrap();let b=launch(g,plan,end).unwrap();assert_eq!(a,b);assert!(a<4000);
    }
}
fn main(){
    let args:Vec<_>=std::env::args().collect();let seconds:f64=args.get(1).and_then(|s|s.parse().ok()).unwrap_or(120.);let seed:u32=args.get(2).and_then(|s|s.parse().ok()).unwrap_or(51000);
    let start=Instant::now();let deadline=start+Duration::from_secs_f64(seconds);let half=start+Duration::from_secs_f64(seconds/2.);
    println!("{}",json!({"type":"config","schema":3,"seed":seed,"seconds":seconds,"budgets":[4,32],"combat_horizon":32,"order_interval":8,"restraint_low_interval":2,"combat_metric":"paired material advantage; army elimination reported separately","space_metric":"actual peaceful launch completion time"}));
    let mut i=0;while Instant::now()<half {let comparison=(i%3) as u8;let Some(a)=fight(seed+i,false,comparison,half)else{break};let Some(b)=fight(seed+i,true,comparison,half)else{break};println!("{}",json!({"type":"combat","comparison":(["breadth","foresight","restraint"][comparison as usize]),"seed":seed+i,"matches":[a,b]}));i+=1;}
    i=0;while Instant::now()<deadline {let Some(r)=race(seed+i,deadline)else{break};println!("{}",json!({"type":"space","result":r}));i+=1;}
    println!("{}",json!({"type":"end","elapsed_seconds":start.elapsed().as_secs_f64()}));
}
