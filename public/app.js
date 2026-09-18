import { Globe } from './globe.js';
import { icon, colors, civs, civNames, buildings, techs } from './icons.js';
import { Soundscape } from './audio.js';
import {branches,unitIcons,unitNames,counters,prerequisites,researchCost,researchGate,distances,route,abilities} from './planning.js';
import {orderBlock,targetTiles,refitChoices,abilityCost} from './controls.js';
import {Manual} from './manual.js';
import {FeedbackLayer} from './feedback.js';
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
let callsign=1000+crypto.getRandomValues(new Uint32Array(1))[0]%9000;const encountered=new Set(),seenDiscoveries=new Set();
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
let selectedTech=1,abilityTarget=null,refitOpen=false;
const discoveryIcons=['swords','coin','scout','shield','sail','telescope','gear','heart','cloud','horse'];
const discoveryNames=['Hostile camp','Buried treasury','Stranded scouts','Abandoned guard post','Wrecked caravan','Observatory','Repair workshop','Supply depot','Weather station','Mercenary camp'];
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
 creating=(async()=>{const data=await api('/api/rooms',{seed,count,difficulty,civ,name:username,tag:callsign});room=data.room;token=data.token;slot=data.slot;seq=data.seq;saveSeat();history.replaceState({},'',`/?room=${room}`);await connect();})();
 try{await creating;}finally{creating=null;renderControls();}
}
async function joinRoom(id){room=id;const saved=stored(id);const data=await api(`/api/rooms/${id}/join`,{token:saved?.token,civ,name:username,tag:callsign});token=data.token;slot=data.slot;seq=data.seq;saveSeat();await connect();}
function connect(){
 clearTimeout(reconnectTimer);stopped=false;
 const ready=new Promise(resolve=>readyResolve=resolve);
 ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/rooms/${room}/ws`,['meridian',token]);
 ws.onmessage=e=>{
  const msg=JSON.parse(e.data);
  if(msg.type==='welcome'){ws.send(JSON.stringify({type:'presence',active:!document.hidden}));slot=msg.slot;seq=Math.max(seq,msg.seq);world=msg.world;globe.setWorld(world);if(inflight)ws.send(JSON.stringify(inflight.message));}
  if(msg.type==='world'){world=msg.world;globe.setWorld(world);}
  if(msg.type==='state'){
   if(!msg.rules?.tactics){location.replace(`/legacy/index.html?room=${room}`);return;}
   if(state?.revision>msg.revision&&state.phase!=='preview')return;
   const previous=state;state=msg;seed=msg.seed;count=msg.players.length;difficulty=msg.difficulty;if(!profileDirty)civ=msg.players[slot].civ;
   callsign=msg.players[slot].tag;if(!profileDirty&&document.activeElement?.id!=='username'){username=msg.players[slot].name||username;rememberIdentity();}else msg.players[slot].name=username;
   if(!connected){setConnected(true);retry=0;}lastTick=msg.tick;lastStateAt=performance.now();globe.setState(msg,slot);feedbackLayer.accept(msg);
   if(msg.phase==='running'&&!hasStarted){hasStarted=true;home();}
   soundscape.events(msg,previous,world,globe,slot);
   if(msg.phase==='running')for(const d of msg.discoveries||[]){if(!seenDiscoveries.has(d.tile)){seenDiscoveries.add(d.tile);if(!d.used){toast(discoveryIcons[d.kind]);soundscape.play('confirm',.2);break;}}}
   if(msg.phase==='running'){for(const t of msg.tiles)if(t.visible&&t.owner>=0&&t.owner!==slot&&!encountered.has(t.owner)){encountered.add(t.owner);toast(civs[msg.players[t.owner].civ],html(msg.players[t.owner].name));break;}}
   if(pointerHeld)pendingRender=true;else{render();rebuildMarkers();}if(readyResolve){readyResolve();readyResolve=null;}
  }
  if(msg.type==='ack'&&inflight?.message.seq===msg.seq){const pending=inflight;inflight=null;if(!msg.error&&pending.message.type==='command')state.players[slot].cooldown=Math.max(state.players[slot].cooldown,state.tick+2);renderControls();if(msg.error){toast(['','warning','bolt','shield','sail','coin','lock'][msg.error]||'warning',msg.error,true);pending.reject(Error(String(msg.error)));}else{soundscape.command(pending.message.kind||pending.message.type,pending.message.value);pending.resolve();}}
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
setInterval(()=>{if(connected&&ws?.readyState===1)ws.send(JSON.stringify({type:'ping',time:Date.now(),active:!document.hidden}));},10000);
function renderControls(){if(!state)return;if(state.phase==='running'){if(pointerHeld)pendingRender=true;else{renderProvince();renderResearch();}}const lobby=state.phase==='lobby'||state.phase==='preview';$('start').disabled=!!inflight||!!creating||lobby&&state.phase!=='preview'&&(!connected||!state.host);$('invite').disabled=!!creating;if(lobby){const locked=!!inflight||!!creating||state.phase!=='preview'&&(!connected||!state.host);$('fewer-players').disabled=locked||count<=Math.max(2,state.humans||1);$('more-players').disabled=locked||count>=8;for(const id of ['difficulty','regenerate'])$(id).disabled=locked;}}
function render(){
 const lobby=state.phase==='lobby'||state.phase==='preview';document.body.classList.toggle('in-lobby',lobby);show('lobby',lobby);show('roster',!lobby);show('dock',!lobby);$('resources').innerHTML=lobby?'':resources();
 $('clock').innerHTML=icon('clock')+`<span>${time(state.tick)}</span>`;
 if(lobby)renderLobby();else{renderRoster();renderProvince();renderResearch();}
 $('tech-toggle').disabled=!!state.spectator;renderControls();if(state.spectator){clearRoute();techOpen=false;show('research',false);}if(state.phase==='ended')renderEnding();
}
function resources(){if(state.spectator)return `<div class="resource spectator" aria-label="Spectating: all your cities have fallen">${icon('spectate')}</div>`;const p=state.players[slot];return `<div class="resource gold" aria-label="Treasury">${icon('coin')}<span>${num(p.gold)}</span></div><div class="resource pieces" aria-label="Unit capacity">${icon('shield')}<span>${state.squads.filter(u=>u.owner===slot).length}/${state.rules.unit_cap}</span></div>`;}
function renderLobby(){
 $('emblem').innerHTML=icon(civs[civ]);$('era').innerHTML=icon('temple')+icon('arrow')+icon('rocket');
 $('civilizations').innerHTML=civs.map((s,i)=>btn(`civ-${i}`,s,civNames[i],'',`class="${civ===i?'active':''}" aria-pressed="${civ===i}"`)).join('');
 if(document.activeElement?.id!=='username')$('bonus').innerHTML=icon('person')+`<input id="username" type="text" autocomplete="off" spellcheck="false" aria-label="Your player name, up to 32 characters" value="${html(username)}"><small>${Array.from(username).length}/32</small>`;
 $('bonus').querySelector('small').textContent=`${Array.from(username).length}/32`;
 $('username').oninput=()=>{username=Array.from($('username').value.replace(/[\u0000-\u001f\u007f]/g,'')).slice(0,32).join('');$('username').value=username;rememberIdentity();state.players[slot].name=username;if(state.phase==='preview')previewState.players[0].name=username;else queueProfile();renderLobby();};
 $('seats').innerHTML=state.players.map((p,i)=>`<span class="seat ${!p.bot?'human':''}" style="--seat:${colors[i]}" aria-label="${html(p.name)}, ${civNames[p.civ]}">${icon(p.bot?'bot':civs[p.civ])}<small>${html(p.name)}</small></span>`).join('');
 const host=state.phase==='preview'||state.host,humans=state.humans||1;
 $('config').innerHTML=`<div class="player-count">${btn('fewer-players','minus','Remove a player slot','',!host||count<=Math.max(2,humans)?'disabled':'')}<div class="config-group" aria-label="${humans} human players, ${count-humans} bot seats, ${count} total">${icon('person')}<span>${humans}/${count}</span><span class="bot-seats">${icon('bot')}${count-humans}</span></div>${btn('more-players','plus','Add a player slot','',!host||count>=8?'disabled':'')}</div><button id="difficulty" class="difficulty" aria-label="${['Easy','Medium','Hard'][difficulty]} bots" ${!host?'disabled':''}>${Array.from({length:difficulty+1},()=>icon('bot')).join('')}</button>${btn('regenerate','refresh','Generate a new world','',!host?'disabled':'')}`;
 $('victory-hint').innerHTML=`<em>${icon('crown')}<span>${state.rules.capital_goal??4}</span></em><span></span><em>${icon('rocket')}</em><span></span><em>${icon('clock')}20–25</em>`;
 $('seed').innerHTML=icon('globe')+`<span>${seed.toString().padStart(10,'0')}</span>`;
 $('start').innerHTML=icon(state.phase==='lobby'&&!state.host?'hourglass':'play');$('invite').innerHTML=icon('link');
 civs.forEach((_,i)=>$(`civ-${i}`).onclick=()=>{civ=i;rememberIdentity();if(state.phase==='preview'){previewState.players[0].civ=i;state.players[0].civ=i;globe.setState(state,slot);renderLobby();}else queueProfile();});
 $('fewer-players').onclick=()=>configure({count:count-1});$('more-players').onclick=()=>configure({count:count+1});
 $('regenerate').onclick=()=>configure({seed:crypto.getRandomValues(new Uint32Array(1))[0]});$('difficulty').onclick=()=>configure({difficulty:(difficulty+1)%3});
}
async function configure(changes){if(state.phase==='preview'){count=changes.count??count;seed=changes.seed??seed;difficulty=changes.difficulty??difficulty;makePreview();}else await send('configure',{count,seed,difficulty,...changes}).catch(()=>{});}
function makePreview(){previewState=previewEngine({op:'new',seed,count,difficulty}).state;previewState.players[0].civ=civ;previewState.players[0].tag=callsign;previewState.players[0].name=username;world=previewState.tiles.map(t=>({p:t.p,poly:t.poly,near:t.near,terrain:t.terrain,capital:t.capital,site:t.site}));state={...previewState,...previewEngine({op:'view',state:previewState,player:0}).state,tiles:previewState.tiles.map(t=>({...t,visible:true})),phase:'preview',host:true,humans:1,revision:0};globe.setWorld(world);globe.setState(state,0);render();rebuildMarkers();}
function renderRoster(){
 $('roster').innerHTML=state.players.map((p,i)=>`<button class="roster-item ${i===slot?'me':''} ${!p.alive?'dead':''}" style="--faction:${colors[i]}" aria-label="${html(p.name)}, ${!p.alive?'Spectating':p.bot?'AI control':'Human online'}, influence ${p.mandate} of ${state.rules.mandate_goal}" data-player="${i}">${!p.alive?icon('spectate'):p.bot?icon('bot','control-bot'):'<i class="control-human" data-help="person" aria-label="Human online"></i>'}<span class="roster-name">${html(p.name)}</span><span class="victory-count">${icon('crown')}${p.mandate}</span><i class="launch-track" style="width:${Math.min(100,100*Math.max(p.mandate/state.rules.mandate_goal,p.launch/state.rules.space_goal))}%"></i></button>`).join('');
 $('roster').querySelectorAll('button').forEach(b=>b.onclick=()=>{const c=state.cities.find(c=>c.capital===Number(b.dataset.player));if(c){globe.focus(c.tile);selectCity(c.tile);}});
}
const price=n=>`<span class="price">${icon('coin')}${n}</span>`;
const stat=(symbol,n)=>`<span class="stat">${icon(symbol)}${n}</span>`;
function unitStats(k){const s=state.rules.specs[k];return `<div class="unit-stats">${stat('heart',s.hp)}${s.damage?stat('swords',s.damage)+stat('eye',s.min===s.range?s.range:`${s.min}–${s.range}`):''}${stat('route',s.speed)}${s.damage?stat('clock',s.reload):''}</div>`;}
function unitCounters(k){return counters[k].length?`<div class="counter-strip">${icon(unitIcons[k])}${icon('swords')}${counters[k].map(i=>icon(unitIcons[i])).join('')}</div>`:'';}
function clearRoute(){abilityTarget=null;document.body.classList.remove('targeting');globe.previewPath=[];globe.setTargets(new Set());}
function selectCity(tile){clearRoute();activeUnit=-1;globe.routeUnit=-1;selected=tile;techOpen=false;show('research',false);globe.choose(tile,true);globe.frameCity(tile);renderProvince();}
function selectUnit(id){refitOpen=false;const u=state.squads.find(u=>u.id===id);if(!u)return;clearRoute();activeUnit=id;selected=u.tile;techOpen=false;show('research',false);globe.choose(u.tile);globe.routeUnit=id;globe.focus(u.tile);renderProvince();}
function availability(kind,data={}){
 if(!connected)return {reason:'Reconnect to issue orders',icon:'network',count:0};
 if(inflight)return {reason:'Waiting for the current order',icon:'hourglass',count:0};
 return orderBlock(world,state,slot,kind,data);
}
function actionButton(id,symbol,label,body='',block=null,primary=false){
 const hint=block?`<span class="action-lock">${icon(block.icon||'lock')}${block.count?num(block.count):''}</span>`:'';
 return btn(id,symbol,`${label}${block?`. Unavailable: ${block.reason}`:''}`,body+hint,`class="order-action ${primary?'primary-action':''}" ${block?'disabled aria-disabled="true"':'aria-disabled="false"'}`);
}
function aim(u,kind,value,iconName){
 const same=abilityTarget?.kind===kind&&abilityTarget?.value===value;
 clearRoute();refitOpen=false;
 if(!same){abilityTarget={icon:iconName,kind,value};document.body.classList.add('targeting');
  if(kind!=='move')globe.setTargets(new Set(targetTiles(world,state,u,kind,value)));
 }
 renderProvince();
}
function select(tile){
 if(state.phase!=='running'||manual.picking)return;
 const u=state.squads.find(u=>u.id===activeUnit&&u.owner===slot);
 if(abilityTarget&&u&&!state.spectator){
  const {kind,value}=abilityTarget,data={from:u.id,to:tile,value},block=availability(kind,data);
  if(block){toast(block.icon,block.count||'');return;}
  const path=kind==='move'?route(world,state,u,tile):null;
  if(kind==='move'&&!path){toast('hand');return;}
  clearRoute();globe.previewPath=path?.path||[];
  command(kind,data).finally(()=>{if(activeUnit===u.id&&!abilityTarget)globe.previewPath=[];});
  renderProvince();return;
 }
 // A hex tap inspects its city. A unit's moving marker always selects that unit.
 if(state.cities.some(c=>c.tile===tile)){selectCity(tile);return;}
 const on=state.squads.find(u=>u.tile===tile);
 if(on){selectUnit(on.id);return;}
 selectCity(tile);
}
function renderProvince(){
 const u=state.squads.find(u=>u.id===activeUnit),city=state.cities.find(c=>c.tile===(u?u.tile:selected));
 if(state.phase!=='running'||techOpen||!u&&!city){show('province',false);return;}show('province',true);
 if(u&&selected!==u.tile){selected=u.tile;globe.choose(u.tile);}
 if(u){
  const own=u.owner===slot&&!state.spectator,sp=state.rules.specs[u.kind],discovery=state.discoveries?.find(d=>d.tile===u.tile&&!d.used);
  const options=own?refitChoices(state,u):[],actions=abilities(u.kind),block=(kind,value=0,to=null)=>availability(kind,{from:u.id,value,to});
  const refitBlock=options.length?block('refit',options[0]):null;
  const canRefit=options.some(k=>!block('refit',k));
  const actionMarkup=actions.map((a,i)=>actionButton(`ability-${i}`,a.icon,a.label,abilityCost(state,u,a.value)?price(abilityCost(state,u,a.value)):'',block('ability',a.value),u.kind===13||u.kind===10)).join('');
  $('province').innerHTML=`<div class="piece-head"><span class="piece-portrait" style="color:${colors[u.owner]}">${icon(unitIcons[u.kind])}</span><div><span class="owner-name">${html(state.players[u.owner]?.name||'')}</span><div class="health"><i style="width:${100*u.hp/sp.hp}%"></i></div>${stat('heart',num(u.hp))}</div><span class="spacer"></span>${city?btn('select-city','city','Select city here'):''}${btn('close-piece','close','Close selection')}</div>
   ${own&&!state.spectator?`<div class="action-row unit-actions">${actionButton('move-order','route','Move: choose a destination hex','',block('move'))}${sp.damage?actionButton('attack-order','swords','Attack: choose a hex in range; committed until recovery','',block('attack')):''}${actionMarkup}${actionButton('stop-order','hand',u.founding?'Cancel city construction':'Clear remaining path; keep current tile and cooldown','',block('stop'),u.path.length>1)}${discovery?actionButton('claim-site',discoveryIcons[discovery.kind],`Explore ${discoveryNames[discovery.kind]}`,discovery.kind===9?price(50):'',block('explore')):''}${options.length?actionButton('refit-toggle','refit','Choose a different military unit', '',canRefit?null:refitBlock):''}${actionButton('disband-unit','disband','Disband this unit',state.tiles[u.tile].owner===slot?price(Math.floor(sp.cost*.25)):'',block('disband'))}</div>`:''}
   ${abilityTarget?`<div class="aim-hint" aria-label="Choose a map target">${icon(abilityTarget.icon)}${icon('arrow')}${icon('territory')}</div>`:''}
   ${refitOpen&&own&&options.length?`<div class="action-row recruit-row">${options.map(k=>actionButton(`refit-${k}`,unitIcons[k],`Refit as ${unitNames[k]}`,price(Math.max(30,state.rules.specs[k].cost-sp.cost*.5)),block('refit',k))).join('')}</div>`:''}
   ${u.path.length>1||u.left>0?`<div class="movement-status" aria-label="Remaining steps and movement cooldown">${stat('route',u.path.length-1)}${stat('clock',u.left)}</div>`:''}
   ${u.locked_until>state.tick?`<div class="commitment">${icon('hourglass')}${u.locked_until-state.tick}${u.focus!=null?icon('swords'):''}</div>`:''}
   ${u.refit>=0?`<div class="training">${icon(unitIcons[u.refit])}${stat('clock',u.work)}</div>`:''}
   ${u.founding?`<div class="job-progress"><i style="width:${100*(1-u.work/45)}%"></i></div>`:''}`;
  $('close-piece').onclick=closeSelection;
  if(city)$('select-city').onclick=()=>selectCity(city.tile);
  if(own&&!state.spectator){
   $('move-order').onclick=()=>aim(u,'move',0,'route');
   $('disband-unit').onclick=()=>{clearRoute();command('disband',{from:u.id});};
   if(sp.damage)$('attack-order').onclick=()=>aim(u,'attack',0,'swords');
   if(options.length)$('refit-toggle').onclick=()=>{clearRoute();refitOpen=!refitOpen;renderProvince();};
   if(refitOpen)options.forEach(k=>{const b=$(`refit-${k}`);if(b)b.onclick=()=>{refitOpen=false;command('refit',{from:u.id,value:k});};});
   if(discovery)$('claim-site').onclick=()=>{clearRoute();command('explore',{from:u.id});};
   $('stop-order').onclick=()=>{clearRoute();command('stop',{from:u.id});};
   actions.forEach((a,i)=>$(`ability-${i}`).onclick=()=>{if(a.target)aim(u,'ability',a.value,a.icon);else{clearRoute();command('ability',{from:u.id,value:a.value});}});
  }
  if(abilityTarget){const id=abilityTarget.kind==='move'?'move-order':abilityTarget.kind==='attack'?'attack-order':`ability-${actions.findIndex(a=>a.value===abilityTarget.value)}`;const button=$(id);if(button){button.classList.add('armed');button.setAttribute('aria-pressed','true');}}
 }else if(city){
  const own=city.owner===slot&&!state.spectator,p=state.players[slot],unit=state.squads.find(u=>u.tile===city.tile),units=own?p.unlocked:[];
  const block=(kind,value)=>availability(kind,{from:city.tile,value});
  $('province').innerHTML=`<div class="piece-head"><span class="piece-portrait" style="color:${colors[city.owner]}">${icon(city.capital>=0?'crown':'city')}</span><div><span class="owner-name">${html(state.players[city.owner].name)}</span><div class="unit-stats">${stat('territory',city.radius)}${stat('factory',city.production)}${own?stat('coin',3+city.production*2)+stat('clock',5):''}</div></div><span class="spacer"></span>${unit?btn('select-occupant',unitIcons[unit.kind],'Select occupying unit'):''}${btn('close-piece','close','Close selection')}</div>
   ${own?`<div class="city-upgrades">${actionButton('radius-upgrade','territory','Expand city control radius',city.radius<3?`<span class="radius-change">${city.radius}${icon('arrow')}${city.radius+1}</span>${price([0,80,140][city.radius])}`:'',block('upgrade',0))}${actionButton('production-upgrade','factory','Upgrade production and income',city.production<3?price([0,110,180][city.production]):'',block('upgrade',1))}</div>
   <div class="action-row recruit-row">${units.map(k=>actionButton(`train-${k}`,unitIcons[k],`Train ${unitNames[k]}, ${state.rules.specs[k].cost} coins`,price(state.rules.specs[k].cost),block('train',k))).join('')}</div>
   ${city.training>=0?`<div class="training">${icon(unitIcons[city.training])}${stat('clock',city.left)}<div class="job-progress"><i style="width:${100*(1-city.left/city.total)}%"></i></div></div>`:''}`:''}
   ${city.capture?`<div class="training">${icon('swords')}${city.capture}/12</div>`:''}`;
  $('close-piece').onclick=closeSelection;if(unit)$('select-occupant').onclick=()=>selectUnit(unit.id);
  if(own){$('radius-upgrade').onclick=()=>command('upgrade',{from:city.tile,value:0});$('production-upgrade').onclick=()=>command('upgrade',{from:city.tile,value:1});units.forEach(k=>$(`train-${k}`).onclick=()=>command('train',{from:city.tile,value:k}));}
 }
}
function closeSelection(){activeUnit=-1;selected=-1;clearRoute();globe.choose(-1);globe.routeUnit=-1;show('province',false);}
function toggleResearch(){if(state?.spectator)return;techOpen=!techOpen;clearRoute();renderResearch();renderProvince();}
function renderResearch(){
 show('research',techOpen);if(!techOpen)return;const p=state.players[slot];
 const node=k=>{const done=p.unlocked.includes(k),busy=p.research===k,blocked=availability('research',{value:k});return `<button data-tech="${k}" aria-label="Research ${unitNames[k]}, ${researchCost(k)} coins${blocked?`. Unavailable: ${blocked.reason}`:''}" ${blocked?'disabled aria-disabled="true"':'aria-disabled="false"'} class="tree-node ${selectedTech===k?'selected':''} ${done?'done':''} ${busy?'studying':''} ${!done&&blocked?'locked':''}">${icon(unitIcons[k])}<span>${done?icon('check'):busy?stat('clock',p.research_left):price(researchCost(k))}</span></button>`;};
 const k=selectedTech,done=p.unlocked.includes(k),prereq=prerequisites(k),gate=researchGate(k);
 $('research').innerHTML=`<div class="panel-head">${icon('flask')}${stat('coin',num(p.gold))}${btn('close-tech','close','Close research tree')}</div><div class="tree-scroll"><div class="connected-tree"><svg class="tree-links" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true"><path d="M50 45V245M150 45V245M250 45V245M50 145L90 350M150 145L90 350M150 245L210 350M150 145L210 350"/></svg>${[0,1,2].map(row=>`<div class="tree-row">${branches.map(b=>node(b[row])).join('')}</div>`).join('')}<div class="tree-row final-nodes">${node(10)}${node(11)}</div></div><div class="tech-detail"><div class="tech-unit">${icon(unitIcons[k])}${unitStats(k)}</div>${unitCounters(k)}<div class="ability-preview">${abilities(k).map(a=>icon(a.icon)).join('')}</div><div class="prereq">${prereq.map(i=>icon(unitIcons[i])).join('')}${prereq.length?icon('arrow'):''}${icon(unitIcons[k])}${state.tick<gate?stat('clock',time(gate)):''}</div></div></div>`;
 $('close-tech').onclick=toggleResearch;$('research').querySelectorAll('[data-tech]').forEach(b=>b.onclick=()=>{selectedTech=Number(b.dataset.tech);command('research',{value:selectedTech});renderResearch();});
}
function openGuide(){manual.open();}
function home(){clearRoute();activeUnit=-1;const c=state.cities.find(c=>c.owner===slot&&c.capital===slot)||state.cities.find(c=>c.owner===slot);if(c){globe.targetDistance=1.65;globe.focus(c.tile);selectCity(c.tile);}}
function renderEnding(){const p=state.players[state.winner];show('ending',true);$('ending').innerHTML=`<div class="winner-icon">${icon(state.victory===2?'rocket':'crown')}</div><div class="end-emblem" style="color:${colors[state.winner]}">${icon(civs[p.civ])}<span>${html(p.name)}</span></div><div>${time(state.tick)}</div>${btn('new-game','refresh','New match','','class="guide-play"')}`;$('new-game').onclick=()=>location.assign('/');}
function rebuildMarkers(){
 $('markers').innerHTML='';markerNodes=[];const preview=state.phase==='preview'||state.phase==='lobby';
 for(const c of state.cities){if(!preview&&!state.tiles[c.tile].visible&&c.capital<0)continue;const el=document.createElement('button');el.className=`marker city-marker ${c.capital>=0?'capital':''}`;el.style.setProperty('--faction',colors[c.owner]);el.setAttribute('aria-label',`${state.players[c.owner].name}, ${c.capital>=0?'capital':'city'}, production ${c.production}`);el.innerHTML=`<span class="marker-name">${html(state.players[c.owner].name)}</span>${icon(c.capital>=0?'crown':'city')}${c.capture?`<span>${c.capture}</span>`:''}`;el.onclick=()=>{if(abilityTarget)select(c.tile);else selectCity(c.tile);};$('markers').append(el);markerNodes.push({el,p:world[c.tile].p,i:c.tile});}
 if(!preview)for(const d of state.discoveries||[]){if(d.used)continue;const el=document.createElement('button');el.className='marker discovery-marker';el.style.setProperty('--faction',d.kind===0?'#cd7755':'#86d4c7');el.setAttribute('aria-label',`Explore ${discoveryNames[d.kind]} at hex ${d.tile}`);el.innerHTML=icon(discoveryIcons[d.kind]);el.onclick=()=>{if(abilityTarget)select(d.tile);else{globe.focus(d.tile);toast(discoveryIcons[d.kind]);}};$('markers').append(el);markerNodes.push({el,p:world[d.tile].p,i:d.tile,discovery:true});}
 if(!preview)for(const u of state.squads){const el=document.createElement('button');el.className=`marker unit-marker ${u.founding?'founding':''} ${u.mode===1?'concealed':''}`;el.style.setProperty('--faction',colors[u.owner]);el.setAttribute('aria-label',`${(state.players[u.owner]?.name||'')}, ${unitNames[u.kind]} ${u.id}, health ${num(u.hp)}`);el.innerHTML=icon(unitIcons[u.kind])+`<i class="piece-health" style="width:${100*u.hp/state.rules.specs[u.kind].hp}%"></i>${u.founding?`<span class="work-count">${u.work}</span>`:u.locked_until>state.tick?`<span class="work-count">${u.locked_until-state.tick}</span>`:''}`;el.onclick=()=>{if(abilityTarget)select(u.tile);else selectUnit(u.id);};$('markers').append(el);markerNodes.push({el,p:world[u.tile].p,i:-1,u});}
}
function updateMarkers(now){if(!globe)return;for(const n of markerNodes){const u=n.u,pos=u?globe.unitPosition(u,now).p:n.p;const p=globe.project(pos);n.el.style.display=p.visible?'flex':'none';n.el.style.left=`${p.x}px`;n.el.style.top=`${p.y+(u?22:n.discovery?-15:-34)}px`;n.el.classList.toggle('selected',u?u.id===activeUnit:n.i===selected);n.el.classList.toggle('hurt',!!u&&feedbackLayer.timeline.items.some(e=>e.action==='hit'&&e.unit===u.id&&now-e.start<1200));}
 if(state?.phase==='running')$('clock').innerHTML=icon('clock')+`<span>${time(lastTick+Math.min(2,Math.floor((now-lastStateAt)/1000)))}</span>`;feedbackLayer.update(now,globe);soundscape.mix(globe,state,now);
}
$('tools').innerHTML=btn('home','home','Focus your capital')+btn('zoom-in','plus','Zoom in')+btn('zoom-out','minus','Zoom out')+btn('sound','mute','Toggle sound')+btn('help','book','Open icon manual');
const manual=new Manual($('guide'),()=>({state,slot}));
const feedbackLayer=new FeedbackLayer(soundscape);
$('dock').innerHTML=btn('tech-toggle','flask','Open technology tree');
$('home').onclick=home;$('zoom-in').onclick=()=>globe.targetDistance=Math.max(1.12,globe.targetDistance-.25);$('zoom-out').onclick=()=>globe.targetDistance=Math.min(4.8,globe.targetDistance+.3);$('sound').innerHTML=icon(sound?'sound':'mute');$('sound').onclick=()=>{sound=soundscape.toggle();$('sound').innerHTML=icon(sound?'sound':'mute');};$('help').onclick=openGuide;$('tech-toggle').onclick=toggleResearch;
$('invite').onclick=async()=>{try{await createRoom();const url=`${location.origin}/?room=${room}`;try{await navigator.clipboard.writeText(url);toast('check');}catch{if(navigator.share)await navigator.share({url});else toast('link');}}catch(e){toast('warning',Number(e.message)||503,true);}};
$('start').onclick=async()=>{try{$('lobby').classList.add('busy');if(state.phase==='preview')await createRoom();await flushProfile();await send('start');}catch(e){toast('warning',Number(e.message)||503,true);}finally{$('lobby').classList.remove('busy');}};
window.addEventListener('resize',()=>{const u=state?.squads.find(u=>u.id===activeUnit);if(u)globe.focus(u.tile);});
document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||manual.opened)return;if(e.key==='Escape'){closeSelection();techOpen=false;show('research',false);manual.close();}if(e.key.toLowerCase()==='h')home();if(e.key.toLowerCase()==='t'&&state?.phase==='running')toggleResearch();});
document.addEventListener('visibilitychange',()=>{if(ws?.readyState===1){ws.send(JSON.stringify({type:'presence',active:!document.hidden}));if(!document.hidden)ws.send(JSON.stringify({type:'ping',time:Date.now(),active:!document.hidden}));}});
try{
 globe=new Globe($('globe'),select);globe.onFrame=updateMarkers;
 const module=await WebAssembly.compileStreaming(fetch('/engine.wasm'));const e=new WebAssembly.Instance(module,{}).exports,enc=new TextEncoder(),dec=new TextDecoder();
 previewEngine=request=>{const bytes=enc.encode(JSON.stringify(request)),p=e.alloc(bytes.length);new Uint8Array(e.memory.buffer,p,bytes.length).set(bytes);e.run(p,bytes.length);return JSON.parse(dec.decode(new Uint8Array(e.memory.buffer,e.output_ptr(),e.output_len())));};
 makePreview();const id=new URL(location.href).searchParams.get('room');if(id){if(!/^[a-f0-9]{20}$/.test(id))throw Error('404');await joinRoom(id);}else $('connection').innerHTML=icon('globe');
}catch(e){console.error(e);toast('warning',Number(e.message)||503,true);$('start').disabled=true;}
