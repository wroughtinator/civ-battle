const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
// Include adjacent coastal segments so beaches join without cracks at land corners.
export function coastalEdges(world,neighbors){
 const own=world.map((tile,i)=>tile.terrain===0?[]:tile.poly.flatMap((a,k)=>world[neighbors[i][k]]?.terrain===0?[[a,tile.poly[(k+1)%tile.poly.length]]]:[]));
 return world.map((tile,i)=>[...own[i],...tile.near.flatMap(j=>own[j])]);
}
export function shoreDistance(p,edges){
 let distance=Infinity;
 for(const [a,b] of edges){const ab=b.map((v,i)=>v-a[i]),ap=p.map((v,i)=>v-a[i]),t=Math.max(0,Math.min(1,dot(ap,ab)/dot(ab,ab)));distance=Math.min(distance,Math.hypot(...ap.map((v,i)=>v-ab[i]*t)));}
 return distance;
}
export function beachWeight(distance){const t=Math.max(0,Math.min(1,(distance-.004)/.010));return 1-t*t*(3-2*t);}

// Area-weighted normals from the final displaced mesh, shared across triangle
// duplicates and tile boundaries. Includes the slope of the mountain envelope.
export function smoothTerrainNormals(vertices){
 const sums=new Map(),keys=[];
 for(let i=0;i<vertices.length;i+=27){
  const a=vertices.slice(i,i+3),b=vertices.slice(i+9,i+12),c=vertices.slice(i+18,i+21);
  const u=b.map((v,j)=>v-a[j]),v=c.map((x,j)=>x-a[j]);
  let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(n.reduce((s,x,j)=>s+x*a[j],0)<0)n=n.map(x=>-x);
  for(let k=0;k<3;k++){
   const at=i+k*9,key=vertices.slice(at,at+3).map(x=>Math.round(x*1e6)).join(',');
   keys.push(key);const sum=sums.get(key)||[0,0,0];for(let j=0;j<3;j++)sum[j]+=n[j];sums.set(key,sum);
  }
 }
 for(let i=0;i<keys.length;i++){
  const n=sums.get(keys[i]),length=Math.hypot(...n);
  if(length>1e-12)for(let j=0;j<3;j++)vertices[i*9+3+j]=n[j]/length;
 }
}

// Small, shared visual rules matching the authoritative terrain mechanics.
export const terrainIcons=['sail','wheat','tree','sand','mountain','snow'];
export const terrainNames=['Water','Grassland','Forest','Desert','Mountains','Ice'];
// These describe terrain rules, not whether an individual order is available.
const settlement=['good','settle','✓','Suitable for a city; normal spacing, coin and construction requirements still apply.'];
const noSettlement=['bad','settle','×','Cannot found a city on this terrain.'];
const noFarms=['bad','wheat','×','No farm income; only controlled grassland outside city centres grows farms.'];
export const terrainEffects=[
 [['neutral','sail','✓','Ships travel on water. Ground units must board a friendly ship with a free berth to cross; drones fly across.'],noSettlement,noFarms],
 [['good','wheat','+0.25','Each controlled grassland tile outside a city centre adds 0.25 coins every five seconds. Blockade halves city income; sabotage pauses it.'],settlement,['bad','horse','+25%','Cavalry deal 25% more damage to targets here for twelve seconds after moving.']],
 [['good','shield','−25%','Ground units take 25% less incoming damage in forest. Aircraft receive no cover.'],['bad','clock','+3 / +7','Forest adds three seconds to ground movement cooldown, or seven for cavalry. Commandos and aircraft have no forest movement penalty.'],['good','eye','✓','Commandos can activate camouflage in forest.'],settlement,noFarms],
 [settlement,noFarms,['bad','horse','+25%','Cavalry deal 25% more damage to targets here for twelve seconds after moving.']],
 [['good','shield','↗','Mountains block intervening direct fire. Artillery and drones can shoot over them; this is not a damage reduction.'],['bad','clock','+7','Mountains add seven seconds to ground movement cooldown. Aircraft are unaffected.'],['bad','tank','×','Tanks and cavalry cannot enter mountains.'],noSettlement,noFarms],
 [['neutral','route','✓','Ground units can cross ice with no terrain movement penalty.'],noSettlement,noFarms],
];
export function terrainSummary(icon,terrain){
 const effects=terrainEffects[terrain];if(!effects)return '';
 return `<section class="tile-terrain" aria-label="${terrainNames[terrain]} terrain effects"><div class="tile-terrain-heading">${icon(terrainIcons[terrain])}<strong>${terrainNames[terrain]}</strong><small>Tap effects for details</small></div><div class="tile-effects">${effects.map(([tone,symbol,value,label])=>`<button class="tile-effect ${tone}" data-terrain-help="${terrainIcons[terrain]}" aria-label="${label}" title="${label}">${icon(symbol)}<span>${value}</span></button>`).join('')}</div></section>`;
}
export const inForestCover=(world,u)=>world[u.tile]?.terrain===2&&!(u.kind>=6&&u.kind<=9);
export const terrainSlows=(terrain,kind)=>!(kind>=6&&kind<=9)&&(terrain===4||terrain===2&&kind!==5);
export const rate=value=>Number(value.toFixed(2)).toString();
export const incomeBenefit=(icon,amount)=>`<span class="upgrade-benefit">${icon('coin')}+${rate(amount/5)}<span class="upgrade-per">/${icon('clock')}1</span></span>`;
