// Visible-state affordances. Rust still validates every submitted command.
import {passengers,landingTiles,canEnter,canFound,distances,lineOfSight,prerequisites,researchCost,researchGate} from './planning.js';

const blocked=(reason,icon='lock',count=0)=>({reason,icon,count});
import {units,naval,air} from './roster.js';
// Retained export for old callers; current rules have no unit conversions.
export const refitChoices=()=>[];
export const abilityCost=(state,u,value)=>u.kind===13?35+25*state.cities.filter(c=>c.owner===u.owner).length:u.kind===10?180:u.kind===11?150:u.kind===8&&value===2?65:0;

export function targetTiles(world,state,u,kind,value=0){
 if(kind==='face')return world[u.tile].near;
 if(kind==='disembark')return landingTiles(world,state,u);
 const s=state.rules.specs[u.kind],missile=kind==='ability'&&(u.kind===11||u.kind===8&&value===2);
 const max=missile?(u.kind===11?9:7):kind==='ability'&&u.kind===6?3:s.range,min=missile?0:s.min;
 const d=distances(world,u.tile);
 return d.flatMap((n,i)=>{
  if(n<min||n>max||!state.tiles[i]?.visible)return [];
  if(!missile&&u.kind===8&&world[i].terrain>0)return [];
  if(!missile&&!units[u.kind].indirect&&!lineOfSight(world,u.tile,i))return [];
  if(kind==='ability'&&u.kind===5&&value===1&&!state.cities.some(c=>c.tile===i&&c.owner!==u.owner))return [];
  return [i];
 });
}

