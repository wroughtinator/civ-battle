// Display rules only; Rust authoritatively validates every order.
import {roster,units,naval,air} from './roster.js';
export const branches=roster.branches;
export const unitIcons=units.map(u=>u.icon);
export const unitNames=units.map(u=>u.name);
export const counters=units.map(u=>u.counters);
export const prerequisites=k=>units[k]?.prerequisites||[];
export const researchCost=k=>units[k]?.research_cost;
export const researchGate=()=>0;
export function distances(world,start){const d=Array(world.length).fill(Infinity),q=[start];d[start]=0;for(let x=0;x<q.length;x++)for(const j of world[q[x]].near)if(d[j]===Infinity){d[j]=d[q[x]]+1;q.push(j);}return d;}
export function canEnter(world,k,i){return !!world[i]&&(naval(k)?world[i].terrain===0:air(k)?true:units[k]?.mounted?world[i].terrain!==0&&world[i].terrain!==4:world[i].terrain!==0);}
export const passengers=(state,u)=>state.squads.filter(s=>s.boarded_on===u.id);
export const boardingCapacity=(state,u)=>state.rules.specs[u.kind].boarding_capacity||0;
export function boardingTarget(world,state,u,to){
 if(u.boarded_on!=null||!world[to]||world[to].terrain!==0||canEnter(world,u.kind,to))return null;
 return state.squads.find(s=>s.tile===to&&s.boarded_on==null&&s.owner===u.owner&&s.refit<0&&passengers(state,s).length<boardingCapacity(state,s))||null;
}
export function landingTiles(world,state,u){
 if(!boardingCapacity(state,u))return [];
 const cargo=passengers(state,u);
 return world[u.tile].near.filter(i=>world[i].terrain!==0&&!state.squads.some(s=>s.boarded_on==null&&s.tile===i)&&cargo.some(s=>canEnter(world,s.kind,i)));
}
export function movementCost(world,state,u,i){const t=world[i].terrain;let n=state.rules.specs[u.kind].speed;if(!air(u.kind)&&!naval(u.kind)){if(t===0)n=18;else if(t===4)n+=7;else if(t===2)n+=u.kind===5?0:u.kind===1?7:3;}if(state.tiles[i]?.storm>.5)n+=air(u.kind)?5:t===0?3:1;if(u.mode===3&&u.kind===1&&u.effect_until>state.tick)n=Math.max(2,n-2);if(u.mode===1&&u.kind===8)n+=3;return n;}
export function route(world,state,u,to){
 if(u.boarded_on!=null||(!canEnter(world,u.kind,to)&&!boardingTarget(world,state,u,to)))return null;const start=u.tile;
 const occupied=new Map(state.squads.filter(s=>s.id!==u.id&&s.boarded_on==null).map(s=>[s.tile,s]));
 const d=Array(world.length).fill(Infinity),prev=Array(world.length).fill(-1),done=new Set();d[start]=0;
 while(done.size<world.length){let i=-1,best=Infinity;for(let j=0;j<d.length;j++)if(!done.has(j)&&d[j]<best){i=j;best=d[j];}if(i<0)break;if(i===to)break;done.add(i);for(const j of world[i].near){const other=occupied.get(j);if(!(j===to&&boardingTarget(world,state,u,j))&&(!canEnter(world,u.kind,j)||other||guardBlocks(world,state,u,i,j)))continue;const n=d[i]+movementCost(world,state,u,j);if(n<d[j]){d[j]=n;prev[j]=i;}}}
 if(!Number.isFinite(d[to]))return null;const path=[to];while(path[0]!==start)path.unshift(prev[path[0]]);if(start!==u.tile)path.unshift(u.tile);return {path,seconds:Math.max(0,d[to]-(path.length>1?movementCost(world,state,u,to):0))+(path.length>1?(u.left||0):0)};
}
export function inFront(world,u,tile){
 if(u.facing==null||!world[u.facing]||tile===u.tile)return false;
 const o=world[u.tile].p,tangent=p=>{const d=p.reduce((v,x,i)=>v+x*o[i],0),t=p.map((x,i)=>x-o[i]*d),l=Math.hypot(...t);return t.map(x=>x/l);};
 const a=tangent(world[u.facing].p),b=tangent(world[tile].p);return a.reduce((v,x,i)=>v+x*b[i],0)>=.49;
}
export function guardBlocks(world,state,u,from,to){return !air(u.kind)&&state.squads.some(g=>g.owner!==u.owner&&g.hp>0&&g.boarded_on==null&&g.refit<0&&world[g.tile].near.includes(from)&&world[g.tile].near.includes(to)&&(g.kind===0&&!naval(u.kind)||[16,26,30].includes(g.kind)&&naval(g.kind)===naval(u.kind)&&!g.left&&g.path.length===1&&(inFront(world,g,from)||inFront(world,g,to))));}
export function lineOfSight(world,from,to){const d=distances(world,to),q=[from],seen=new Set(q);for(let i=0;i<q.length;i++){if(q[i]===to)return true;for(const j of world[q[i]].near)if(!seen.has(j)&&d[j]<d[q[i]]&&(j===to||world[j].terrain!==4)){seen.add(j);q.push(j);}}return false;}
export function attackRoute(world,state,u,to){
 const enemy=state.squads.find(s=>s.tile===to&&s.owner!==u.owner),sp=state.rules.specs[u.kind];if(!enemy||sp.range<=1)return route(world,state,u,to);
 const d=distances(world,to),paths=[];for(let i=0;i<world.length;i++)if(d[i]>=sp.min&&d[i]<=sp.range&&(units[u.kind].indirect||lineOfSight(world,i,to))&&!state.squads.some(s=>s.tile===i&&s.id!==u.id)){const p=route(world,state,u,i);if(p)paths.push(p);}return paths.sort((a,b)=>a.path.length-b.path.length||a.path.at(-1)-b.path.at(-1))[0]||null;
}
export function canFound(world,state,tile){return [1,2,3].includes(world[tile]?.terrain)&&state.cities.every(c=>distances(world,c.tile)[tile]>=4)&&!state.squads.some(u=>u.founding&&u.tile!==tile&&distances(world,u.tile)[tile]<4);}
export function abilities(k){
 const targeted=(icon,value,range,label)=>({icon,value,target:true,range,label});
 if(k===13)return [{icon:'settle',value:0,label:'Found city: 25 second commitment; consumes settler'}];
 if(k===8)return [{icon:'submerge',value:0,label:'Submerge or surface: 8 second commitment; hidden, slower, weaker attacks'},{icon:'radar',value:1,label:'Sonar ping: reveal hidden units and yourself; 12 second commitment'},targeted('missile',2,7,'Ballistic missile: 65 coins; 14 second warning, 28 second commitment; requires carrier')];
 if(k===5)return [{icon:'eye',value:0,label:'Camouflage in forest: 8 second commitment'},targeted('gear',1,1,'Sabotage a city: pause its income and production for 24 seconds')];
 if(k===10)return [{icon:'rocket',value:0,label:'Launch: 180 coins; remain in a production 3 city for 120 seconds'}];
 if(k===11)return [targeted('nuke',0,9,'Nuclear strike: 150 coins; 14 second warning, 36 second commitment; friendly fire')];
 if(k===1)return [targeted('horse',0,1,'Shock charge: damage and knock the target into an empty hex; 20 second commitment')];
 if(k===2)return [targeted('bow',0,2,'Volley: damage a hex and its neighbors, including allies; 22 second commitment')];
 if(k===4)return [targeted('cannon',0,3,'Barrage: heavy area damage with friendly fire; 30 second commitment')];
 if(k===6)return [targeted('bomb',0,3,'Bombing run: area damage with friendly fire; storms reduce damage; 22 second commitment')];
 if(k===7)return [targeted('ship',0,2,'Broadside: area damage with friendly fire; 24 second commitment'),{icon:'radar',value:1,label:'Sonar ping: reveal submarines and yourself; 12 second commitment'}];
 if(k===9)return [{icon:'shield',value:0,label:'Air-defense screen: 18 second defensive commitment'},{icon:'radar',value:1,label:'Sonar ping: reveal submarines and yourself; 12 second commitment'}];
 if(k===12)return [{icon:'eye',value:1,label:'Reconnaissance: see four hexes away; 12 second commitment'}];
 return []; // Guards and tanks dig in automatically after holding for 8 seconds.
}
