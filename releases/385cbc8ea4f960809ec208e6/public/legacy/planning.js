// Pure observation-based planning. The server independently validates every order.
export function reachableProvinces(world,tiles,from,owner,{sea=false,naval=false,limit=8}={}){
 const seen=new Set([from]),result=new Set(),queue=[[from,0]];
 for(let k=0;k<queue.length;k++){const [i,d]=queue[k];if(d>=limit)continue;for(const j of world[i].near){if(seen.has(j))continue;const water=world[j].terrain===0;if(naval?!water:water&&!sea)continue;seen.add(j);if(naval||!water)result.add(j);if(water||tiles[j].owner===owner)queue.push([j,d+1]);}}
 return result;
}
export function equipmentTargets(world,tiles,unit,owner){
 if(unit.kind===3)return new Set(world.flatMap((t,i)=>i!==unit.tile&&t.terrain>0&&tiles[i].visible&&t.p.reduce((s,v,k)=>s+v*world[unit.tile].p[k],0)>.42?[i]:[]));
 return reachableProvinces(world,tiles,unit.tile,owner,{naval:unit.kind===1||unit.kind===2,limit:17});
}
