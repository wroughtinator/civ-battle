// Presentation seconds only. These do not alter windup, damage, or recovery rules.
import {units} from './roster.js';
const baseStyles=[
 {type:'slash',seconds:.32,color:[1,.88,.58],kick:.006},
 {type:'charge',seconds:.42,color:[1,.72,.32],kick:.020},
 {type:'arrow',seconds:.45,color:[1,.88,.48],kick:.002},
 {type:'shell',seconds:.30,color:[1,.68,.25],kick:-.008},
 {type:'mortar',seconds:.60,color:[1,.48,.15],kick:-.010},
 {type:'burst',seconds:.28,color:[1,.91,.64],kick:-.003},
 {type:'bomb',seconds:.48,color:[1,.60,.23],kick:.007},
 {type:'broadside',seconds:.40,color:[1,.77,.39],kick:-.005},
 {type:'torpedo',seconds:.60,color:[.40,.90,1],kick:-.003},
 {type:'sortie',seconds:.65,color:[.82,.92,1],kick:0},
 {type:'pulse',seconds:.38,color:[.38,.95,1],kick:0},
 {type:'rocket',seconds:.55,color:[1,.40,.12],kick:-.004},
 {type:'stab',seconds:.26,color:[.91,1,.78],kick:.010},
 {type:'bash',seconds:.32,color:[1,.78,.39],kick:.004},
];
export const attackStyles=units.map(u=>baseStyles[u.style]);
export const unitScales=[.105,.095,.103,.120,.112,.091,.108,.165,.155,.170,.110,.115,.100,.112];
export function attackTiming(event,now){
 const style=attackStyles[event.kind]||attackStyles[0],end=event.start+event.flight;
 const start=Math.max(event.start,end-style.seconds*1000),duration=Math.max(1,end-start);
 return {style,start,end,progress:(now-start)/duration,active:now>=start&&now<=end};
}

