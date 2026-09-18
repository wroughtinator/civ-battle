// Presentation only: animate observed tile changes, never future orders.
export const STEP_LERP_MS = 180;
export class UnitMotion {
 constructor(){this.tiles=new Map();this.steps=new Map();}
 accept(units,now){
  const live=new Set(units.map(u=>u.id));
  for(const u of units){
   const from=this.tiles.get(u.id);
   if(from!==undefined&&from!==u.tile)this.steps.set(u.id,{from,to:u.tile,start:now});
   this.tiles.set(u.id,u.tile);
  }
  for(const id of this.tiles.keys())if(!live.has(id)){this.tiles.delete(id);this.steps.delete(id);}
 }
 position(u,world,now){
  const step=this.steps.get(u.id),target=world[u.tile].p;
  if(!step||step.to!==u.tile||now-step.start>=STEP_LERP_MS)return {p:target,forward:null,moving:false};
  const a=world[step.from].p,f=Math.max(0,(now-step.start)/STEP_LERP_MS);
  const p=a.map((v,i)=>v+(target[i]-v)*f),length=Math.hypot(...p);
  return {p:p.map(v=>v/length),forward:target.map((v,i)=>v-a[i]),moving:true};
 }
}
