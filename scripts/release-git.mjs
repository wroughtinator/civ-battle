import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyArchives,retainPublished} from './releases.mjs';

const git=(root,args,options={})=>execFileSync('git',args,{cwd:root,encoding:'utf8',...options});
const temporary=fn=>{
 const directory=mkdtempSync(join(tmpdir(),'meridian-release-git-'));
 try{return fn(directory);}finally{rmSync(directory,{recursive:true,force:true});}
};

// Read the shared archives without touching the checkout's HEAD or real index.
export function syncReleaseArchives(root) {
 git(root,['fetch','origin','main']);
 const base=git(root,['rev-parse','refs/remotes/origin/main']).trim();
 temporary(directory=>{
  const env={...process.env,GIT_INDEX_FILE:join(directory,'index')};
  git(root,['read-tree',base],{env});
  const paths=git(root,['ls-tree','-r','--name-only','-z',base,'--','releases/']);
  git(root,['checkout-index','--prefix='+directory.replaceAll('\\','/')+'/','--stdin','-z'],{env,input:paths});
  const shared=verifyArchives(directory),local=verifyArchives(root);
  if(shared.bootstrap!==local.bootstrap)throw Error('Shared bootstrap release does not match this checkout');
  for(const [id,hash] of Object.entries(shared.releases)) {
   if(local.releases[id]&&local.releases[id]!==hash)throw Error(`Shared release conflicts with local archive: ${id}`);
  }
  // Both trees were verified. Never replace an existing immutable file.
  cpSync(join(directory,'releases'),join(root,'releases'),{recursive:true,force:false,filter:source=>!source.endsWith('catalog.json')});
  local.releases={...shared.releases,...local.releases};
  writeFileSync(join(root,'releases/catalog.json'),JSON.stringify(local,null,2)+'\n');
  verifyArchives(root);
 });
 return base;
}

// Back up exactly the archives, even from a dirty or detached task checkout.
// The ordinary fast-forward push rejects concurrent main updates; never force it.
export function pushReleaseArchives(root,base) {
 const catalog=verifyArchives(root);
 retainPublished(catalog,JSON.parse(git(root,['show',`${base}:releases/catalog.json`])));
 return temporary(directory=>{
  const env={...process.env,GIT_INDEX_FILE:join(directory,'index')};
  git(root,['read-tree',base],{env});
  git(root,['add','--','releases/'],{env});
  const tree=git(root,['write-tree'],{env}).trim();
  let commit=base;
  if(tree!==git(root,['rev-parse',`${base}^{tree}`]).trim()) {
   commit=git(root,['commit-tree',tree,'-p',base],{input:`Archive game release ${catalog.current}\n`}).trim();
  }
  try{git(root,['push','origin',`${commit}:refs/heads/main`]);}
  catch(error){throw Error('Release archive push to origin/main failed; production was not deployed. Resolve Git access or concurrent changes and rerun deploy.',{cause:error});}
  const remote=git(root,['ls-remote','origin','refs/heads/main']).split(/\s/)[0];
  if(remote!==commit)throw Error('origin/main changed during archive verification; rerun deploy before publishing.');
  console.log(`Release archives committed and verified on origin/main: ${commit}`);
  return commit;
 });
}
