import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEngine} from '../worker/wasm.js';
import {orderBlock} from '../public/controls.js';
import {researchTreeMarkup} from '../public/research-tree.js';
import {icon} from '../public/icons.js';
import {units} from '../public/roster.js';
const run=makeEngine(new WebAssembly.Module(readFileSync(new URL('../worker/engine.wasm',import.meta.url))));
const fixture=()=>{const s=run({op:'new',seed:42,count:2}).state;s.players.forEach(p=>p.bot=false);s.players[0].gold=1000;return s;};
const plan=(state,value)=>{const r=run({op:'command',state,player:0,kind:'plan',value});assert.equal(r.error,0);return r.state;};
test('switching and cancelling research refunds once, including completed-target cancellation',()=>{
 let s=fixture();s=plan(s,1);assert.equal(s.players[0].research,14);assert.equal(s.players[0].gold,1000-units[s.players[0].research].research_cost);
 s.players[0].research_left=1;s=plan(s,19);assert.equal(s.players[0].research,19);assert.equal(s.players[0].gold,1000-units[s.players[0].research].research_cost);
 const invalid=run({op:'command',state:s,player:0,kind:'plan',value:254});assert.notEqual(invalid.error,0);
 s.players[0].unlocked.push(14);s=plan(s,14);assert.equal(s.players[0].research,-1);assert.equal(s.players[0].gold,1000);
 s=plan(s,255);assert.equal(s.players[0].gold,1000);assert.deepEqual(s.players[0].research_queue,[]);
});
test('client accepts immediate orders despite a legacy player cooldown',()=>{
 const s=fixture();s.players[0].cooldown=9999;
 const v={...run({op:'view',state:s,player:0}).state,tick:s.tick,winner:s.winner};
 assert.equal(orderBlock(s.tiles,v,0,'plan',{value:10}),null);
 assert.equal(orderBlock(s.tiles,v,0,'upgrade',{from:s.cities[0].tile,value:0}),null);
 s.players[0].cooldown=0;
});
test('tree renders all eras and connections with distinct active and queued states',()=>{
 const s=plan(fixture(),1),markup=researchTreeMarkup(s.players[0],icon);
 assert.equal((markup.match(/data-tech=/g)||[]).length,33);
 assert.equal((markup.match(/class="research-era"/g)||[]).length,3);
 assert.match(markup,/class="research-links"/);assert.match(markup,/tree-node studying/);assert.match(markup,/tree-node queued/);
 assert.doesNotMatch(markup,/tech-inspector|tech-help|\/33/);
});

test('orbital goal queues only its two input paths and leaves unrelated branches locked',()=>{
 const s=plan(fixture(),10),p=s.players[0],path=[p.research,...p.research_queue];
 assert.equal(path.length,19);assert.equal(new Set(path).size,19);
 assert.ok(path.includes(35)&&path.includes(33));
 for(const k of [5,6,7,8,9,11,19,20,21,29,30,31,32,34])assert.ok(!path.includes(k));
});
