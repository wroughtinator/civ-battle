// Local-only renderer benchmark. Build the WASM first with node scripts/build.mjs.
// --snapshot saves current JS for an identical before/after comparison.
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {makeEngine} from '../worker/wasm.js';
const root=resolve('public'),baseline=resolve('artifacts/renderer-baseline');
if(process.argv.includes('--snapshot')){
 mkdirSync(baseline,{recursive:true});
 for(const name of readdirSync(root))if(name.endsWith('.js'))copyFileSync(resolve(root,name),resolve(baseline,name));
}
const engine=makeEngine(new WebAssembly.Module(readFileSync('worker/engine.wasm')));
const state=engine({op:'new',seed:31415,count:6,difficulty:1}).state;
const views=state.players.map((_,player)=>engine({op:'view',state,player}).state);
state.rules=views[0].rules;
// Combine observed territory metadata for an all-visible renderer stress scene.
state.tiles=state.tiles.map((tile,i)=>({...tile,city:views.find(v=>v.tiles[i].city!=null)?.tiles[i].city??null}));
state.cities=state.cities.map(c=>views[c.owner].cities.find(v=>v.tile===c.tile));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm'};
createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/fixture.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(state));return;}
 let file=url.pathname==='/benchmark'?resolve('scripts/profile-renderer.html'):resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(url.pathname.startsWith('/baseline/'))file=resolve(baseline,url.pathname.slice(10));
 if(![root,baseline,resolve('scripts')].some(p=>file.startsWith(p+sep))||!existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
}).listen(8794,'127.0.0.1',()=>console.log('Renderer benchmark: http://127.0.0.1:8794/benchmark (add ?baseline=1 for saved version)'));
