import {createShowcase, showcasePosition, showcaseFeedback} from './showcase.js';
import {assetBytes,assetsReady,finishLoading,loadingFailed,loadingStage} from './loading.js';
import { Globe } from './globe.js';
import { icon, colors } from './icons.js';
import { Soundscape } from './audio.js';
import {passengers,boardingCapacity,boardingTarget,branches,unitIcons,unitNames,counters,researchCost,distances,route,abilities,canEnter} from './planning.js';
import {orderBlock,targetTiles,refitChoices,abilityCost} from './controls.js';
import {Manual} from './manual.js';
import {FeedbackLayer} from './feedback.js';
import {terrainIcons,terrainSummary,inForestCover,rate,incomeBenefit} from './terrain.js';
const $=id=>document.getElementById(id),show=(id,yes)=>$(id).classList.toggle('hidden',!yes);
const btn=(id,symbol,label,body='',extra='')=>`<button ${id?`id="${id}"`:''} aria-label="${label}" ${extra}>${icon(symbol)}${body}</button>`;
const num=n=>Math.floor(n??0),time=n=>`${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,world=[],slot=0,room=null,token=null,ws=null,seq=0,inflight=null,connected=false,stopped=false;
let selected=-1,marchFrom=-1,marchRatio=0,previewEngine=null,previewState=null,count=8,difficulty=1,seed=crypto.getRandomValues(new Uint32Array(1))[0],civ=0;
let techOpen=false,lastTick=0,lastStateAt=performance.now(),sound=false,audio=null,markerNodes=[],marchNodes=[],hasStarted=false,retry=0,reconnectTimer,toastTimer;
let leaving=false,creating=null,readyResolve=null,pointerHeld=false,pendingRender=false;
const heldPointers=new Set();
document.addEventListener('pointerdown',e=>{heldPointers.add(e.pointerId);pointerHeld=true;},true);
const finishPointer=e=>{heldPointers.delete(e.pointerId);requestAnimationFrame(()=>{pointerHeld=heldPointers.size>0;if(!pointerHeld&&pendingRender&&state){pendingRender=false;render();rebuildMarkers();}});};
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
let selectedTech=1,abilityTarget=null,refitOpen=false;
let globe,showcase=null;
const soundscape=new Soundscape();sound=soundscape.enabled;
document.addEventListener('pointerdown',()=>soundscape.unlock(),{passive:true});
document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('#sound'))soundscape.play('click',.12);});
function toast(symbol,value='',error=false){$('toast').style.color='';$('toast').innerHTML=(symbol?icon(symbol):'')+`<span>${value}</span>`;$('toast').className=`show ${error?'error':''}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').className='',3500);beep(error?160:510);}
function beep(freq=480){soundscape.play(freq<200?'warning':'click',freq<200?.22:.14);}
function setConnected(value){connected=value;$('connection').classList.toggle('offline',!value);$('connection').innerHTML=icon(value?'network':'refresh');renderControls();}
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data;try{data=await r.json();}catch{throw Error('503');}if(!r.ok)throw Error(String(data.error||r.status));return data;}
function stored(id){try{return JSON.parse(localStorage.getItem(`meridian:${id}`)||'null');}catch{return null;}}
function saveSeat(){try{localStorage.setItem(`meridian:${room}`,JSON.stringify({token,slot}));}catch{}}
async function createRoom(){
 if(room){if(!connected)throw Error('503');return;}
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
   if(!connected){setConnected(true);retry=0;}lastTick=msg.tick;lastStateAt=performance.now();if(msg.phase==='lobby')showShowcase();else globe.setState(msg,slot);feedbackLayer.accept(msg);
   if(msg.phase==='lobby'&&previous?.phase!=='lobby'){hasStarted=false;encountered.clear();closeSelection();techOpen=false;show('research',false);}
   if(msg.phase==='running'&&!hasStarted){hasStarted=true;home();}
   soundscape.events(msg,previous,world,globe,slot);
   if(msg.phase==='running'){for(const t of msg.tiles)if(t.visible&&t.owner>=0&&t.owner!==slot&&!encountered.has(t.owner)){encountered.add(t.owner);toast('',html(msg.players[t.owner].name));$('toast').style.color=colors[t.owner];break;}}
   if(pointerHeld&&!msg.result&&msg.phase!=='ended')pendingRender=true;else{render();rebuildMarkers();}if(readyResolve){readyResolve();readyResolve=null;}
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
function renderControls(){if(!state)return;if($('ending').open)$('back-lobby').disabled=!connected||!!inflight;if(state.phase==='running'){if(pointerHeld)pendingRender=true;else{renderProvince();renderResearch();}}const lobby=state.phase==='lobby'||state.phase==='preview';$('start').disabled=!!inflight||!!creating||lobby&&state.phase!=='preview'&&(!connected||!state.host||state.awaitingResults);$('invite').disabled=!!creating;if(lobby){const locked=!!inflight||!!creating||state.phase!=='preview'&&(!connected||!state.host);$('fewer-players').disabled=locked||count<=(state.minCount||2);$('more-players').disabled=locked||count>=8;$('difficulty').disabled=locked;}}
function render(){
 const title=state.phase==='preview',lobby=state.phase==='lobby'||title;show('title-screen',title);show('topbar',!title);document.body.classList.toggle('on-title',title);document.body.classList.toggle('in-lobby',lobby);show('lobby',lobby&&!title);show('roster',!lobby);show('dock',!lobby);$('resources').innerHTML=lobby?'':resources();
 $('clock').innerHTML=icon('clock')+`<span>${time(state.tick)}</span>`;
 if(lobby)renderLobby();else{renderRoster();renderProvince();renderResearch();}
 $('tech-toggle').disabled=!!state.spectator;renderControls();if(state.spectator){clearRoute();techOpen=false;show('research',false);}$('leave-room').setAttribute('aria-label',lobby?'Back to title':'Leave game');if(state.result||state.phase==='ended')renderEnding();else if($('ending').open)$('ending').close();
}
function resources(){if(state.spectator)return `<div class="resource spectator" aria-label="Spectating">${icon('spectate')}</div>`;return `<div class="resource gold" aria-label="Treasury">${icon('coin')}<span>${num(state.players[slot].gold)}</span></div>`;}

function renderLobby(){
 if(document.activeElement?.id!=='username')$('bonus').innerHTML=icon('person')+`<input id="username" type="text" autocomplete="off" spellcheck="false" aria-label="Your player name, up to 32 characters" value="${html(username)}"><small>${Array.from(username).length}/32</small>`;
 $('bonus').querySelector('small').textContent=`${Array.from(username).length}/32`;
 $('username').oninput=()=>{username=Array.from($('username').value.replace(/[\u0000-\u001f\u007f]/g,'')).slice(0,32).join('');$('username').value=username;rememberIdentity();state.players[slot].name=username;if(state.phase==='preview')previewState.players[0].name=username;else queueProfile();renderLobby();};
 $('seats').innerHTML=state.players.map((p,i)=>`<span class="seat ${!p.bot?'human':''}" style="--seat:${colors[i]}" aria-label="${html(p.name)}${p.bot?', bot':''}"><i class="player-color" aria-hidden="true"></i><small>${html(p.name)}</small></span>`).join('');
 const host=state.phase==='preview'||state.host,humans=state.humans||1;
 show('config',!!host);$('config').innerHTML=`<div class="player-count">${btn('fewer-players','minus','Remove a bot','',!host||count<=(state.minCount||2)?'disabled':'')}<div class="config-group" aria-label="${humans} human players, ${count-humans} bot seats, ${count} total">${icon('person')}<span>${count-humans} bots</span></div>${btn('more-players','plus','Add a bot','',!host||count>=8?'disabled':'')}</div><button id="difficulty" class="difficulty" aria-label="${['Easy','Medium','Hard'][difficulty]} bots" ${!host?'disabled':''}><span class="difficulty-icons">${Array.from({length:difficulty+1},()=>icon('bot')).join('')}</span><span>${['Easy','Medium','Hard'][difficulty]}</span><span class="difficulty-change">Change</span></button>`;
 $('victory-hint').innerHTML=`<em>${icon('crown')}<span>${state.rules.capital_goal??4}</span></em><span></span><em>${icon('rocket')}</em><span></span><em>${icon('clock')}20–25</em>`;
 $('seed').innerHTML=icon('globe')+`<span>${seed.toString().padStart(10,'0')}</span>`;
 $('start').innerHTML=icon(state.phase==='lobby'&&(!state.host||state.awaitingResults)?'hourglass':'play');$('start').setAttribute('aria-label',state.awaitingResults?'Waiting for players to return from the victory screen':'Start match');$('invite').innerHTML=icon('link');
 $('fewer-players').onclick=()=>configure({count:count-1});$('more-players').onclick=()=>configure({count:count+1});
 $('difficulty').onclick=()=>configure({difficulty:(difficulty+1)%3});
}
async function configure(changes){if(state.phase==='preview'){count=changes.count??count;seed=changes.seed??seed;difficulty=changes.difficulty??difficulty;makePreview();}else await send('configure',{count,seed,difficulty,...changes}).catch(()=>{});}
function makePreview(){previewState=previewEngine({op:'new',seed,count,difficulty}).state;previewState.players[0].civ=civ;previewState.players[0].tag=callsign;previewState.players[0].name=username;world=previewState.tiles.map(t=>({p:t.p,poly:t.poly,near:t.near,terrain:t.terrain,capital:t.capital,site:t.site}));state={...previewState,...previewEngine({op:'view',state:previewState,player:0}).state,tiles:previewState.tiles.map(t=>({...t,visible:true})),phase:'preview',host:true,humans:1,revision:0};globe.setWorld(world);showShowcase();render();rebuildMarkers();$('host-game').disabled=false;}
function showShowcase(){
 if(!showcase||showcase.seed!==seed)showcase=createShowcase(world,state.rules,seed);
 globe.setState(showcase,0);globe.showcasePose=(u,now)=>showcasePosition(u,world,now);
}
function renderRoster(){
 $('roster').innerHTML=state.players.map((p,i)=>`<button class="roster-item ${i===slot?'me':''} ${!p.alive?'dead':''}" style="--faction:${colors[i]}" aria-label="${html(p.name)}, ${!p.alive?'Spectating':p.bot?'AI control':'Human online'}, influence ${p.mandate} of ${state.rules.mandate_goal}" data-player="${i}"><i class="player-color" aria-hidden="true"></i><span class="roster-name">${html(p.name)}</span><span class="victory-count">${icon('crown')}${p.mandate}</span><i class="launch-track" style="width:${Math.min(100,100*Math.max(p.mandate/state.rules.mandate_goal,p.launch/state.rules.space_goal))}%"></i></button>`).join('');
 $('roster').querySelectorAll('button').forEach(b=>b.onclick=()=>{const c=state.cities.find(c=>c.capital===Number(b.dataset.player));if(c){globe.focus(c.tile);selectCity(c.tile);}});
}
const price=n=>`<span class="price">${icon('coin')}${n}</span>`;
const stat=(symbol,n)=>`<span class="stat">${icon(symbol)}${n}</span>`;
function unitStats(k){const s=state.rules.specs[k];return `<div class="unit-stats">${stat('heart',s.hp)}${s.damage?stat('swords',s.damage)+stat('eye',s.min===s.range?s.range:`${s.min}–${s.range}`):''}${stat('route',s.speed)}${s.damage?stat('clock',s.reload):''}</div>`;}
function unitCounters(k){return counters[k].length?`<div class="counter-strip">${icon(unitIcons[k])}${icon('swords')}${counters[k].map(i=>icon(unitIcons[i])).join('')}</div>`:'';}
function clearRoute(){abilityTarget=null;document.body.classList.remove('targeting');globe.previewPath=[];globe.setTargets(new Set());globe.setBlockedTargets(new Set());}
function selectCity(tile){clearRoute();activeUnit=-1;globe.routeUnit=-1;selected=tile;techOpen=false;show('research',false);globe.choose(tile,true);globe.frameCity(tile);renderProvince();}
function selectUnit(id){refitOpen=false;const u=state.squads.find(u=>u.id===id);if(!u)return;if(u.boarded_on!=null){selectUnit(u.boarded_on);return;}clearRoute();activeUnit=id;selected=u.tile;techOpen=false;show('research',false);globe.choose(u.tile);globe.routeUnit=id;globe.focus(u.tile);renderProvince();}
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
  if(kind==='move'){const d=distances(world,u.tile);globe.setBlockedTargets(new Set(world.flatMap((t,i)=>state.tiles[i]?.visible&&d[i]<=3&&!canEnter(world,u.kind,i)&&!boardingTarget(world,state,u,i)?[i]:[])));}
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
 // Invisible model hit targets keep individual units selectable on city tiles.
 if(state.cities.some(c=>c.tile===tile)){selectCity(tile);return;}
 const on=state.squads.find(u=>u.tile===tile&&u.boarded_on==null);
 if(on){selectUnit(on.id);return;}
 selectCity(tile);
}
function renderProvince(){
 const aboard=state.squads.find(u=>u.id===activeUnit)?.boarded_on;if(aboard!=null){activeUnit=aboard;globe.routeUnit=aboard;}
 const u=state.squads.find(u=>u.id===activeUnit),city=state.cities.find(c=>c.tile===(u?u.tile:selected));
 if(state.phase!=='running'||techOpen||!world[u?u.tile:selected]){show('province',false);return;}show('province',true);
 if(u&&selected!==u.tile){selected=u.tile;globe.choose(u.tile);}
 if(u){
  const own=u.owner===slot&&!state.spectator,sp=state.rules.specs[u.kind];
  const options=own?refitChoices(state,u):[],actions=abilities(u.kind),block=(kind,value=0,to=null)=>availability(kind,{from:u.id,value,to});
  const cargo=passengers(state,u),capacity=boardingCapacity(state,u);
  const refitBlock=options.length?block('refit',options[0]):null;
  const canRefit=options.some(k=>!block('refit',k));
  const actionMarkup=actions.map((a,i)=>actionButton(`ability-${i}`,a.icon,a.label,abilityCost(state,u,a.value)?price(abilityCost(state,u,a.value)):'',block('ability',a.value),u.kind===13||u.kind===10)).join('');
  $('province').innerHTML=`<div class="piece-head"><span class="piece-portrait" style="color:${colors[u.owner]}">${icon(unitIcons[u.kind])}</span><div><span class="owner-name">${html(state.players[u.owner]?.name||'')}</span><div class="health"><i style="width:${100*u.hp/sp.hp}%"></i></div>${stat('heart',num(u.hp))}<span class="terrain-status">${icon(terrainIcons[world[u.tile].terrain])}${inForestCover(world,u)?`<span aria-label="Forest cover: 25% less incoming damage">${icon('shield')}−25%</span>`:''}</span></div><span class="spacer"></span>${city?btn('select-city','city','Select city here'):''}${btn('close-piece','close','Close selection')}</div>
   ${capacity&&(own||state.spectator)?`<div class="passenger-status" aria-label="${cargo.length} of ${capacity} passengers aboard">${icon('board')}<strong>${cargo.length}/${capacity}</strong><span class="passenger-manifest">${cargo.map(s=>`<span title="${unitNames[s.kind]}: ${num(s.hp)} health" aria-label="${unitNames[s.kind]}, ${num(s.hp)} health">${icon(unitIcons[s.kind])}</span>`).join('')}</span></div>`:''}
   ${own&&!state.spectator?`<div class="action-row unit-actions">${actionButton('move-order','route','Move: choose a destination hex','',block('move'))}${sp.damage?actionButton('attack-order','swords','Attack: choose a hex in range; committed until recovery','',block('attack')):''}${actionMarkup}${capacity?actionButton('disembark-order','disembark','Disembark one passenger: choose adjacent empty land; first passenger able to enter it','',block('disembark')):''}${actionButton('stop-order','hand',u.founding?'Cancel city construction':'Clear remaining path; keep current tile and cooldown','',block('stop'),u.path.length>1)}${options.length?actionButton('refit-toggle','refit','Choose a different military unit', '',canRefit?null:refitBlock):''}${actionButton('disband-unit','disband','Disband this unit',state.tiles[u.tile].owner===slot?price(Math.floor(sp.cost*.25)):'',block('disband'))}</div>`:''}
   ${abilityTarget?`<div class="aim-hint" aria-label="Choose a map target">${icon(abilityTarget.icon)}${icon('arrow')}${icon('territory')}</div>`:''}
   ${refitOpen&&own&&options.length?`<div class="action-row recruit-row">${options.map(k=>actionButton(`refit-${k}`,unitIcons[k],`Refit as ${unitNames[k]}`,price(Math.max(30,state.rules.specs[k].cost-sp.cost*.5)),block('refit',k))).join('')}</div>`:''}
   ${u.path.length>1||u.left>0?`<div class="movement-status" aria-label="Remaining steps and movement cooldown">${stat('route',u.path.length-1)}${stat('clock',u.left)}</div>`:''}
   ${u.locked_until>state.tick?`<div class="commitment">${icon('hourglass')}${u.locked_until-state.tick}${u.focus!=null?icon('swords'):''}</div>`:''}
   ${u.refit>=0?`<div class="training">${icon(unitIcons[u.refit])}${stat('clock',u.work)}</div>`:''}
   ${u.founding?`<div class="job-progress"><i style="width:${100*(1-u.work/45)}%"></i></div>`:''}`;
  $('close-piece').onclick=closeSelection;
  if(city)$('select-city').onclick=()=>selectCity(city.tile);
  if(own&&!state.spectator){
   if(capacity)$('disembark-order').onclick=()=>aim(u,'disembark',0,'disembark');
   $('move-order').onclick=()=>aim(u,'move',0,'route');
   $('disband-unit').onclick=()=>{clearRoute();command('disband',{from:u.id});};
   if(sp.damage)$('attack-order').onclick=()=>aim(u,'attack',0,'swords');
   if(options.length)$('refit-toggle').onclick=()=>{clearRoute();refitOpen=!refitOpen;renderProvince();};
   if(refitOpen)options.forEach(k=>{const b=$(`refit-${k}`);if(b)b.onclick=()=>{refitOpen=false;command('refit',{from:u.id,value:k});};});
   $('stop-order').onclick=()=>{clearRoute();command('stop',{from:u.id});};
   actions.forEach((a,i)=>$(`ability-${i}`).onclick=()=>{if(a.target)aim(u,'ability',a.value,a.icon);else{clearRoute();command('ability',{from:u.id,value:a.value});}});
  }
  if(abilityTarget){const id=abilityTarget.kind==='move'?'move-order':abilityTarget.kind==='attack'?'attack-order':abilityTarget.kind==='disembark'?'disembark-order':`ability-${actions.findIndex(a=>a.value===abilityTarget.value)}`;const button=$(id);if(button){button.classList.add('armed');button.setAttribute('aria-pressed','true');}}
 }else if(city){
  const own=city.owner===slot&&!state.spectator,p=state.players[slot],unit=state.squads.find(u=>u.tile===city.tile),units=own?p.unlocked:[];
  const block=(kind,value)=>availability(kind,{from:city.tile,value});
  const capacityGain=state.rules.unit_cap<16?1:0;
  const landBenefits=city.radius<3?`<span class="radius-change">${city.radius}${icon('arrow')}${city.radius+1}</span><span class="upgrade-benefit">${icon('shield')}+${capacityGain}</span>${incomeBenefit(icon,city.expansion_income??0)}${price([0,80,140][city.radius])}`:'';
  const productionBenefits=city.production<3?`<span class="upgrade-benefit">${icon('coin')}+0.4<span class="upgrade-per">/${icon('clock')}1</span></span><span class="upgrade-benefit">${icon('hourglass')}−${city.production===1?'20':'16.7'}%</span>${price([0,110,180][city.production])}`:'';
  $('province').innerHTML=`<div class="piece-head"><span class="piece-portrait" style="color:${colors[city.owner]}">${icon(city.capital>=0?'crown':'city')}</span><div><span class="owner-name">${html(state.players[city.owner].name)}</span><div class="unit-stats">${stat('territory',city.radius)}${stat('factory',city.production)}${own?stat('wheat',city.farms??0)+stat('coin',rate(city.income??(3+city.production*2)))+stat('clock',5):''}</div></div><span class="spacer"></span>${unit?btn('select-occupant',unitIcons[unit.kind],'Select occupying unit'):''}${btn('close-piece','close','Close selection')}</div>
   ${own?`<div class="city-upgrades">${actionButton('radius-upgrade','territory',city.radius<3?`Expand city control radius to ${city.radius+1}; +${rate((city.expansion_income??0)/5)} coins per second from new farmland; +${capacityGain} unit capacity${capacityGain?'':'; capacity limit reached'}`:'Expand city control radius',landBenefits,block('upgrade',0))}${actionButton('production-upgrade','factory',city.production<3?`Upgrade production: +0.4 coins per second (2 every 5 seconds); approximately ${city.production===1?'20':'16.7'}% shorter training time for new recruits`:'Upgrade production and income',productionBenefits,block('upgrade',1))}</div>
   <div class="action-row recruit-row">${units.map(k=>actionButton(`train-${k}`,unitIcons[k],`Train ${unitNames[k]}, ${state.rules.specs[k].cost} coins`,price(state.rules.specs[k].cost),block('train',k))).join('')}</div>
   ${city.training>=0?`<div class="training">${icon(unitIcons[city.training])}${stat('clock',city.left)}<div class="job-progress"><i style="width:${100*(1-city.left/city.total)}%"></i></div></div>`:''}`:''}
   ${city.capture?`<div class="training">${icon('swords')}${city.capture}/12</div>`:''}`;
  $('close-piece').onclick=closeSelection;if(unit)$('select-occupant').onclick=()=>selectUnit(unit.id);
  if(own){$('radius-upgrade').onclick=()=>command('upgrade',{from:city.tile,value:0});$('production-upgrade').onclick=()=>command('upgrade',{from:city.tile,value:1});units.forEach(k=>$(`train-${k}`).onclick=()=>command('train',{from:city.tile,value:k}));}
 }else{
  $('province').innerHTML=`<div class="tile-inspector-head">${icon('territory')}<span>Tile terrain</span><span class="spacer"></span>${btn('close-piece','close','Close selection')}</div>`;
  $('close-piece').onclick=closeSelection;
 }
 $('province').insertAdjacentHTML('beforeend',terrainSummary(icon,world[u?u.tile:selected].terrain));
 $('province').querySelectorAll('[data-terrain-help]').forEach(b=>b.onclick=()=>manual.open(b.dataset.terrainHelp,b.getAttribute('aria-label')));
}
function closeSelection(){activeUnit=-1;selected=-1;clearRoute();globe.choose(-1);globe.routeUnit=-1;show('province',false);}
function toggleResearch(){if(state?.spectator)return;techOpen=!techOpen;clearRoute();renderResearch();renderProvince();}
function renderResearch(){
 show('research',techOpen);if(!techOpen)return;const p=state.players[slot];
 const node=k=>{const done=p.unlocked.includes(k),busy=p.research===k,blocked=availability('research',{value:k});return `<button data-tech="${k}" aria-label="Research ${unitNames[k]}, ${researchCost(k)} coins${blocked?`. Unavailable: ${blocked.reason}`:''}" ${blocked?'disabled aria-disabled="true"':'aria-disabled="false"'} class="tree-node ${selectedTech===k?'selected':''} ${done?'done':''} ${busy?'studying':''} ${!done&&blocked?'locked':''}">${icon(unitIcons[k])}<span>${done?icon('check'):busy?stat('clock',p.research_left):price(researchCost(k))}</span></button>`;};
 $('research').innerHTML=`<div class="panel-head">${icon('flask')}${btn('close-tech','close','Close research tree')}</div><div class="tree-scroll"><div class="connected-tree"><svg class="tree-links" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true"><path d="M50 45V245M150 45V245M250 45V245M50 145L90 350M150 145L90 350M150 245L210 350M150 145L210 350"/></svg>${[0,1,2].map(row=>`<div class="tree-row">${branches.map(b=>node(b[row])).join('')}</div>`).join('')}<div class="tree-row final-nodes">${node(10)}${node(11)}</div></div></div>`;
 $('close-tech').onclick=toggleResearch;$('research').querySelectorAll('[data-tech]').forEach(b=>b.onclick=()=>{selectedTech=Number(b.dataset.tech);command('research',{value:selectedTech});renderResearch();});
}
function openGuide(){manual.open();}
function home(){clearRoute();activeUnit=-1;const c=state.cities.find(c=>c.owner===slot&&c.capital===slot)||state.cities.find(c=>c.owner===slot);if(c){globe.targetDistance=1.65;globe.focus(c.tile);selectCity(c.tile);}}
async function leaveRoom(){
 if(leaving)return;leaving=true;
 try{
  if(creating)await creating;
  if(room&&connected){if(inflight)await inflight.promise.catch(()=>{});await send('leave');}
  stopped=true;clearTimeout(reconnectTimer);clearTimeout(profileTimer);
  if(room)try{localStorage.removeItem(`meridian:${room}`);}catch{}
  if(ws){ws.onclose=null;ws.onmessage=null;ws.close();}
  location.assign('/');
 }catch(e){leaving=false;toast('warning',Number(e.message)||503,true);}
}
function renderEnding(){
 const result=state.result||{winner:state.winner,victory:state.victory,tick:state.tick,player:state.players[state.winner]},p=result.player;
 const dialog=$('ending');
 if(!dialog.open){
  manual.close();clearRoute();techOpen=false;show('research',false);show('province',false);
  dialog.innerHTML=`<div class="winner-icon">${icon(result.victory===2?'rocket':'crown')}</div><h1 id="victory-title">${result.winner===slot?'Victory!':'Match complete'}</h1><div class="end-emblem" style="color:${colors[result.winner]}"><span>${html(p.name)} wins!</span></div><p>${result.victory===2?'Space victory':'Capital victory'} · ${time(result.tick)}</p><div class="result-actions">${btn('back-lobby','home','Back to lobby','Back to lobby')}${btn('leave-result','close','Leave game','Leave')}</div>`;
  $('back-lobby').onclick=async()=>{try{await send('lobby');}catch{}};
  $('leave-result').onclick=confirmLeave;
  dialog.showModal();
 }
 $('back-lobby').disabled=!connected||!!inflight;
}
function rebuildMarkers(){
 $('markers').innerHTML='';markerNodes=[];const preview=state.phase==='preview'||state.phase==='lobby';if(preview)return;
 for(const c of state.cities){if(!preview&&!state.tiles[c.tile].visible&&c.capital<0)continue;const el=document.createElement('button');el.className=`marker city-marker ${c.capital>=0?'capital':''}`;el.style.setProperty('--faction',colors[c.owner]);el.setAttribute('aria-label',`${state.players[c.owner].name}, ${c.capital>=0?'capital':'city'}, production ${c.production}`);el.onclick=()=>{if(abilityTarget)select(c.tile);else selectCity(c.tile);};$('markers').append(el);markerNodes.push({el,p:world[c.tile].p,i:c.tile});}
 if(!preview)for(const u of state.squads){if(u.boarded_on!=null)continue;const el=document.createElement('button');el.className=`marker unit-marker ${u.founding?'founding':''} ${u.mode===1?'concealed':''}`;el.style.setProperty('--faction',colors[u.owner]);el.setAttribute('aria-label',`${(state.players[u.owner]?.name||'')}, ${unitNames[u.kind]} ${u.id}, health ${num(u.hp)}`);el.onclick=()=>{if(abilityTarget)select(u.tile);else selectUnit(u.id);};$('markers').append(el);markerNodes.push({el,p:world[u.tile].p,i:-1,u});}
}
function updateMarkers(now){if(!globe)return;if(globe.state?.showcase){showcaseFeedback(showcase,world,now);globe.effects.accept(showcase,now);}for(const n of markerNodes){const u=n.u,pos=u?globe.unitPosition(u,now).p:n.p;const p=globe.project(pos);n.el.style.display=p.visible?'flex':'none';n.el.style.left=`${p.x}px`;n.el.style.top=`${p.y-10}px`;n.el.classList.toggle('selected',u?u.id===activeUnit:n.i===selected);n.el.classList.toggle('hurt',!!u&&feedbackLayer.timeline.items.some(e=>e.action==='hit'&&e.unit===u.id&&now-e.start<1200));}
 if(state?.phase==='running')$('clock').innerHTML=icon('clock')+`<span>${time(lastTick+Math.min(2,Math.floor((now-lastStateAt)/1000)))}</span>`;feedbackLayer.update(now,globe);soundscape.mix(globe,state,now);
}
$('navigation').innerHTML=btn('leave-room','arrow','Back to title');
$('top-actions').innerHTML=btn('sound','mute','Toggle sound')+btn('help','book','Open manual','<span>Manual</span>');
function confirmLeave(){if(!$('leave-confirm').open)$('leave-confirm').showModal();}
$('leave-room').onclick=()=>state.phase==='lobby'?leaveRoom():confirmLeave();
$('stay').onclick=()=>$('leave-confirm').close();
$('confirm-leave').onclick=async()=>{$('confirm-leave').disabled=true;await leaveRoom();$('confirm-leave').disabled=false;};
$('host-game').onclick=async()=>{try{$('host-game').disabled=true;await createRoom();}catch(e){toast('warning',Number(e.message)||503,true);}finally{$('host-game').disabled=false;}};
$('ending').addEventListener('cancel',e=>e.preventDefault());
const manual=new Manual($('guide'),()=>({state,slot}));
const feedbackLayer=new FeedbackLayer(soundscape);
$('dock').innerHTML=btn('tech-toggle','flask','Open technology tree');
function renderSound(){$('sound').innerHTML=icon(sound?'sound':'mute');$('sound').setAttribute('aria-pressed',String(sound));}renderSound();$('sound').onclick=()=>{sound=soundscape.toggle();renderSound();};$('help').onclick=openGuide;$('tech-toggle').onclick=toggleResearch;
$('invite').onclick=async()=>{try{await createRoom();const url=`${location.origin}/?room=${room}`;try{await navigator.clipboard.writeText(url);toast('check');}catch{if(navigator.share)await navigator.share({url});else toast('link');}}catch(e){toast('warning',Number(e.message)||503,true);}};
$('start').onclick=async()=>{try{$('lobby').classList.add('busy');if(state.phase==='preview')await createRoom();await flushProfile();await send('start');}catch(e){toast('warning',Number(e.message)||503,true);}finally{$('lobby').classList.remove('busy');}};
window.addEventListener('resize',()=>{const u=state?.squads.find(u=>u.id===activeUnit);if(u)globe.focus(u.tile);});
document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||manual.opened)return;if(e.key==='Escape'){closeSelection();techOpen=false;show('research',false);manual.close();}if(e.key.toLowerCase()==='h'&&state?.phase==='running')home();if(e.key.toLowerCase()==='t'&&state?.phase==='running')toggleResearch();});
document.addEventListener('visibilitychange',()=>{if(ws?.readyState===1){ws.send(JSON.stringify({type:'presence',active:!document.hidden}));if(!document.hidden)ws.send(JSON.stringify({type:'ping',time:Date.now(),active:!document.hidden}));}});
try{
 globe=new Globe($('globe'),select);globe.onFrame=updateMarkers;
 const module=await WebAssembly.compile(await assetBytes('/engine.wasm'));const e=new WebAssembly.Instance(module,{}).exports,enc=new TextEncoder(),dec=new TextDecoder();
 previewEngine=request=>{const bytes=enc.encode(JSON.stringify(request)),p=e.alloc(bytes.length);new Uint8Array(e.memory.buffer,p,bytes.length).set(bytes);e.run(p,bytes.length);return JSON.parse(dec.decode(new Uint8Array(e.memory.buffer,e.output_ptr(),e.output_len())));};
 makePreview();const id=new URL(location.href).searchParams.get('room');if(id){if(!/^[a-f0-9]{20}$/.test(id))throw Error('404');loadingStage('Joining your game…');await joinRoom(id);}else $('connection').innerHTML=icon('globe');
 await assetsReady();
 // Let the renderer upload and draw the completed scene before revealing it.
 await new Promise(resolve=>{globe.onFrame=now=>{updateMarkers(now);globe.onFrame=updateMarkers;resolve();};});
 await finishLoading();
}catch(e){console.error(e);loadingFailed(e);$('start').disabled=true;}
