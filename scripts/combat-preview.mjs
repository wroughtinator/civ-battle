// Local-only, deterministic visual fixture; never served by the production worker.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {makeEngine} from '../worker/wasm.js';
const root=resolve('public'),engine=makeEngine(new WebAssembly.Module(readFileSync('worker/engine.wasm')));
const state=engine({op:'new',seed:42,count:4,difficulty:1}).state;
state.tiles.forEach(t=>{t.visible=true;t.explored=true;});
const to=state.tiles.findIndex(t=>t.terrain===1&&t.p[2]>.6),from=state.tiles[to].near.find(i=>state.tiles[i].terrain>0);
state.squads=[];state.phase='running';state.feedback=[];state.events=[];
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Combat effects preview</title><link rel="stylesheet" href="/style.css"><style>#fixture{position:fixed;bottom:12px;left:12px;right:12px;display:flex;gap:5px;flex-wrap:wrap;z-index:99}#fixture button{width:34px;height:34px;padding:5px}output{position:fixed;top:12px;left:12px;color:white}</style></head><body><canvas id="globe"></canvas><output aria-label="Effects triangles and CPU milliseconds"></output><nav id="fixture"></nav><script type="module">
import {Globe} from '/globe.js';import {icon} from '/icons.js';import {units} from '/roster.js';
const data=await(await fetch('/fixture.json')).json(),g=new Globe(document.getElementById('globe'),()=>{});
g.setWorld(data.state.tiles);g.setState(data.state,0);g.preview=false;g.targetOffset=0;g.targetDistance=3.1;g.focus(data.to);g.targetFocus[1]-=.5;
const params=new URLSearchParams(location.search);let kind=Number(params.get('kind')??-1),frozen=params.has('age')?Number(params.get('age')):null,start=performance.now();
const nav=document.getElementById('fixture');for(const k of [-1,...units.map(u=>u.id)]){const button=document.createElement('button');button.setAttribute('aria-label',k<0?'Nuclear blast':units[k].name);button.innerHTML=icon(k<0?'nuke':units[k].icon);button.onclick=()=>{kind=k;frozen=null;start=performance.now();};nav.append(button);}
const update=g.updateEffects.bind(g);let frames=0,total=0,max=0;
g.updateEffects=now=>{const age=frozen??((now-start)/1000)%(kind<0?7:2.8);
g.effects.items=kind<0?[{action:'nuclear',from:data.to,to:data.to,start:now-age*1000,end:now+1}]:[{action:age<.65?'shot':'impact',kind,from:data.from,to:data.to,start:now-(age<.65?age:age-.65)*1000,end:now+1,flight:650,id:'fixture',tick:1}];
const before=performance.now();update(now);const ms=performance.now()-before;total+=ms;max=Math.max(max,ms);frames++;if(frames%30===0)document.querySelector('output').textContent=g.effectsMesh.count/3+' / '+(total/frames).toFixed(2)+' / '+max.toFixed(2);};
</script></body></html>`;
createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(page);return;}if(url.pathname==='/fixture.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({state,from,to}));return;}const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.wasm':'application/wasm'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}}).listen(8897,'127.0.0.1',()=>console.log('Combat preview: http://127.0.0.1:8897'));

