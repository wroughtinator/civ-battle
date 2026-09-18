// Stateless, deterministic effects: no particle objects, textures or extra draw calls.
import {attackStyles} from './combat-visuals.js';
const TAU=Math.PI*2;
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(p,s)=>p.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=p=>mul(p,1/Math.max(1e-8,Math.hypot(...p)));
const clamp=x=>Math.max(0,Math.min(1,x));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const sphere=[];
// Shared low-poly shell. Face lighting keeps smoke volumetric in the unlit effects pass.
for(let y=0;y<4;y++)for(let x=0;x<8;x++){
 const at=(u,v)=>[Math.sin(v*Math.PI/4)*Math.cos(u*TAU/8),Math.cos(v*Math.PI/4),Math.sin(v*Math.PI/4)*Math.sin(u*TAU/8)];
 const a=at(x,y),b=at(x+1,y),c=at(x+1,y+1),d=at(x,y+1);
 if(y>0)sphere.push([a,b,d]);if(y<3)sphere.push([b,c,d]);
}
function frame(p,height,triangle){
 const east=norm(cross(Math.abs(p[1])>.95?[1,0,0]:[0,1,0],p)),north=cross(p,east);
 const point=(x,y,z)=>add(mul(p,height+y),add(mul(east,x),mul(north,z)));
 const puff=(x,y,z,rx,ry,rz,color)=>{
  if(rx<.0001||ry<.0001)return;
  for(const face of sphere){const shade=.28+.72*clamp((face[0][1]+face[1][1]+face[2][1])/3*.7+.4-(face[0][0]+face[1][0]+face[2][0])*.14);triangle(...face.map(v=>point(x+v[0]*rx,y+v[1]*ry,z+v[2]*rz)),mul(color,shade));}
 };
 return {point,puff};
}
export function drawImpact(e,age,{b,height,triangle,ring,ribbon,water=false,detail=1}){
 const type=attackStyles[e.kind]?.type||'bash',heavy=['shell','mortar','bomb','broadside','rocket'].includes(type)||e.kind===21;
 const wet=water||type==='torpedo',life=heavy?1.35:wet?1.05:.65;
 if(age<0||age>=life)return;
 const t=age/life,fade=1-clamp((t-.55)/.45),size=heavy?.065:.033;
 const {point,puff}=frame(b,height,triangle),hot=wet?[.68,.94,1]:[1,.57,.13];
 ring(b,size*(.2+2.3*Math.sqrt(t)),.007*(1-t),wet?[.53,.83,.92]:[.64,.42,.22],height);
 if(age<.19){const r=size*(1-age/.19);puff(0,r*.4,0,r,r*.75,r,[1,.94,.69]);}
 // Ballistic sparks / spray have long bright tips and darker tapering tails.
 const count=Math.round((heavy?12:8)*detail);
 for(let j=0;j<count;j++){
  const a=j*2.39996+e.kind*.71,speed=size*(1.1+(j%3)*.3),r=speed*Math.sqrt(t);
  const y=Math.max(.002,Math.sin(t*Math.PI)*size*(wet?2.4:1.2)*(1+(j%2)*.4));
  ribbon(point(Math.cos(a)*r*.72,y*.85,Math.sin(a)*r*.72),point(Math.cos(a)*r,y,Math.sin(a)*r),.0025*fade,hot);
 }
 if(heavy||wet){
  for(let j=0;j<(detail<1?3:5);j++){
   const a=j*2.39996,r=size*t*.7,s=size*(.32+t*.45)*fade;
   puff(Math.cos(a)*r,size*(.25+t*(wet?1.9:1.1)),Math.sin(a)*r,s,s*(wet?1.7:.85),s,wet?[.62,.80,.85]:mix([1,.19,.008],[.055,.063,.077],clamp(t*2.4)));
  }
 }else if(['slash','stab','charge','bash'].includes(type)){
  for(let j=0;j<2;j++){const a=-.8+j*1.6+t*.5,r=size*fade;ribbon(point(-Math.cos(a)*r,.008,-Math.sin(a)*r),point(Math.cos(a)*r,.01,Math.sin(a)*r),.004*fade,[1,.91,.64]);}
 }
}

export function drawNuclear(age,{b,height,triangle,ring,ribbon,detail=1}){
 if(age<0||age>=6)return;
 const {point,puff}=frame(b,height,triangle),rise=1-Math.exp(-age*1.4),fade=1-clamp((age-4.4)/1.6);
 const heat=clamp(age/3.3),smoke=mix([1,.22,.012],[.055,.065,.083],heat);
 // A brief fireball gives way to a tall, narrow stem and an overhanging cap.
 if(age<.65){const r=(.025+.11*Math.sin(age/.65*Math.PI))*(1-age/.9);puff(0,.035,0,r,r,r,[1,.93,.67]);}
 if(age<2.4){const t=age/2.4;ring(b,.03+.37*Math.sqrt(t),.015*(1-t),mix([1,.82,.45],[.49,.45,.38],t),height+.004);}
 for(let j=0;j<(detail<1?4:6);j++){
  const y=.025+j*.039*rise,r=(.028+.015*Math.sin(j*1.9+age))*fade;
  puff(Math.sin(j*2+age*.3)*.009*rise,y,Math.cos(j*2)*.008,r,r*1.5,r,mix([.9,.19,.012],smoke,j/7));
 }
 const top=.07+.255*rise,cap=(.045+.115*rise)*fade;
 puff(0,top+.027,0,cap*.78,cap*.61,cap*.78,smoke);
 const lobes=detail<1?7:10;
 for(let j=0;j<lobes;j++){
  const a=j*TAU/lobes+age*.10,r=cap*.68,s=cap*(.46+.08*Math.sin(j*3));
  puff(Math.cos(a)*r,top+Math.sin(j*2+age*.6)*.021,Math.sin(a)*r,s,s*.85,s,mix(smoke,[.5,.075,.004],.16*(1-heat)));
 }
 // Detached ground dust, plus embers drawn up into the convection column.
 for(let j=0;j<(detail<1?5:8);j++){
  const a=j*2.39996,r=(.04+.07*rise)*fade,s=.031*fade;
  puff(Math.cos(a)*r,.016,Math.sin(a)*r,s,s*.55,s,[.12,.085,.045]);
  if(age<2.3){const y=.035+((j*.17+age*.7)%1)*top;ribbon(point(Math.cos(a)*.025,y,Math.sin(a)*.025),point(Math.cos(a)*.027,y+.016,Math.sin(a)*.027),.0018,[1,.68,.21]);}
 }
}
