import {icon} from './icons.js';
import {abilities,unitIcons} from './planning.js';

export class EventTimeline {
 constructor(){this.seen=new Set();this.items=[];this.seed=null;}
 accept(state,now=performance.now()){
  if(this.seed!==state.seed){this.seed=state.seed;this.seen.clear();this.items=[];}
  const fresh=[];
  for(const e of state.feedback||[]){
   if(this.seen.has(e.id))continue;this.seen.add(e.id);
   // Reconnecting must not replay a dozen seconds of old attacks.
   if(state.tick-e.tick>3)continue;
   const lead=e.action==='shot'?Math.max(.85,e.duration-(state.tick-e.tick)):0;
   const item={...e,start:now,end:now+(e.action==='pickup'?4:e.action==='shot'?lead+1:2.5)*1000,flight:lead*1000};
   this.items.push(item);fresh.push(item);
  }
  this.items=this.items.filter(e=>e.end>now).slice(-120);
  if(this.seen.size>1200){const keys=[...this.seen];this.seen=new Set(keys.slice(-600));}
  return fresh;
 }
}

// Symbols describe the actual payout, including coin fallbacks, never the unopened chest.
export const pickupSymbols=e=>({0:['coin','coin','coin'],1:['coin','coin','coin'],2:['scout'],3:['shield'],4:['coin','coin','coin'],5:['telescope'],6:['heart','heart'],7:e.amount>0?['heart','bolt']:['bolt'],8:['cloud','shield'],9:['horse']})[e.value]||['coin'];
export const actionSymbol=e=>e.action==='shot'?(e.value?abilities(e.kind)[0]?.icon:'swords'):e.action==='ability'?(abilities(e.kind).find(a=>a.value===e.value)?.icon||'bolt'):({disembark:'disembark',move:'route',stop:'hand',refit:'refit',disband:'disband',explore:'telescope',heal:'heart'})[e.action]||unitIcons[e.kind];

export class FeedbackLayer {
 constructor(audio){this.audio=audio;this.timeline=new EventTimeline();this.nodes=[];this.root=document.createElement('div');this.root.id='action-feedback';this.root.setAttribute('aria-hidden','true');document.body.append(this.root);}
 accept(state){
  for(const e of this.timeline.accept(state)){
   const el=document.createElement('div');el.className=`feedback-float ${e.action==='pickup'?'pickup-reward':e.action==='hit'?'damage-number':e.action==='heal'?'heal-number':'action-number'}`;
   el.innerHTML=e.action==='pickup'?icon('plus')+pickupSymbols(e).map(icon).join(''):e.action==='hit'?`−${Math.ceil(e.amount)}`:e.action==='heal'?`+${Math.ceil(e.amount)}`:icon(actionSymbol(e));
   this.root.append(el);this.nodes.push({el,e});
   if(e.action==='pickup'){this.audio.pickup();continue;}
   this.audio.play(e.action==='hit'?'impact':e.action==='shot'?'launch':e.action==='move'?'order':e.action==='ability'?'launch':'confirm',e.action==='hit'?.3:.18,0,e.kind===2?1.6:e.kind===4?.7:1);
  }
 }
 update(now,globe){
  this.nodes=this.nodes.filter(({el,e})=>{const age=(now-e.start)/1000;const lifetime=e.action==='pickup'?4:2.5;if(age>lifetime){el.remove();return false;}const tile=e.action==='move'?e.to:e.action==='shot'?e.from:e.to,pos=globe.world[tile]?.p;if(!pos)return false;const p=globe.project(pos);el.style.display=p.visible?'flex':'none';el.style.left=`${p.x}px`;el.style.top=`${p.y-45-age*24}px`;el.style.opacity=Math.min(1,(lifetime-age)*1.5);return true;});
 }
}
