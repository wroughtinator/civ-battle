import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync, copyFileSync} from 'node:fs';
import {join, dirname, relative} from 'node:path';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path,'utf8'));
const write = (path, data) => {mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);};
export function filesAt(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?filesAt(join(dir,e.name)).map(f=>`${e.name}/${f}`):[e.name]).sort();
}
export function loadCatalog(root) {return read(join(root,'releases/catalog.json'));}
function saveCatalog(root, catalog) {
  const path=join(root,'releases/catalog.json');
  write(path+'.tmp',JSON.stringify(catalog,null,2)+'\n');renameSync(path+'.tmp',path);
}
export function verifyArchives(root) {
  const catalog=loadCatalog(root);
  if(!catalog.releases[catalog.current]||!catalog.releases[catalog.bootstrap])throw Error('Incomplete release catalog');
  for(const [id, digest] of Object.entries(catalog.releases)) {
    const directory=join(root,'releases',id), manifestPath=join(directory,'release.json');
    if(sha(readFileSync(manifestPath))!==digest)throw Error(`Release manifest changed: ${id}`);
    const manifest=read(manifestPath);
    for(const [path, hash] of Object.entries(manifest.hashes)) {
      if(sha(readFileSync(join(directory,path)))!==hash)throw Error(`Immutable release changed: ${id}/${path}`);
    }
    const expected=Object.keys(manifest.hashes).filter(p=>!p.startsWith('../')).sort();
    const actual=filesAt(directory).filter(p=>p!=='release.json');
    if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error(`Release file list changed: ${id}`);
  }
  return catalog;
}
export function retainPublished(local, remote) {
  if(!remote?.releases || remote.bootstrap!==local.bootstrap)throw Error('Production bootstrap release does not match this checkout');
  for(const [id,hash] of Object.entries(remote.releases))if(local.releases[id]!==hash)throw Error(`Refusing to remove or replace production release ${id}`);
}

// Only root URLs are rewritten. Relative module imports remain inside the release.
function scopeClient(bytes, id, publicFiles) {
  const rootNames=[...new Set(['api','assets','legacy',...publicFiles.filter(f=>!f.includes('/'))])];
  const names=rootNames.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const pattern=new RegExp(`(?<![.\\w/\\-])/(?:${names})(?=/|["'\x60?#)\\s]|$)`,'g');
  const scoped=bytes.toString('utf8').replace(pattern,match=>`/releases/${id}${match}`);
  return Buffer.from(scoped.replaceAll('https://meridian-globe.camerons-nonsense.workers.dev/assets/',`https://meridian-globe.camerons-nonsense.workers.dev/releases/${id}/assets/`));
}
export function captureRelease(root, source, {bootstrap=false}={}) {
  const catalogPath=join(root,'releases/catalog.json');
  const catalog=existsSync(catalogPath)?verifyArchives(root):{schema:1,bootstrap:null,current:null,releases:{}};
  if(!catalog.bootstrap&&!bootstrap)throw Error('Capture the deployed baseline before creating releases');
  const publicFiles=filesAt(join(source,'public'));
  const workerFiles=filesAt(join(source,'worker')).filter(f=>/\.(js|wasm)$/.test(f)&&!['gateway.js','routing.js','pinned-room.js'].includes(f));
  const inputs=[...publicFiles.map(f=>`public/${f}`),...workerFiles.map(f=>`worker/${f}`)].sort();
  const inputHashes=Object.fromEntries(inputs.map(f=>[f,sha(readFileSync(join(source,f)))]));
  const id=sha(JSON.stringify({format:2,inputHashes})).slice(0,24);
  if(catalog.releases[id]) {catalog.current=id;saveCatalog(root,catalog);return id;}
  const directory=join(root,'releases',id);
  if(existsSync(directory))throw Error(`Incomplete release directory exists: ${directory}`);
  const hashes={}, wasmNames={};
  const put=(path, bytes)=>{write(join(directory,path),bytes);hashes[path]=sha(bytes);};
  for(const file of workerFiles.filter(f=>f.endsWith('.wasm'))) {
    const bytes=readFileSync(join(source,'worker',file));const name=sha(bytes)+'.wasm';
    put(`../engines/${name}`,bytes);wasmNames[file]=`../../engines/${name}`;
  }
  for(const file of workerFiles.filter(f=>f.endsWith('.js'))) {
    let code=readFileSync(join(source,'worker',file),'utf8');
    for(const [from,to] of Object.entries(wasmNames))code=code.replaceAll(`'./${from}'`,`'${to}'`).replaceAll(`"./${from}"`,`"${to}"`);
    put(`worker/${file}`,Buffer.from(code));
  }
  for(const file of publicFiles) {
    const bytes=readFileSync(join(source,'public',file));
    put(`public/${file}`,/\.(js|html|css|json)$/.test(file)?scopeClient(bytes,id,publicFiles):bytes);
  }
  const headers={};
  const headerText=readFileSync(join(source,'public/_headers'),'utf8').split(/\r?\n/);
  let global=false;
  for(const line of headerText){if(line&&!/^\s/.test(line)){global=line==='/*';continue;}const m=line.match(/^\s+([^:]+):\s*(.*)$/);if(global&&m)headers[m[1]]=m[2];}
  const manifest={id,format:2,inputHashes,hashes,publicFiles,headers};
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  write(join(directory,'release.json'),manifestBytes);
  catalog.releases[id]=sha(manifestBytes);catalog.current=id;
  if(bootstrap) {if(catalog.bootstrap)throw Error('Bootstrap is already frozen');catalog.bootstrap=id;}
  saveCatalog(root,catalog);return id;
}

export function stageReleases(root) {
  const catalog=verifyArchives(root), imports=[], entries=[];
  for(const id of Object.keys(catalog.releases)) {
    const manifest=read(join(root,'releases',id,'release.json'));
    imports.push(`import {Room as R${id}} from '../releases/${id}/worker/index.js';`);
    entries.push(`${JSON.stringify(id)}:{Room:R${id},files:${JSON.stringify(manifest.publicFiles)},headers:${JSON.stringify(manifest.headers)}}`);
    for(const file of manifest.publicFiles)if(!file.startsWith('_')) {
      const target=join(root,'.deploy/public/releases',id,file);mkdirSync(dirname(target),{recursive:true});
      copyFileSync(join(root,'releases',id,'public',file),target);
    }
  }
  write(join(root,'.deploy/registry.js'),`${imports.join('\n')}\nexport const releases=Object.freeze({${entries.join(',')}});\nexport const current=${JSON.stringify(catalog.current)},bootstrap=${JSON.stringify(catalog.bootstrap)};\nexport const catalog=${JSON.stringify(catalog)};\n`);
  return catalog;
}