export function orderBlock(world,state,slot,kind,{from=0,to=null,value=0}={}){
 if(kind==='refit')return blocked('Units cannot change type; recruit in a city');
 const p=state.players[slot];
 if(!p?.alive||state.winner>=0)return blocked('Player cannot issue orders');
 if(kind!=='stop'&&p.cooldown>state.tick)return blocked('Order recovering','clock',p.cooldown-state.tick);
 if(kind==='plan')return value===255||units[value]?.researchable?null:blocked('Choose a technology');
 if(kind==='research'){
  if(p.unlocked.includes(value))return blocked('Already researched','check');
  if(p.research>=0)return blocked('Research in progress','clock',p.research_left);
  if(!prerequisites(value).every(k=>p.unlocked.includes(k)))return blocked('Requires earlier research');
  if(state.tick<researchGate(value))return blocked('Available later','clock',researchGate(value)-state.tick);
  return p.gold<researchCost(value)?blocked('Not enough coins','coin'):null;
 }
 if(kind==='train'||kind==='upgrade'){
  const c=state.cities.find(c=>c.tile===from&&c.owner===slot);
  if(!c)return blocked('Requires your city');
  if(kind==='upgrade'){
   const level=value===0?c.radius:c.production,cost=(value===0?[0,80,140]:[0,110,180])[level];
   if(level>=3)return blocked('Fully upgraded','check');
   return p.gold<cost?blocked('Not enough coins','coin'):null;
  }
  if(!p.unlocked.includes(value))return blocked('Requires research');
  if(c.training>=0)return blocked('Recruitment in progress','clock',c.left);
  const reserved=state.squads.filter(u=>u.owner===slot).length+state.cities.filter(c=>c.owner===slot&&c.training>=0).length;
  if(reserved>=state.rules.unit_cap)return blocked('No free unit capacity','shield');
  if(naval(value)&&!world[from].near.some(i=>world[i].terrain===0))return blocked('Requires a coastal city','sail');
  return p.gold<state.rules.specs[value].cost?blocked('Not enough coins','coin'):null;
 }
 const u=state.squads.find(u=>u.id===from&&u.owner===slot);
 if(!u)return blocked('Select your unit');
 if(kind==='ability'&&[0,3].includes(u.kind))return blocked('Digs in automatically after holding position','shield');
 if(u.boarded_on!=null)return blocked('Aboard a carrier: disembark from its action panel','disembark');
 if(u.refit>=0)return blocked('Refitting','clock',u.work);
 if(kind==='move'||kind==='stop')return kind==='stop'&&u.path.length<2&&!u.founding&&u.focus==null?blocked('No movement, focus or construction to stop','hand'):null;
 if(u.locked_until>state.tick)return blocked('Unit committed','clock',u.locked_until-state.tick);
 if(kind==='face')return !units[u.kind].directional||u.left?blocked('Requires a stationary directional unit','face'):to!=null&&!world[u.tile].near.includes(to)?blocked('Face an adjacent hex','face'):null;
 if(kind==='disband')return null;
 if(u.left)return blocked('Movement cooldown','clock',u.left);
 if(u.founding)return blocked('City construction in progress','clock',u.work);
 if(kind==='disembark'){
  if(!passengers(state,u).length)return blocked('No passengers aboard','board');
  const tiles=landingTiles(world,state,u);
  return (to==null?tiles.length>0:tiles.includes(to))?null:blocked('Requires adjacent empty land suitable for a passenger','territory');
 }
 if(kind==='explore'){
  const d=state.discoveries?.find(d=>d.tile===u.tile&&!d.used);
  if(!d)return blocked('No discovery here');
  if(d.kind===0){const ds=distances(world,u.tile);if(state.squads.some(s=>s.owner===8&&ds[s.tile]<=2))return blocked('Defeat the camp guards first','swords');}
  if(d.kind===9&&p.gold<50)return blocked('Not enough coins','coin');
  if([2,3,9].includes(d.kind)){
   if(state.squads.filter(s=>s.owner===slot).length>=state.rules.unit_cap)return blocked('No free unit capacity','shield');
   const k=d.kind===2?12:d.kind===3?0:1;
   if(!world[u.tile].near.some(i=>world[i].terrain>0&&canEnter(world,k,i)&&!state.squads.some(s=>s.tile===i)))return blocked('No empty deployment hex','territory');
  }
  if(d.kind===6&&u.hp>=state.rules.specs[u.kind].hp)return blocked('Health is already full','heart');
  if(d.kind===7&&u.hp>=state.rules.specs[u.kind].hp&&u.ability_ready<=state.tick)return blocked('No repairs or recharge needed','heart');
  return null;
 }
 const special=kind==='ability',k=u.kind;
 if(special){
  if(u.ability_ready>state.tick)return blocked('Ability recovering','clock',u.ability_ready-state.tick);
  if(p.gold<abilityCost(state,u,value))return blocked('Not enough coins','coin');
  if(k===13){
   if(![1,2,3].includes(world[u.tile].terrain))return blocked('Requires suitable land','territory');
   return canFound(world,state,u.tile)?null:blocked('Requires four hexes from cities','territory',4);
  }
  if(k===10){
   if(!p.unlocked.includes(10)||!prerequisites(10).every(k=>p.unlocked.includes(k)))return blocked('Requires every technology, including orbital research','flask');
   if(p.launch_tile!=null)return blocked('Launch already in progress','rocket');
   return state.cities.some(c=>c.tile===u.tile&&c.owner===slot&&c.production===3)?null:blocked('Requires your production-three city','factory');
  }
  if(k===5&&value===0)return u.mode!==1&&world[u.tile].terrain!==2?blocked('Camouflage requires forest','territory'):null;
  if(k===8&&value===2&&!p.unlocked.includes(9))return blocked('Requires carrier research');
  if(!(value===0&&[1,2,4,6,7,11].includes(k)||k===5&&value===1||k===8&&value===2))return null;
 }
 const missile=special&&(k===11||k===8&&value===2);
 if(!missile){
  if(!state.rules.specs[k].damage)return blocked('This unit cannot attack','swords');
  if(world[u.tile].terrain===0&&!naval(k)&&!air(k))return blocked('Cannot attack while embarked','sail');
  if(state.tick-u.moved<units[k].setup)return blocked('Artillery is setting up','clock',units[k].setup-(state.tick-u.moved));
 }
 const targets=targetTiles(world,state,u,kind,value);
 return (to==null?targets.length>0:targets.includes(to))?null:blocked('No valid target in range','territory');
}
