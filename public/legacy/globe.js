import { colors } from './icons.js';
const norm=p=>{const l=Math.hypot(...p);return p.map(x=>x/l);};
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,s)=>a.map((x,i)=>x*(1-s)+b[i]*s);
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const palette=colors.map(rgb);
// Original deterministic terrain functions; no third-party shader code.
const terrain=[[.035,.12,.20],[.40,.51,.28],[.20,.37,.21],[.72,.61,.40],[.46,.47,.42],[.86,.88,.84]];
const rnd=(x,y=0,z=0)=>{const n=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return n-Math.floor(n);};
const noise3=p=>{const q=p.map(Math.floor),f=p.map((v,i)=>{const x=v-q[i];return x*x*(3-2*x);});let v=0;for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)v+=rnd(q[0]+x,q[1]+y,q[2]+z)*(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);return v;};
const ridge=p=>Math.pow(1-Math.abs(noise3([p[0]*31+p[2]*11,p[1]*47,p[2]*23-p[0]*9])*2-1),2)*.85+noise3(mul(p,95))*.15;
const ground=(p,mountain=0)=>1.008+noise3(mul(p,49))*.005+mountain*(.014+ridge(p)*.057);
const vertex=`#version 300 es
precision highp float;
in vec3 position;in vec3 normal;in vec3 color;in vec3 material;
uniform vec4 camera;uniform vec2 viewport;uniform float offset;uniform float mode;uniform float time;
uniform mat3 modelBasis;uniform vec3 modelOrigin;uniform float modelScale;uniform vec3 modelTint;
out vec3 vColor;out vec3 vNormal;out vec3 vPos;out vec3 vWorld;out vec3 vMaterial;
vec3 rotate(vec3 p){float c=cos(camera.x),s=sin(camera.x);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);c=cos(camera.y);s=sin(camera.y);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
void main(){vec3 world=modelScale>0.?modelOrigin+modelBasis*position*modelScale:position;vec3 n=modelScale>0.?modelBasis*normal:normal;if(mode>2.5){vec3 q=normalize(world);float billow=sin(q.x*31.+sin(q.y*27.))*sin(q.z*28.+sin(q.x*19.));world=q*(1.078+billow*.009);}vec3 p=rotate(world);float z=camera.z-p.z;float scale=2.75;gl_Position=vec4(p.x*scale/viewport.x+offset*z,p.y*scale,z*1.001-0.02001,z);gl_PointSize=2.;vColor=modelScale>0.?mix(color,modelTint,.12):color;vNormal=rotate(material.y>.5&&material.y<1.5?normalize(world):n);vPos=p;vWorld=world;vMaterial=material;}`;
const fragment=`#version 300 es
precision highp float;
in vec3 vColor;in vec3 vNormal;in vec3 vPos;in vec3 vWorld;in vec3 vMaterial;
uniform float mode;uniform float time;uniform vec4 camera;uniform sampler2D oceanNormal;uniform sampler2D oceanRough;uniform sampler2D fogTexture;uniform float preview;uniform vec4 weather[3];
out vec4 outColor;
float hash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.43));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.07);}
vec3 tone(vec3 x){return pow(clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.),vec3(1./2.2));}
vec3 rotate(vec3 p){float c=cos(camera.x),s=sin(camera.x);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);c=cos(camera.y);s=sin(camera.y);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
void main(){vec3 wn=normalize(vWorld),n=normalize(vNormal),eye=normalize(vec3(0,0,camera.z)-vPos),sun=normalize(vec3(-.6,.85,1.));
if(mode>2.5){
 float facing=dot(n,eye);if(facing<.025||camera.z<1.26)discard;
 float storm=0.;for(int i=0;i<3;i++)storm=max(storm,smoothstep(weather[i].w-.035,weather[i].w+.075,dot(wn,weather[i].xyz)));
 vec3 drift=vec3(time*.009,0,time*.004),q=wn+drift*.006;
 // Weather systems occupy distinct regions, with clear air between them.
 // Low-frequency coverage gates the small billows instead of sprinkling noise everywhere.
 vec3 warp=vec3(noise(q*5.1),noise(q*5.1+7.),noise(q*5.1+19.))*.8;
 float broad=fbm(q*3.2+warp),coverage=smoothstep(.43,.65,broad+storm*.17);
 float shape=fbm(q*16.+warp),erosion=noise(q*91.+drift*.03);
 float field=shape-erosion*.065;
 float mass=coverage*smoothstep(.38,.66,field);
 float wisps=smoothstep(.62,.84,fbm(q*vec3(11.,43.,19.)+warp))*.10;
 float density=mass*mix(.9,1.6,storm)+wisps*coverage;
 if(density<.025)discard;
 vec3 sunWorld=sun;float ca=cos(camera.y),sa=-sin(camera.y);sunWorld=vec3(sunWorld.x,ca*sunWorld.y-sa*sunWorld.z,sa*sunWorld.y+ca*sunWorld.z);ca=cos(camera.x);sa=-sin(camera.x);sunWorld=vec3(ca*sunWorld.x+sa*sunWorld.z,sunWorld.y,-sa*sunWorld.x+ca*sunWorld.z);
 float shadow=fbm((q+sunWorld*.03)*16.+warp)-shape;
 float light=clamp(.67-shadow*2.5+field*.18,.25,1.1);
 vec3 cloud=mix(vec3(.17,.24,.30),vec3(.89,.93,.95),light)*(.7+.3*max(dot(n,sun),0.));
 cloud+=vec3(.18,.15,.10)*pow(1.-mass,3.)*max(dot(n,sun),0.);
 float cloudFog=preview>.5?1.:texture(fogTexture,vec2(atan(wn.z,wn.x)/6.2831853+.5,asin(clamp(wn.y,-1.,1.))/3.14159265+.5)).r;cloud=mix(vec3(.025,.045,.065),cloud,.3+.7*cloudFog);
 float alpha=(1.-exp(-density*2.6))*smoothstep(1.26,2.55,camera.z)*smoothstep(.025,.30,facing);
 outColor=vec4(tone(cloud),alpha);return;
}
if(mode>1.5){float edge=pow(1.-abs(dot(n,eye)),3.);outColor=vec4(.22,.61,.77,edge*.26);return;}
float fog=preview>.5?1.:texture(fogTexture,vec2(atan(wn.z,wn.x)/6.2831853+.5,asin(clamp(wn.y,-1.,1.))/3.14159265+.5)).r;float f=fbm(wn*11.+vec3(time*.016,0,-time*.008));float visibility=smoothstep(.13,.87,fog+(f-.5)*.23);
vec3 c=pow(max(vColor,vec3(0.)),vec3(1.65))*(.29+max(dot(n,sun),0.)*.91);
if(vMaterial.y<.5&&mode<.5){
 float patches=fbm(vWorld*95.),detail=fbm(vWorld*460.);float rock=smoothstep(.018,.052,length(vWorld)-1.);
 vec3 grass=mix(vec3(.105,.16,.043),vec3(.22,.25,.09),patches);
 vec3 base=pow(vColor,vec3(2.2));base=mix(base,grass,.2*(1.-rock)*step(vMaterial.z,2.5));
 base=mix(base,vec3(.18,.175,.15)*( .62+detail*.9),rock*.7);
 float snow=smoothstep(1.054,1.075,length(vWorld)+patches*.008)*smoothstep(.45,.9,dot(normalize(vNormal),normalize(vPos)));
 base=mix(base,vec3(.80,.84,.82),snow);
 float striation=.9+.1*sin(vWorld.y*650.+patches*8.);base*=mix(.65+detail*.6,striation,rock);
 c=base*(.27+max(dot(n,sun),0.)*.95);
}
if(vMaterial.y>1.5&&vMaterial.y<2.5){float spec=pow(max(dot(reflect(-sun,n),eye),0.),45.);c+=vec3(.8,.85,.8)*spec*.23;}
if(vMaterial.y>.5&&vMaterial.y<1.5&&mode<.5){
 vec3 weights=pow(abs(wn),vec3(4.));weights/=dot(weights,vec3(1));vec2 drift=vec2(time*.008,-time*.006);
 vec2 rx=texture(oceanNormal,vWorld.yz*43.+drift).xy*2.-1.;rx+=.5*(texture(oceanNormal,vWorld.yz*97.-drift*1.4).xy*2.-1.);
 vec2 ry=texture(oceanNormal,vWorld.zx*43.+drift).xy*2.-1.;ry+=.5*(texture(oceanNormal,vWorld.zx*97.-drift*1.4).xy*2.-1.);
 vec2 rz=texture(oceanNormal,vWorld.xy*43.+drift).xy*2.-1.;rz+=.5*(texture(oceanNormal,vWorld.xy*97.-drift*1.4).xy*2.-1.);
 vec3 ripple=vec3(0.,rx.x,rx.y)*weights.x+vec3(ry.y,0.,ry.x)*weights.y+vec3(rz.x,rz.y,0.)*weights.z;
 vec3 swell=vec3(cos(vWorld.z*160.+time*.8),sin(vWorld.x*147.+time*.6),cos(vWorld.y*173.-time*.7))*.055;ripple+=swell;
 ripple-=wn*dot(wn,ripple);n=normalize(rotate(wn+ripple*.28));
 float storm=0.;for(int i=0;i<3;i++)storm=max(storm,smoothstep(weather[i].w-.025,weather[i].w+.065,dot(wn,weather[i].xyz)));
 float rough=texture(oceanRough,vWorld.zx*45.+drift).r;
 float fresnel=.02+.98*pow(1.-max(dot(n,eye),0.),5.);
 vec3 reflected=reflect(-eye,n);vec3 sky=mix(vec3(.025,.07,.12),vec3(.24,.38,.52),smoothstep(-.3,1.,reflected.y));
 float cloud=fbm(reflected*7.+vec3(time*.008,0,0));sky=mix(sky,vec3(.47,.54,.58),smoothstep(.53,.8,cloud)*.42);
 float depth=smoothstep(.24,.97,vMaterial.z);vec3 water=mix(vec3(.012,.19,.18),vec3(.003,.024,.059),depth);
 water*=.85+.15*fbm(vWorld*80.);float diffuse=.52+.48*max(dot(normalize(rotate(wn)),sun),0.);
 c=mix(water*diffuse,sky,fresnel);c+=vec3(.009,.021,.03)*max(0.,dot(ripple,vec3(.6,.4,.3))+.1);
 float highlight=pow(max(dot(n,normalize(sun+eye)),0.),mix(420.,150.,rough));c+=vec3(1.,.9,.69)*highlight*1.35;
 float coast=1.-smoothstep(.24,.46,vMaterial.z);float surf=pow(.5+.5*sin(vMaterial.z*170.-time*1.7+fbm(vWorld*150.)*7.),7.);
 c=mix(c,vec3(.56,.72,.69),coast*(.2+surf*.6));c*=1.-storm*.18;
}
if(mode>.5)c=vColor;
vec3 mist=mix(vec3(.01,.021,.032),vec3(.035,.065,.09),f);vec3 remembered=mix(vec3(dot(c,vec3(.21,.72,.07))*.43),c*.42,.35);c=mix(mix(mist,remembered,smoothstep(.05,.45,fog)),c,visibility);
outColor=vec4(tone(c),1.);}`;
class Mesh {
 constructor(gl){this.gl=gl;this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();this.count=0;}
 update(data){const g=this.gl,packed=new Float32Array(data.length/9*12);for(let i=0,j=0;i<data.length;i+=9,j+=12){packed.set(data.slice(i,i+9),j);packed.set(data.materials?.slice(i/3,i/3+3)||[1,0,0],j+9);}g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.bufferData(g.ARRAY_BUFFER,packed,g.STATIC_DRAW);[0,1,2,3].forEach((i)=>{g.enableVertexAttribArray(i);g.vertexAttribPointer(i,3,g.FLOAT,false,48,i*12);});this.count=data.length/9;}
 draw(mode){this.gl.bindVertexArray(this.vao);this.gl.drawArrays(mode,0,this.count);}
}
export class Globe {
 constructor(canvas,onSelect){
  this.canvas=canvas;this.onSelect=onSelect;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:true,powerPreference:'high-performance'});
  if(!this.gl)throw new Error('WebGL2 unavailable');
  const g=this.gl;const shader=(type,source)=>{const s=g.createShader(type);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(s));return s;};
  this.program=g.createProgram();g.attachShader(this.program,shader(g.VERTEX_SHADER,vertex));g.attachShader(this.program,shader(g.FRAGMENT_SHADER,fragment));['position','normal','color','material'].forEach((n,i)=>g.bindAttribLocation(this.program,i,n));g.linkProgram(this.program);if(!g.getProgramParameter(this.program,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(this.program));
  this.u=Object.fromEntries(['camera','viewport','offset','mode','time','oceanNormal','oceanRough','fogTexture','preview','weather[0]','modelBasis','modelOrigin','modelScale','modelTint'].map(n=>[n,g.getUniformLocation(this.program,n)]));
  this.textures=['ocean-normal.png','ocean-roughness.png'].map((file,unit)=>{const texture=g.createTexture();g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1,1,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array(unit?[160,160,160,255]:[128,128,255,255]));const img=new Image();img.onload=()=>{g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,img);g.generateMipmap(g.TEXTURE_2D);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.REPEAT);};img.src='/assets/'+file;return texture;});
  this.fogTexture=g.createTexture();g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,this.fogTexture);g.texImage2D(g.TEXTURE_2D,0,g.R8,128,64,0,g.RED,g.UNSIGNED_BYTE,new Uint8Array(8192).fill(255));g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
  this.vegetation=new Mesh(g);this.land=new Mesh(g);this.lines=new Mesh(g);this.props=new Mesh(g);this.air=new Mesh(g);this.selection=new Mesh(g);this.routes=new Mesh(g);this.clouds=new Mesh(g);this.units=new Mesh(g);
  this.models={};for(const [kind,name] of ['tank','fleet','submarine','recon','drone','missile','nuke','satellite'].entries())fetch(`/assets/${name}.mesh`).then(r=>{if(!r.ok)throw Error('Model unavailable');return r.arrayBuffer();}).then(buffer=>{const view=new DataView(buffer),data=[];data.materials=[];for(let i=0;i<buffer.byteLength;i+=16){for(let j=0;j<6;j++)data.push(view.getInt16(i+j*2,true)/32767);for(let j=12;j<15;j++)data.push(view.getUint8(i+j)/255);data.materials.push(1,2,0);}const mesh=new Mesh(g);mesh.update(data);this.models[kind]=mesh;}).catch(e=>console.warn(e));
  this.yaw=.15;this.pitch=.18;this.distance=3.15;this.targetDistance=3.15;this.offset=.24;this.targetOffset=.24;this.selected=-1;this.hovered=-1;this.preview=true;this.world=[];this.state=null;this.slot=0;this.clock=0;this.pointer=null;this.lastTouch=0;
  this.bind();this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
 }
 bind(){
  const c=this.canvas,surfaces=[c,document.getElementById('markers')].filter(Boolean),pointers=new Map();let suppressClick=false;
  const down=e=>{const point={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false,target:e.target};pointers.set(e.pointerId,point);this.pointer=point;this.targetFocus=null;e.target.setPointerCapture(e.pointerId);if(pointers.size>1)for(const p of pointers.values())p.moved=true;};
  const move=e=>{const p=pointers.get(e.pointerId);if(!p){if(e.pointerType!=='touch')this.hovered=this.pick(e.clientX,e.clientY);return;}
   const values=[...pointers.values()],before=values.length===2?Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y):0,dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
   if(Math.hypot(p.x-p.sx,p.y-p.sy)>8)p.moved=true;
   if(values.length===2){const after=Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);if(after>10&&before>10)this.targetDistance=Math.max(1.12,Math.min(4.8,1+(this.targetDistance-1)*before/after));}
   else if(p.moved){const sensitivity=Math.min(.006,Math.max(.0006,(this.distance-1)*.003));this.yaw+=dx*sensitivity;this.pitch=Math.max(-1.48,Math.min(1.48,this.pitch+dy*sensitivity));}
  };
  const up=e=>{const p=pointers.get(e.pointerId);if(!p)return;suppressClick=p.moved;if(!p.moved&&p.target===c){const i=this.pick(e.clientX,e.clientY);if(i>=0)this.onSelect(i);}pointers.delete(e.pointerId);this.pointer=pointers.size?[...pointers.values()][0]:null;};
  for(const surface of surfaces){surface.addEventListener('pointerdown',down);surface.addEventListener('pointermove',move);surface.addEventListener('pointerup',up);surface.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);this.pointer=null;suppressClick=true;});surface.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}},true);}
  c.addEventListener('wheel',e=>{e.preventDefault();this.targetDistance=Math.max(1.12,Math.min(4.8,this.targetDistance+e.deltaY*.0015));},{passive:false});
 }
 setWorld(world){this.world=world;this.staticReady=false;this.borderCache=[];this.fogLookup=new Uint16Array(8192);for(let y=0;y<64;y++)for(let x=0;x<128;x++){const lat=((y+.5)/64-.5)*Math.PI,lon=((x+.5)/128-.5)*Math.PI*2,p=[Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon)];let best=-2,idx=0;for(let i=0;i<world.length;i++){const v=world[i].p,d=p[0]*v[0]+p[1]*v[1]+p[2]*v[2];if(d>best){best=d;idx=i;}}this.fogLookup[y*128+x]=idx;}this.rebuild();}
 updateFog(){const g=this.gl,data=new Uint8Array(8192);for(let i=0;i<data.length;i++){const t=this.state?.tiles[this.fogLookup[i]];data[i]=this.preview||t?.visible?255:t?.explored?117:0;}g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,this.fogTexture);g.texSubImage2D(g.TEXTURE_2D,0,0,0,128,64,g.RED,g.UNSIGNED_BYTE,data);}
 setState(state,slot){this.state=state;this.slot=slot;this.receivedAt=performance.now();this.preview=state.phase!=='running'&&state.phase!=='ended';this.targetOffset=this.preview&&innerWidth>760?.24:0;this.updateFog();this.rebuild();}
 focus(i){if(!this.world[i])return;const p=this.world[i].p;let yaw=-Math.atan2(p[0],p[2]);while(yaw-this.yaw>Math.PI)yaw-=Math.PI*2;while(yaw-this.yaw<-Math.PI)yaw+=Math.PI*2;this.targetFocus=[yaw,Math.atan2(p[1],Math.hypot(p[0],p[2]))];}
 choose(i){this.selected=i;this.rebuildSelection();}
 setTargets(targets){this.targets=targets;this.rebuildSelection();}
 rotate(p){const c=Math.cos(this.yaw),s=Math.sin(this.yaw),x=c*p[0]+s*p[2],z=-s*p[0]+c*p[2];return[x,Math.cos(this.pitch)*p[1]-Math.sin(this.pitch)*z,Math.sin(this.pitch)*p[1]+Math.cos(this.pitch)*z];}
 project(p){const v=this.rotate(p),w=this.canvas.clientWidth,h=this.canvas.clientHeight,z=this.distance-v[2];return{x:w*(.5+this.offset/2)+v[0]*h*1.375/z,y:h/2-v[1]*h*1.375/z,visible:v[2]>1/this.distance,z:v[2]};}
 pick(x,y){const rect=this.canvas.getBoundingClientRect();x-=rect.left;y-=rect.top;let best=-1,dist=Infinity;this.world.forEach((t,i)=>{const p=this.project(t.p);if(!p.visible)return;const d=Math.hypot(x-p.x,y-p.y);const size=this.canvas.clientHeight*.105/(this.distance-p.z);if(d<dist&&d<size){dist=d;best=i;}});return best;}
 rebuild(){if(!this.world.length)return;const land=[],lines=[],props=[],air=[],clouds=[],vegetation=[],staticBuild=!this.staticReady;
  let activeMat=[1,0,0];const cornerFog=new Map(),cornerTerrain=new Map();const key=p=>p.map(v=>v.toFixed(5)).join(',');
  const fogValue=i=>this.preview?1:this.state?.tiles[i]?.visible?1:this.state?.tiles[i]?.explored?.46:0;
  this.world.forEach((t,i)=>t.poly.forEach(p=>{const k=key(p),v=cornerFog.get(k)||[0,0];v[0]+=fogValue(i);v[1]++;cornerFog.set(k,v);const a=cornerTerrain.get(k)||[0,0,0];a[0]+=t.terrain===4?1:0;a[1]+=t.terrain===0?1:0;a[2]++;cornerTerrain.set(k,a);}));
  const push=(list,p,n,c)=>{list.push(...p,...n,...c);list.materials??=[];list.materials.push(...activeMat);};
  const tri=(list,a,b,c,col)=>{const n=norm(cross(add(b,mul(a,-1)),add(c,mul(a,-1))));const outward=n[0]*a[0]+n[1]*a[1]+n[2]*a[2]<0?mul(n,-1):n;[a,b,c].forEach(p=>push(list,p,outward,col));};
  this.world.forEach((t,i)=>{
   const s=this.state?.tiles[i]||{owner:-1};const height=t.terrain===0?1:1.013+(t.terrain===4?.007:0);let col=terrain[t.terrain];activeMat=[fogValue(i),t.terrain===0?1:0,t.terrain];
   if(t.terrain===0)col=t.near.some(j=>this.world[j].terrain>0)?[.025,.22,.245]:[.016,.084,.145];
   const jitter=t.terrain===0?0:((i*137)%19-9)*.001;col=col.map(c=>c+jitter);

   const poly=t.poly.map(p=>mul(p,height));this.borderCache[i]??=[];
   const drawGround=(a,b,c,fa,fb,fc,ma,mb,mc,da,db,dc,level)=>{
    if(level>0){const ab=norm(add(a,b)),bc=norm(add(b,c)),ca=norm(add(c,a));const fab=(fa+fb)/2,fbc=(fb+fc)/2,fca=(fc+fa)/2,mab=(ma+mb)/2,mbc=(mb+mc)/2,mca=(mc+ma)/2,dab=(da+db)/2,dbc=(db+dc)/2,dca=(dc+da)/2;
     drawGround(a,ab,ca,fa,fab,fca,ma,mab,mca,da,dab,dca,level-1);drawGround(ab,b,bc,fab,fb,fbc,mab,mb,mbc,dab,db,dbc,level-1);drawGround(ca,bc,c,fca,fbc,fc,mca,mbc,mc,dca,dbc,dc,level-1);drawGround(ab,bc,ca,fab,fbc,fca,mab,mbc,mca,dab,dbc,dca,level-1);return;
    }
    const ps=[a,b,c].map((p,k)=>mul(p,t.terrain===0?1:ground(p,[ma,mb,mc][k]))),at=land.length/9;
    tri(land,...ps,col);for(let k=0;k<3;k++){if(t.terrain>0){const p=[a,b,c][k],mountain=[ma,mb,mc][k],east=norm(cross(Math.abs(p[1])>.98?[1,0,0]:[0,1,0],p)),north=cross(p,east),ep=norm(add(p,mul(east,.0007))),np=norm(add(p,mul(north,.0007))),base=ground(p,mountain),dx=(ground(ep,mountain)-base)/.0007,dz=(ground(np,mountain)-base)/.0007,normal=norm(add(add(p,mul(east,-dx)),mul(north,-dz)));for(let j=0;j<3;j++)land[(at+k)*9+3+j]=normal[j];}land.materials[(at+k)*3]=[fa,fb,fc][k];land.materials[(at+k)*3+2]=t.terrain===0?[da,db,dc][k]:t.terrain;}
   };
   for(let k=0;k<poly.length;k++){
    const q=t.poly[k],r=t.poly[(k+1)%poly.length],f=cornerFog.get(key(q)),h=cornerFog.get(key(r)),a=cornerTerrain.get(key(q)),b=cornerTerrain.get(key(r));
    if(staticBuild){drawGround(t.p,q,r,fogValue(i),f[0]/f[1],h[0]/h[1],t.terrain===4?1:0,a[0]/a[2],b[0]/b[2],t.terrain===0?1:0,a[1]/a[2],b[1]/b[2],t.terrain===4?3:2);
    tri(air,mul(t.p,1.078),mul(q,1.078),mul(r,1.078),[.2,.5,.6]);tri(clouds,mul(t.p,1.087),mul(q,1.087),mul(r,1.087),[1,1,1]);}
    const linecol=s.owner>=0?mix(palette[s.owner],[.11,.18,.13],.35):mix(col,[.10,.16,.12],.7);
    for(let step=0;step<8;step++){const v=step/8,w=(step+1)/8;let border=this.borderCache[i][k*8+step];if(!border){const pa=norm(mix(q,r,v)),pb=norm(mix(q,r,w));border=[pa,pb,ground(pa,(a[0]/a[2])*(1-v)+(b[0]/b[2])*v),ground(pb,(a[0]/a[2])*(1-w)+(b[0]/b[2])*w)];this.borderCache[i][k*8+step]=border;}const [pa,pb,ha,hb]=border;
     if(t.terrain>0){for(const [p,hp] of [[pa,ha],[pb,hb]])push(lines,mul(p,hp+.0003),p,linecol);
      if(staticBuild&&(a[1]>0||b[1]>0)){const shore=[.47,.42,.29];tri(land,mul(pa,ha),mul(pa,.999),mul(pb,.999),shore);tri(land,mul(pa,ha),mul(pb,.999),mul(pb,hb),shore);}
     }
    }
   }
   activeMat=[fogValue(i),3,0];
   const up=t.p,east=norm(cross(Math.abs(up[1])>.9?[1,0,0]:[0,1,0],up)),north=cross(up,east);
   const point=(x,y,z)=>{const p=norm(add(add(up,mul(east,x)),mul(north,z)));return mul(p,ground(p,t.terrain===4?1:0)+y);};
   const pyramid=(x,z,r,h,col,sides=5)=>{const top=point(x,h,z);for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2,b=(k+1)/sides*Math.PI*2;tri(props,point(x+Math.cos(a)*r,0,z+Math.sin(a)*r),top,point(x+Math.cos(b)*r,0,z+Math.sin(b)*r),col);}};
   const box=(x,z,w,h,d,col)=>{const a=point(x-w/2,0,z-d/2),b=point(x+w/2,0,z-d/2),c=point(x+w/2,0,z+d/2),e=point(x-w/2,0,z+d/2);const lift=p=>add(p,mul(up,h));for(const [q,r] of [[a,b],[b,c],[c,e],[e,a]]){tri(props,q,r,lift(r),col);tri(props,q,lift(r),lift(q),col);}tri(props,lift(a),lift(b),lift(c),col);tri(props,lift(a),lift(c),lift(e),col);};
   const treeStart=props.length;const crown=(x,z,y,r,h,color,seed)=>{const rings=[];for(let layer=0;layer<4;layer++){const radius=r*[.5,1,.8,.13][layer];rings.push(Array.from({length:7},(_,k)=>{const angle=k/7*Math.PI*2+layer*.21;return point(x+Math.cos(angle)*radius*(.8+rnd(seed,k,layer)*.4),y+h*layer/3,z+Math.sin(angle)*radius*(.8+rnd(seed,k,layer)*.4));}));}for(let j=0;j<3;j++)for(let k=0;k<7;k++){const l=(k+1)%7,c=color.map(v=>v*(.8+rnd(seed,k,j)*.3));tri(props,rings[j][k],rings[j][l],rings[j+1][l],c);tri(props,rings[j][k],rings[j+1][l],rings[j+1][k],c);}};
   if(staticBuild&&(t.terrain===2||t.terrain===1)){const trees=t.terrain===2?12:3;for(let j=0;j<trees;j++){const a=rnd(i,j,1)*6.283,r=Math.sqrt(rnd(i,j,2))*.047,x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.hypot(x,z)<.025)continue;const h=.018+rnd(i,j,3)*.017,leaf=[.10+rnd(i,j)*.055,.24+rnd(i,j)*.11,.10+rnd(i,j)*.065];box(x,z,.0018,h*.65,.0018,[.24,.19,.11]);crown(x,z,h*.35,.008+rnd(i,j,4)*.006,h*.8,leaf,i*53+j);}}
   if(staticBuild&&t.terrain===1){for(let j=0;j<13;j++){const x=(rnd(i,j,8)-.5)*.08,z=(rnd(i,j,9)-.5)*.08;tri(props,point(x-.003,0,z),point(x+.001,.004,z),point(x+.003,0,z),[.37,.45,.17]);}}
   if(staticBuild&&props.length>treeStart){vegetation.push(...props.splice(treeStart));vegetation.materials??=[];vegetation.materials.push(...props.materials.splice(treeStart/3));}
   if(t.site){const steel=[.27,.36,.37];box(-.023,.022,.013,.019,.016,steel);box(.022,.022,.012,.026,.013,steel);for(const x of [-.017,0,.017])box(x,-.025,.012,.008,.013,[.46,.44,.34]);}
   if(s.building===7){const steel=[.36,.45,.46],x=t.capital>=0?.045:0;box(x,0,.034,.019,.025,steel);box(x-.012,-.01,.005,.048,.005,[.48,.40,.30]);box(x+.008,-.01,.006,.035,.006,[.56,.50,.37]);}
   if(s.owner>=0){const faction=palette[s.owner],stone=[.79,.74,.59];
    if(t.capital>=0){const civ=this.state?.players[s.owner]?.civ||0;
     if(civ===1||civ===5){pyramid(0,0,.037,.046,stone,4);if(civ===5)box(0,0,.022,.046,.022,stone);}
     else if(civ===4||civ===6){box(0,0,.03,.035,.03,stone);pyramid(0,0,.033,.043,faction,4);box(0,0,.019,.055,.019,stone);pyramid(0,0,.025,.065,faction,4);}
     else {box(0,0,.047,.008,.036,stone);for(const x of [-.017,0,.017])box(x,-.01,.006,.035,.006,stone);box(0,0,.043,.038,.028,stone);pyramid(0,0,.036,.055,faction,4);}
     box(-.035,.016,.017,.016,.02,mix(stone,faction,.2));box(.028,.026,.019,.022,.016,stone);
    }else if(s.building===7){}else if(s.building){const b=s.building;
     if(b===1){for(let j=0;j<5;j++)box((j-2)*.009,0,.005,.007,.048,[.76,.61,.3]);}
     else if(b===3){box(0,0,.04,.023,.03,stone);pyramid(0,0,.034,.041,[.38,.57,.57],6);}
     else if(b===4){box(0,0,.04,.025,.04,stone);for(const x of [-.023,.023])for(const z of [-.023,.023])box(x,z,.015,.044,.015,stone);}
     else if(b===6){box(0,0,.045,.006,.045,[.4,.45,.46]);box(0,0,.013,.065,.013,[.89,.89,.82]);pyramid(0,0,.012,.081,[.88,.59,.33],6);box(.022,0,.007,.06,.007,[.49,.55,.54]);}
     else if(b===5){box(0,0,.044,.009,.04,stone);box(0,0,.003,.05,.003,[.8,.77,.66]);tri(props,point(0,.016,0),point(0,.051,0),point(.029,.016,0),[.9,.86,.74]);}
     else {box(0,0,.03,.019,.027,stone);pyramid(0,0,.027,.033,faction,4);}
    }else {box(-.012,0,.017,.012,.018,stone);pyramid(-.012,0,.015,.022,mix(faction,stone,.35),4);box(.012,.012,.019,.017,.02,stone);}
   }
  });if(staticBuild){this.land.update(land);this.vegetation.update(vegetation);this.air.update(air);this.clouds.update(clouds);this.staticReady=true;}this.lines.update(lines);this.props.update(props);this.rebuildSelection();
 }
 rebuildSelection(){const data=[];const rings=[...[...(this.targets||[])].map(i=>[i,[.45,.85,.78]]),[this.selected,[1,.86,.55]]];for(const [i,color] of rings){if(!this.world[i])continue;const t=this.world[i];for(let k=0;k<t.poly.length;k++){const a=mul(t.poly[k],1.032),b=mul(t.poly[(k+1)%t.poly.length],1.032),inner=p=>mul(norm(mix(p,t.p,.07)),1.033);for(const p of [a,b,inner(b),a,inner(b),inner(a)])data.push(...p,...norm(p),...color);}}this.selection.update(data);}
 updateRoutes(time){const data=[];for(const m of [...this.state?.marches||[],...this.state?.strikes||[]]){const a=this.world[m.from]?.p,b=this.world[m.to]?.p;if(!a||!b||m.from===m.to)continue;let prev=null;const col=m.kind===2?[1,.3,.12]:palette[m.owner];for(let j=0;j<=32;j++){const t=j/32,p=mul(norm(mix(a,b,t)),1.035+Math.sin(Math.PI*t)*(m.kind===undefined?.1:.27));if(prev){for(const v of [prev,p])data.push(...v,...norm(v),...col);}prev=p;}}this.routes.update(data);}
 updateUnits(now){const data=[],elapsed=Math.min(2,(now-(this.receivedAt||now))/1000);const tri=(a,b,c,col)=>{const n=norm(cross(add(b,mul(a,-1)),add(c,mul(a,-1))));for(const p of [a,b,c])data.push(...p,...n,...col);};
  for(const s of this.state?.squads||[]){let up=this.world[s.tile]?.p;if(!up)continue;if(s.path.length>1&&s.left>0){const f=Math.min(s.path.length-1,(1-Math.max(0,s.left-elapsed)/s.total)*(s.path.length-1)),i=Math.min(s.path.length-2,Math.floor(f));up=norm(mix(this.world[s.path[i]].p,this.world[s.path[i+1]].p,f-i));}const east=norm(cross(Math.abs(up[1])>.98?[1,0,0]:[0,1,0],up)),north=cross(up,east),height=s.kind===1||s.kind===2?1.008:1.035;const point=(x,y,z)=>add(mul(up,height+y),add(mul(east,x),mul(north,z)));const col=palette[s.owner],dark=mix(col,[.035,.07,.075],.65);
   const box=(x,z,w,h,d,color,y=0)=>{const ps=[point(x-w/2,y,z-d/2),point(x+w/2,y,z-d/2),point(x+w/2,y,z+d/2),point(x-w/2,y,z+d/2)],tops=ps.map(p=>add(p,mul(up,h)));for(let i=0;i<4;i++){const j=(i+1)%4;tri(ps[i],ps[j],tops[j],color);tri(ps[i],tops[j],tops[i],color);}tri(tops[0],tops[1],tops[2],color);tri(tops[0],tops[2],tops[3],color);};
   if(this.models[s.kind])continue;
   if(s.kind===0){box(0,0,.04,.012,.047,dark);box(-.023,0,.008,.009,.055,[.06,.08,.075]);box(.023,0,.008,.009,.055,[.06,.08,.075]);box(0,0,.025,.014,.025,col,.012);box(0,-.028,.005,.005,.037,col,.022);}
   else if(s.kind===1||s.kind===2){const w=s.kind===1?.023:.012;box(0,0,w,.007,.075,dark);tri(point(-w/2,.007,-.037),point(0,.009,-.058),point(w/2,.007,-.037),col);box(0,.004,w*.7,.012,.025,col,.007);if(s.kind===1){box(0,-.016,.004,.028,.004,col);box(0,.02,.008,.005,.02,col,.012);}else box(0,-.003,.003,.018,.003,col,.01);}
   else{for(let k=0;k<3;k++){box((k-1)*.014,0,.008,.02,.008,dark);box((k-1)*.014,0,.01,.007,.01,col,.02);}}
  }
  for(const s of this.state?.strikes||[]){if(this.models[4+s.kind])continue;const a=this.world[s.from]?.p,b=this.world[s.to]?.p;if(!a||!b)continue;const f=Math.min(1,1-Math.max(0,s.left-elapsed)/s.total),p=mul(norm(mix(a,b,f)),1.045+Math.sin(f*Math.PI)*.27),tangent=norm(cross(p,[0,1,0])),n=norm(p);const tip=add(p,mul(n,.018));tri(add(p,mul(tangent,-.008)),tip,add(p,mul(tangent,.008)),s.kind===2?[1,.34,.1]:[1,.87,.53]);}
  for(const e of this.state?.events||[]){const age=(this.state.tick-e.tick)+elapsed;if(e.kind<7||e.kind>9||age>6)continue;const p=this.world[e.tile]?.p;if(!p)continue;const east=norm(cross(p,[0,1,0])),north=cross(p,east),radius=(e.kind===9?.13:.045)*Math.min(1,age/3);for(let j=0;j<24;j++){const ring=a=>add(mul(p,1.045),add(mul(east,Math.cos(a)*radius),mul(north,Math.sin(a)*radius)));tri(mul(p,1.05+Math.sin(age/6*Math.PI)*(e.kind===9?.19:.035)),ring(j/24*6.283),ring((j+1)/24*6.283),[1,.4+age*.055,.12]);}}
  this.units.update(data);
 }
 drawModels(now){const g=this.gl,elapsed=Math.min(2,(now-(this.receivedAt||now))/1000);
  const draw=(kind,up,forward,radius,scale,owner)=>{const mesh=this.models[kind];if(!mesh)return;let east=norm(cross(Math.abs(up[1])>.98?[1,0,0]:[0,1,0],up)),north=cross(up,east);if(forward&&Math.hypot(...forward)>.001){north=mul(norm(add(forward,mul(up,-forward.reduce((a,v,i)=>a+v*up[i],0)))),-1);east=norm(cross(up,north));}g.uniformMatrix3fv(this.u.modelBasis,false,[...east,...up,...north]);g.uniform3fv(this.u.modelOrigin,mul(up,radius));g.uniform1f(this.u.modelScale,scale);g.uniform3fv(this.u.modelTint,palette[owner]);mesh.draw(g.TRIANGLES);};
  for(const s of this.state?.squads||[]){let up=this.world[s.tile].p,forward=null;if(s.path.length>1&&s.left>0){const f=Math.min(s.path.length-1,(1-Math.max(0,s.left-elapsed)/s.total)*(s.path.length-1)),i=Math.min(s.path.length-2,Math.floor(f)),a=this.world[s.path[i]].p,b=this.world[s.path[i+1]].p;up=norm(mix(a,b,f-i));forward=add(b,mul(a,-1));}draw(s.kind,up,forward,s.kind===2?1.001:s.kind===1?1.003:ground(up,this.world[s.tile].terrain===4?1:0)+.006,s.kind===1||s.kind===2?.12:s.kind===3?.064:.09,s.owner);}
  for(const s of this.state?.strikes||[]){const a=this.world[s.from]?.p,b=this.world[s.to]?.p;if(!a||!b)continue;const f=Math.min(1,1-Math.max(0,s.left-elapsed)/s.total);draw(4+s.kind,norm(mix(a,b,f)),add(b,mul(a,-1)),1.045+Math.sin(f*Math.PI)*.27,s.kind===0?.06:.037,s.owner);}
  if(this.state?.players[this.slot]?.satellite>0){const a=now*.00015;draw(7,norm([Math.cos(a),.4*Math.sin(a*.7),Math.sin(a)]),null,1.2,.075,this.slot);}
  g.uniform1f(this.u.modelScale,0);
 }
 frame(now){this.clock=now/1000;const c=this.canvas,g=this.gl;const dpr=Math.min(devicePixelRatio||1,innerWidth<=760?1.4:1.8),w=Math.floor(c.clientWidth*dpr),h=Math.floor(c.clientHeight*dpr);if(c.width!==w||c.height!==h){c.width=w;c.height=h;g.viewport(0,0,w,h);this.targetOffset=this.preview&&innerWidth>760?.24:0;}
  this.distance+=(this.targetDistance-this.distance)*.09;this.offset+=(this.targetOffset-this.offset)*.06;
  if(this.targetFocus){this.yaw+=(this.targetFocus[0]-this.yaw)*.085;this.pitch+=(this.targetFocus[1]-this.pitch)*.085;if(Math.abs(this.yaw-this.targetFocus[0])+Math.abs(this.pitch-this.targetFocus[1])<.001)this.targetFocus=null;}
  else if(this.preview&&!this.pointer)this.yaw+=.0007;
  g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(this.program);g.uniform4f(this.u.camera,this.yaw,this.pitch,this.distance,0);g.uniform2f(this.u.viewport,w/h,1);g.uniform1f(this.u.offset,this.offset);g.uniform1f(this.u.time,this.clock);g.uniform1i(this.u.oceanNormal,0);g.uniform1i(this.u.oceanRough,1);g.uniform1i(this.u.fogTexture,2);g.uniform1f(this.u.preview,this.preview?1:0);g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,this.fogTexture);g.uniform4fv(this.u['weather[0]'],(this.state?.weather||[[.3,.2,.93,.89],[-.8,.3,.5,.89],[.4,-.3,-.85,.9]]).flat());this.textures.forEach((t,i)=>{g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,t);});
  g.enable(g.DEPTH_TEST);g.disable(g.CULL_FACE);g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.depthMask(false);g.uniform1f(this.u.mode,2);this.air.draw(g.TRIANGLES);g.depthMask(true);g.disable(g.BLEND);g.uniform1f(this.u.mode,0);this.land.draw(g.TRIANGLES);this.vegetation.draw(g.TRIANGLES);this.props.draw(g.TRIANGLES);g.uniform1f(this.u.mode,1);this.lines.draw(g.LINES);this.selection.draw(g.TRIANGLES);this.updateRoutes(now);this.routes.draw(g.LINES);
  g.uniform1f(this.u.mode,0);this.updateUnits(now);this.units.draw(g.TRIANGLES);this.drawModels(now);g.enable(g.BLEND);g.depthMask(false);g.uniform1f(this.u.mode,3);this.clouds.draw(g.TRIANGLES);g.depthMask(true);
  this.onFrame?.(now);requestAnimationFrame(this.frame);
 }
}
