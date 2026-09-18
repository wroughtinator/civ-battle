import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseRig,sampleRig,modelNames,treeNames,orientationBasis,Woodland} from '../public/model-assets.js';
import {coastalEdges,shoreDistance,beachWeight,smoothTerrainNormals} from '../public/terrain.js';
import {attackTiming,attackStyles,drawAttack,ballisticPose} from '../public/combat-visuals.js';
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

for(const name of modelNames.slice(0,14))test(`${name}: bounded mesh, normalized skin weights and distinct animated poses`,()=>{
 const bytes=readFileSync(`public/assets/forge/${name}.rig`),rig=parseRig(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.equal(rig.meta.version,2);assert.equal(rig.meta.stride,28);
 assert.ok(rig.meta.vertices/3<3200);assert.ok(rig.meta.bones.length<=32);
 for(let i=0;i<rig.vertices.length;i+=rig.meta.stride){assert.equal(rig.vertices.slice(i+20,i+24).reduce((a,b)=>a+b,0),255);for(const joint of rig.vertices.slice(i+16,i+20))assert.ok(joint<rig.meta.bones.length);}
 for(const clip of ['idle','walk','attack']){
  const a=sampleRig(rig,clip,0,new Float32Array(512)),b=sampleRig(rig,clip,rig.meta.clips[clip].duration*.43,new Float32Array(512));
  assert.ok(a.every(Number.isFinite));assert.ok(b.every(Number.isFinite));assert.ok(a.some((v,i)=>Math.abs(v-b[i])>.001),clip);
 }
});

test('complete forge catalog has every runtime model and bounded textured geometry',()=>{
 const catalog=JSON.parse(readFileSync('public/assets/forge/catalog.json'));
 assert.equal(new Set(catalog.models.map(m=>m.name)).size,55);
 for(const name of [...modelNames,...treeNames,...Array.from({length:10},(_,i)=>'discovery-'+i),...Array.from({length:8},(_,i)=>'capital-'+i),...Array.from({length:7},(_,i)=>'building-'+(i+1)),'farm','site'])assert.ok(catalog.models.some(m=>m.name===name),name);
 for(const m of catalog.models){
  const texture=readFileSync(`public/assets/forge/${m.name}.png`);assert.equal(texture.readUInt32BE(16),256);assert.equal(texture.readUInt32BE(20),256);
  const bytes=readFileSync(`public/assets/forge/${m.name}.${['tree','prop'].includes(m.category)?'mesh':'rig'}`);
  if(['tree','prop'].includes(m.category)){assert.equal(bytes.length%60,0);assert.ok(bytes.length/60<1200);}
  else{const rig=parseRig(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));for(const clip of Object.keys(rig.meta.clips))assert.ok(sampleRig(rig,clip,.17,new Float32Array(512)).every(Number.isFinite));}
 }
});

test('ballistic bodies follow the arc and point upward on ascent, downward on descent',()=>{
 const a=[0,0,1],b=[Math.sin(.4),0,Math.cos(.4)];
 const ascent=ballisticPose(a,b,.1),peak=ballisticPose(a,b,.5),descent=ballisticPose(a,b,.9);
 const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
 assert.ok(dot(ascent.forward,ascent.up)>.1);assert.ok(dot(descent.forward,descent.up)<-.1);assert.ok(peak.radius>ascent.radius);
 for(const f of[0,.5,1])assert.ok(Object.values(ballisticPose(a,b,f)).flat().every(Number.isFinite));
});

test('ground and airborne bases remain orthonormal for vertical and polar headings',()=>{
 for(const up of[[0,0,1],[0,1,0]])for(const forward of[null,[0,0,0],[0,0,1],[0,1,0],[.1,.3,.4]])for(const flight of[false,true]){
  const b=orientationBasis(up,forward,flight);assert.ok(b.every(Number.isFinite));
  for(let i=0;i<3;i++)assert.ok(Math.abs(Math.hypot(...b.slice(i*3,i*3+3))-1)<1e-6);
  assert.ok(Math.abs(b.slice(0,3).reduce((s,v,i)=>s+v*b[i+3],0))<1e-6);
 }
});

test('each ranged weapon dispatches a real textured model with a finite pose',()=>{
 const norm=p=>{const l=Math.hypot(...p);return p.map(x=>x/l);},add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s),mix=(a,b,s)=>a.map((x,i)=>x*(1-s)+b[i]*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const expected={2:'arrow',3:'shell',4:'mortar',5:'bullet',6:'bomb',7:'shell',8:'torpedo',9:'aircraft',11:'rocket'};
 for(const [kind,name]of Object.entries(expected)){const bodies=[];drawAttack({kind:+kind,start:0,flight:1000,from:0,to:1},1000-attackStyles[kind].seconds*500,{a:[0,0,1],b:norm([.1,0,1]),base:()=>1.02,ring(){},ribbon(){},triangle(){},norm,add,mul,mix,cross,model:(n,p,f,s)=>bodies.push({n,p,f,s})});assert.ok(bodies.length);for(const b of bodies){assert.equal(b.n,name);assert.ok([...b.p,...b.f,b.s].every(Number.isFinite));}}
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


test('forest instance count does not change across the old zoom threshold',()=>{
 const counts=[],gl=new Proxy({drawArraysInstanced:(_mode,_start,_vertices,count)=>counts.push(count)},{get:(o,k)=>o[k]??(()=>{})});
 const trees=Object.assign(Object.create(Woodland.prototype),{gl,count:12,sway:true,instances:Array.from({length:12},()=>[0,0,1,0,1,1,1,1])});
 for(const distance of [1.8,2.29,2.31,3.5])trees.draw({distance,rotate:p=>p,u:{}});
 assert.deepEqual(counts,[12,12,12,12]);
});
test('displaced terrain shares outward unit normals across triangle duplicates',()=>{
 const vertex=p=>[...p,0,0,0,1,1,1],a=[0,0,1],b=[.2,0,1],c=[0,.2,1.1],d=[.2,.2,1.3];
 const mesh=[a,b,c,b,d,c].flatMap(vertex);smoothTerrainNormals(mesh);
 assert.deepEqual(mesh.slice(12,15),mesh.slice(30,33));
 assert.deepEqual(mesh.slice(21,24),mesh.slice(48,51));
 for(let i=0;i<mesh.length;i+=9){const n=mesh.slice(i+3,i+6);assert.ok(Math.abs(Math.hypot(...n)-1)<1e-9);assert.ok(n[2]>0);}
 assert.notDeepEqual(mesh.slice(3,6),mesh.slice(39,42));
});
