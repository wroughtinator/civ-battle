import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../scripts/decision-audit-report.mjs';
const config={type:'config',seed:1};
const combat=(comparison,score)=>({type:'combat',comparison,matches:[0,1].map(()=>({high_score:score,army_eliminated:false,remaining_health_value:1}))});
test('missing and small samples never establish planning advantage',()=>{
 assert.equal(summarize([config,{type:'end'}]).verdict,'INCONCLUSIVE');
 const r=summarize([config,combat('breadth',1),combat('foresight',1),{type:'end'}]);assert.equal(r.combat.foresight.verdict,'INCONCLUSIVE');
});
test('all distinct comparisons must independently pass, with incomplete launches retained',()=>{
 const events=[config,{type:'end'},...Array.from({length:32},()=>combat('breadth',1)),...Array.from({length:32},()=>combat('foresight',1)),...Array.from({length:32},()=>combat('restraint',1)),...Array.from({length:32},()=>({type:'space',result:{both_launched:true,high_seconds:1000,low_seconds:1100,saved_seconds:100}}))];
 assert.equal(summarize(events).verdict,'PASS');events.push({type:'space',result:{both_launched:false,high_seconds:4000,low_seconds:4000,saved_seconds:0}});assert.equal(summarize(events).verdict,'INCONCLUSIVE');
});
test('remaining material is not reported as an eliminated army',()=>{
 const r=summarize([config,combat('breadth',1),{type:'end'}]);assert.deepEqual(r.combat.breadth.army_elimination,{wins:0,losses:0,unresolved:2,mutual_destruction:0});
});
