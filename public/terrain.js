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

// Small, shared visual rules matching the authoritative terrain mechanics.
export const terrainIcons=['sail','wheat','tree','sand','mountain','snow'];
export const inForestCover=(world,u)=>world[u.tile]?.terrain===2&&!(u.kind>=6&&u.kind<=9);
export const terrainSlows=(terrain,kind)=>!(kind>=6&&kind<=9)&&(terrain===4||terrain===2&&kind!==5);
export const rate=value=>Number(value.toFixed(2)).toString();
export const incomeBenefit=(icon,amount)=>`<span class="upgrade-benefit">${icon('coin')}+${rate(amount/5)}<span class="upgrade-per">/${icon('clock')}1</span></span>`;
