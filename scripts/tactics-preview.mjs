// Local-only QA fixture. Never included in the production asset directory.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {canFound} from '../public/planning.js';
import {makeEngine} from '../worker/wasm.js';
const root=resolve('public'),run=makeEngine(new WebAssembly.Module(readFileSync('worker/engine.wasm')));
const state=run({op:'new',seed:31415,difficulty:1}).state;state.tick=1000;state.players.forEach(p=>p.bot=false);state.players[0].gold=3000;state.players[0].unlocked=Array.from({length:14},(_,i)=>i);
const center=state.cities.find(c=>c.owner===0);center.production=3;center.radius=3;
const d=Array(642).fill(Infinity),q=[center.tile];d[center.tile]=0;for(let i=0;i<q.length;i++)for(const n of state.tiles[q[i]].near)if(d[n]===Infinity){d[n]=d[q[i]]+1;q.push(n);}
const base=state.squads[0];state.squads=[];
for(let k=0;k<14;k++){const tile=q.find(i=>d[i]>0&&d[i]<8&&(k>=7&&k<=9?state.tiles[i].terrain===0:state.tiles[i].terrain===1)&&!state.squads.some(u=>u.tile===i));if(tile===undefined)continue;state.squads.push({...base,id:100+k,owner:0,kind:k,tile,to:tile,path:[tile],left:0,hp:run({op:'view',state,player:0}).state.rules.specs[k].hp,ready:0,ability_ready:0,refit:-1});state.tiles[tile].owner=0;}
const used=new Set(state.squads.map(u=>u.tile));state.discoveries=Array.from({length:10},(_,k)=>{const tile=q.find(i=>d[i]>0&&d[i]<7&&state.tiles[i].terrain>0&&!used.has(i));used.add(tile);return {tile,kind:k,variant:k*871,used:false,owner:-1,seen:1,until:0};});
if(process.env.TACTICS_PREVIEW_SCENE==='settler'){
 const settler=state.squads.find(u=>u.kind===13);
 const tile=q.find(i=>canFound(state.tiles,state,i)&&state.tiles[i].terrain===1);
 Object.assign(settler,{tile,to:tile,path:[tile]});state.squads=[settler];state.discoveries=[];
 state.players[0].gold=200;state.tick=1000;
}
if(process.env.TACTICS_PREVIEW_SCENE==='combat'){
 const archer=state.squads.find(u=>u.kind===2),settler=state.squads.find(u=>u.kind===13);
 const tile=center.tile,target=state.tiles[tile].near[0];state.tiles[tile].terrain=1;state.tiles[target].terrain=1;
 Object.assign(archer,{tile,to:tile,path:[tile],locked_until:0,fire_at:0});
 state.squads=[archer,{...archer,id:201,kind:0,owner:1,tile:target,to:target,path:[target],hp:110},settler];state.discoveries=[];
}
if(process.env.TACTICS_PREVIEW_SCENE==='transport'){
 const ship=state.squads.find(u=>u.kind===9),guard=state.squads.find(u=>u.kind===0),tank=state.squads.find(u=>u.kind===3),settler=state.squads.find(u=>u.kind===13);
 const sea=q.find(i=>d[i]>0&&d[i]<6&&state.tiles[i].terrain===0&&state.tiles[i].near.some(j=>state.tiles[j].terrain===1));
 const land=state.tiles[sea].near.find(i=>state.tiles[i].terrain===1);
 Object.assign(ship,{tile:sea,to:sea,path:[sea]});
 Object.assign(guard,{tile:land,to:land,path:[land]});
 for(const u of [tank,settler])Object.assign(u,{tile:sea,to:sea,path:[sea],boarded_on:ship.id});
 state.squads=[ship,guard,tank,settler];state.discoveries=[];
}
if(process.env.TACTICS_PREVIEW_SCENE==='spectator'){
 state.cities.find(c=>c.owner===0).owner=1;
 const next=run({op:'step',state,ticks:1}).state;Object.assign(state,next);
}
if(process.env.TACTICS_PREVIEW_SCENE==='territory'){
 center.radius=1;center.production=1;state.squads=[];state.discoveries=[];
 const tile=q.find(i=>d[i]===4&&state.tiles[i].terrain===1&&canFound(state.tiles,state,i));
 state.cities.push({...center,tile,capital:-1,radius:1});
 Object.assign(state,run({op:'command',state,player:0,kind:'upgrade',from:tile,value:0}).state);
}
const port=Number(process.env.TACTICS_PREVIEW_PORT)||8795;
const patch=`previewState=await(await fetch('/fixture.json')).json();world=previewState.tiles;globe.setWorld(world);connected=true;fixtureRender=()=>{state={...previewState,...previewEngine({op:'view',state:previewState,player:0}).state,phase:'running',host:true,humans:1};state.tiles=previewState.tiles.map((t,i)=>({...state.tiles[i],...t,visible:true,explored:true}));state.squads=previewState.squads;state.discoveries=previewState.discoveries;globe.setState(state,0);feedbackLayer.accept(state);if(pointerHeld)pendingRender=true;else{render();rebuildMarkers();}lastStateAt=performance.now();lastTick=state.tick;};fixtureRender();home();setInterval(()=>{previewState=previewEngine({op:'step',state:previewState,ticks:1}).state;fixtureRender();},1000);if(previewState.squads.length===1)selectUnit(previewState.squads[0].id);if(previewState.squads.some(u=>u.id===201))selectUnit(102);`;
createServer((req,res)=>{
 if(req.url==='/fixture.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(state));return;}
 const path=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!path.startsWith(root+'\\')&&!path.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{let data=readFileSync(path);if(path.endsWith('app.js')){data=('let fixtureRender;\n'+data.toString()).replace("const command=(kind,data={})=>send('command',{kind,...data}).catch(()=>{});",`const command=(kind,data={})=>{const r=previewEngine({op:'command',state:previewState,player:0,kind,...data});previewState=r.state;fixtureRender();if(r.error)toast('warning',r.error,true);return Promise.resolve();};`);data=data.replace('makePreview();const id=',`${patch}const id=`);}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.wasm':'application/wasm','.webp':'image/webp','.mp3':'audio/mpeg'})[extname(path)]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(404).end();}
}).listen(port,'127.0.0.1',()=>console.log(`Tactics QA fixture http://127.0.0.1:${port}`));
