// Local-only graphics review: actual renderer, deterministic world, synthetic combat events.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {makeEngine} from '../worker/wasm.js';
const engine=makeEngine(new WebAssembly.Module(readFileSync('worker/engine.wasm'))),state=engine({op:'new',seed:31415,difficulty:1}).state,root=resolve('public');
state.phase='running';state.tick=100;state.discoveries=[];state.cities=[];state.squads=[];state.tiles.forEach(t=>{t.visible=true;t.explored=true;t.owner=-1;t.building=0;t.capital=-1;});
const coast=state.tiles.findIndex(t=>t.terrain===1&&t.near.some(j=>state.tiles[j].terrain===0));
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>#review{position:fixed;top:8px;left:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:90vw}#review button{padding:5px 9px;font-size:12px;color:#e6e9cf;background:#15323b;border:1px solid #617b7e;border-radius:5px}output{position:fixed;bottom:10px;left:12px;color:white;font:12px monospace}</style></head><body><canvas id="globe"></canvas><div id="review"></div><output></output><script type="module">
import{Globe}from'/globe.js';import{unitNames}from'/planning.js';
const state=await(await fetch('/fixture.json')).json(),g=new Globe(document.querySelector('canvas'),i=>g.focus(i));g.setWorld(state.tiles);g.setState(state,0);g.targetDistance=1.40;g.targetOffset=0;g.focus(${coast});
let selected=0,serial=0,walking=false,last=0,elapsed=0,frames=0,auto=false;
const nav=document.querySelector('#review'),button=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.onclick=fn;nav.append(b);};
function select(k){selected=k;const sea=k>=7&&k<=9;const tile=sea?state.tiles[${coast}].near.find(j=>state.tiles[j].terrain===0):${coast};state.squads=[{id:40,kind:k,owner:0,tile,to:tile,path:[tile],hp:100,ready:0,refit:-1}];g.setState(state,0);g.focus(tile);g.targetDistance=1.32;}
function attack(){const u=state.squads[0];if(!u)return;const to=state.tiles[u.tile].near.find(j=>j!==u.tile);g.effects.accept({...state,feedback:[{id:++serial,tick:100,action:'shot',unit:40,kind:selected,from:u.tile,to,value:0,duration:1}]});}
button('Coast',()=>{state.squads=[];g.setState(state,0);g.focus(${coast});g.targetDistance=1.48;});
button('Mountains',()=>{g.focus(state.tiles.findIndex(t=>t.terrain===4));g.targetDistance=1.48;});
button('Forest',()=>{g.focus(state.tiles.findIndex(t=>t.terrain===2));g.targetDistance=1.30;});
unitNames.forEach((name,k)=>button(name,()=>select(k)));button('Attack',attack);button('Repeat attacks',()=>auto=!auto);button('Walk',()=>walking=!walking);
setInterval(()=>{if(auto)attack();if(walking&&state.squads.length){const u=state.squads[0],to=state.tiles[u.tile].near.find(j=>state.tiles[j].terrain===1);if(to!==undefined){u.tile=to;g.setState(state,0);g.focus(to);}}},1600);
g.onFrame=now=>{frames++;elapsed+=last?now-last:0;last=now;if(frames%60===0){document.querySelector('output').textContent='WebGL error: '+g.gl.getError()+' | '+Object.keys(g.models).length+' models | '+g.treeInstances.length+' trees | '+Math.round(frames/elapsed*1000)+' fps';}};
</script></body></html>`;
createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(page);return;}if(req.url==='/fixture.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(state));return;}const p=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(root+'\\')&&!p.startsWith(root+'/')){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}}).listen(8796,'127.0.0.1',()=>console.log('Graphics review http://127.0.0.1:8796'));
