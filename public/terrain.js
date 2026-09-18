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
export const inForestCover=(world,u)=>world[u.tile]?.terrain===2&&!(u.kind>=6&&u.kind<=9);
export const terrainSlows=(terrain,kind)=>!(kind>=6&&kind<=9)&&(terrain===4||terrain===2&&kind!==5);
export const rate=value=>Number(value.toFixed(2)).toString();
export const incomeBenefit=(icon,amount)=>`<span class="upgrade-benefit">${icon('coin')}+${rate(amount/5)}<span class="upgrade-per">/${icon('clock')}1</span></span>`;
