import {units,naval} from './roster.js';
import {icon} from './icons.js';
import {orderBlock} from './controls.js';

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function manufactureUnits(world,state,slot,tile){
 return [...state.players[slot].unlocked].filter(k=>!naval(k)||world[tile].near.some(i=>world[i].terrain===0)).sort((a,b)=>units[a].era-units[b].era||a-b);
}
export function unitDescription(k){
 const u=units[k],weak=units.filter(other=>other.counters.includes(k));
 return {role:u.role,counters:u.counters.length?u.counters.map(i=>units[i].name).join(', '):'No specialist combat bonus.',weak:weak.length?weak.map(u=>u.name).join(', '):!u.spec.damage?'Direct attacks; keep an escort.':u.directional?'Flanking and attacks from behind.':u.spec.min>1?'Enemies inside its minimum range.':'Concentrated attacks; avoid fighting unsupported.'};
}
export class Manufacture {
 constructor(context,send){
  this.context=context;this.send=send;this.tile=null;this.signature='';
  this.root=document.createElement('dialog');this.root.id='manufacture';this.root.setAttribute('aria-labelledby','manufacture-title');
  this.root.innerHTML=`<header class="manufacture-head"><h2 id="manufacture-title">Manufacture</h2><button type="button" data-close aria-label="Close manufacture">${icon('close')}</button></header><div class="manufacture-layout"><section class="manufacture-catalog" aria-label="Available units"></section><aside class="manufacture-queue"><div class="manufacture-queue-head"><h3>City queue <span data-count></span></h3><button type="button" data-clear>Clear queue</button></div><p class="manufacture-note">Units build in order. Coins are charged when each unit starts. Waiting units pause until coins and capacity are available.</p><div data-current role="status"></div><ol data-queue aria-label="Waiting units"></ol><p class="manufacture-note">Clearing removes waiting units. The unit being built will finish.</p></aside></div>`;
  document.body.append(this.root);
  this.root.querySelector('[data-close]').onclick=()=>this.root.close();
  this.root.querySelector('[data-clear]').onclick=()=>send('clear_queue',{from:this.tile});
  this.root.addEventListener('click',e=>{if(e.target===this.root)this.root.close();});
  this.root.addEventListener('close',()=>{this.tile=null;document.getElementById('manufacture-open')?.focus({preventScroll:true});});
 }
 open(tile){this.tile=tile;this.signature='';this.render();if(this.tile!==null)this.root.showModal();}
 render(){
  if(this.tile===null)return;
  const {world,state,slot,connected}=this.context(),c=state?.cities.find(c=>c.tile===this.tile&&c.owner===slot);
  if(!c||state.phase!=='running'||state.spectator){this.root.close();this.tile=null;return;}
  const available=manufactureUnits(world,state,slot,c.tile),signature=JSON.stringify([c.tile,available,c.production]);
  if(signature!==this.signature){
   this.signature=signature;
   this.root.querySelector('.manufacture-catalog').innerHTML=available.map(k=>{
    const u=units[k],d=unitDescription(k),s=state.rules.specs[k];
    return `<article class="manufacture-card"><div class="manufacture-card-head">${icon(u.icon)}<h3>${escape(u.name)}</h3><span class="manufacture-price" aria-label="${s.cost} coins">${icon('coin')}${s.cost}</span></div><p>${escape(d.role)}</p><dl><div><dt>Counters</dt><dd>${escape(d.counters)}</dd></div><div><dt>Weak against</dt><dd>${escape(d.weak)}</dd></div></dl><button type="button" data-add="${k}" aria-label="Add ${escape(u.name)} to queue">${icon('plus')}Add to queue</button></article>`;
   }).join('');
   this.root.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>this.send('enqueue',{from:this.tile,value:Number(b.dataset.add)}));
  }
  const q=c.queue||[];
  this.root.querySelectorAll('[data-add]').forEach(b=>b.disabled=!connected||q.length>=50);
  this.root.querySelector('[data-clear]').disabled=!connected||!q.length;
  this.root.querySelector('[data-count]').textContent=`(${q.length}/50)`;
  const current=this.root.querySelector('[data-current]');
  let status=!connected?'Reconnecting…':c.training>=0?`Building ${units[c.training].name} · ${c.left>0?`${c.left}s remaining`:'waiting for deployment space'}`:q.length?`Waiting: ${orderBlock(world,state,slot,'train',{from:c.tile,value:q[0]})?.reason||'production will begin shortly'}`:'Choose a unit to begin.';
  if(connected&&c.disabled_until>state.tick)status=`City disabled · ${c.disabled_until-state.tick}s remaining`;
  current.textContent=status;
  const list=this.root.querySelector('[data-queue]'),queueKey=JSON.stringify(q);
  if(list.dataset.queue!==queueKey){list.dataset.queue=queueKey;const groups=[];for(const k of q){if(groups.at(-1)?.kind===k)groups.at(-1).count++;else groups.push({kind:k,count:1});}list.innerHTML=groups.map(g=>`<li>${icon(units[g.kind].icon)}<span>${escape(units[g.kind].name)}</span><strong>×${g.count}</strong></li>`).join('');}
 }
}
