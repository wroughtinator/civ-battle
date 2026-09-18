import test from 'node:test';
import assert from 'node:assert/strict';
import {manufactureUnits,unitDescription} from '../public/manufacture.js';
import {units} from '../public/roster.js';

test('catalog shows every unlocked unit suitable for the city, independent of cash',()=>{
 const state={players:[{gold:0,unlocked:units.map(u=>u.id)}]};
 const world=[{near:[1],terrain:1},{near:[0],terrain:1}];
 const inland=manufactureUnits(world,state,0,0);
 assert.deepEqual(new Set(inland),new Set(units.filter(u=>u.domain!=='sea').map(u=>u.id)));
 world[1].terrain=0;
 assert.equal(manufactureUnits(world,state,0,0).length,units.length);
 state.players[0].unlocked=[0,12,13];
 assert.deepEqual(manufactureUnits(world,state,0,0),[0,12,13]);
});

test('every manufacture card explains purpose and actual roster matchups',()=>{
 for(const u of units){
  const d=unitDescription(u.id);
  assert.equal(d.role,u.role);
  for(const k of u.counters)assert.ok(d.counters.includes(units[k].name));
  for(const other of units.filter(other=>other.counters.includes(u.id)))assert.ok(d.weak.includes(other.name));
  assert.ok(d.counters&&d.weak);
 }
});
