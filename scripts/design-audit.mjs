import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {summarize, markdown} from './design-audit-report.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.includes('--help')) {
  console.log('Usage: npm run analyze:design -- [--seconds 120] [--seed 42000] [--budgets 8,32] [--horizon 120] [--out artifacts/design-audit/<new-name>] [--no-build] [--check]\nAnalysis is bounded; first compilation is separate. --check returns 2 unless every certificate gate passes. Output folders must be new.');
  process.exit(0);
}
const options={seconds:120,seed:42000,budgets:'8,32',horizon:120};
let noBuild=false,check=false;
for(let i=0;i<args.length;i++) {
  const key=args[i];
  if(key==='--no-build') {noBuild=true;continue;}
  if(key==='--check') {check=true;continue;}
  if(!['--seconds','--seed','--budgets','--horizon','--out'].includes(key) || !args[i+1]) throw new Error(`Invalid argument: ${key}`);
  options[key.slice(2)]=args[++i];
}
const seconds=Number(options.seconds),seed=Number(options.seed),horizon=Number(options.horizon);
const budgets=options.budgets.split(',').map(Number);
if(!Number.isFinite(seconds)||seconds<1||seconds>3600) throw new Error('--seconds must be 1..3600');
if(!Number.isInteger(seed)||seed<0||seed>0xffffffff) throw new Error('--seed must be a u32');
if(!Number.isInteger(horizon)||horizon<6||horizon>1200||horizon%6) throw new Error('--horizon must be a multiple of 6 in 6..1200');
if(budgets.length<2||budgets.some((b,i)=>!Number.isInteger(b)||b<8||b>4096||(i&&b<=budgets[i-1]))) throw new Error('--budgets must contain at least two increasing integers in 8..4096');
const out=resolve(root,options.out??`artifacts/design-audit/${new Date().toISOString().replaceAll(':','-').replaceAll('.','-')}`);
if(existsSync(out)) throw new Error(`Output already exists; use a new folder: ${out}`);
const files=[];
function walk(dir) {for(const e of readdirSync(join(root,dir),{withFileTypes:true})) {const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(rs|toml)$/.test(p))files.push(p);}}
walk('engine/src');walk('engine/examples/design_audit');
files.push('data/units.json','engine/examples/design_audit.rs','engine/Cargo.toml','Cargo.toml','Cargo.lock','scripts/design-audit.mjs','scripts/design-audit-report.mjs');
const hash=createHash('sha256');
for(const f of files.sort()) {hash.update(f.replaceAll('\\','/'));hash.update(readFileSync(join(root,f)));}
const fingerprint=hash.digest('hex');
const buildStart=performance.now();
if(!noBuild) {
  const build=spawnSync('cargo',['build','--profile','audit','--example','design_audit'],{cwd:root,stdio:'inherit'});
  if(build.status!==0) process.exit(build.status??1);
}
const buildSeconds=(performance.now()-buildStart)/1000;
const metadata=spawnSync('cargo',['metadata','--no-deps','--format-version','1'],{cwd:root,encoding:'utf8'});
if(metadata.status!==0) throw new Error(metadata.stderr||'cargo metadata failed');
const binary=join(JSON.parse(metadata.stdout).target_directory,'audit','examples',process.platform==='win32'?'design_audit.exe':'design_audit');
mkdirSync(out,{recursive:true});
console.log(`Running Meridian Strategy Audit (${seconds}s); build took ${buildSeconds.toFixed(2)}s. Output: ${out}`);
const child=spawn(binary,[String(seconds),String(seed),out,budgets.join(','),String(horizon)],{cwd:root,stdio:'inherit'});
let timedOut=false;
// Cooperative native deadlines normally stop exactly at the requested budget.
// A small watchdog grace protects against a stuck simulator and preserves JSONL.
const watchdog=setTimeout(()=>{timedOut=true;child.kill();},seconds*1000+3000);
const status=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>done({code,signal}));});
clearTimeout(watchdog);
const events=[];
for(const line of readFileSync(join(out,'events.jsonl'),'utf8').split('\n').filter(Boolean)) {
  try {events.push(JSON.parse(line));} catch { /* A watchdog can interrupt the final write. */ }
}
const report=summarize(events);
report.source_fingerprint=fingerprint;report.build_seconds=buildSeconds;report.build_skipped=noBuild;
report.process={...status,watchdog_fired:timedOut};
if(!report.ended_cleanly||status.code!==0) {
  report.verdict='INCONCLUSIVE';
  report.warnings.unshift('The native audit did not finish cleanly. Partial evidence was recovered; no certificate is issued.');
}
if(noBuild) {
  report.verdict='INCONCLUSIVE';
  report.warnings.unshift('Build skipped: source fingerprint does not establish the identity of the executable. No certificate is issued.');
}
writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
writeFileSync(join(out,'report.md'),markdown(report));
console.log(`\n${report.verdict}: ${JSON.stringify(report.gates)}`);
for(const c of report.compute) console.log(`${c.high} vs ${c.low}: ${c.pairs} complete seed pairs, higher-compute wins ${c.high_win_rate==null?'n/a':(c.high_win_rate*100).toFixed(1)+'%'}`);
for(const warning of report.warnings) console.log(`- ${warning}`);
console.log(`Report: ${join(out,'report.md')}`);
process.exitCode=status.code!==0?1:check&&report.verdict!=='PASS'?2:0;
