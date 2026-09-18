// Reporting is pure so censored samples and statistical gates can be regression-tested.
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const pct = x => x == null ? 'n/a' : `${(100*x).toFixed(1)}%`;
const active = ['adaptive', 'guards', 'cavalry', 'archers', 'artillery', 'naval', 'space', 'expansion'];

export function summarize(events) {
  const config = events.find(e => e.type === 'config') ?? {};
  const pairs = events.filter(e => e.type === 'pair' && e.complete && e.batch_complete !== false);
  const partialPairs = events.filter(e => e.type === 'pair' && (!e.complete || e.batch_complete === false)).length;
  const score = e => mean(e.matches.map(m => m.controllers[m.winner] === e.a ? 1 : 0));
  const compute = [];
  for (let i=1; i<(config.budgets?.length ?? 0); i++) {
    const high = `mcts-${config.budgets[i]}`, low = `mcts-${config.budgets[i-1]}`;
    const samples = pairs.filter(e => e.phase === 'compute' && e.a === high && e.b === low);
    const values = samples.map(score), rate = mean(values);
    // Distribution-free Hoeffding interval over independent seed/seat-pair scores.
    // Unlike treating the two seat-swapped games as independent Bernoulli trials,
    // this keeps their correlation inside one bounded [0,1] sample.
    const radius = values.length ? Math.sqrt(Math.log(40)/(2*values.length)) : 1;
    const lower = Math.max(0, (rate ?? 0)-radius), upper = Math.min(1, (rate ?? 1)+radius);
    compute.push({high, low, pairs:samples.length, games:samples.length*2,
      high_win_rate:rate, interval95:[lower,upper],
      verdict:lower > 0.5 ? 'PASS' : upper < 0.5 ? 'FAIL' : 'INCONCLUSIVE'});
  }
  const meta = pairs.filter(e => e.phase === 'meta');
  const inputTests=[];
  const inputGroups=[['apm_frequency','Same policy: 2s vs 8s',null],['apm_repeat','Same 8s thinking + repeated commands vs no repeats',null],
    ...(config.budgets??[]).slice(1).map((b,i)=>['apm_thinking',`Fast/shallow ${config.budgets[i]}@2s vs slow/deeper ${b}@8s`,`mcts-${config.budgets[i]}@2s:mcts-${b}@8s`])];
  for(const [phase,label,key] of inputGroups) {
    const samples=pairs.filter(e=>e.phase===phase&&(!key||`${e.a}:${e.b}`===key));
    const rate=mean(samples.map(score));
    const radius=samples.length?Math.sqrt(Math.log(40)/(2*samples.length)):1;
    const lower=Math.max(0,(rate??0)-radius),upper=Math.min(1,(rate??1)+radius);
    const fastApm=[],slowApm=[];let repeatAttempts=0;
    for(const e of samples)for(const m of e.matches)for(let p=0;p<m.controllers.length;p++) {
      const s=m.stats[p]??{orders:{}};
      const apm=Object.values(s.orders??{}).reduce((a,b)=>a+b,0)*60/Math.max(1,m.ticks);
      (m.controllers[p]===e.a?fastApm:slowApm).push(apm);
      repeatAttempts+=s.repeat_attempts??0;
    }
    const byPolicy={};for(const e of samples)(byPolicy[e.a]??=[]).push(score(e));
    const policyCoverage=Object.keys(byPolicy).length;
    const threshold=phase==='apm_thinking'?0.5:0.65;
    let verdict=lower>threshold?'FAIL':upper<=threshold?'PASS':'INCONCLUSIVE';
    if(!samples.length||(phase!=='apm_thinking'&&policyCoverage<8))verdict='INCONCLUSIVE';
    inputTests.push({phase,label,pairs:samples.length,fast_win_rate:rate,interval95:[lower,upper],verdict,
      excess_fast_win_percentage_points:rate==null?null:Math.max(0,(rate-.5)*100),
      fast_actual_apm:mean(fastApm),slow_actual_apm:mean(slowApm),repeat_attempts:repeatAttempts,
      policies:policyCoverage,breakdown:Object.fromEntries(Object.entries(byPolicy).map(([k,v])=>[k,{pairs:v.length,fast_win_rate:mean(v)}]))});
  }
  const inputRestraint={verdict:inputTests.some(t=>t.verdict==='FAIL')?'FAIL':inputTests.every(t=>t.verdict==='PASS')?'PASS':'INCONCLUSIVE',tests:inputTests};
  const matrix = {};
  for (const e of meta) {
    const s = score(e);
    (matrix[e.a] ??= {})[e.b] ??= [];
    (matrix[e.b] ??= {})[e.a] ??= [];
    matrix[e.a][e.b].push(s); matrix[e.b][e.a].push(1-s);
  }
  const strategies = active.map(name => {
    const opponents = Object.entries(matrix[name] ?? {}).filter(([n]) => n !== 'idle');
    const wins=meta.filter(e=>e.a!=='idle'&&e.b!=='idle').flatMap(e=>e.matches)
      .filter(m=>m.controllers[m.winner]===name);
    const winningRoutes={};for(const m of wins)winningRoutes[m.victory]=(winningRoutes[m.victory]??0)+1;
    return {name, opponents:opponents.length, pairs:opponents.reduce((s,[,a])=>s+a.length,0),
      winning_routes:winningRoutes,
      // Equal opponent weights avoid awarding a high rank for farming an easy opponent.
      mean_win_rate:mean(opponents.map(([,a])=>mean(a))),
      worst_matchup: opponents.length ? Math.min(...opponents.map(([,a])=>mean(a))) : null,
      matchups:Object.fromEntries(opponents.map(([n,a])=>[n,{pairs:a.length,win_rate:mean(a)}]))};
  }).sort((a,b)=>(b.mean_win_rate ?? -1)-(a.mean_win_rate ?? -1));
  const coverage = meta.filter(e=>e.a !== 'idle' && e.b !== 'idle');
  const cells = new Set(coverage.map(e=>[e.a,e.b].sort().join(':'))).size;
  const collapse = strategies.find(s=>s.opponents === 7 && s.mean_win_rate >= 0.8 && s.worst_matchup >= 0.5);
  const viable = strategies.filter(s=>s.opponents === 7 && s.mean_win_rate >= 0.4);
  const diversity = {verdict:cells<28 ? 'INCONCLUSIVE' : collapse ? 'FAIL' : viable.length>=3 ? 'PASS' : 'FAIL',
    tested_matchups:cells, required_matchups:28, viable_tested_policies:viable.map(s=>s.name),
    dominant_tested_policy:collapse?.name ?? null, strategies};
  const probes = events.filter(e=>e.type === 'probe' && e.complete).map(e=>{
    const byPolicy = active.map(policy=>{
      const branches = e.branches.filter(b=>b.policy===policy);
      return {policy, immediate:mean(branches.map(b=>b.immediate_value)), later:mean(branches.map(b=>b.later_value))};
    });
    const immediate = [...byPolicy].sort((a,b)=>b.immediate-a.immediate)[0];
    const later = [...byPolicy].sort((a,b)=>b.later-a.later)[0];
    const spread = later.later - Math.min(...byPolicy.map(p=>p.later));
    const delayedGain = later.later - immediate.later;
    // Require an actual rule-state consequence in addition to the heuristic gap.
    // Compare only within a fixed opponent continuation, not between opponents.
    const tangible = [...new Set(e.branches.map(b=>b.opponent))].some(o=>{
      const bs=e.branches.filter(b=>b.opponent===o);
      return new Set(bs.map(b=>b.cities)).size>1 || new Set(bs.map(b=>b.winner)).size>1
        || Math.max(...bs.map(b=>b.launch??b.mandate??0))-Math.min(...bs.map(b=>b.launch??b.mandate??0))>=10;
    });
    const select = (h,b) => e.recommendations.find(r=>r.horizon===h && r.result.requested===b)?.result.policy;
    const low=select(config.horizon,config.budgets[0]), high=select(config.horizon,config.budgets.at(-1));
    const longer=select(config.horizon*2,config.budgets.at(-1));
    const get = p => byPolicy.find(x=>x.policy===active[p])?.later;
    return {seed:e.seed,tick:e.tick,snapshot:e.snapshot,source_controllers:e.source_controllers,spread,delayed_gain:delayedGain,
      immediate_best:immediate.policy,later_best:later.policy,tangible_consequence:tangible,
      low_choice:active[low],high_choice:active[high],longer_choice:active[longer],
      high_minus_low_replay_value:get(high)-get(low),
      longer_minus_shorter_replay_value:get(longer)-get(high),policy_values:byPolicy};
  });
  const consequential = probes.filter(p=>p.tangible_consequence && p.spread>=0.03);
  const delayed = consequential.filter(p=>p.delayed_gain>=0.02);
  const decisions = {verdict:probes.length<3 ? 'INCONCLUSIVE' : consequential.length>=2 && delayed.length>=1 ? 'PASS' : 'FAIL',
    complete_positions:probes.length,consequential_positions:consequential.length,
    delayed_reversals:delayed.length,probes};
  const ffaEvents = events.filter(e=>e.type==='multiplayer');
  const ffa = ffaEvents.filter(e=>e.match.complete).map(e=>e.match);
  const ffaWins = Object.fromEntries(active.map(n=>[n,ffa.filter(m=>m.controllers[m.winner]===n).length]));
  // Require a full eight-seat rotation before interpreting multiplayer dominance.
  const groups = [...new Set(ffaEvents.map(e=>Math.floor(e.rotation/8)))].map(group=>
    ffaEvents.filter(e=>Math.floor(e.rotation/8)===group && e.match.complete));
  const fullGroups = groups.filter(g=>new Set(g.map(e=>e.rotation%8)).size===8);
  const balanced=fullGroups.flat().map(e=>e.match);
  const fullRotations=fullGroups.length;
  const balancedWins=Object.fromEntries(active.map(n=>[n,balanced.filter(m=>m.controllers[m.winner]===n).length]));
  const multiplayer={verdict:fullRotations<1 ? 'INCONCLUSIVE' : Math.max(...Object.values(balancedWins))/balanced.length>0.75 ? 'FAIL' : 'PASS',
    complete_games:ffa.length,full_rotations:fullRotations,wins:ffaWins,balanced_wins:balancedWins};
  const all = [...pairs.flatMap(e=>e.matches), ...ffa];
  const wins = {};
  for(const m of all) wins[m.victory]=(wins[m.victory]??0)+1;
  const orders={},trains={};
  let invalid=0;
  for(const m of all) for(const s of m.stats) {
    invalid+=s.invalid_orders??0;
    for(const [k,v] of Object.entries(s.orders)) orders[k]=(orders[k]??0)+v;
    for(const [k,v] of Object.entries(s.train_orders)) trains[k]=(trains[k]??0)+v;
  }
  const warnings=[];
  const weakPolicies=diversity.strategies.filter(s=>s.opponents===7&&s.mean_win_rate<0.4).map(s=>s.name);
  if(weakPolicies.length)warnings.push(`Underperforming tested policies (below 40% opponent-weighted wins): ${weakPolicies.join(', ')}. The diversity gate needs several viable policies; it does not mean every playstyle is competitive.`);
  const spaceShare=all.length?(wins.space??0)/all.length:null;
  if(spaceShare>=0.8)warnings.push(`${pct(spaceShare)} of counted victories are space launches. Military pressure may be feeding a space race rather than supporting an independent conquest route; inspect captures and the multiplayer endings.`);
  const pacing={};
  for(const group of ['two_player','eight_player']) {
    const completed=(group==='two_player'?meta.filter(e=>e.a!=='idle'&&e.b!=='idle').flatMap(e=>e.matches):ffa).filter(m=>Number.isFinite(m.ticks));
    const ticks=completed.map(m=>m.ticks).sort((a,b)=>a-b);
    pacing[group]={completed_games:ticks.length,mean_seconds:mean(ticks),median_seconds:ticks.length?ticks[Math.floor(ticks.length/2)]:null,p80_seconds:ticks.length?ticks[Math.floor(ticks.length*.8)]:null,completed_by_15_minutes:mean(ticks.map(t=>t<=900?1:0)),space_wins:completed.filter(m=>m.victory==='space').length};
  }
  const unused=(config.researchable_units??[]).filter(k=>!trains[k]);
  if(unused.length)warnings.push(`Researchable unit types never recruited in counted matches: ${unused.join(', ')}. Those playstyles lack full-match policy coverage; do not call the entire roster certified.`);
  if(pacing.two_player.mean_seconds>900)warnings.push(`Completed active two-player games average ${(pacing.two_player.mean_seconds/60).toFixed(1)} minutes, above the 15-minute target. Inspect the separate stall count too.`);
  const attemptedGames=events.flatMap(e=>e.type==='pair'?e.matches??[]:e.type==='multiplayer'?[e.match]:[]);
  const resolvedExperiments=attemptedGames.filter(m=>m.complete||m.stop_reason==='tick_cap');
  const capped=resolvedExperiments.filter(m=>m.stop_reason==='tick_cap').length;
  const completion={games:resolvedExperiments.length,tick_capped_games:capped,
    verdict:resolvedExperiments.length<8?'INCONCLUSIVE':capped/resolvedExperiments.length>0.1?'FAIL':'PASS'};
  if(capped)warnings.push(`${capped}/${resolvedExperiments.length} resolved experiments reached the 2,200-second diagnostic cap without a legal victory. They are stalls, not draws or wins; inspect blocked routes, passive policies and delayed space development.`);
  for(const t of inputTests) {
    if(t.fast_win_rate>0.5)warnings.push(`${t.label}: fast/repeated-input side wins ${pct(t.fast_win_rate)}; input penalty ${t.excess_fast_win_percentage_points.toFixed(1)} percentage points above 50%. ${t.verdict==='FAIL'?'This fails the input-restraint gate.':'Evidence is not yet decisive; see the interval.'}`);
  }
  if(collapse) warnings.push(`The tested meta concentrates on ${collapse.name}: ${pct(collapse.mean_win_rate)} mean win rate with no losing sampled matchup. This diagnoses this policy portfolio, not all possible human strategies.`);
  const totalWins=all.length, territory=wins.territory??0;
  if(totalWins && territory/totalWins>=0.8) warnings.push(`${pct(territory/totalWins)} of completed matches end through territorial influence. Check whether expansion/influence crowds out combat and alternative objectives.`);
  if(all.length && mean(all.map(m=>m.captures))<1) warnings.push('Fewer than one city capture per completed match on average: conquest is uncommon in this portfolio.');
  if(delayed.length===0) warnings.push('No tested position demonstrates a delayed ranking reversal with a tangible consequence. Long-term depth is not established.');
  if(compute.some(c=>c.verdict!=='PASS')) warnings.push('A reliable advantage from additional thinking has not been established at every tested budget step. Inspect sample size, search horizon, evaluator and action coverage before blaming the rules.');
  if(cells<28) warnings.push(`Strategy tournament coverage is incomplete (${cells}/28 active matchups); its ranking is provisional.`);
  if(fullRotations<1) warnings.push('Eight-player results do not yet cover a full seat rotation.');
  const control = meta.filter(e=>e.a==='idle'||e.b==='idle');
  const idleRate = mean(control.map(e=>e.a==='idle'?score(e):1-score(e)));
  if(idleRate>0.1) warnings.push(`Idle control won ${pct(idleRate)} of its matched games; investigate passive victory or weak opponents.`);
  const gates={thinking:compute.length && compute.every(c=>c.verdict==='PASS') ? 'PASS' : compute.some(c=>c.verdict==='FAIL') ? 'FAIL' : 'INCONCLUSIVE',
    policy_diversity:diversity.verdict,decision_consequences:decisions.verdict,multiplayer:multiplayer.verdict,
    active_beats_idle:control.length<4 ? 'INCONCLUSIVE' : idleRate>0.1 ? 'FAIL' : 'PASS',
    input_restraint:inputRestraint.verdict,completion:completion.verdict};
  const verdict=Object.values(gates).includes('FAIL')?'FAIL':Object.values(gates).every(g=>g==='PASS')?'PASS':'INCONCLUSIVE';
  return {schema_version:3,name:'Meridian Strategy Audit',verdict,certificate_scope:'Operational tests of this policy portfolio, sampled maps, horizons and input rates; not a proof of strategic depth or distinct human metas.',
    config,gates,compute,completion,pacing,unrecruited_unit_types:unused,underperforming_policies:weakPolicies,space_victory_share:spaceShare,input_restraint:inputRestraint,diversity,decisions,multiplayer,negative_control:{pairs:control.length,idle_win_rate:idleRate},
    observations:{completed_matches:all.length,excluded_incomplete_pairs:partialPairs,victory_counts:wins,
      average_captures:mean(all.map(m=>m.captures)),average_founded_cities:mean(all.map(m=>m.cities_founded)),
      orders,train_orders:trains,invalid_orders:invalid},warnings,
    ended_cleanly:events.some(e=>e.type==='end'),elapsed_seconds:events.find(e=>e.type==='end')?.elapsed_seconds ?? null};
}

