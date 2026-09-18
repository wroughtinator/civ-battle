import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseRig,sampleRig} from '../public/model-assets.js';
import {coastalEdges,shoreDistance,beachWeight} from '../public/terrain.js';
import {attackTiming,attackStyles,drawAttack} from '../public/combat-visuals.js';
import {makeEngine} from '../worker/wasm.js';

test('every ocean-facing edge gets sand, including mountain and snow coasts',()=>{
 const engine=makeEngine(new WebAssembly.Module(readFileSync('worker/engine.wasm')));
 const world=engine({op:'new',seed:31415,difficulty:1}).state.tiles,neighbors=world.map(t=>t.poly.map(()=>-1)),edges=new Map();
 const key=p=>p.map(x=>x.toFixed(5)).join(',');
 world.forEach((t,i)=>t.poly.forEach((p,k)=>{const id=[key(p),key(t.poly[(k+1)%t.poly.length])].sort().join('|'),other=edges.get(id);if(other){neighbors[i][k]=other[0];neighbors[other[0]][other[1]]=i;}else edges.set(id,[i,k]);}));
 const coasts=coastalEdges(world,neighbors);let checked=0;
 world.forEach((t,i)=>{if(!t.terrain)return;t.poly.forEach((a,k)=>{if(world[neighbors[i][k]]?.terrain!==0)return;const b=t.poly[(k+1)%t.poly.length],p=a.map((v,j)=>(v+b[j])/2);assert.equal(beachWeight(shoreDistance(p,coasts[i])),1);checked++;});});
 assert.ok(checked>50);assert.equal(beachWeight(Infinity),0);assert.equal(beachWeight(.03),0);
});

for(const name of ['guard','archer','scout'])test(`${name}: bounded mesh, normalized skin weights and distinct animated poses`,()=>{
 const bytes=readFileSync(`public/assets/${name}.rig`),rig=parseRig(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.ok(rig.meta.vertices/3<3200);assert.ok(rig.meta.bones.length<=32);
 for(let i=0;i<rig.vertices.length;i+=24){assert.equal(rig.vertices.slice(i+20,i+24).reduce((a,b)=>a+b,0),255);for(const joint of rig.vertices.slice(i+16,i+20))assert.ok(joint<rig.meta.bones.length);}
 for(const clip of ['idle','walk','attack']){
  const a=sampleRig(rig,clip,0,new Float32Array(512)),b=sampleRig(rig,clip,rig.meta.clips[clip].duration*.43,new Float32Array(512));
  assert.ok(a.every(Number.isFinite));assert.ok(b.every(Number.isFinite));assert.ok(a.some((v,i)=>Math.abs(v-b[i])>.001),clip);
 }
});

test('all attack cues are distinct, under 650ms, and finish at the authoritative windup',()=>{
 assert.equal(new Set(attackStyles.map(s=>s.type)).size,14);
 for(let kind=0;kind<14;kind++){
  const e={kind,start:1000,flight:5000},end=6000;
  assert.equal(attackTiming(e,end-700).active,false);
  assert.equal(attackTiming(e,end-100).active,true);
  assert.equal(attackTiming(e,end+1).active,false);
  assert.ok(attackStyles[kind].seconds<=.65);
 }
});

test('attack geometry remains finite for every weapon and point-blank target',()=>{
 const norm=p=>{const l=Math.hypot(...p);return p.map(x=>x/l);},add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s),mix=(a,b,s)=>a.map((x,i)=>x*(1-s)+b[i]*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 let count=0;const check=(...args)=>{assert.ok(args.flat().every(Number.isFinite));count++;};
 for(let kind=0;kind<14;kind++)for(const b of [[0,0,1],norm([.1,0,1])])for(const f of [.05,.4,.9]){
  const e={kind,start:0,flight:1000,from:0,to:1,value:0};
  drawAttack(e,1000-attackStyles[kind].seconds*1000*(1-f),{a:[0,0,1],b,base:()=>1.02,ring:check,ribbon:check,triangle:check,norm,add,mul,mix,cross});
 }
 assert.ok(count>100);
});
