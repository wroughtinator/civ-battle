// Local-only complete asset audit using the actual game renderer.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {makeEngine} from '../worker/wasm.js';
const engine=makeEngine(new WebAssembly.Module(readFileSync('worker/engine.wasm')));
const state=engine({op:'new',seed:31415,difficulty:1}).state,root=resolve('public');
state.phase='running';state.tick=100;state.discoveries=[];state.cities=[];state.squads=[];state.strikes=[];
state.tiles.forEach(t=>{t.visible=true;t.explored=true;t.owner=-1;t.building=0;t.capital=-1;});
const coast=state.tiles.findIndex(t=>t.terrain===1&&t.near.some(j=>state.tiles[j].terrain===0));
const page=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>
#review{position:fixed;top:8px;left:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:95vw}#review button,#review select{padding:5px 9px;font-size:12px;color:#e6e9cf;background:#15323b;border:1px solid #617b7e;border-radius:5px}output{position:fixed;bottom:10px;left:12px;color:white;font:12px monospace;text-shadow:0 1px 3px black}#audit{position:fixed;right:10px;bottom:38px;max-height:170px;max-width:440px;overflow:auto;background:#101b22dc;color:#def;padding:10px;font:11px monospace;white-space:pre-wrap}#audit:empty{display:none}</style></head>
<body><canvas id="globe"></canvas><div id="review"></div><pre id="audit" aria-label="Audit results"></pre><output></output><script type="module">
import{Globe}from'/globe.js';import{unitNames}from'/planning.js';import{modelNames}from'/model-assets.js';
const state=await(await fetch('/fixture.json')).json(),catalog=await(await fetch('/assets/forge/catalog.json')).json();
const g=new Globe(document.querySelector('canvas'),i=>g.focus(i));g.setWorld(state.tiles);g.setState(state,0);g.targetDistance=1.4;g.targetOffset=0;g.focus(${coast});
let selected=0,serial=0,walking=false,last=0,elapsed=0,frames=0,auto=false,chosen='Coast',auditRunning=false,strikeStart=null;
const errors=[],observedPoses=new Set(),seenProjectiles=new Set();
const nav=document.querySelector('#review'),button=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.onclick=fn;nav.append(b);};
function clear(){state.squads=[];state.strikes=[];strikeStart=null;g.effects.items=[];g.setState(state,0);}
function select(k){clear();selected=k;chosen=modelNames[k];const sea=k>=7&&k<=9,tile=sea?state.tiles[${coast}].near.find(j=>state.tiles[j].terrain===0):${coast};state.squads=[{id:40,kind:k,owner:0,tile,to:tile,path:[tile],hp:100,ready:0,refit:-1}];g.setState(state,0);g.focus(tile);g.targetDistance=1.38;}
function attack(){const u=state.squads[0];if(!u)return;const to=state.tiles[u.tile].near[0];g.effects.accept({...state,feedback:[{id:++serial,tick:100,action:'shot',unit:40,kind:selected,from:u.tile,to,value:0,duration:1}]});}
function step(){const u=state.squads[0];if(!u)return;const sea=u.kind>=7&&u.kind<=9,to=state.tiles[u.tile].near.find(j=>sea?state.tiles[j].terrain===0:state.tiles[j].terrain!==0&&state.tiles[j].terrain!==4);if(to!==undefined){u.tile=to;g.setState(state,0);g.focus(to);}}
function showAsset(entry){chosen=entry.name;if(modelNames.includes(entry.name)){select(modelNames.indexOf(entry.name));return;}clear();chosen=entry.name;g.loadStatic(entry.name,entry.category==='tree');const p=state.tiles[${coast}].p,origin=p.map(v=>v*1.023);g.propInstances.set(entry.name,[[...origin,.5,.085,.085,.085,1]]);if(entry.category==='tree')g.treeGroups.set(entry.name,[[...origin,.5,.085,.085,.085,1]]);g.focus(${coast});g.targetDistance=1.38;}
button('Globe',()=>{clear();chosen='Mini Earth';g.targetDistance=3.1;});
button('Grass',()=>{clear();chosen='Meadow';g.focus(state.tiles.findIndex(t=>t.terrain===1&&!t.near.some(j=>state.tiles[j].terrain===0)));g.targetDistance=1.48;});
button('Coast',()=>{clear();chosen='Coast';g.focus(${coast});g.targetDistance=1.48;});
button('Mountains',()=>{clear();chosen='Mountains';g.focus(state.tiles.findIndex(t=>t.terrain===4));g.targetDistance=1.48;});
button('Forest',()=>{clear();chosen='Forest';g.staticReady=false;g.rebuild();g.focus(state.tiles.findIndex(t=>t.terrain===2));g.targetDistance=1.38;});
unitNames.forEach((name,k)=>button(name,()=>select(k)));button('Attack',attack);button('Repeat attacks',()=>auto=!auto);button('Walk',()=>walking=!walking);
button('Oblique',()=>{g.targetFocus=null;g.pitch-=.18;g.yaw+=.10;g.targetDistance=1.45;});
const picker=document.createElement('select');picker.setAttribute('aria-label','Asset');for(const entry of catalog.models)picker.add(new Option(entry.name,entry.name));picker.onchange=()=>showAsset(catalog.models.find(m=>m.name===picker.value));nav.append(picker);
function strike(kind){clear();chosen=kind===2?'Nuclear missile flight':'Ballistic missile flight';const from=${coast},to=state.tiles[state.tiles[from].near[0]].near.find(i=>i!==from);state.strikes=[{kind,from,to,owner:0,left:14,total:14}];g.setState(state,0);g.focus(from);g.targetDistance=1.85;strikeStart=performance.now();}
button('Ballistic missile',()=>strike(1));button('Nuclear missile',()=>strike(2));
button('Satellite',()=>{clear();chosen='Satellite orbit';state.players[0].launch=10;g.setState(state,0);g.targetDistance=2.4;});
const waitFrames=n=>new Promise(resolve=>{function next(){if(--n<=0)resolve();else requestAnimationFrame(next);}requestAnimationFrame(next);});
button('Run visual audit',async()=>{
 if(auditRunning)return;auditRunning=true;auto=walking=false;const results=[];errors.length=0;seenProjectiles.clear();const report=document.querySelector('#audit');
 try{for(const entry of catalog.models){showAsset(entry);picker.value=entry.name;report.textContent='Checking '+entry.name+' ('+(results.length+1)+'/'+catalog.models.length+')';const start=performance.now();
   while(!(modelNames.includes(entry.name)?g.models[modelNames.indexOf(entry.name)]:g.staticMeshes.get(entry.name))){if(performance.now()-start>10000)throw Error('Load timeout: '+entry.name);await waitFrames(1);}
   observedPoses.clear();await waitFrames(10);
   if(entry.category==='unit'){attack();await waitFrames(75);step();await waitFrames(8);}
   results.push({name:entry.name,loaded:true,poses:[...observedPoses],webglErrors:errors.length});
  }
  for(const kind of[1,2]){strike(kind);await waitFrames(15);results.push({name:kind===2?'nuclear-flight':'ballistic-flight',loaded:!!g.models[kind===2?15:14],webglErrors:errors.length});}
  report.textContent=JSON.stringify({passed:results.length===57&&errors.length===0&&results.every(r=>r.loaded)&&results.filter(r=>catalog.models.find(m=>m.name===r.name)?.category==='unit').every(r=>['idle','walk','attack'].every(p=>r.poses.includes(p)))&&seenProjectiles.size===8,assets:results.length,errors,projectiles:[...seenProjectiles],results},null,2);
 }catch(e){report.textContent=JSON.stringify({passed:false,error:e.message,results},null,2);}finally{auditRunning=false;}
});
setInterval(()=>{if(auditRunning)return;if(auto)attack();if(walking)step();},1600);
g.onFrame=now=>{frames++;elapsed+=last?now-last:0;last=now;const error=g.gl.getError();if(error)errors.push(error);const mesh=g.models[selected],pose=mesh?.states.get(40)?.name;if(pose)observedPoses.add(pose);for(const p of g.projectileBodies||[])seenProjectiles.add(modelNames[p.kind]);
 if(strikeStart!==null&&state.strikes.length){state.strikes[0].left=14-((now-strikeStart)/1000)%14;g.receivedAt=now;}
 if(frames%15===0)document.querySelector('output').textContent=chosen+' | WebGL errors: '+errors.length+' | '+Object.keys(g.models).length+' rigs / '+g.staticMeshes.size+' prop types | '+g.treeInstances.length+' trees | '+(pose||'static')+' | '+Math.round(frames/elapsed*1000)+' fps';
};
</script></body></html>`;
createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(page);return;}
 if(req.url==='/fixture.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(state));return;}
 const p=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!p.startsWith(root+'\\')&&!p.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}
}).listen(8797,'127.0.0.1',()=>console.log('Asset Forge review http://127.0.0.1:8797'));
