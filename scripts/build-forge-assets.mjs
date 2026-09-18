import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,copyFileSync,readdirSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('tools/asset-forge'),dest=resolve('public/assets/forge');mkdirSync(dest,{recursive:true});
execFileSync(process.execPath,[root+'/catalog.mjs'],{stdio:'inherit'});
execFileSync('cargo',['build','--release','--manifest-path',root+'/Cargo.toml'],{stdio:'inherit'});
const exe=root+'/target/release/asset-forge'+(process.platform==='win32'?'.exe':'');
const catalog=JSON.parse(readFileSync(root+'/catalog.json'));
for(const entry of catalog.models){const model=root+'/models/'+entry.name+'.json',texture=dest+'/'+entry.name+'.png',isStatic=['tree','prop'].includes(entry.category);
 execFileSync(exe,['bake',model,root+'/sources/materials.png',texture],{stdio:'inherit'});
 execFileSync(exe,['runtime',model,texture,dest+'/'+entry.name+(isStatic?'.mesh':'.rig'),...(isStatic?['--static-mesh']:[])],{stdio:'inherit'});
}
execFileSync(exe,['maps',root+'/sources/terrain.png',dest,'--palette',root+'/sources/terrain-palette.json'],{stdio:'inherit'});
// Older client entry points still use the original packed format. Rebuild those
// compatibility copies from the same new geometry/materials; never touch releases/.
const compatibility=['tank','fleet','submarine','recon','drone','missile','nuke','satellite'];
for(const name of compatibility)execFileSync(exe,['legacy-mesh',root+'/models/'+name+'.json',dest+'/'+name+'.png',resolve('public/assets',name+'.mesh')],{stdio:'inherit'});
for(const name of ['ocean-normal.png','ocean-roughness.png'])copyFileSync(dest+'/'+name,resolve('public/assets',name));
for(const file of readdirSync('public/assets'))if(file.endsWith('.rig')||(file.endsWith('.mesh')&&!compatibility.includes(file.slice(0,-5)))||file==='woodland.webp')unlinkSync(resolve('public/assets',file));
writeFileSync(dest+'/catalog.json',JSON.stringify(catalog,null,2)+'\n');console.log('Built complete Asset Forge runtime catalog.');
const old=JSON.parse(readFileSync('docs/asset-manifest.json')),assets=[];
function inventory(dir){for(const f of readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+f.name;if(f.isDirectory()){inventory(p);continue;}const bytes=readFileSync(p),prior=old.assets.find(a=>a.file===p);assets.push({file:p,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...(p.includes('/audio/')||p.endsWith('globe-share.jpg')?{license:prior?.license||'Original project visual',source:prior?.source}:{license:'Original geometry and AI-generated materials; see docs/ASSETS.md',source:'tools/asset-forge/catalog.json'})});}}
inventory('public/assets');assets.sort((a,b)=>a.file.localeCompare(b.file));writeFileSync('docs/asset-manifest.json',JSON.stringify({verified:'2026-09-18',pipeline:'Asset Forge',assets},null,2)+'\n');
