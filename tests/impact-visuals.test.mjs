import test from 'node:test';
import assert from 'node:assert/strict';
import {drawImpact,drawNuclear} from '../public/impact-visuals.js';
import {EventTimeline} from '../public/feedback.js';
import {Globe} from '../public/globe.js';

test('every weapon impact stays finite at poles and expires without residual geometry',()=>{
 for(const b of [[0,0,1],[0,1,0],[0,-1,0]])for(const detail of [.65,1]){
  let count=0;const check=(...args)=>{assert.ok(args.flat().every(Number.isFinite));count++;};
  const ctx={b,height:1.02,triangle:check,ring:check,ribbon:check,detail};
  for(let kind=0;kind<36;kind++)for(const water of [false,true])for(const age of [0,.1,.5,1.2])drawImpact({kind},age,{...ctx,water});
  assert.ok(count>100);count=0;
  for(const age of [-1,6,7]){drawNuclear(age,ctx);drawImpact({kind:4},age,ctx);}
  assert.equal(count,0);
  for(const age of [0,.2,1,3,5.9])drawNuclear(age,ctx);
 }
});

test('nuclear cloud has an elevated cap, a narrower stem, and reduced mobile geometry',()=>{
 const capture=detail=>{const vertices=[];drawNuclear(1.5,{b:[0,1,0],height:1,detail,triangle:(a,b,c)=>vertices.push(a,b,c),ring(){},ribbon(){}});return vertices;};
 const full=capture(1),mobile=capture(.65);
 assert.ok(mobile.length<full.length*.8);
 assert.ok(Math.max(...mobile.map(v=>v[1]))>1.3);
 const width=verts=>Math.max(...verts.map(v=>Math.hypot(v[0],v[2])));
 assert.ok(width(mobile.filter(v=>v[1]>1.25))>width(mobile.filter(v=>v[1]>1.08&&v[1]<1.18))*2);
});

test('nuclear timeline deduplicates authoritative blasts and does not replay stale events',()=>{
 const timeline=new EventTimeline(),state={seed:1,tick:30,events:[{kind:9,tick:30,tile:4,player:0}]};
 assert.equal(timeline.accept(state,1000)[0].end,7000);
 assert.equal(timeline.accept(state,2000).length,0);
 assert.equal(timeline.accept({...state,seed:2,tick:40},3000).length,0);
});

test('massed effects obey a shared mobile budget and cull the back of the globe',()=>{
 let data;const globe=Object.assign(Object.create(Globe.prototype),{
  canvas:{clientWidth:390},world:[{p:[0,0,1],terrain:0}],state:{},rotate:p=>p,
  effects:{items:Array.from({length:120},()=>({action:'nuclear',from:0,to:0,start:0,end:6000}))},
  effectsMesh:{update:d=>{data=d;}},
 });
 globe.updateEffects(1500);assert.equal(data.length/27,4500);assert.ok(data.every(Number.isFinite));
 globe.world[0].p=[0,0,-1];globe.updateEffects(1500);assert.equal(data.length,0);
 globe.effects.items=[];globe.updateEffects(7000);assert.equal(data.length,0);
});
