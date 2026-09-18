import { Globe } from './globe.js';
import { icon, colors, civs, civNames, buildings, techs } from './icons.js';
import { Soundscape } from './audio.js';
import {reachableProvinces,equipmentTargets} from './planning.js';
const $=id=>document.getElementById(id),show=(id,yes)=>$(id).classList.toggle('hidden',!yes);
const btn=(id,symbol,label,body='',extra='')=>`<button ${id?`id="${id}"`:''} aria-label="${label}" ${extra}>${icon(symbol)}${body}</button>`;
const num=n=>Math.floor(n??0),time=n=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,world=[],slot=0,room=null,token=null,ws=null,seq=0,inflight=null,connected=false,stopped=false;
let selected=-1,marchFrom=-1,marchRatio=0,previewEngine=null,previewState=null,count=8,difficulty=1,seed=crypto.getRandomValues(new Uint32Array(1))[0],civ=0;
let techOpen=false,lastTick=0,lastStateAt=performance.now(),sound=false,audio=null,markerNodes=[],marchNodes=[],hasStarted=false,retry=0,reconnectTimer,toastTimer;
let creating=null,readyResolve=null,pointerHeld=false,pendingRender=false;
document.addEventListener('pointerdown',()=>pointerHeld=true,true);
const finishPointer=()=>requestAnimationFrame(()=>{pointerHeld=false;if(pendingRender&&state){pendingRender=false;render();rebuildMarkers();}});
document.addEventListener('pointerup',finishPointer,true);document.addEventListener('pointercancel',finishPointer,true);
let arsenal=false,activeUnit=-1,targetOrder=null;
let callsign=1000+crypto.getRandomValues(new Uint32Array(1))[0]%9000;const encountered=new Set();
const pick=values=>values[crypto.getRandomValues(new Uint32Array(1))[0]%values.length];
let username=pick(['Mighty','Cosmic','Brave','Golden','Quiet','Lucky','Nimble','Velvet','Wandering','Daring','Sunny','Clever','Silver','Wild','Royal','Hidden'])+' '+pick(['Mango','Fox','Owl','Otter','Peach','Panda','Falcon','Tiger','Lynx','Kiwi','Badger','Orca','Cedar','Comet','Walrus','Lotus']);
try{const saved=document.cookie.split('; ').find(x=>x.startsWith('meridian_name='));if(saved)username=Array.from(decodeURIComponent(saved.slice(14))).slice(0,32).join('')||username;}catch{}
let profileTimer,profilePromise=Promise.resolve(),profileDirty=false;
try{const identity=JSON.parse(localStorage.getItem('meridian:identity'));if(identity&&Number.isInteger(identity.tag)){callsign=identity.tag;civ=identity.civ||0;}}catch{}
function rememberIdentity(){try{localStorage.setItem('meridian:identity',JSON.stringify({tag:callsign,civ}));document.cookie=`meridian_name=${encodeURIComponent(username)}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;}catch{}}
rememberIdentity();
async function syncProfile(){while(profileDirty&&connected&&state?.phase==='lobby'){if(inflight)await inflight.promise.catch(()=>{});const profile={civ,name:username,tag:callsign};await send('civ',profile);if(profile.name===username&&profile.civ===civ)profileDirty=false;}}
function queueProfile(){profileDirty=true;clearTimeout(profileTimer);profileTimer=setTimeout(()=>{profilePromise=profilePromise.catch(()=>{}).then(syncProfile).catch(()=>{});},350);}
async function flushProfile(){clearTimeout(profileTimer);await profilePromise;profileDirty=true;await syncProfile();}
const unitIcons=['tank','ship','submarine','specops'],unitNames=['Tank battalion','Surface fleet','Submarine','Special operations'];
let globe;
const soundscape=new Soundscape();sound=soundscape.enabled;
document.addEventListener('pointerdown',()=>soundscape.unlock(),{passive:true});
document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('#sound'))soundscape.play('click',.12);});
function toast(symbol,value='',error=false){$('toast').innerHTML=icon(symbol)+`<span>${value}</span>`;$('toast').className=`show ${error?'error':''}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').className='',3500);beep(error?160:510);}
function beep(freq=480){soundscape.play(freq<200?'warning':'click',freq<200?.22:.14);}
function setConnected(value){connected=value;$('connection').classList.toggle('offline',!value);$('connection').innerHTML=icon(value?'network':'refresh');renderControls();}
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data;try{data=await r.json();}catch{throw Error('503');}if(!r.ok)throw Error(String(data.error||r.status));return data;}
function stored(id){try{return JSON.parse(localStorage.getItem(`meridian:${id}`)||'null');}catch{return null;}}
function saveSeat(){try{localStorage.setItem(`meridian:${room}`,JSON.stringify({token,slot}));}catch{}}
async function createRoom(){
 if(room&&connected)return;
 if(creating)return creating;
 creating=(async()=>{const data=await api('/releases/5be701fc5855cb2f1c641919/api/rooms',{seed,count:8,difficulty,civ,name:username,tag:callsign});room=data.room;token=data.token;slot=data.slot;seq=data.seq;saveSeat();history.replaceState({},'',`/?room=${room}`);await connect();})();
 try{await creating;}finally{creating=null;renderControls();}
}
async function joinRoom(id){room=id;const saved=stored(id);const data=await api(`/releases/5be701fc5855cb2f1c641919/api/rooms/${id}/join`,{token:saved?.token,civ,name:username,tag:callsign});token=data.token;slot=data.slot;seq=data.seq;saveSeat();await connect();}
function connect(){
 clearTimeout(reconnectTimer);stopped=false;
 const ready=new Promise(resolve=>readyResolve=resolve);
 ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/releases/5be701fc5855cb2f1c641919/api/rooms/${room}/ws`,['meridian',token]);
 ws.onmessage=e=>{
  const msg=JSON.parse(e.data);
  if(msg.type==='welcome'){slot=msg.slot;seq=Math.max(seq,msg.seq);world=msg.world;globe.setWorld(world);if(inflight)ws.send(JSON.stringify(inflight.message));}
  if(msg.type==='world'){world=msg.world;globe.setWorld(world);}
  if(msg.type==='state'){
   if(state?.revision>msg.revision&&state.phase!=='preview')return;
   const previous=state;state=msg;seed=msg.seed;count=msg.players.length;difficulty=msg.difficulty;if(!profileDirty)civ=msg.players[slot].civ;
   callsign=msg.players[slot].tag;if(!profileDirty&&document.activeElement?.id!=='username'){username=msg.players[slot].name||username;rememberIdentity();}else msg.players[slot].name=username;
   if(!connected){setConnected(true);retry=0;}lastTick=msg.tick;lastStateAt=performance.now();globe.setState(msg,slot);
   if(msg.phase==='running'&&!hasStarted){hasStarted=true;home();if(!localStorage.getItem('meridian:learned'))openGuide();}
   soundscape.events(msg,previous,world,globe,slot);
   if(msg.phase==='running'){for(const t of msg.tiles)if(t.visible&&t.owner>=0&&t.owner!==slot&&!encountered.has(t.owner)){encountered.add(t.owner);toast(civs[msg.players[t.owner].civ],html(msg.players[t.owner].name));break;}}
   if(pointerHeld)pendingRender=true;else{render();rebuildMarkers();}if(readyResolve){readyResolve();readyResolve=null;}
  }
  if(msg.type==='ack'&&inflight?.message.seq===msg.seq){const pending=inflight;inflight=null;renderControls();if(msg.error){toast(['','warning','bolt','shield','sail','coin','lock'][msg.error]||'warning',msg.error,true);pending.reject(Error(String(msg.error)));}else{soundscape.command(pending.message.kind||pending.message.type,pending.message.value);pending.resolve();}}
  if(msg.type==='resync'){seq=msg.seq;if(inflight){const pending=inflight;inflight=null;pending.reject(Error('409'));}toast('refresh',409,true);}
  if(msg.type==='pong'){$('connection').innerHTML=icon('network')+`<span>${Math.max(1,Date.now()-msg.time)}</span>`;}
  if(msg.type==='error')toast('warning',msg.code,true);
 };
 ws.onclose=e=>{setConnected(false);if(e.code===4001){stopped=true;toast('lock',4001,true);return;}if(stopped)return;reconnectTimer=setTimeout(()=>connect(),Math.min(12000,700*2**Math.min(retry++,4)));};
 ws.onerror=()=>setConnected(false);
 return ready;
}
function send(type,payload={}){
 if(!connected||ws?.readyState!==1)return Promise.reject(Error('503'));
 if(inflight){toast('hourglass');return Promise.reject(Error('429'));}
 const request=new Promise((resolve,reject)=>{inflight={message:{type,...payload,seq:++seq},resolve,reject};ws.send(JSON.stringify(inflight.message));renderControls();});inflight.promise=request;return request;
}
const command=(kind,data={})=>send('command',{kind,...data}).catch(()=>{});
setInterval(()=>{if(connected&&ws?.readyState===1)ws.send(JSON.stringify({type:'ping',time:Date.now()}));},10000);
function renderControls(){if(!state)return;const lobby=state.phase==='lobby'||state.phase==='preview';$('start').disabled=!!inflight||!!creating||lobby&&state.phase!=='preview'&&(!connected||!state.host);$('invite').disabled=!!creating;}
function render(){
 const lobby=state.phase==='lobby'||state.phase==='preview';document.body.classList.toggle('in-lobby',lobby);show('lobby',lobby);show('roster',!lobby);show('dock',!lobby);$('resources').innerHTML=lobby?'':resources();
 $('clock').innerHTML=icon('clock')+`<span>${time(state.tick)}</span>`;
 if(lobby)renderLobby();else{renderRoster();renderProvince();renderResearch();}
 renderControls();if(state.phase==='ended')renderEnding();
}
function resources(){const p=state.players[slot];return `<div class="resource gold" aria-label="Gold">${icon('coin')}<span>${num(p.gold)}</span></div><div class="resource food" aria-label="Food">${icon('wheat')}<span>${num(p.food)}</span></div><div class="resource science" aria-label="Science">${icon('flask')}<span>${num(p.science)}</span></div>${state.rules?`<div class="resource industry" aria-label="Industrial supplies">${icon('factory')}<span>${num(p.industry)}</span></div>`:''}<div class="resource orders" aria-label="Available orders">${icon('bolt')}<div class="orders-dots">${Array.from({length:5},(_,i)=>`<i class="${i<Math.floor(p.orders)?'full':''}"></i>`).join('')}</div></div>`;}
function renderLobby(){
 $('emblem').innerHTML=icon(civs[civ]);$('era').innerHTML=icon('temple')+icon('arrow')+icon('rocket');
 $('civilizations').innerHTML=civs.map((s,i)=>btn(`civ-${i}`,s,civNames[i],'',`class="${civ===i?'active':''}" aria-pressed="${civ===i}"`)).join('');
 if(document.activeElement?.id!=='username')$('bonus').innerHTML=icon('person')+`<input id="username" type="text" autocomplete="off" spellcheck="false" aria-label="Your player name, up to 32 characters" value="${html(username)}"><small>${Array.from(username).length}/32</small>`;
 $('bonus').querySelector('small').textContent=`${Array.from(username).length}/32`;
 $('username').oninput=()=>{username=Array.from($('username').value.replace(/[\u0000-\u001f\u007f]/g,'')).slice(0,32).join('');$('username').value=username;rememberIdentity();state.players[slot].name=username;if(state.phase==='preview')previewState.players[0].name=username;else queueProfile();renderLobby();};
 $('seats').innerHTML=state.players.map((p,i)=>`<span class="seat ${!p.bot?'human':''}" style="--seat:${colors[i]}" aria-label="${html(p.name)}, ${civNames[p.civ]}">${icon(p.bot?'bot':civs[p.civ])}<small>${html(p.name)}</small></span>`).join('');
 const host=state.phase==='preview'||state.host;
 $('config').innerHTML=`<div class="config-group">${icon('person')}<span>${state.humans||1}/8</span></div><button id="difficulty" class="difficulty" aria-label="${['Easy','Medium','Hard'][difficulty]} bots" ${!host?'disabled':''}>${Array.from({length:difficulty+1},()=>icon('bot')).join('')}</button>${btn('regenerate','refresh','Generate a new world','',!host?'disabled':'')}`;
 $('victory-hint').innerHTML=`<em>${icon('crown')}<span>4</span></em><span></span><em>${icon('rocket')}</em><span></span><em>${icon('clock')}20–25</em>`;
 $('seed').innerHTML=icon('globe')+`<span>${seed.toString().padStart(10,'0')}</span>`;
 $('start').innerHTML=icon(state.phase==='lobby'&&!state.host?'hourglass':'play');$('invite').innerHTML=icon('link');
 civs.forEach((_,i)=>$(`civ-${i}`).onclick=()=>{civ=i;rememberIdentity();if(state.phase==='preview'){previewState.players[0].civ=i;state.players[0].civ=i;globe.setState(state,slot);renderLobby();}else queueProfile();});
 $('regenerate').onclick=()=>configure({seed:crypto.getRandomValues(new Uint32Array(1))[0]});$('difficulty').onclick=()=>configure({difficulty:(difficulty+1)%3});
}
async function configure(changes){if(state.phase==='preview'){count=changes.count??count;seed=changes.seed??seed;difficulty=changes.difficulty??difficulty;makePreview();}else await send('configure',{count,seed,difficulty,...changes}).catch(()=>{});}
function makePreview(){count=8;previewState=previewEngine({op:'new',seed,count,difficulty}).state;previewState.players[0].civ=civ;previewState.players[0].tag=callsign;previewState.players[0].name=username;world=previewState.tiles.map(t=>({p:t.p,poly:t.poly,near:t.near,terrain:t.terrain,capital:t.capital,site:t.site}));state={...previewState,phase:'preview',host:true,humans:1,revision:0};globe.setWorld(world);globe.setState(state,0);render();rebuildMarkers();}
function renderRoster(){
 $('roster').innerHTML=state.players.map((p,i)=>`<button class="roster-item ${i===slot?'me':''} ${!p.alive?'dead':''}" style="--faction:${colors[i]}" aria-label="Focus ${html(p.name)} capital, score ${p.score}" data-player="${i}">${icon(civs[p.civ])}<span class="roster-name">${html(p.name)}</span><span class="score">${p.score}</span>${p.mandate||p.launch?`<span class="victory-count">${icon('crown')}${p.mandate||0}${p.launch?icon('rocket')+p.launch:''}</span>`:''}${p.launch||p.domination||p.mandate?`<i class="launch-track" style="width:${Math.max(p.launch/420,p.domination/90,(p.mandate||0)/(state.rules?.mandate_goal??720))*100}%"></i>`:''}</button>`).join('');
 $('roster').querySelectorAll('button').forEach(b=>b.onclick=()=>{const i=world.findIndex(t=>t.capital===Number(b.dataset.player));if(i>=0){const p=state.players[Number(b.dataset.player)];toast(civs[p.civ],html(p.name));globe.focus(i);select(i);}});
}
function select(i){if(!state)return;if(targetOrder){if(!globe.targets?.has(i)){beep(160);return;}command(targetOrder.kind,{...targetOrder,to:i});cancelMarch();selected=i;globe.choose(i);renderProvince();return;}activeUnit=-1;if(marchFrom>=0){if(!reachable(marchFrom).has(i)){beep(160);return;}if(i!==marchFrom)command('march',{from:marchFrom,to:i,value:marchRatio});cancelMarch();selected=i;globe.choose(i);renderProvince();return;}
 selected=i;globe.choose(i);if(state.phase==='running'||state.phase==='ended'){show('province',true);renderProvince();}beep(380);}
function cancelMarch(){document.body.classList.remove('targeting');marchFrom=-1;targetOrder=null;globe.setTargets([]);show('march-hint',false);if(state)rebuildMarkers();}
function renderProvince(){
 if(activeUnit>=0){renderUnit();return;}
 if(selected<0||!world[selected]||state.phase==='preview'||state.phase==='lobby'){show('province',false);return;}
 show('province',marchFrom<0&&!targetOrder&&!techOpen);if(marchFrom>=0||targetOrder)return;
 const t=state.tiles[selected],w=world[selected],p=state.players[slot],mine=t.owner===slot,running=state.phase==='running',owner=w.site?(state.sites?.find(s=>s.tile===selected)?.owner??t.owner):t.owner;
 const terrainIcon=['sail','wheat','tree','sand','mountain','snow'][w.terrain];
 $('province').innerHTML=`<div class="province-head">${icon(w.capital>=0?'crown':w.site?'factory':terrainIcon)}<span class="army-count">${icon('shield')}${t.army<0?icon('eye'):t.army}</span>${t.storm>.2?`<span class="weather-stat" aria-label="Weather intensity">${icon('cloud')}${num(t.storm*100)}%</span>`:''}<span class="spacer"></span>${owner>=0?`<span class="owner" style="color:${colors[owner]}">${icon(civs[state.players[owner].civ])}<small>${html(state.players[owner].name)}</small></span>`:''}${btn('dismiss-province','close','Close province')}</div>`;
 if(w.site)$('province').innerHTML+=`<div class="bonus">${icon('factory')}×2 ${icon('crown')}+1 ${icon('clock')}8</div>`;
 if(t.suppression>0)$('province').innerHTML+=`<div class="bonus">${icon('shield')}−30% ${icon('clock')}${t.suppression}</div>`;
 if(mine&&running){$('province').innerHTML+=`<div class="province-tabs">${btn('civil-tab','city','Construction and armies','',!arsenal?'class="active"':'')}${btn('arsenal-tab','tank','Military equipment and strikes','',arsenal?'class="active"':'')}</div>`;}
 if(mine&&running&&!arsenal){
  const affordable=p.orders>=1&&state.tick>=p.cooldown&&connected;
  $('province').innerHTML+=`<div class="order-actions">${btn('march-half','sword','Move half the army','<span>50%</span>',t.army<6||!affordable?'disabled':'')}${btn('march-most','swords','Move eighty percent of the army','<span>80%</span>',t.army<4||!affordable?'disabled':'')}</div><div class="action-row">${(state.rules?[1,2,3,4,5,6,7]:[1,2,3,4,5,6]).map(b=>{
   const costs=[0,45,55,70,60,65,400,95],available=b===5?p.tech[2]>=2&&w.near.some(j=>world[j].terrain===0):b===6?p.tech[1]>=4&&p.tech[2]>=2&&!state.tiles.some(x=>x.owner===slot&&(x.building===6||x.next===6)):true;
   const disabled=!available||!affordable||(p.gold<costs[b]||b===6&&p.industry<60)||t.work>0||t.building===b;
   return btn(`build-${b}`,buildings[b],['','Build farm','Build market','Build academy','Build fortress','Build harbor','Build launch site','Build factory'][b],`<span class="price">${icon(!available?'lock':t.building===b?'check':'coin')}${t.building===b?'':costs[b]}</span>${b===6&&state.rules?`<span class="price">${icon('factory')}60</span>`:''}`,`${disabled?'disabled':''} class="${t.building===b?'active':''}"`);
  }).join('')}</div>`;
  if(t.work>0)$('province').innerHTML+=`<div class="job-progress"><i style="width:${100-t.work/(t.next===6?90:t.next===7?(p.tech[1]>=3?28:40):(p.tech[1]>=3?18:25))*100}%"></i></div><div class="bonus">${icon(buildings[t.next])}${icon('hourglass')}<span>${t.work}</span></div>`;
  if(t.unrest>0)$('province').innerHTML+=`<div class="bonus">${icon('warning')}${icon('hourglass')}<span>${t.unrest}</span></div>`;
  $('march-half').onclick=()=>beginMarch(0);$('march-most').onclick=()=>beginMarch(1);
  (state.rules?[1,2,3,4,5,6,7]:[1,2,3,4,5,6]).forEach(b=>$(`build-${b}`).onclick=()=>command('build',{from:selected,value:b}));
 }else if(mine&&running&&arsenal){renderArsenal(t,w,p);}else if(t.building){$('province').innerHTML+=`<div class="bonus">${icon(buildings[t.building])}${t.building===6?icon('rocket'):''}</div>`;}
 if(mine&&running){$('civil-tab').onclick=()=>{arsenal=false;renderProvince();};$('arsenal-tab').onclick=()=>{arsenal=true;renderProvince();};}
 $('dismiss-province').onclick=()=>{selected=-1;globe.choose(-1);show('province',false);};
}
function renderArsenal(t,w,p){
 const ready=connected&&p.orders>=1&&state.tick>=p.cooldown&&!inflight;
 const unlocked=[p.tech[0]>=2&&p.tech[1]>=3,p.tech[2]>=2&&t.building===5,p.tech[0]>=3&&p.tech[2]>=2&&t.building===5,p.tech[0]>=3&&p.tech[1]>=2];
 const costs=[110,100,145,125].map(v=>num(v*(p.doctrine===1?1.2:1))),limits=(state.squads||[]).filter(s=>s.owner===slot).length;
 $('province').innerHTML+=`<div class="action-row equipment">${unitIcons.map((s,i)=>btn(`train-${i}`,s,`Train ${unitNames[i]}`,`<span class="price">${icon(unlocked[i]?'coin':'lock')}${costs[i]}</span><span class="price ${state.rules?'':'hidden'}">${icon('factory')}${[30,25,40,30][i]}</span>`,!ready||!unlocked[i]||p.gold<costs[i]||p.industry<[30,25,40,30][i]||p.food<15||limits>=6?'disabled':'')).join('')}</div><div class="military-cost">${icon('wheat')}15 ${icon('hourglass')}20 ${icon('person')}${limits}/6 ${btn('equipment-guide','help','Military prerequisites','','class="small-help"')}</div>`;
 const attacks=[p.tech[0]>=2&&p.tech[1]>=3,p.tech[0]>=3&&p.tech[1]>=2,p.tech[0]>=4&&p.tech[1]>=4&&state.tick>=840];
 $('province').innerHTML+=`<div class="action-row equipment">${['drone','missile','nuke'].map((s,i)=>btn(`strike-${i}`,s,['Target drone strike','Target cruise missile','Target nuclear strike'][i],`<span class="price">${icon(attacks[i]?'coin':'lock')}${[90,150,550][i]}</span><span class="price ${state.rules?'':'hidden'}">${icon('factory')}${[18,35,120][i]}</span>`,!ready||!attacks[i]||p.gold<[90,150,550][i]||p.industry<[18,35,120][i]||p.science<[0,25,180][i]||p.strike_ready>state.tick?'disabled':'')).join('')}${btn('satellite-launch','satellite','Launch reconnaissance satellite',`<span class="price">${icon(p.satellite?'hourglass':p.tech[1]<4?'lock':'coin')}${p.satellite||180}</span><span class="price ${state.rules?'':'hidden'}">${icon('factory')}25</span>`,!ready||p.tech[1]<4||p.gold<180||p.industry<25||p.science<70||p.satellite>0?'disabled':'')}</div><div class="military-cost">${icon('flask')}0 / 25 / 180 / 70 ${p.strike_ready>state.tick?icon('clock')+time(p.strike_ready-state.tick):''}</div>`;
 unitIcons.forEach((_,i)=>$(`train-${i}`).onclick=()=>command('train',{from:selected,value:i}));
 ['drone','missile','nuke'].forEach((_,i)=>$(`strike-${i}`).onclick=()=>beginTarget({kind:'strike',from:selected,value:i}));
 $('satellite-launch').onclick=()=>command('satellite');
 $('equipment-guide').onclick=()=>{$('guide').innerHTML=`<div class="panel-head">${icon('tank')}${btn('close-guide','close','Close military guide')}</div>${[['tank','swords',2,'factory',3],['ship','sail',2,'sail',2],['submarine','cannon',3,'sail',2],['specops','cannon',3,'telescope',2],['drone','swords',2,'factory',3],['missile','cannon',3,'telescope',2],['nuke','logistics',4,'rocket',4]].map(([unit,a,x,b,y])=>`<div class="guide-row">${icon(unit)}${icon('arrow','arrow')}${icon(a)}${x}${icon('plus')}${icon(b)}${y}</div>`).join('')}<div class="guide-row">${icon('nuke')}${icon('clock')}14:00</div>`;show('guide',true);$('close-guide').onclick=()=>show('guide',false);};
}
function beginTarget(order){cancelMarch();document.body.classList.add('targeting');targetOrder=order;show('province',false);const targets=new Set();const unit=(state.squads||[]).find(s=>s.id===order.from),equipment=unit?equipmentTargets(world,state.tiles,unit,slot):new Set();world.forEach((t,i)=>{if(order.kind==='strike'){const d=t.p.reduce((sum,v,k)=>sum+v*world[order.from].p[k],0);if((state.tiles[i].visible||state.beacons?.some(b=>b.tile===i)||state.sites?.some(b=>b.tile===i))&&state.tiles[i].owner!==slot&&d>=[.68,.12,-1][order.value])targets.add(i);}else if(unit&&equipment.has(i))targets.add(i);});globe.setTargets(targets);$('march-hint').innerHTML=icon('hand')+icon('arrow')+icon(order.kind==='strike'?['drone','missile','nuke'][order.value]:unitIcons[unit.kind]);show('march-hint',true);rebuildMarkers();}
function renderUnit(){const u=(state.squads||[]).find(s=>s.id===activeUnit&&s.owner===slot);if(!u){activeUnit=-1;renderProvince();return;}show('province',!techOpen&&!targetOrder);if(targetOrder)return;
 $('province').innerHTML=`<div class="province-head">${icon(unitIcons[u.kind])}<span class="army-count">${icon('heart')}${num(u.hp)}</span><span class="spacer"></span>${btn('close-unit','close','Close unit')}</div><div class="order-actions">${btn('move-unit','arrow','Move selected unit',u.left?`<span>${icon('hourglass')}${u.left}</span>`:'',u.left>0||u.ready>state.tick||state.players[slot].orders<1||!connected?'disabled':'')}</div><div class="bonus">${icon('coin')}−1.2 ${icon('clock')}5 ${u.kind===2?icon('eye')+icon('radar'):''}</div>`;
 $('move-unit').onclick=()=>beginTarget({kind:'maneuver',from:u.id,value:0});$('close-unit').onclick=()=>{activeUnit=-1;renderProvince();};
}
function reachable(from){const sea=state.players[slot].tech[2]>=2;return reachableProvinces(world,state.tiles,from,slot,{sea,limit:sea?17:8});}
function beginMarch(value){document.body.classList.add('targeting');marchFrom=selected;marchRatio=value;show('province',false);globe.setTargets(reachable(selected));rebuildMarkers();$('march-hint').innerHTML=icon('hand')+icon('arrow')+icon('swords')+`<span>${Math.floor(state.tiles[selected].army*(value===1?.8:.5))}</span>`;show('march-hint',true);beep();}
function renderResearch(){if(!techOpen)return;const p=state.players[slot],names=[['Bronze working','Engineering','Gunpowder','Logistics'],['Writing','Astronomy','Industry','Rocketry'],['Agriculture','Navigation','Banking','Medicine']];
 $('research').innerHTML=`<div class="panel-head">${icon('flask')}<span>${num(p.science)}</span>${btn('close-research','close','Close technology tree')}</div><div class="tech-grid">${techs.map((branch,b)=>`<div class="tech-branch">${branch.map((symbol,level)=>{
  const done=p.tech[b]>level,next=p.tech[b]===level,studying=p.research===b&&next,cost=[55,100,180,300][level]+p.tech.reduce((a,b)=>a+b,0)*(state.rules?.research_surcharge??12),gate=[0,0,300,780][level],eraLocked=state.tick<gate;
  const benefit=[[['swords','+16%'],['fort','+15%'],['shield','−35%'],['clock','−36%']],[['flask','+12%'],['eye','+1'],['hourglass','−28%'],['rocket','']],[['wheat','+18%'],['sail',''],['coin','+43%'],['heart','+0.3']]][b][level];
  return btn(`tech-${b}-${level}`,symbol,`${names[b][level]}${done?' researched':''}`,`<span class="tech-cost">${icon(done?'check':studying?'hourglass':eraLocked?'clock':!next?'lock':'flask')}${done?'':studying?p.research_left:eraLocked?time(gate-state.tick):cost}</span><span class="tech-benefit">${icon(benefit[0])}${benefit[1]}</span>`,`class="tech-node ${done?'done':studying?'studying':!next||eraLocked?'locked':''}" ${done||!next||eraLocked||p.research>=0||p.science<cost||p.orders<1||state.phase!=='running'?'disabled':''}`);
 }).join('')}</div>`).join('')}</div><div class="tech-recipes" aria-label="Combined research prerequisites"><div>${icon('swords')}2 ${icon('plus')}${icon('factory')}3 ${icon('arrow')}${icon('tank')}${icon('drone')}</div><div>${icon('cannon')}3 ${icon('plus')}${icon('sail')}2 ${icon('arrow')}${icon('submarine')}</div><div>${icon('rocket')}4 ${icon('plus')}${icon('sail')}2 ${icon('arrow')}${icon('globe')}</div><div aria-label="Every discovery increases future technology costs by 36 science">${icon('flask')}+${state.rules?.research_surcharge??12} ${icon('arrow')}${icon('scroll')}${icon('gear')}${icon('wheat')}</div></div>`;
 $('close-research').onclick=toggleResearch;techs.forEach((branch,b)=>branch.forEach((_,l)=>$(`tech-${b}-${l}`).onclick=()=>command('research',{value:b})));
 const doctrines=[['swords','Mobilization: army growth and food upkeep plus 25 percent, science minus 10 percent','person','+25%','wheat','+25%','flask','−10%'],['flask','Technocracy: science plus 25 percent, equipment cost plus 20 percent','flask','+25%','coin','+20%','tank',''],['ship','Maritime doctrine: gold plus 20 percent, naval travel time minus 20 percent, army attack minus 10 percent','coin','+20%','clock','−20%','swords','−10%']];
 $('research').insertAdjacentHTML('beforeend',`<div class="doctrine-title">${icon(p.doctrine<0?'check':'refresh')}${p.doctrine<0?'1 / 3':icon('coin')+'140 '+icon('flask')+'60 '+icon('hourglass')+(p.doctrine_left||45)}</div><div class="doctrines">${doctrines.map(([symbol,label,a,x,b,y,c,z],i)=>btn(`doctrine-${i}`,symbol,label,`<span>${icon(a)}${x}</span><span>${icon(b)}${y}</span><span>${icon(c)}${z}</span>`,`class="${p.doctrine===i?'active':''}" ${p.doctrine===i||p.doctrine_left>0||!p.tech.some(t=>t>=3)||p.orders<1||p.doctrine>=0&&(p.gold<140||p.science<60)||state.phase!=='running'?'disabled':''}`)).join('')}</div>`);
 doctrines.forEach((_,i)=>$(`doctrine-${i}`).onclick=()=>command('doctrine',{value:i}));
}
function toggleResearch(){techOpen=!techOpen;show('research',techOpen);$('tech-toggle').classList.toggle('active',techOpen);if(techOpen){show('province',false);renderResearch();}else renderProvince();}
function openGuide(){
 $('guide').innerHTML=`<div class="panel-head">${icon('globe')}${btn('close-guide','close','Close visual guide')}</div>
 <div class="guide-row" aria-label="Drag globe to rotate; scroll or pinch to zoom">${icon('hand')} ${icon('arrow','arrow')} ${icon('globe')} ${icon('plus')} ${icon('minus')}</div>
 <div class="guide-row" aria-label="Select your province, choose fifty or eighty percent, then select the destination"><span class="chip">${icon('crown')}</span>${icon('arrow','arrow')}<span>${icon('swords')}<small>50%<br>80%</small></span>${icon('arrow','arrow')}<span class="chip">${icon('hand')}</span></div>
 <div class="guide-row" aria-label="Gold builds farms for food, markets for gold, and academies for science">${icon('coin')}${icon('arrow','arrow')}${icon('wheat')}${icon('coin')}${icon('temple')}</div>
 <div class="guide-row" aria-label="One command regenerates every eight seconds; decisions do not pause time">${icon('bolt')}<span>1</span>${icon('clock')}<span>8</span>${icon('arrow','arrow')}${icon('bolt')}<span>5</span></div>
 <div class="guide-row" aria-label="Hold four capitals for ninety seconds or complete 420 points of orbital progress. Completed milestones survive attacks. No score timeout.">${icon('crown')}<span>4</span>${icon('hourglass')}<span>90</span>${icon('rocket')}<span>420</span>${icon('clock')}<span>20–25</span></div>
 <div class="guide-row" aria-label="Capitals bank one territorial point every four seconds, frontier hubs one every eight seconds; 720 points wins. Conquest does not erase earned points.">${icon('crown')}+1 ${icon('clock')}4 ${icon('factory')}+1 ${icon('clock')}8 ${icon('arrow')}720</div>
 <div class="guide-row" aria-label="Launch sites spend gold, science and industrial supplies each second. Disruption stops progress; completed 60-point milestones are permanent.">${icon('coin')}0.8 ${icon('flask')}0.5 ${icon('factory')}0.6 ${icon('arrow')}${icon('rocket')}+1</div>
 <div class="guide-row" aria-label="Harbors train fleets and submarines. Submarines counter surface fleets; fleets detect submarines and blockade coastal provinces">${icon('sail')}${icon('arrow','arrow')}${icon('ship')}${icon('submarine')}${icon('radar')}</div>
 <div class="guide-row" aria-label="Storms slow movement and weaken drone strikes. Banking provides weather navigation; satellites remove drone weather penalties">${icon('cloud')}${icon('drone')}<span>−55%</span>${icon('arrow','arrow')}${icon('satellite')}</div>
 ${btn('guide-done','check','Continue playing','','class="guide-play"')}`;
 if(!state.rules){$('guide').querySelectorAll('.guide-row')[5].innerHTML=`${icon('clock')}18:00 ${icon('arrow')}${icon('rocket')}+1`; $('guide').querySelectorAll('.guide-row')[6].innerHTML=`${icon('coin')}0.8 ${icon('flask')}0.5 ${icon('arrow')}${icon('rocket')}+1`;}
 show('guide',true);$('close-guide').onclick=$('guide-done').onclick=()=>{show('guide',false);try{localStorage.setItem('meridian:learned','1');}catch{}};
}
function home(){cancelMarch();const i=world.findIndex((t,i)=>t.capital===slot&&state.tiles[i].owner===slot);const fallback=state.tiles.findIndex(t=>t.owner===slot);if(i>=0||fallback>=0){if(state.phase==='running')globe.targetDistance=Math.min(globe.targetDistance,1.85);globe.focus(i>=0?i:fallback);selected=i>=0?i:fallback;globe.choose(selected);renderProvince();}}
function renderEnding(){
 const winner=state.players[state.winner];show('ending',true);$('ending').innerHTML=`<div class="winner-icon">${icon(state.victory===2?'rocket':state.victory===1?'crown':'trophy')}</div><div class="end-emblem" style="color:${colors[state.winner]}">${icon(civs[winner.civ])}<span>${html(winner.name)}</span></div><div>${time(state.tick)}</div><div class="end-scores">${state.players.map((p,i)=>({...p,i})).sort((a,b)=>a.i===state.winner?-1:b.i===state.winner?1:b.score-a.score).map((p,rank)=>`<div class="end-row" style="color:${colors[p.i]}"><span>${rank+1}</span>${icon(civs[p.civ])}<span class="end-name">${html(p.name)}</span><span>${p.score}</span></div>`).join('')}</div>${btn('new-game','refresh','New match','','class="guide-play"')}`;
 $('new-game').onclick=()=>location.assign('/');
}
function rebuildMarkers(){
 $('markers').innerHTML='';markerNodes=[];marchNodes=[];
 const preview=state.phase==='preview'||state.phase==='lobby';
 const targets=marchFrom>=0?reachable(marchFrom):targetOrder?globe.targets:new Set();
 world.forEach((t,i)=>{const s=state.tiles[i],owner=t.site?(state.sites?.find(h=>h.tile===i)?.owner??s.owner):s.owner;if(!t.site&&(s.owner<0||preview&&t.capital<0)&&!targets.has(i))return;if(!preview&&s.army<0&&t.capital<0&&!t.site&&s.building!==6&&!targets.has(i))return;
  const el=document.createElement('button');el.className=`marker ${t.capital>=0?'capital':t.site?'hub':''} ${i===selected?'selected':''} ${targets.has(i)?'target':''}`;el.style.setProperty('--faction',owner>=0?colors[owner]:'#8fc9be');el.setAttribute('aria-label',`${targets.has(i)?'Move to province':'Province'} ${i}${t.capital>=0?' capital':t.site?' industrial hub':''}, ${owner>=0?state.players[owner].name:'neutral'}${s.army>=0?`, army ${s.army}`:''}`);el.innerHTML=(t.capital>=0?`<span class="marker-name">${owner>=0?html(state.players[owner].name):''}</span>`+icon('crown'):s.building===6?icon('rocket'):t.site?icon('factory'):'')+(!preview?(s.army>=0?s.army:t.site||targets.has(i)?icon('eye'):''):'');el.onclick=()=>select(i);$('markers').append(el);markerNodes.push({el,p:t.p,i});
 });
 if(!preview)for(const m of state.marches){const el=document.createElement('span');el.className='marker moving';el.style.setProperty('--faction',colors[m.owner]);el.textContent=Math.floor(m.army);$('markers').append(el);marchNodes.push({el,m});}
 if(!preview)for(const u of state.squads||[]){const el=document.createElement('button');el.className='marker unit-marker';el.style.setProperty('--faction',colors[u.owner]);el.setAttribute('aria-label',`${state.players[u.owner].name}, ${unitNames[u.kind]} ${u.id}, health ${num(u.hp)}`);el.innerHTML=`<span class="marker-name">${html(state.players[u.owner].name)}</span>`+icon(unitIcons[u.kind])+num(u.hp)+(u.left?icon('hourglass'):'');el.onclick=()=>{if(u.owner===slot){cancelMarch();activeUnit=u.id;selected=u.tile;globe.choose(selected);renderProvince();}else select(u.tile);};$('markers').append(el);markerNodes.push({el,p:world[u.tile].p,i:-1,u});}
 if(!preview)for(const b of state.beacons||[]){if(state.tiles[b.tile].visible)continue;const el=document.createElement('button');el.className='marker beacon';el.style.setProperty('--faction',colors[b.owner]);el.setAttribute('aria-label',`Launch beacon at province ${b.tile}`);el.innerHTML=icon('rocket')+(state.players[b.owner].launch||0);el.onclick=()=>{globe.focus(b.tile);select(b.tile);};$('markers').append(el);markerNodes.push({el,p:world[b.tile].p,i:b.tile});}
}
function updateMarkers(now){if(!globe)return;for(const n of markerNodes){let pos=n.p;const u=n.u;if(u?.path.length>1&&u.left>0){const f=Math.min(u.path.length-1,(1-Math.max(0,u.left-Math.min(2,(now-lastStateAt)/1000))/u.total)*(u.path.length-1)),i=Math.min(u.path.length-2,Math.floor(f)),a=world[u.path[i]].p,b=world[u.path[i+1]].p;pos=a.map((v,k)=>v*(1-f+i)+b[k]*(f-i));const length=Math.hypot(...pos);pos=pos.map(v=>v/length);}const p=globe.project(pos);n.el.style.display=p.visible?'flex':'none';n.el.style.left=`${p.x}px`;n.el.style.top=`${p.y+($('globe').offsetTop||0)+(u?12:-12)}px`;n.el.classList.toggle('selected',u?u.id===activeUnit:n.i===selected);}
 const elapsed=state?.phase==='running'?Math.min(2,(now-lastStateAt)/1000):0;
 for(const {el,m} of marchNodes){const progress=Math.min(1,Math.max(0,1-(m.left-elapsed)/m.total)),path=m.path?.length>1?m.path:[m.from,m.to],f=progress*(path.length-1),step=Math.min(path.length-2,Math.floor(f)),a=world[path[step]].p,b=world[path[step+1]].p;let pos=a.map((x,i)=>x*(1-f+step)+b[i]*(f-step)),length=Math.hypot(...pos);pos=pos.map(x=>x/length*1.015);const p=globe.project(pos);el.style.display=p.visible?'flex':'none';el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;}
 if(state?.phase==='running')$('clock').innerHTML=icon('clock')+`<span>${time(lastTick+Math.floor(elapsed))}</span>`;
 soundscape.mix(globe,state,now);
}

$('tools').innerHTML=btn('home','home','Focus your capital')+btn('zoom-in','plus','Zoom in')+btn('zoom-out','minus','Zoom out')+btn('sound','mute','Toggle sound')+btn('help','help','Visual instructions');
$('dock').innerHTML=btn('tech-toggle','flask','Open technology tree')+btn('capital-focus','crown','Select your capital')+btn('cancel-order','hand','Cancel order and selection');
$('home').onclick=$('capital-focus').onclick=()=>{activeUnit=-1;home();};$('zoom-in').onclick=()=>globe.targetDistance=Math.max(1.12,globe.targetDistance-.35);$('zoom-out').onclick=()=>globe.targetDistance=Math.min(4.8,globe.targetDistance+.35);$('sound').innerHTML=icon(sound?'sound':'mute');$('sound').onclick=()=>{sound=soundscape.toggle();$('sound').innerHTML=icon(sound?'sound':'mute');};$('help').onclick=openGuide;$('tech-toggle').onclick=toggleResearch;$('cancel-order').onclick=()=>{cancelMarch();activeUnit=-1;selected=-1;globe.choose(-1);show('province',false);};
$('invite').onclick=async()=>{try{await createRoom();const url=`${location.origin}/?room=${room}`;try{await navigator.clipboard.writeText(url);toast('check');}catch{if(navigator.share)await navigator.share({url});else toast('link',room.slice(-6));}}catch(e){toast('warning',Number(e.message)||503,true);}};
$('start').onclick=async()=>{try{$('lobby').classList.add('busy');if(state.phase==='preview')await createRoom();await flushProfile();await send('start');}catch(e){toast('warning',Number(e.message)||503,true);}finally{$('lobby').classList.remove('busy');}};
document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.key==='Escape'){cancelMarch();show('guide',false);if(techOpen)toggleResearch();else{selected=-1;globe.choose(-1);show('province',false);}}if(e.key.toLowerCase()==='h')home();if(e.key.toLowerCase()==='t'&&state?.phase==='running')toggleResearch();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ws?.readyState===1)ws.send(JSON.stringify({type:'ping',time:Date.now()}));if(document.hidden&&soundscape.master)soundscape.master.gain.setTargetAtTime(0,soundscape.ctx.currentTime,.08);});
try{
 globe=new Globe($('globe'),select);globe.onFrame=updateMarkers;
 const module=await WebAssembly.compileStreaming(fetch('/releases/5be701fc5855cb2f1c641919/legacy/engine.wasm'));const e=new WebAssembly.Instance(module,{}).exports,enc=new TextEncoder(),dec=new TextDecoder();
 previewEngine=request=>{const bytes=enc.encode(JSON.stringify(request)),p=e.alloc(bytes.length);new Uint8Array(e.memory.buffer,p,bytes.length).set(bytes);e.run(p,bytes.length);return JSON.parse(dec.decode(new Uint8Array(e.memory.buffer,e.output_ptr(),e.output_len())));};
 makePreview();const id=new URL(location.href).searchParams.get('room');if(id){if(!/^[a-f0-9]{20}$/.test(id))throw Error('404');await joinRoom(id);}
 else {$('connection').innerHTML=icon('globe');}
}catch(e){console.error(e);toast('warning',Number(e.message)||503,true);if(previewEngine){room=null;token=null;history.replaceState({},'','/');makePreview();}else{$('start').disabled=true;}}
