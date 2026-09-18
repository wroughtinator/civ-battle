// Display rules only; Rust authoritatively validates every order.
export const branches=[[1,3,5],[2,4,6],[7,8,9]];
export const unitIcons=['shield','horse','bow','tank','cannon','specops','drone','ship','submarine','carrier','satellite','nuke','scout','settler'];
export const unitNames=['Guard','Cavalry','Archer','Tank','Artillery','Commando','Drone','Fleet','Submarine','Carrier','Orbital engineer','Nuclear launcher','Scout','Settler'];
export const counters=[[1],[2,4],[0],[0,1,2],[3,9],[4,10],[3,4],[6,8],[7,9],[6],[],[],[],[]];
export const prerequisites=k=>{for(const b of branches){const i=b.indexOf(k);if(i>=0)return i?[b[i-1]]:[];}return k===10?[3,4]:k===11?[4,6]:[];};
export const researchCost=k=>k===10?300:k===11?310:[65,145,235][branches.flatMap(b=>b.includes(k)?[b.indexOf(k)]:[])[0]];
export const researchGate=k=>k===10?780:k===11?840:[0,240,540][branches.flatMap(b=>b.includes(k)?[b.indexOf(k)]:[])[0]];
export function distances(world,start){const d=Array(world.length).fill(Infinity),q=[start];d[start]=0;for(let x=0;x<q.length;x++)for(const j of world[q[x]].near)if(d[j]===Infinity){d[j]=d[q[x]]+1;q.push(j);}return d;}
export function canEnter(world,k,i){return !!world[i]&&(k>=7&&k<=9?world[i].terrain===0:k===6?true:k===1||k===3?world[i].terrain!==0&&world[i].terrain!==4:world[i].terrain!==0);}
export function movementCost(world,state,u,i){const t=world[i].terrain;let n=state.rules.specs[u.kind].speed;if(u.kind!==6&&!(u.kind>=7&&u.kind<=9)){if(t===0)n=18;else if(t===4)n+=7;else if(t===2)n+=u.kind===5?0:u.kind===1?7:3;}if(state.tiles[i]?.storm>.5)n+=u.kind===6?5:t===0?3:1;if(u.mode===3&&u.kind===1&&u.effect_until>state.tick)n=Math.max(2,n-2);if(u.mode===1&&u.kind===8)n+=3;return n;}
export function route(world,state,u,to){
 if(!canEnter(world,u.kind,to))return null;const start=u.tile;
 const occupied=new Map(state.squads.filter(s=>s.id!==u.id).map(s=>[s.tile,s]));
 const d=Array(world.length).fill(Infinity),prev=Array(world.length).fill(-1),done=new Set();d[start]=0;
 while(done.size<world.length){let i=-1,best=Infinity;for(let j=0;j<d.length;j++)if(!done.has(j)&&d[j]<best){i=j;best=d[j];}if(i<0)break;if(i===to)break;done.add(i);for(const j of world[i].near){const other=occupied.get(j);if(!canEnter(world,u.kind,j)||other)continue;const n=d[i]+movementCost(world,state,u,j);if(n<d[j]){d[j]=n;prev[j]=i;}}}
 if(!Number.isFinite(d[to]))return null;const path=[to];while(path[0]!==start)path.unshift(prev[path[0]]);if(start!==u.tile)path.unshift(u.tile);return {path,seconds:Math.max(0,d[to]-(path.length>1?movementCost(world,state,u,to):0))+(path.length>1?(u.left||0):0)};
}
export function lineOfSight(world,from,to){const d=distances(world,to),q=[from],seen=new Set(q);for(let i=0;i<q.length;i++){if(q[i]===to)return true;for(const j of world[q[i]].near)if(!seen.has(j)&&d[j]<d[q[i]]&&(j===to||world[j].terrain!==4)){seen.add(j);q.push(j);}}return false;}
export function attackRoute(world,state,u,to){
 const enemy=state.squads.find(s=>s.tile===to&&s.owner!==u.owner),sp=state.rules.specs[u.kind];if(!enemy||sp.range<=1)return route(world,state,u,to);
 const d=distances(world,to),paths=[];for(let i=0;i<world.length;i++)if(d[i]>=sp.min&&d[i]<=sp.range&&(u.kind===4||lineOfSight(world,i,to))&&!state.squads.some(s=>s.tile===i&&s.id!==u.id)){const p=route(world,state,u,i);if(p)paths.push(p);}return paths.sort((a,b)=>a.path.length-b.path.length||a.path.at(-1)-b.path.at(-1))[0]||null;
}
export function canFound(world,state,tile){return [1,2,3].includes(world[tile]?.terrain)&&state.cities.every(c=>distances(world,c.tile)[tile]>=4)&&!state.squads.some(u=>u.founding&&u.tile!==tile&&distances(world,u.tile)[tile]<4);}
export function abilities(k){
 const targeted=(icon,value,range,label)=>({icon,value,target:true,range,label});
 if(k===13)return [{icon:'settle',value:0,label:'Found city: 45 second commitment; consumes settler'}];
 if(k===8)return [{icon:'submerge',value:0,label:'Submerge or surface: 8 second commitment; hidden, slower, weaker attacks'},{icon:'radar',value:1,label:'Sonar ping: reveal hidden units and yourself; 12 second commitment'},targeted('missile',2,7,'Ballistic missile: 65 coins; 14 second warning, 28 second commitment; requires carrier')];
 if(k===5)return [{icon:'eye',value:0,label:'Camouflage in forest: 8 second commitment'},targeted('gear',1,1,'Sabotage a city: pause its income and production for 24 seconds')];
 if(k===10)return [{icon:'rocket',value:0,label:'Launch: 180 coins; remain in a production 3 city for 360 seconds'}];
 if(k===11)return [targeted('nuke',0,9,'Nuclear strike: 150 coins; 14 second warning, 36 second commitment; friendly fire')];
 if(k===1)return [targeted('horse',0,1,'Shock charge: damage and knock the target into an empty hex; 20 second commitment')];
 if(k===2)return [targeted('bow',0,2,'Volley: damage a hex and its neighbors, including allies; 22 second commitment')];
 if(k===4)return [targeted('cannon',0,3,'Barrage: heavy area damage with friendly fire; 30 second commitment')];
 if(k===6)return [targeted('bomb',0,3,'Bombing run: area damage with friendly fire; storms reduce damage; 22 second commitment')];
 if(k===7)return [targeted('ship',0,2,'Broadside: area damage with friendly fire; 24 second commitment'),{icon:'radar',value:1,label:'Sonar ping: reveal submarines and yourself; 12 second commitment'}];
 if(k===9)return [{icon:'shield',value:0,label:'Air-defense screen: 18 second defensive commitment'},{icon:'radar',value:1,label:'Sonar ping: reveal submarines and yourself; 12 second commitment'}];
 if(k===12)return [{icon:'eye',value:1,label:'Reconnaissance: see four hexes away; 12 second commitment'}];
 return [{icon:'shield',value:0,label:k===3?'Hull down: 45 percent less incoming damage; 18 second commitment':'Brace: 45 percent less incoming damage; 18 second commitment'}];
}
