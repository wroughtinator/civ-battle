import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {captureRelease,verifyArchives} from '../scripts/releases.mjs';
import {syncReleaseArchives,pushReleaseArchives} from '../scripts/release-git.mjs';

test('deployment backs up archives from detached dirty checkouts and rejects concurrent pushes',t=>{
 const dir=mkdtempSync(join(tmpdir(),'meridian-git-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const root=join(dir,'game'),remote=join(dir,'origin.git'),stale=join(dir,'stale');mkdirSync(root);
 const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 git(dir,'init','--bare','--initial-branch=main',remote);
 git(root,'init','--initial-branch=main');
 const identity=cwd=>{git(cwd,'config','user.name','Release test');git(cwd,'config','user.email','test@example.invalid');git(cwd,'config','core.autocrlf','false');};
 identity(root);
 for(const sub of ['public','worker'])mkdirSync(join(root,sub));
 writeFileSync(join(root,'public/_headers'),'/*\n  X-Content-Type-Options: nosniff\n');
 writeFileSync(join(root,'public/app.js'),'// original\n');
 writeFileSync(join(root,'worker/index.js'),'export class Room {}\n');
 const first=captureRelease(root,root,{bootstrap:true});
 git(root,'add','.');git(root,'commit','-m','Initial source and archive');git(root,'remote','add','origin',remote);git(root,'push','-u','origin','main');
 git(dir,'-c','core.autocrlf=false','clone',remote,stale);identity(stale);git(stale,'checkout','--detach');
 // Another checkout has already published an archive absent from this task.
 const base=syncReleaseArchives(root);
 writeFileSync(join(root,'public/app.js'),'// second release\n');
 const second=captureRelease(root,root);pushReleaseArchives(root,base);
 writeFileSync(join(stale,'public/app.js'),'// staged user edit\n');git(stale,'add','public/app.js');
 writeFileSync(join(stale,'public/app.js'),'// unstaged user edit\n');
 const head=git(stale,'rev-parse','HEAD'),index=git(stale,'diff','--cached'),working=readFileSync(join(stale,'public/app.js'),'utf8');
 const shared=syncReleaseArchives(stale);
 assert.ok(verifyArchives(stale).releases[second]);
 const third=captureRelease(stale,stale),published=pushReleaseArchives(stale,shared);
 const catalog=JSON.parse(git(stale,'show',`${published}:releases/catalog.json`));
 assert.equal(catalog.current,third);for(const id of [first,second,third])assert.ok(catalog.releases[id]);
 assert.equal(git(stale,'show',`${published}:public/app.js`),'// original');
 assert.equal(git(stale,'rev-parse','HEAD'),head);assert.equal(git(stale,'diff','--cached'),index);
 assert.equal(readFileSync(join(stale,'public/app.js'),'utf8'),working);
 assert.equal(pushReleaseArchives(stale,syncReleaseArchives(stale)),published,'unchanged archive does not add a commit');
 // Advance main after sync: deployment must stop rather than overwrite it.
 const staleBase=syncReleaseArchives(stale);
 const concurrent=git(stale,'commit-tree',`${staleBase}^{tree}`,'-p',staleBase,'-m','Concurrent main change');
 git(stale,'push','origin',`${concurrent}:refs/heads/main`);
 writeFileSync(join(stale,'public/app.js'),'// fourth release\n');captureRelease(stale,stale);
 assert.throws(()=>pushReleaseArchives(stale,staleBase),/production was not deployed/);
 assert.equal(git(stale,'ls-remote','origin','refs/heads/main').split(/\s/)[0],concurrent);
});
