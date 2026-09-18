import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEngine} from '../worker/wasm.js';
test('all three earlier rule sets remain pinned, and v4 is discrete pieces',()=>{for(const n of [1,2,3,4]){const run=makeEngine(new WebAssembly.Module(readFileSync(new URL(`../worker/engine${n===4?'':`-v${n}`}.wasm`,import.meta.url))));const state=run({op:'new',seed:42,count:8,difficulty:1}).state;const view=run({op:'view',state,player:0}).state;assert.equal(!!view.rules?.tactics,n===4);if(n===4){assert.equal(state.cities.length,8);assert.equal(state.players[0].food,undefined);}else assert.equal(typeof state.players[0].food,'number');}});
