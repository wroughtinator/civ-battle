import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,markdown} from '../scripts/design-audit-report.mjs';
const config={type:'config',budgets:[8,32],horizon:120,seconds:120,seed:1};
const match=(controllers,winner)=>({controllers,winner,complete:true,victory:'space',captures:0,cities_founded:0,stats:[]});
const pair=(seed,score=1)=>({type:'pair',phase:'compute',a:'mcts-32',b:'mcts-8',seed,complete:true,
  matches:[match(['mcts-32','mcts-8'],score===0?1:0),match(['mcts-8','mcts-32'],score===1?1:0)]});
test('victory balance separates controls and excludes censored pairs and partial rotations',()=>{
  const mixed={type:'pair',phase:'meta',a:'guards',b:'archers',seed:1,complete:true,
    matches:[match(['guards','archers'],0),{...match(['archers','guards'],0),victory:'elimination'}]};
  const idle={...mixed,a:'idle',matches:[match(['idle','archers'],1),match(['archers','idle'],0)]};
  const partial={type:'multiplayer',rotation:0,match:match(['guards','archers'],0)};
  const r=summarize([config,mixed,idle,{...mixed,batch_complete:false},partial,pair(7)]);
  const c=r.victory_balance.cohorts;
  assert.equal(c.active_strategy.games,2);
  assert.equal(c.active_strategy.space_share,.5);
  assert.equal(c.active_strategy.distance_from_even_percentage_points,0);
  assert.equal(c.idle_control.space_share,1);
  assert.equal(c.compute.games,2);
  assert.equal(c.eight_player_full_rotations.games,0);
  assert.equal(c.eight_player_full_rotations.space_share,null);
  assert.match(markdown(r),/Distance from 50\/50/);
});
test('small samples cannot certify a thinking advantage',()=>{
  const r=summarize([config,pair(1)]);
  assert.equal(r.compute[0].high_win_rate,1);
  assert.equal(r.compute[0].verdict,'INCONCLUSIVE');
  assert.notEqual(r.verdict,'PASS');
});
test('diagnostic caps fail completion without inventing wins or draws',()=>{
 const stalled={controllers:['guards','archers'],complete:false,winner:null,stop_reason:'tick_cap'};
 const events=Array.from({length:4},(_,seed)=>({type:'pair',phase:'meta',seed,complete:false,batch_complete:true,matches:[stalled,stalled]}));
 const r=summarize([config,...events]);assert.equal(r.gates.completion,'FAIL');assert.equal(r.observations.completed_matches,0);
});
test('paired scores need consistent evidence; seat splits are not skill wins',()=>{
  const wins=summarize([config,...Array.from({length:8},(_,i)=>pair(i))]);
  assert.equal(wins.compute[0].verdict,'PASS');
  const splits=summarize([config,...Array.from({length:30},(_,i)=>pair(i,.5))]);
  assert.equal(splits.compute[0].high_win_rate,.5);
  assert.equal(splits.compute[0].verdict,'INCONCLUSIVE');
});
test('unfinished pairs and unfinished batches do not count as losses or wins',()=>{
  const r=summarize([config,{...pair(1),complete:false},{...pair(2),batch_complete:false}]);
  assert.equal(r.compute[0].pairs,0);
  assert.equal(r.observations.completed_matches,0);
  assert.equal(r.observations.excluded_incomplete_pairs,2);
});
test('eight scattered multiplayer completions are not a full rotation',()=>{
  const events=[0,1,2,3,8,9,10,11].map(rotation=>({type:'multiplayer',rotation,match:match(['adaptive','guards'],0)}));
  const r=summarize([config,...events]);
  assert.equal(r.multiplayer.complete_games,8);
  assert.equal(r.multiplayer.full_rotations,0);
  assert.equal(r.multiplayer.verdict,'INCONCLUSIVE');
});
test('empty reports render and never pass',()=>{
  const r=summarize([config]);
  assert.equal(r.verdict,'INCONCLUSIVE');
  assert.match(markdown(r),/not a proof/);
});
test('frequent idle wins fail the operational certificate',()=>{
  const samples=Array.from({length:4},(_,seed)=>({type:'pair',phase:'meta',a:'guards',b:'idle',seed,complete:true,
    matches:[match(['guards','idle'],1),match(['idle','guards'],0)]}));
  const r=summarize([config,...samples]);
  assert.equal(r.gates.active_beats_idle,'FAIL');
  assert.equal(r.verdict,'FAIL');
});
test('a reliable advantage from faster input blocks certification',()=>{
  const policies=['adaptive','guards','cavalry','archers','artillery','naval','space','expansion'];
  const events=Array.from({length:32},(_,seed)=>{
    const policy=policies[seed%8],a=`${policy}@2s`,b=`${policy}@8s`;
    return {type:'pair',phase:'apm_frequency',a,b,seed,complete:true,
      matches:[{...match([a,b],0),ticks:120},{...match([b,a],1),ticks:120}]};
  });
  const r=summarize([config,...events]);
  assert.equal(r.input_restraint.tests[0].verdict,'FAIL');
  assert.equal(r.gates.input_restraint,'FAIL');
  assert.equal(r.input_restraint.tests[0].excess_fast_win_percentage_points,50);
  assert.equal(r.verdict,'FAIL');
});
test('unknown APM evidence never passes and censored spam wins do not count',()=>{
  const e={type:'pair',phase:'apm_repeat',a:'guards@8s+repeat',b:'guards@8s',complete:true,batch_complete:false,
    matches:[match(['guards@8s+repeat','guards@8s'],0)]};
  const r=summarize([config,e]);
  assert.equal(r.gates.input_restraint,'INCONCLUSIVE');
  assert.equal(r.input_restraint.tests[1].pairs,0);
});
