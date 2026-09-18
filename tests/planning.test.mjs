import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEngine} from '../worker/wasm.js';
import {route,guardBlocks} from '../public/planning.js';
const run=makeEngine(new WebAssembly.Module(readFileSync(new URL('../worker/engine.wasm',import.meta.url))));
test('visible guard zones produce the same detour in client and WASM',()=>{
 const state=run({op:'new',seed:42}).state;state.players.forEach(p=>p.bot=false);state.tiles.forEach(t=>t.terrain=1);
 const u=state.squads.find(u=>u.owner===0),g=state.squads.find(u=>u.owner===1);g.tile=100;g.kind=0;g.path=[100];
 u.tile=state.tiles[100].near[0];u.path=[u.tile];const to=state.tiles[u.tile].near.find(t=>state.tiles[100].near.includes(t));state.squads=[u,g];
 const view=run({op:'view',state,player:0}).state;assert.ok(guardBlocks(state.tiles,view,u,u.tile,to));
 const plan=route(state.tiles,view,u,to);assert.ok(plan.path.length>2);
 const moved=run({op:'command',state,player:0,kind:'move',from:u.id,to});assert.equal(moved.error,0);assert.deepEqual(moved.state.squads.find(s=>s.id===u.id).path,plan.path.slice(1));
});
test('weighted client hex routes match authoritative paths across terrain',()=>{for(const seed of [42,515,1299]){const state=run({op:'new',seed,difficulty:1}).state;const u=state.squads.find(u=>u.owner===0&&u.kind===12);const view=run({op:'view',state,player:0}).state;for(let to=0;to<642;to+=29){const path=route(state.tiles,view,u,to);if(!path)continue;const result=run({op:'command',state,player:0,kind:'move',from:u.id,to});assert.equal(result.error,0);assert.deepEqual(result.state.squads.find(s=>s.id===u.id).path,path.path.length>1?path.path.slice(1):path.path);}}});
test('fleet routes stay on water and occupied friendly hexes block movement',()=>{const state=run({op:'new',seed:42}).state;const u=state.squads[0];u.kind=7;u.tile=state.tiles.findIndex(t=>t.terrain===0);u.path=[u.tile];state.squads=[u];const view=run({op:'view',state,player:0}).state;for(let to=0;to<642;to+=11){const path=route(state.tiles,view,u,to);if(path)assert.ok(path.path.every(i=>state.tiles[i].terrain===0));}const to=state.tiles[u.tile].near.find(i=>state.tiles[i].terrain===0);view.squads.push({...u,id:999,tile:to});assert.equal(route(state.tiles,view,u,to),null);});

test('reroutes start at the occupied tile during cooldown and land paths exclude water',()=>{
 const state=run({op:'new',seed:42}).state,u=state.squads.find(u=>u.owner===0&&u.kind===12);
 const view=run({op:'view',state,player:0}).state;
 for(let to=0;to<state.tiles.length;to+=7){
  const plan=route(state.tiles,view,u,to);if(!plan)continue;
  assert.ok(plan.path.every(i=>state.tiles[i].terrain!==0));
  if(plan.path.length<3)continue;
  const moving={...u,tile:plan.path[1],path:plan.path.slice(1),left:5};
  const next=route(state.tiles,view,moving,plan.path.at(-1));
  assert.equal(next.path[0],moving.tile);
  assert.deepEqual(route(state.tiles,view,moving,moving.tile),{path:[moving.tile],seconds:0});
 }
});
