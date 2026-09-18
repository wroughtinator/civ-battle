import {readFileSync} from 'node:fs';
import {verifyArchives,stageReleases} from './releases.mjs';

if(process.env.MERIDIAN_LOCAL_DEV!=='1') {
  let lock;
  try {lock=JSON.parse(readFileSync('.deploy.lock','utf8'));process.kill(lock.pid,0);}catch{lock=null;}
  if(process.env.MERIDIAN_RELEASE_DEPLOY!=='1'||!lock)throw Error('Use bash deploy.sh or npm run deploy. Direct Wrangler deployments bypass live-match release protection.');
}
verifyArchives(process.cwd());stageReleases(process.cwd());
