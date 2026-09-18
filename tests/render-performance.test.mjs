import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Mesh,UnitRings,sceneryKey} from '../public/render-buffers.js';
import {RiggedMesh,Woodland} from '../public/model-assets.js';
import {Globe} from '../public/globe.js';

function fakeGL(){
 const calls=[];
 const gl=new Proxy({calls},{get:(obj,key)=>obj[key]??(obj[key]=(...args)=>{
  calls.push([key,...args.map(a=>ArrayBuffer.isView(a)?Array.from(a):a)]);
  if(key.startsWith('create'))return {};
 })});
 return gl;
}
test('streamed mesh preserves material layout, reuses capacity and never draws stale empty data',()=>{
 const gl=fakeGL(),mesh=new Mesh(gl),vertices=Array.from({length:27},(_,i)=>i/10);
 vertices.materials=[.1,2,3,.4,5,6,.7,8,9];mesh.update(vertices);
 let packed=gl.calls.filter(c=>c[0]==='bufferSubData').at(-1)[3];
 for(let i=0;i<3;i++)assert.deepEqual(packed.slice(i*12,i*12+12),[...vertices.slice(i*9,i*9+9),...vertices.materials.slice(i*3,i*3+3)].map(Math.fround));
 const allocations=gl.calls.filter(c=>c[0]==='bufferData').length;
 mesh.update(vertices.slice(0,9));assert.equal(gl.calls.filter(c=>c[0]==='bufferData').length,allocations);
 packed=gl.calls.filter(c=>c[0]==='bufferSubData').at(-1)[3];assert.deepEqual(packed.slice(9),[1,0,0]);
 mesh.update([]);mesh.draw(gl.TRIANGLES);assert.equal(gl.calls.filter(c=>c[0]==='drawArrays').length,0);
});

test('static terrain releases its CPU staging copy after upload',()=>{
 const mesh=new Mesh(fakeGL(),false);mesh.update(Array(27).fill(1));
 assert.equal(mesh.count,3);assert.equal(mesh.packed.byteLength,0);
 mesh.update(Array(54).fill(2));assert.equal(mesh.count,6);assert.equal(mesh.packed.byteLength,0);
});

test('cached territories match a fresh rebuild after fog, ownership, selection and expansion changes',()=>{
 const positions=[[0,0,1],[.1,0,.995],[0,.1,.995]];
 const make=state=>Object.assign(Object.create(Globe.prototype),{
  preview:false,selectedCity:-1,state,
  world:positions.map(p=>({p,terrain:1,poly:positions})),
  edgeNeighbors:[[1,2,1],[0,2,0],[0,1,0]],
  borderCache:positions.map(()=>Array.from({length:24},()=>[positions[0],positions[1],1.01,1.01])),
  territorySurfaces:positions.map(()=>positions.flat()),
  territories:new Mesh(fakeGL()),territoryBorders:new Mesh(fakeGL())
 });
 const state={tiles:[{visible:true,city:0},{visible:true,city:0},{visible:true,city:null}],cities:[{tile:0,owner:0,expansion_tiles:[2]}]};
 const globe=make(state);
 const packed=mesh=>Array.from(mesh.packed.subarray(0,mesh.count*12));
 for(const change of [()=>{},()=>state.tiles[1].visible=false,()=>globe.selectedCity=0,()=>state.cities[0].owner=1,()=>state.tiles[1].city=null,()=>state.cities[0].expansion_tiles=[],()=>globe.preview=true,()=>globe.preview=false,()=>state.cities=[]]){
  change();globe.rebuildTerritory();
  const fresh=make(state);fresh.selectedCity=globe.selectedCity;fresh.preview=globe.preview;fresh.rebuildTerritory();
  assert.deepEqual(packed(globe.territories),packed(fresh.territories));
  assert.deepEqual(packed(globe.territoryBorders),packed(fresh.territoryBorders));
 }
});

