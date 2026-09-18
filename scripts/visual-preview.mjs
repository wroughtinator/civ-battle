// Local-only asset inspection fixture. It is never part of the production Worker/assets.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {makeEngine} from '../worker/wasm.js';
const root=resolve('public');const engine=makeEngine(new WebAssembly.Module(readFileSync('worker/engine.wasm')));
const state=engine({op:'new',seed:42,count:4,difficulty:1}).state;state.tick=920;
const from=state.tiles.findIndex(t=>t.terrain>0&&t.p[2]>.45&&t.near.some(i=>state.tiles[i].terrain===0));const water=state.tiles[from].near.find(i=>state.tiles[i].terrain===0);
const second=state.tiles[water].near.find(i=>state.tiles[i].terrain===0&&i!==water);
state.tiles[from].owner=0;state.tiles[from].building=5;state.players[0].tech=[4,4,4];
state.squads=[{id:0,kind:0,tile:from,hp:60},{id:1,kind:2,tile:water,hp:45},{id:2,kind:1,tile:second,hp:65},{id:3,kind:3,tile:state.tiles[from].near.find(i=>state.tiles[i].terrain>0),hp:35}].map(s=>({...s,owner:0,to:s.tile,path:[s.tile],left:0,total:1,ready:0}));
state.phase='preview';const world=state.tiles.map(t=>({p:t.p,poly:t.poly,near:t.near,terrain:t.terrain,capital:t.capital}));
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><canvas id="globe"></canvas><nav id="tools"></nav><script type="module">import{Globe}from'/globe.js';import{icon}from'/icons.js';const data=await(await fetch('/fixture.json')).json();const g=new Globe(document.getElementById('globe'),i=>g.focus(i));g.setWorld(data.world);g.setState(data.state,0);g.preview=false;g.targetOffset=0;g.targetDistance=1.32;g.focus(data.from);const nav=document.getElementById('tools');for(const s of data.state.squads){const b=document.createElement('button');b.setAttribute('aria-label',['Tank','Submarine','Fleet','Special ops'][s.id]);b.innerHTML=icon(['tank','submarine','ship','specops'][s.id]);b.onclick=()=>{g.focus(s.tile);g.targetDistance=1.16;};nav.append(b);}</script></body></html>`;
createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(page);return;}if(req.url==='/fixture.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({state,world,from}));return;}const path=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!path.startsWith(root+'/')&&!path.startsWith(root+'\\')){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.wasm':'application/wasm'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}}).listen(8795,'127.0.0.1',()=>console.log('Local visual fixture: http://127.0.0.1:8795'));