export function markdown(r) {
  const lines=[`# Meridian Strategy Audit: ${r.verdict}`,'',r.certificate_scope,'',
    `Analysis budget: ${r.config.seconds}s. Measured analysis: ${r.elapsed_seconds?.toFixed(2) ?? 'interrupted'}s. Build: ${r.build_seconds?.toFixed(2) ?? 'unknown'}s.`,
    `Source fingerprint: \`${r.source_fingerprint ?? 'unknown'}\`. Seed: ${r.config.seed}.`, '',
    '| Gate | Result |','|---|---|',...Object.entries(r.gates).map(([k,v])=>`| ${k.replaceAll('_',' ')} | ${v} |`),'',
    '## Thinking advantage','',
    'Same evaluator, policy portfolio, information and two-second order opportunities. Search chooses a three-policy plan, executes it over the fixed horizon, then replans. Each sample includes both seat assignments on one seed. Entire unfinished parallel batches are excluded to avoid selecting only fast-finishing games. The conservative 95% interval treats each seed pair as one sample.','',
    '| Higher vs lower compute | Complete seed pairs | Higher win rate | 95% interval | Verdict |',
    '|---|---:|---:|---|---|',...r.compute.map(c=>`| ${c.high} vs ${c.low} | ${c.pairs} | ${pct(c.high_win_rate)} | ${c.interval95.map(pct).join(' – ')} | ${c.verdict} |`),'',
    '## Input frequency and spam penalty','',
    `The engine permits at most one normal order every ${r.config.order_interval??2} seconds (${(60/(r.config.order_interval??2)).toFixed(1)} opportunities/minute). The experiment still compares attempts every 2 versus 8 seconds; engine cooldowns reject premature attempts. Actual successful orders/minute are measured below; these are not mouse clicks. Search rollouts respect the experimental order intervals. Repeated-command bots think every 8 seconds and blindly retry their last successful command at intervening 2-second opportunities.`,'',
    '| Test (fast side first) | Seed pairs | Fast win rate | 95% interval | Excess over 50% | Actual APM, fast / slow | Verdict |',
    '|---|---:|---:|---|---:|---|---|',
    ...r.input_restraint.tests.map(t=>`| ${t.label} | ${t.pairs} | ${pct(t.fast_win_rate)} | ${t.interval95.map(pct).join(' – ')} | ${t.excess_fast_win_percentage_points?.toFixed(1)??'n/a'} pp | ${t.fast_actual_apm?.toFixed(1)??'n/a'} / ${t.slow_actual_apm?.toFixed(1)??'n/a'} | ${t.verdict} |`),'',
    'The descriptive penalty is excess fast-side wins above 50%, not an artificial change to match results. The same-policy/repeat gate allows at most 65% fast-side wins; the fast/shallow versus slow/deeper gate allows at most 50%. A confidence interval crossing the threshold remains INCONCLUSIVE. Passing also requires all eight policies represented in each same-policy test. The current game order interval is recorded in configuration; the experimental input rates and thresholds stay fixed.','',
    '## Tested strategy portfolio','',
    `${r.diversity.tested_matchups}/28 active matchups covered. Rates weight each tested opponent equally; idle is excluded. Shared tactical code means different policy names are not proof of different metas.`,'',
    '| Policy | Opponents | Seed pairs | Mean win rate | Worst matchup | Winning routes |', '|---|---:|---:|---:|---:|---|',
    ...r.diversity.strategies.map(s=>`| ${s.name} | ${s.opponents}/7 | ${s.pairs} | ${pct(s.mean_win_rate)} | ${pct(s.worst_matchup)} | ${JSON.stringify(s.winning_routes)} |`),'',
    '### Matchup matrix','',
    `| Policy | ${active.join(' | ')} |`,`|---|${active.map(()=>'---:').join('|')}|`,
    ...active.map(a=>`| ${a} | ${active.map(b=>a===b?'—':pct(r.diversity.strategies.find(s=>s.name===a)?.matchups[b]?.win_rate)).join(' | ')} |`),'',
    '## Decision consequences','',
    `${r.decisions.complete_positions} complete sampled positions; ${r.decisions.consequential_positions} consequential choices; ${r.decisions.delayed_reversals} delayed ranking reversals.`,
    'Values below are heuristic scores, not win probabilities. Counterfactuals use referee state; it is never supplied to the choosing bot. Each branch uses the same opponent continuation, commits the choice for one search interval, then continues adaptively for 240 seconds.','',
    '| Position | Immediate best → later best | Later value spread | Delayed gain | Real state consequence | More compute replay gain |',
    '|---|---|---:|---:|---|---:|',...r.decisions.probes.map(p=>`| ${p.snapshot} (${p.seed}:${p.tick}) | ${p.immediate_best} → ${p.later_best} | ${p.spread.toFixed(3)} | ${p.delayed_gain.toFixed(3)} | ${p.tangible_consequence} | ${p.high_minus_low_replay_value.toFixed(3)} |`),'',
    '## Outcomes and collapse warnings','',
    ...Object.entries(r.pacing??{}).map(([group,t])=>`${group.replaceAll('_',' ')}: ${t.completed_games} completed games, mean ${t.mean_seconds==null?'n/a':(t.mean_seconds/60).toFixed(1)} minutes, median ${t.median_seconds==null?'n/a':(t.median_seconds/60).toFixed(1)}, 80th percentile ${t.p80_seconds==null?'n/a':(t.p80_seconds/60).toFixed(1)}; ${pct(t.completed_by_15_minutes)} of completions within 15 minutes; ${t.space_wins} space victories. Capped games are excluded from duration averages and remain failures in the completion gate.`),
    `Counted ${r.observations.completed_matches} completed matches; excluded ${r.observations.excluded_incomplete_pairs} incomplete pairs.`,
    `Diagnostic tick-cap stalls: ${r.completion.tick_capped_games}/${r.completion.games} resolved experiments. Runtime cutoffs remain separate.`,
    `Victory routes: ${JSON.stringify(r.observations.victory_counts)}. Average captures: ${r.observations.average_captures?.toFixed(2) ?? 'n/a'}.`,
    `Eight-player games: ${r.multiplayer.complete_games}; full rotations: ${r.multiplayer.full_rotations}. Wins: ${JSON.stringify(r.multiplayer.wins)}.`,
    `Idle control: ${pct(r.negative_control.idle_win_rate)} win rate across ${r.negative_control.pairs} seed pairs.`,
    `Issued training orders by unit kind: ${JSON.stringify(r.observations.train_orders)}. Rejected real-world orders: ${r.observations.invalid_orders} (including deliberate repeated-command attempts).`,'',
    ...r.warnings.map(w=>`- ${w}`),'',
    '## Interpretation and agent instructions','',
    '- PASS means the explicit experimental gates passed, not that the game is solved or universally deep.',
    '- FAIL means this bounded suite observed a failed criterion. Do not automatically change balance: reproduce the problematic matchup or position and inspect the planner first.',
    '- INCONCLUSIVE means at least one required claim lacks evidence. Never translate it into PASS, and do not mistake unfinished games for draws.',
    '- Search is open-loop UCT over eight existing scripted policies. It cannot discover actions those policies never propose. Tactical control, transport, scouting and hidden-state priors remain limited.',
    '- No neural-network training, belief memory, equilibrium solver, mechanical rule ablations or exhaustive human-meta coverage is included.',
    '- Snapshot selection is the first six eligible non-idle match positions at tick 700, not an unbiased sample of all decisions. Budget and horizon probes are diagnostics, not full-game horizon win-rate evidence.',
    '- Before accepting a game change, keep seeds, budgets, horizon and this tool fixed; compare baseline/candidate reports. Repeat with fresh seeds before accepting a claimed improvement.',
    '- Raw evidence is in events.jsonl, machine-readable findings in summary.json, and replayable generated states in position-*.json. See docs/DESIGN_AUDIT.md for thresholds and extension points.',''];
  return lines.join('\n');
}
