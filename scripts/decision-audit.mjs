import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {summarize,markdown} from './decision-audit-report.mjs';
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const seconds=Number(get('--seconds',120)),seed=Number(get('--seed',51000));
if(!Number.isFinite(seconds)||seconds<1||seconds>120||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Use --seconds 1..120 and a u32 seed');
const out=resolve(get('--out',`artifacts/planning-audit/${Date.now()}`));if(existsSync(out))throw Error('Choose a new output folder');
const files=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(rs|toml)$/.test(p))files.push(p);}}
walk('engine/src');walk('engine/examples/design_audit');files.push('data/units.json','engine/examples/decision_audit.rs','scripts/decision-audit.mjs','scripts/decision-audit-report.mjs','Cargo.toml','engine/Cargo.toml','Cargo.lock');
const hash=createHash('sha256');for(const f of files.sort()){hash.update(f.replaceAll('\\','/'));hash.update(readFileSync(f));}
const fingerprint=hash.digest('hex'),build=performance.now();const result=spawnSync('cargo',['build','--profile','audit','--example','decision_audit'],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);const buildSeconds=(performance.now()-build)/1000;
mkdirSync(out,{recursive:true});console.log(`Meridian Planning Audit: ${seconds}s, seed ${seed}. ${out}`);
const child=spawn(resolve('target/audit/examples/decision_audit'+(process.platform==='win32'?'.exe':'')),[String(seconds),String(seed)],{stdio:['ignore','pipe','inherit']});let raw='';child.stdout.on('data',b=>raw+=b);
const timer=setTimeout(()=>child.kill(),seconds*1000+3000);const code=await new Promise((r,j)=>{child.once('error',j);child.once('exit',r);});clearTimeout(timer);writeFileSync(join(out,'events.jsonl'),raw);
const events=raw.trim().split('\n').flatMap(s=>{try{return [JSON.parse(s)];}catch{return [];}}),r=summarize(events);r.build_seconds=buildSeconds;r.source_fingerprint=fingerprint;if(code!==0)r.verdict='INCONCLUSIVE';
writeFileSync(join(out,'summary.json'),JSON.stringify(r,null,2)+'\n');writeFileSync(join(out,'report.md'),markdown(r));console.log(JSON.stringify(r,null,2));process.exitCode=code!==0?1:args.includes('--check')&&r.verdict!=='PASS'?2:0;
