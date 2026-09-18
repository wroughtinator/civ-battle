import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEngine} from '../worker/wasm.js';
import {canFound,abilities} from '../public/planning.js';
import {orderBlock,targetTiles,refitChoices} from '../public/controls.js';
import {units} from '../public/roster.js';
const run=makeEngine(new WebAssembly.Module(readFileSync(new URL('../worker/engine.wasm',import.meta.url))));
function fixture(){
 const state=run({op:'new',seed:42,difficulty:1}).state;
 state.tick=300;state.players.forEach(p=>p.bot=false);state.players[0].gold=1000;
 state.players[0].unlocked=Array.from({length:36},(_,i)=>i);
 state.discoveries=[];
 return state;
}
const view=state=>({...run({op:'view',state,player:0}).state,tick:state.tick,winner:state.winner});
test('automatic defence has no action button and research has no elapsed-time gate',()=>{
 const state=fixture(),u=state.squads.find(u=>u.owner===0&&u.kind===0);state.tick=0;
 for(const k of [0,3]){u.kind=k;assert.deepEqual(abilities(k),[]);compare(state,'ability',{from:u.id,value:0},false);}
 state.players[0].unlocked=[0,1,24,26,12,13];compare(state,'research',{value:3},true);
});
test('launch requires orbital research but permits skipping every unrelated technology',()=>{
 const state=fixture(),city=state.cities.find(c=>c.owner===0),u=state.squads.find(u=>u.owner===0&&u.tile===city.tile);
 city.production=3;u.kind=10;const data={from:u.id,value:0};
 compare(state,'ability',data,true);
 state.players[0].unlocked=[0,12,13,10];compare(state,'ability',data,true);
 state.players[0].unlocked=[0,12,13,35,33];compare(state,'ability',data,false);
});
function compare(state,kind,data,enabled){
 assert.equal(orderBlock(state.tiles,view(state),0,kind,data)===null,enabled);
 const result=run({op:'command',state,player:0,kind,...data});
 assert.equal(result.error===0,enabled,`${kind} must agree with Rust`);
 return result;
}
test('founding is visibly available only for a stationary, affordable settler on a valid site',()=>{
 const state=fixture(),u=state.squads.find(u=>u.owner===0&&u.kind===13);
 u.tile=state.tiles.findIndex((t,i)=>canFound(state.tiles,state,i)&&!state.squads.some(s=>s.tile===i));u.to=u.tile;u.path=[u.tile];
 const data={from:u.id,value:0};
 const result=compare(state,'ability',data,true);
 assert.equal(result.state.squads.find(s=>s.id===u.id).founding,true);
 assert.equal(result.state.squads.find(s=>s.id===u.id).work,25);
 for(const change of [s=>s.players[0].gold=0,s=>s.squads.find(s=>s.id===u.id).left=9,s=>s.squads.find(s=>s.id===u.id).locked_until=310,s=>s.squads.find(s=>s.id===u.id).tile=s.cities[0].tile]){
  const changed=structuredClone(state);change(changed);compare(changed,'ability',data,false);
 }
 assert.deepEqual(refitChoices(view(state),u),[], 'settlers never get the military refit menu');
 assert.ok(orderBlock(state.tiles,view(state),0,'stop',{from:u.id}),'idle stop is disabled');
});
test('city affordability and queued recruitment slots agree with authoritative rules',()=>{
 const state=fixture(),city=state.cities.find(c=>c.owner===0),data={from:city.tile,value:1};
 state.players[0].gold=109;compare(state,'upgrade',data,false);
 state.players[0].gold=110;compare(state,'upgrade',data,true);
 state.players[0].gold=1000;city.radius=3;compare(state,'upgrade',{from:city.tile,value:0},false);
 city.radius=1;
 // Queued units reserve capacity even though they do not occupy a hex yet.
 const other=state.cities.find(c=>c.owner!==0);other.owner=0;other.training=0;
 const cap=view(state).rules.unit_cap;
 const prototype=state.squads.find(u=>u.owner===0);
 for(let i=state.squads.filter(u=>u.owner===0).length;i<cap-1;i++)state.squads.push({...prototype,id:900+i,tile:100+i,path:[100+i]});
 compare(state,'train',{from:city.tile,value:0},false);
});
test('a fifth settlement is enabled and accepted when its site and funds are valid',()=>{
 const state=fixture();state.cities.slice(0,4).forEach(c=>c.owner=0);
 const u=state.squads.find(u=>u.owner===0&&u.kind===13);
 u.tile=state.tiles.findIndex((t,i)=>canFound(state.tiles,state,i)&&!state.squads.some(s=>s.tile===i));u.to=u.tile;u.path=[u.tile];
 const result=compare(state,'ability',{from:u.id,value:0},true);
 assert.equal(result.state.players[0].gold,865);
 assert.equal(result.state.squads.find(s=>s.id===u.id).founding,true);
});
test('refit cost, commitment, terrain and artillery setup disable actions before submission',()=>{
 const state=fixture(),u=state.squads.find(u=>u.owner===0&&u.kind===0);
 state.players[0].gold=20;compare(state,'refit',{from:u.id,value:3},false);
 state.players[0].gold=1000;compare(state,'refit',{from:u.id,value:3},false);assert.deepEqual(refitChoices(view(state),u),[]);
 u.kind=4;u.moved=state.tick-5;
 const targets=targetTiles(state.tiles,view(state),u,'attack');assert.ok(targets.length);
 compare(state,'attack',{from:u.id,to:targets[0]},false);
 u.moved=state.tick-10;compare(state,'attack',{from:u.id,to:targets[0]},true);
 u.locked_until=state.tick+10;compare(state,'attack',{from:u.id,to:targets[0]},false);
 assert.equal(orderBlock(state.tiles,view(state),0,'move',{from:u.id}),null,'movement can still be queued during recovery');
});
test('highlighted attack targets honor minimum range, sight, terrain and line of sight',()=>{
 for(const kind of [0,2,4,6,8,11]){
  const state=fixture(),u=state.squads.find(u=>u.owner===0&&u.kind===0);u.kind=kind;u.moved=0;
  if(kind===8){u.tile=state.tiles.findIndex(t=>t.terrain===0);u.to=u.tile;u.path=[u.tile];}
  const command=kind===11?'ability':'attack',targets=targetTiles(state.tiles,view(state),u,command);
  assert.ok(targets.length,`kind ${kind} has targets in this fixture`);
  for(const to of targets)compare(state,command,{from:u.id,to,value:0},true);
 }
});

