import {icon,colors} from './icons.js';
import {abilities,unitIcons} from './planning.js';

export class EventTimeline {
 constructor(){this.seen=new Set();this.items=[];this.seed=null;}
 accept(state,now=performance.now()){
  if(this.seed!==state.seed){this.seed=state.seed;this.seen.clear();this.items=[];}
  const fresh=[];
  const detonations=(state.events||[]).filter(e=>e.kind===9||e.kind===8).map(e=>({id:`detonation:${e.kind}:${e.tick}:${e.tile}:${e.player}`,tick:e.tick,action:e.kind===9?'nuclear':'impact',from:e.tile,to:e.tile,kind:e.kind===9?11:35}));
  for(const e of [...(state.feedback||[]),...detonations]){
   if(this.seen.has(e.id))continue;this.seen.add(e.id);
   // Reconnecting must not replay a dozen seconds of old attacks.
   if(state.tick-e.tick>3)continue;
   const lead=(e.action==='shot'||e.action==='support')?Math.max(.85,e.duration-(state.tick-e.tick)):0;
   const item={...e,start:now,end:now+(e.action==='nuclear'?6:e.action==='pickup'?4:e.action==='shot'?lead+1:2.5)*1000,flight:lead*1000};
   this.items.push(item);fresh.push(item);
  }
  this.items=this.items.filter(e=>e.end>now).slice(-120);
  if(this.seen.size>1200){const keys=[...this.seen];this.seen=new Set(keys.slice(-600));}
  return fresh;
 }
}

export const pickupSymbols=()=>['coin'];
export const actionSymbol=e=>e.action==='shot'?(e.value?abilities(e.kind)[0]?.icon:'swords'):e.action==='ability'?(abilities(e.kind).find(a=>a.value===e.value)?.icon||'bolt'):({support:'heart',face:'face',disembark:'disembark',move:'route',stop:'hand',refit:'refit',disband:'disband',explore:'telescope',heal:'heart'})[e.action]||unitIcons[e.kind];

export class FeedbackLayer {
 constructor(audio){this.audio=audio;this.timeline=new EventTimeline();this.nodes=[];this.root=document.createElement('div');this.root.id='action-feedback';this.root.setAttribute('aria-hidden','true');document.body.append(this.root);}
 accept(state){
  for(const e of this.timeline.accept(state)){
   // Keep numeric combat feedback without putting icons back over the map.
   if(e.action==='hit'||e.action==='heal'){
    const el=document.createElement('div');el.className=`feedback-float ${e.action==='hit'?'damage-number':'heal-number'}`;
    el.style.setProperty('--player-outline',`${colors[e.owner]||'#b6bdc7'}66`);
    el.textContent=`${e.action==='hit'?'−':'+'}${Math.ceil(e.amount)}`;this.root.append(el);this.nodes.push({el,e});
   }
   if(e.action==='pickup'){
    const el=document.createElement('div');el.className='feedback-float pickup-reward';
    el.innerHTML=icon('coin');const amount=document.createElement('span');amount.textContent=`+${Math.round(e.amount)}`;el.append(amount);
    this.root.append(el);this.nodes.push({el,e});this.audio.pickup();continue;
   }
   if(e.action==='impact')continue;
   if(e.action==='nuclear'){this.audio.play('nuclear',.6,0,1);continue;}
   this.audio.play(e.action==='hit'?'impact':e.action==='shot'?'launch':e.action==='move'?'order':e.action==='ability'?'launch':'confirm',e.action==='hit'?.3:.18,0,e.kind===2?1.6:e.kind===4?.7:1);
  }
 }
 update(now,globe){
  this.nodes=this.nodes.filter(({el,e})=>{const age=(now-e.start)/1000;const lifetime=e.action==='pickup'?4:2.5;if(age>lifetime){el.remove();return false;}const tile=e.action==='move'?e.to:e.action==='shot'?e.from:e.to,pos=globe.world[tile]?.p;if(!pos)return false;const p=globe.project(pos);el.style.display=p.visible?'flex':'none';el.style.left=`${p.x}px`;el.style.top=`${p.y-45-age*24}px`;el.style.opacity=Math.min(1,(lifetime-age)*1.5);return true;});
 }
}