export function drawAttack(event,now,ctx){
 const {style,progress:f}=attackTiming(event,now),{a,b,base,ring,ribbon,triangle,norm,add,mul,mix,cross,model}=ctx;
 const color=style.color,origin=mul(a,base(event.from)),target=mul(b,base(event.to));
 const delta=add(b,mul(a,-1)),forward=Math.hypot(...delta)>.00001?norm(delta):norm(cross(a,Math.abs(a[1])>.98?[1,0,0]:[0,1,0])),side=norm(cross(a,forward));
 if(f<0){ring(b,.033,.0025,color.map(x=>x*.6),base(event.to));return;}
 if(f>1)return; // Authoritative hit events supply the impact; never invent early damage.
 const flash=1-Math.min(1,f*5),tip=add(origin,mul(forward,.055));
 if(flash>0&&!['torpedo','slash','stab','charge','bash','sortie','pulse'].includes(style.type)){
  const r=.024*flash;triangle(add(tip,mul(forward,r*2)),add(tip,mul(side,r)),add(tip,mul(side,-r)),[1,.64,.18]);
  ribbon(tip,add(tip,mul(forward,r*2.3)),r*.22,[1,.98,.81]);
  ring(a,.012+f*.065,.005*flash,[1,.66,.22],base(event.from)+.006);
 }
 if(['slash','stab','charge','bash'].includes(style.type)){
  if(style.type==='slash'){
   const up=norm(b),east=norm(cross(Math.abs(up[1])>.98?[1,0,0]:[0,1,0],up)),north=cross(up,east);
   const at=(angle,r)=>add(target,add(mul(east,Math.cos(angle)*r),mul(north,Math.sin(angle)*r)));
   for(let j=0;j<10;j++){const angle=-1.9+f*3.8-j*.12,outer=.067-j*.001;triangle(at(angle,outer),at(angle+.17,outer),at(angle+.17,outer-.021*(1-j/11)),color.map(v=>v*(1-j*.055)));}
   const edge=-1.9+f*3.8;ribbon(at(edge,.043),at(edge,.071),.003,[1,1,.9]);
  }else if(style.type==='charge'){
   for(const lane of [-1,0,1]){const offset=mul(side,lane*.015),p=add(mul(norm(mix(a,b,f)),base(event.to)),offset);ribbon(add(p,mul(forward,-.07)),p,.004,color);ribbon(add(p,mul(forward,-.028)),p,.0015,[1,.98,.83]);}
  }else if(style.type==='stab'){
   const p=mix(origin,target,Math.sin(f*Math.PI));ribbon(add(p,mul(forward,-.045)),p,.004,color);triangle(add(p,mul(forward,.015)),add(p,mul(side,.009)),add(p,mul(side,-.009)),[1,1,.9]);
  }else ring(b,.016+Math.sin(f*Math.PI)*.035,.010,color,base(event.to));
  return;
 }
 if(style.type==='pulse'){ribbon(origin,target,.004*(1-f),color);ring(b,.015+f*.05,.006,color,base(event.to));return;}
 const count=style.type==='burst'||style.type==='broadside'?3:style.type==='sortie'?2:event.value&&style.type==='arrow'?5:1;
 for(let j=0;j<count;j++){
  const t=Math.max(0,Math.min(1,(f-j*.10)/(1-j*.10))),up=norm(mix(a,b,t));
  const arc=style.type==='mortar'?.16:style.type==='arrow'?.07:style.type==='rocket'?.11:style.type==='sortie'?.07:0;
  let height=base(event.from)*(1-t)+base(event.to)*t+Math.sin(t*Math.PI)*arc;
  if(style.type==='bomb')height+=(1-t)*.085;
  const p=add(mul(up,height),mul(side,(j-(count-1)/2)*.008)),tail=add(p,mul(forward,style.type==='burst'?-.075:-.032));
  const projectile=({arrow:'arrow',shell:'shell',mortar:'mortar',burst:'bullet',bomb:'bomb',broadside:'shell',torpedo:'torpedo',rocket:'rocket',sortie:'aircraft'})[style.type];
  if(model&&projectile){const tangent=add(forward,mul(up,Math.cos(t*Math.PI)*arc*3));model(projectile,p,tangent,style.type==='sortie'?.043:style.type==='torpedo'?.037:style.type==='arrow'?.030:style.type==='burst'?.015:.026);}
  ribbon(tail,p,style.type==='torpedo'?.004:style.type==='mortar'?.005:.0035,color);
  if(style.type!=='arrow'&&style.type!=='torpedo')ribbon(mix(tail,p,.25),p,.0012,[1,.98,.83]);
  if(style.type==='arrow'&&!model){
   triangle(add(p,mul(forward,.013)),add(p,mul(side,.008)),add(p,mul(side,-.008)),[1,.94,.70]);
   const feather=add(tail,mul(forward,.012));triangle(add(tail,mul(side,.007)),feather,add(tail,mul(side,-.007)),[.94,.96,.91]);
  }else if(style.type==='sortie'&&!model){
   triangle(add(p,mul(forward,.027)),add(p,mul(side,.023)),add(p,mul(side,-.023)),color);
  }else if(style.type==='torpedo'){
   for(const sign of [-1,1])ribbon(tail,add(add(tail,mul(forward,-.045)),mul(side,sign*.013)),.002,[.7,.94,1]);
  }else if(style.type==='rocket'){
   triangle(tail,add(tail,mul(side,.009)),add(tail,mul(forward,-.035)),[1,.47,.12]);
  }else if(style.type==='bomb'&&!model){
   ring(up,.009,.006,[.18,.20,.23],height);
  }
  if(['arrow','shell','mortar','broadside','rocket','sortie'].includes(style.type))for(let k=0;k<7;k++){
   const at=q=>add(mul(norm(mix(a,b,q)),base(event.from)*(1-q)+base(event.to)*q+Math.sin(q*Math.PI)*arc),mul(side,(j-(count-1)/2)*.008));
   const q=Math.max(0,t-k*.035),prev=Math.max(0,t-(k+1)*.035),smoke=style.type==='rocket'||style.type==='mortar';
   ribbon(at(prev),at(q),(smoke?.0038:.0018)*(1-k/8),smoke?[.54-k*.025,.49-k*.025,.40-k*.02]:color.map(v=>v*(.8-k*.065)));
  }
 }
}

// Full 3D flight tangent: missiles climb and descend along the visible ballistic arc.
export function ballisticPose(a,b,f){
 const norm=p=>{const l=Math.hypot(...p);return p.map(v=>v/l);};
 const point=t=>norm(a.map((v,i)=>v+(b[i]-v)*t)).map(v=>v*(1.045+Math.sin(t*Math.PI)*.27));
 const p=point(f),before=point(Math.max(0,f-.001)),after=point(Math.min(1,f+.001));
 let forward=after.map((v,i)=>v-before[i]);if(Math.hypot(...forward)<1e-9)forward=[1,0,0];
 return {p,up:norm(p),radius:Math.hypot(...p),forward:norm(forward)};
}
