import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEngine} from '../worker/wasm.js';
import {route,passengers,landingTiles,boardingCapacity} from '../public/planning.js';
import {orderBlock,targetTiles} from '../public/controls.js';
const run=makeEngine(new WebAssembly.Module(readFileSync(new URL('../worker/engine.wasm',import.meta.url))));
function fixture(){
 const state=run({op:'new',seed:42}).state;
 state.tick=300;state.players.forEach(p=>p.bot=false);state.discoveries=[];
 const u=state.squads[0],land=100,sea=state.tiles[land].near[0];
 state.tiles.forEach(t=>t.terrain=1);state.tiles[sea].terrain=0;
 Object.assign(u,{owner:0,kind:3,tile:land,to:land,path:[land],left:0,locked_until:0});
 const ship={...u,id:999,kind:9,tile:sea,to:sea,path:[sea],hp:180};
 state.squads=[u,ship];return {state,u,ship,land,sea};
}
const view=state=>({...run({op:'view',state,player:0}).state,tick:state.tick,winner:state.winner});
test('boarding routes and counts agree with WASM, including full, foreign and non-boardable ships',()=>{
 let {state,u,ship,land,sea}=fixture();
 assert.deepEqual(route(state.tiles,view(state),u,sea).path,[land,sea]);
 const r=run({op:'command',state,player:0,kind:'move',from:u.id,to:sea});assert.equal(r.error,0);
 let v=view(r.state);assert.equal(passengers(v,ship).length,1);assert.equal(boardingCapacity(v,ship),3);
 const aboard=v.squads.find(s=>s.id===u.id);assert.equal(route(state.tiles,v,aboard,land),null);
 assert.ok(orderBlock(state.tiles,v,0,'move',{from:u.id}));
 for(const change of [s=>s.squads[1].owner=1,s=>s.squads[1].kind=7,s=>s.squads[1].refit=8,s=>{for(let i=0;i<3;i++)s.squads.push({...u,id:800+i,tile:sea,boarded_on:ship.id});}]){
  const blocked=structuredClone(state);change(blocked);
  assert.equal(route(blocked.tiles,view(blocked),blocked.squads[0],sea),null);
  assert.notEqual(run({op:'command',state:blocked,player:0,kind:'move',from:u.id,to:sea}).error,0);
 }
});
test('disembark highlighting and disabled controls match WASM terrain, occupancy and commitment checks',()=>{
 const {state,u,ship,land,sea}=fixture();Object.assign(u,{boarded_on:ship.id,tile:sea,to:sea,path:[sea]});
 let v=view(state);assert.ok(landingTiles(state.tiles,v,ship).includes(land));
 assert.deepEqual(targetTiles(state.tiles,v,ship,'disembark'),landingTiles(state.tiles,v,ship));
 const data={from:ship.id,to:land};
 assert.equal(orderBlock(state.tiles,v,0,'disembark',data),null);
 const r=run({op:'command',state,player:0,kind:'disembark',...data});assert.equal(r.error,0);
 assert.equal(r.state.squads[0].boarded_on,null);assert.equal(r.state.squads[0].tile,land);
 for(const change of [s=>s.tiles[land].terrain=4,s=>s.tiles[land].terrain=0,s=>s.squads[1].left=4,s=>s.squads[1].locked_until=310,s=>s.squads[0].boarded_on=null,s=>s.squads.push({...u,id:777,boarded_on:null,tile:land})]){
  const blocked=structuredClone(state);change(blocked);
  assert.ok(orderBlock(blocked.tiles,view(blocked),0,'disembark',data));
  assert.notEqual(run({op:'command',state:blocked,player:0,kind:'disembark',...data}).error,0);
 }
});
