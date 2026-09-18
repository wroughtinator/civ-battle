import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEngine} from '../worker/wasm.js';
import {createShowcase,showcasePosition,showcaseFeedback} from '../public/showcase.js';
import {canEnter,unitNames} from '../public/planning.js';

test('title world keeps every unit, terrain-correct patrols and a satellite without changing the game',()=>{
 const engine=makeEngine(new WebAssembly.Module(readFileSync(new URL('../worker/engine.wasm',import.meta.url))));
 for(const seed of [42,12345,987654]){
  const game=engine({op:'new',seed,count:8,difficulty:1}).state;
  const rules=engine({op:'view',state:game,player:0}).state.rules;
  const before=JSON.stringify(game),scene=createShowcase(game.tiles,rules,seed,()=>.42);
  assert.equal(new Set(scene.squads.map(u=>u.kind)).size,unitNames.length);
  assert.equal(scene.players.filter(p=>p.launch>0).length,1);
  const ids=scene.squads.map(u=>u.id);let shots=0,building=false;
  for(let now=0;now<240000;now+=500){
   for(const u of scene.squads){
    const pose=showcasePosition(u,game.tiles,now,()=>.42);
    assert.ok(canEnter(game.tiles,u.kind,u.tile));assert.ok(canEnter(game.tiles,u.kind,u.next));
    assert.ok(game.tiles[u.tile].near.includes(u.next));
    assert.ok(pose.p.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...pose.p)-1)<1e-8);
    building ||= u.founding;
   }
   showcaseFeedback(scene,game.tiles,now);shots+=scene.feedback.length;
   for(const event of scene.feedback)assert.ok(Number.isFinite(event.id));
  }
  assert.ok(shots>0);assert.ok(building);assert.deepEqual(scene.squads.map(u=>u.id),ids);
  assert.equal(JSON.stringify(game),before);
 }
});
