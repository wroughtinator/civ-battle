import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const args=process.argv.slice(2),options={seed:42000,rounds:4,'max-ticks':7200};
for(let i=0;i<args.length;i+=2){const key=args[i]?.slice(2);if(!['seed','rounds','max-ticks','out'].includes(key)||!args[i+1])throw Error('Use --seed N --rounds N --max-ticks N --out NEW_DIRECTORY');options[key]=args[i+1];}
const seed=Number(options.seed),rounds=Number(options.rounds),ticks=Number(options['max-ticks']);
if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(rounds)||rounds<1||rounds>64||!Number.isInteger(ticks)||ticks<2200||ticks>21600)throw Error('Invalid seed, rounds (1..64), or max-ticks (2200..21600)');
const out=resolve(options.out??`artifacts/outcome-audit/${Date.now()}`);if(existsSync(out))throw Error('Choose a new output directory');
const files=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(rs|toml)$/.test(p))files.push(p);}}
walk('engine/src');walk('engine/examples/design_audit');files.push('engine/examples/design_audit.rs','data/units.json','Cargo.toml','engine/Cargo.toml','Cargo.lock','scripts/outcome-audit.mjs');
const hash=createHash('sha256');for(const f of files.sort()){hash.update(f.replaceAll('\\','/'));hash.update(readFileSync(f));}
const fingerprint=hash.digest('hex'),start=performance.now();
const build=spawnSync('cargo',['build','--profile','audit','--example','design_audit'],{stdio:'inherit'});if(build.status!==0)process.exit(build.status??1);
const buildSeconds=(performance.now()-start)/1000;
const run=spawnSync(resolve(`target/audit/examples/design_audit${process.platform==='win32'?'.exe':''}`),['--outcomes',String(seed),out,String(rounds),String(ticks)],{stdio:'inherit'});
if(run.status!==0)process.exit(run.status??1);
const events=readFileSync(join(out,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const cohorts={};for(const count of [2,8]){
 const games=events.filter(e=>e.type==='outcome'&&e.players===count).map(e=>e.match),wins=games.filter(m=>m.complete),times=wins.map(m=>m.ticks).sort((a,b)=>a-b);
 const space=wins.filter(m=>m.victory==='space').length,conquest=wins.filter(m=>m.victory==='elimination').length;
 cohorts[count]={scheduled_games:rounds*(count===2?56:8),games:games.length,space,conquest,other:wins.length-space-conquest,stalls:games.filter(m=>m.stop_reason==='tick_cap').length,deadline_interruptions:games.filter(m=>m.stop_reason.startsWith('deadline')).length,
  space_share_of_completions:wins.length?space/wins.length:null,mean_completed_seconds:times.length?times.reduce((s,t)=>s+t,0)/times.length:null,median_completed_seconds:times.length?times[Math.floor(times.length/2)]:null};
}
const report={name:'Long match outcome diagnostic',certificate:false,config:events[0],source_fingerprint:fingerprint,build_seconds:buildSeconds,elapsed_seconds:events.at(-1).elapsed_seconds,cohorts};
writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
const text=['# Long match outcome diagnostic','',`Seed ${seed}; ${rounds} fixed rounds; ${ticks} simulated seconds per game. No wall-clock sampling deadline. This is NOT a strategy certificate and does not replace the standard audit.`, '',
 '| Players | Played / scheduled | Space | Conquest | Stalls | Space share of completions | Mean completed minutes |', '|---|---:|---:|---:|---:|---:|---:|',
 ...Object.entries(cohorts).map(([p,c])=>`| ${p} | ${c.games}/${c.scheduled_games} | ${c.space} | ${c.conquest} | ${c.stalls} | ${c.space_share_of_completions==null?'n/a':(100*c.space_share_of_completions).toFixed(1)+'%'} | ${c.mean_completed_seconds==null?'n/a':(c.mean_completed_seconds/60).toFixed(1)} |`),'',
 'Every two-player policy matchup uses both seats. Eight-player games use full eight-seat rotations. Idle is excluded. Fixed fixtures prevent faster finishes from receiving extra weight. Stalls remain unfinished, never wins or draws. Percentages are conditional on completion; inspect stall counts before claiming balance. These are scripted policies, not a forecast of human play.', '',`Source: ${fingerprint}`,''].join('\n');
writeFileSync(join(out,'report.md'),text);console.log(text);