test('100 animated rings upload only 100 transforms, then reuse their GPU allocation',()=>{
 const gl=fakeGL(),rings=new UnitRings(gl),globe={u:{}};
 for(let i=0;i<100;i++)rings.add([0,0,1],.032,[.1,.2,.3],1.008);
 rings.draw(globe);
 const upload=gl.calls.filter(c=>c[0]==='bufferSubData').at(-1)[3];
 assert.equal(upload.length,1100);assert.deepEqual(upload.slice(0,11),[0,0,1.008,0,.032,1,.032,1,.1,.2,.3].map(Math.fround));
 assert.equal(gl.calls.filter(c=>c[0]==='drawArraysInstanced').at(-1)[4],100);
 const allocations=gl.calls.filter(c=>c[0]==='bufferData').length;
 rings.reset();rings.add([1,0,0],.05,[1,0,0],1.1);rings.draw(globe);
 assert.equal(gl.calls.filter(c=>c[0]==='bufferData').length,allocations);
 rings.reset();const count=gl.calls.length;rings.draw(globe);assert.equal(gl.calls.length,count);
});

const scene=()=>({phase:'running',tick:1,tiles:[{owner:0,visible:true,explored:true,building:0,city:0}],cities:[{tile:0,owner:0,expansion_tiles:[1]}],players:[{civ:0}],discoveries:[{tile:2,kind:1,used:false}],squads:[{id:1,tile:0,hp:10}]});
test('scenery invalidation ignores combat/economy but tracks every visual dependency, including in-place mutations',()=>{
 const state=scene(),key=sceneryKey(state,false);
 state.tick++;state.squads[0].tile=2;state.squads[0].hp--;state.players[0].gold=200;
 assert.equal(sceneryKey(state,false),key);assert.notEqual(sceneryKey(state,true),key);
 for(const change of [s=>s.tiles[0].owner=1,s=>s.tiles[0].visible=false,s=>s.tiles[0].explored=false,s=>s.tiles[0].building=2,s=>s.tiles[0].city=1,s=>s.cities[0].owner=1,s=>s.cities[0].expansion_tiles.push(3),s=>s.players[0].civ=2,s=>s.discoveries[0].used=true]){
  const next=scene();change(next);assert.notEqual(sceneryKey(next,false),key);
 }
});

test('state reception skips unchanged scenery but still accepts motion, fog and ownership changes',()=>{
 const prior=globalThis.innerWidth;globalThis.innerWidth=393;
 try{
  let rebuilds=0,motion=0,fog=0;
  const globe=Object.assign(Object.create(Globe.prototype),{selectedCity:-1,effects:{items:[],accept(){}},motion:{accept(){motion++;}},models:{},loadModel(){},updateFog(){fog++;},rebuild(){rebuilds++;}});
  const state=scene();globe.setState(state,0);state.tick++;state.squads[0].tile=1;globe.setState(state,0);
  assert.equal(rebuilds,1);assert.equal(motion,2);assert.equal(fog,2);
  state.tiles[0].visible=false;globe.setState(state,0);assert.equal(rebuilds,2);
  state.tiles[0].owner=1;globe.setState(state,0);assert.equal(rebuilds,3);
 }finally{if(prior===undefined)delete globalThis.innerWidth;else globalThis.innerWidth=prior;}
});

test('scenery and outline passes share instance uploads, with camera and map changes invalidating visibility',()=>{
 const gl=fakeGL(),mesh=new Woodland(gl,new ArrayBuffer(60),{},false),camera={yaw:0,pitch:0,distance:3,u:{},rotate:p=>p};
 mesh.instances=[[0,0,1,0,1,1,1,1,1,0,0],[0,0,-1,0,1,1,1,1,1,0,0]];
 mesh.draw(camera);mesh.draw(camera,true);
 assert.equal(gl.calls.filter(c=>c[0]==='bufferSubData').length,1);
 assert.equal(mesh.visibleCount,1);
 camera.yaw=1;camera.rotate=p=>[p[0],p[1],-p[2]];mesh.draw(camera);assert.equal(gl.calls.filter(c=>c[0]==='bufferSubData').length,2);
 mesh.instances=[];mesh.draw(camera);assert.equal(mesh.visibleCount,0);
});

test('outline pose matches color pose even after another unit uses the same rig during a crossfade',()=>{
 const bytes=readFileSync('public/assets/forge/guard.rig'),gl=fakeGL();
 const mesh=new RiggedMesh(gl,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),null);
 const draw=(id,now,name,seconds)=>{mesh.draw(gl.TRIANGLES,{}, {id,now,name,seconds});return Array.from(mesh.pose);};
 draw(1,100,'idle',.1);draw(1,200,'walk',.2);
 const color=draw(1,240,'walk',.24);draw(2,240,'idle',1.2);
 const mask=draw(1,240,'walk',.24);assert.deepEqual(color,mask);
 assert.notDeepEqual(draw(1,260,'walk',.26),color);
});
