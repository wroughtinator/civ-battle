import {canEnter,unitNames} from './planning.js';

// A separate presentation world: never send these units or orders to a room.
export function createShowcase(world,rules,seed,random=Math.random){
 const pick=values=>values[Math.floor(random()*values.length)];
 const squads=Array.from({length:unitNames.length*3},(_,id)=>{
  const kind=id%unitNames.length;
  const candidates=world.flatMap((t,i)=>canEnter(world,kind,i)&&t.near.some(n=>canEnter(world,kind,n))?[i]:[]);
  const tile=pick(candidates),next=pick(world[tile].near.filter(n=>canEnter(world,kind,n)));
  return {id,kind,tile,next,owner:Math.floor(id/unitNames.length),hp:rules.specs[kind].hp,path:[],left:0,refit:-1,mode:kind===8?1:0,founding:kind===13,work:25,started:null,duration:5000+random()*7000};
 });
 return {seed,eventId:0,showcase:true,phase:'preview',tick:0,rules,squads,tiles:world.map(t=>({...t,visible:true,owner:-1})),cities:[],strikes:[],events:[],feedback:[],players:Array.from({length:8},(_,i)=>({launch:i===0?1:0,civ:i,alive:true}))};
}

export function showcasePosition(u,world,now,random=Math.random){
 if(u.started===null)u.started=now;
 // Settlers build; military units pause between patrol legs to demonstrate attacks.
 const movingTime=u.duration,pause=u.kind===13?7000:2500;
 if(now-u.started>movingTime+pause){
  const previous=u.tile;u.tile=u.next;
  const options=world[u.tile].near.filter(n=>canEnter(world,u.kind,n)&&n!==previous);
  u.next=options.length?options[Math.floor(random()*options.length)]:previous;u.started=now;
 }
 const f=Math.min(1,Math.max(0,(now-u.started)/movingTime)),a=world[u.tile].p,b=world[u.next].p;
 const p=a.map((v,i)=>v+(b[i]-v)*f),length=Math.hypot(...p);
 u.founding=u.kind===13&&f===1;
 return {p:p.map(v=>v/length),forward:b.map((v,i)=>v-a[i]),moving:f<1};
}

export function showcaseFeedback(scene,world,now){
 scene.tick=now/1000;scene.feedback=[];
 for(const u of scene.squads){
  if(u.kind===13||u.started===null||now-u.started<u.duration||u.fired===u.started)continue;
  u.fired=u.started;
  const targets=world[u.next].near.filter(n=>canEnter(world,u.kind,n));
  scene.feedback.push({id:++scene.eventId,action:'shot',kind:u.kind,unit:u.id,from:u.next,to:targets[0]??u.tile,tick:scene.tick,duration:1,value:0});
 }
}