test('Stop remains available during order recovery and preserves step cooldown',()=>{
 const state=fixture(),u=state.squads.find(u=>u.owner===0);
 u.path=[u.tile,state.tiles[u.tile].near[0]];u.to=u.path[1];u.left=5;state.players[0].cooldown=state.tick+2;
 const result=compare(state,'stop',{from:u.id},true),stopped=result.state.squads.find(s=>s.id===u.id);
 assert.deepEqual(stopped.path,[u.tile]);assert.equal(stopped.left,5);assert.equal(stopped.tile,u.tile);
});

test('all 36 client unit specs match WASM and only 33 belong to the research tree',()=>{
 const state=fixture();assert.deepEqual(view(state).rules.specs,units.map(u=>u.spec));
 assert.equal(units.filter(u=>u.researchable).length,33);
 assert.equal(view(state).rules.order_interval,0);assert.equal(view(state).rules.space_goal,360);
});

test('research goals queue locked prerequisites without an up-front payment and hide enemy plans',()=>{
 const state=fixture();state.players[0].unlocked=[0,12,13];state.players[0].gold=0;
 const planned=compare(state,'plan',{value:3},true).state;
 assert.deepEqual(planned.players[0].research_queue,[14,2,16,15,1,23,24,17,22,18,25,26,3]);assert.equal(planned.players[0].gold,0);
 assert.equal(run({op:'view',state:planned,player:1}).state.players[0].research_queue,undefined);
 for(const value of [0,12,13,36,254])compare(state,'plan',{value},false);
 compare(state,'plan',{value:255},true);
});

test('facing affordance agrees with authority for land walls, floating barriers and shield trucks',()=>{
 for(const kind of [16,26,30,34]){
  const state=fixture(),u=state.squads.find(u=>u.owner===0);u.kind=kind;
  const to=state.tiles[u.tile].near[0];
  const result=compare(state,'face',{from:u.id,to},true).state;
  assert.equal(result.squads.find(s=>s.id===u.id).facing,to);
  assert.equal(result.squads.find(s=>s.id===u.id).locked_until,state.tick+8);
  compare(state,'face',{from:u.id,to:u.tile},false);
  u.left=2;compare(state,'face',{from:u.id,to},false);
 }
});

test('robot disables manual controls but remains available during recovery',()=>{
 const state=fixture(),u=state.squads.find(u=>u.owner===0);
 u.automated=true;u.locked_until=state.tick+20;u.left=8;
 for(const kind of ['move','stop','attack','ability','face','explore','disembark','disband'])compare(state,kind,{from:u.id},false);
 compare(state,'auto',{from:u.id,value:0},true);
 compare(state,'auto',{from:u.id,value:1},true);
 assert.equal(orderBlock(state.tiles,view(state),0,'auto',{from:u.id,value:0}),null);
});
