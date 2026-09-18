import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEngine} from '../worker/wasm.js';
import {route} from '../public/planning.js';
const run=makeEngine(new WebAssembly.Module(readFileSync(new URL('../worker/engine.wasm',import.meta.url))));
test('weighted client hex routes match authoritative paths across terrain',()=>{for(const seed of [42,515,1299]){const state=run({op:'new',seed,difficulty:1}).state;const u=state.squads.find(u=>u.owner===0&&u.kind===12);const view=run({op:'view',state,player:0}).state;for(let to=0;to<642;to+=29){const path=route(state.tiles,view,u,to);if(!path)continue;const result=run({op:'command',state,player:0,kind:'move',from:u.id,to});assert.equal(result.error,0);assert.deepEqual(result.state.squads.find(s=>s.id===u.id).path,path.path.length>1?path.path.slice(1):path.path);}}});
test('fleet routes stay on water and occupied friendly hexes block movement',()=>{const state=run({op:'new',seed:42}).state;const u=state.squads[0];u.kind=7;u.tile=state.tiles.findIndex(t=>t.terrain===0);u.path=[u.tile];state.squads=[u];const view=run({op:'view',state,player:0}).state;for(let to=0;to<642;to+=11){const path=route(state.tiles,view,u,to);if(path)assert.ok(path.path.every(i=>state.tiles[i].terrain===0));}const to=state.tiles[u.tile].near.find(i=>state.tiles[i].terrain===0);view.squads.push({...u,id:999,tile:to});assert.equal(route(state.tiles,view,u,to),null);});
