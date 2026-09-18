import {execFileSync} from 'node:child_process';
import {existsSync, openSync, closeSync, unlinkSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {captureRelease,verifyArchives,stageReleases,retainPublished,sha} from './releases.mjs';
import {syncReleaseArchives,pushReleaseArchives} from './release-git.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const args=process.argv.slice(2), dryRun=args.includes('--dry-run'), releaseIndex=args.indexOf('--release');
const selected=releaseIndex>=0?args[releaseIndex+1]:null;
if(args.includes('--help')) {
  console.log('Usage: bash deploy.sh [--dry-run] [--release <id>]\n\nBuild, archive, check and deploy the game with your Wrangler login.\n--dry-run       Build and validate without changing production.\n--release <id>  Use an existing immutable release for NEW rooms (safe rollback).');
  process.exit(0);
}
const recognized=args.filter((_,i)=>i!==releaseIndex+1||releaseIndex<0);
if(recognized.some(a=>!['--dry-run','--release'].includes(a))||(releaseIndex>=0&&!/^[a-f0-9]{24}$/.test(selected??'')))throw Error('Invalid arguments. Use --help.');
const lock=join(root,'.deploy.lock');
let fd;
try {fd=openSync(lock,'wx');}catch {throw Error('Another deployment is running. If it was interrupted, remove .deploy.lock after checking no deployment is active.');}
writeFileSync(fd,JSON.stringify({pid:process.pid,started:new Date().toISOString()}));
const run=(command,args)=>execFileSync(command,args,{cwd:root,stdio:'inherit'});
const wrangler=args=>execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{cwd:root,stdio:'inherit',env:{...process.env,MERIDIAN_RELEASE_DEPLOY:'1'}});
const base='https://meridian-globe.camerons-nonsense.workers.dev';
try {
  const archiveBase=syncReleaseArchives(root);
  let catalog=verifyArchives(root);
  if(selected) {
    if(!catalog.releases[selected])throw Error(`Unknown archived release ${selected}`);
    catalog.current=selected;
    writeFileSync('releases/catalog.json',JSON.stringify(catalog,null,2)+'\n');
  } else {
    run(process.execPath,['scripts/build.mjs']);
    captureRelease(root,root);
  }
  catalog=stageReleases(root);
  run(process.execPath,['--test','tests/releases.test.mjs','tests/release-git.test.mjs','tests/loading.test.mjs']);
  const response=await fetch(base+'/api/releases');
  if(response.ok)retainPublished(catalog,await response.json());
  else if(response.status!==404)throw Error(`Cannot verify retained production releases: HTTP ${response.status}`);
  else {
    // First rollout only: prove the captured baseline still matches live rules/client.
    const baseline=JSON.parse(readFileSync(`releases/${catalog.bootstrap}/release.json`,'utf8'));
    for(const file of ['engine.wasm','app.js','globe.js']) {
      const live=await fetch(base+'/'+file);
      if(!live.ok||sha(Buffer.from(await live.arrayBuffer()))!==baseline.inputHashes['public/'+file])throw Error(`Production changed since baseline capture: ${file}`);
    }
  }
  console.log(`Release ${catalog.current}; retaining ${Object.keys(catalog.releases).length} immutable releases.`);
  if(!dryRun)pushReleaseArchives(root,archiveBase);
  wrangler(['deploy',...(dryRun?['--dry-run']:[])]);
  if(!dryRun) {
    let health;
    for(let attempt=0;attempt<6;attempt++) {
      health=await (await fetch(base+'/api/health',{cache:'no-store'})).json();
      if(health.release===catalog.current)break;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if(health.release!==catalog.current)throw Error('Deployment returned, but the public release has not switched; check /api/health before retrying.');
    retainPublished(catalog,await (await fetch(base+'/api/releases')).json());
    console.log(`Live: ${base}\nExisting rooms retain their original releases.`);
  }
} finally {closeSync(fd);unlinkSync(lock);}
