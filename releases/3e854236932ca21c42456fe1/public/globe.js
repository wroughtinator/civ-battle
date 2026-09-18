import {assetBytes,assetImage,trackLoad} from './loading.js';
import {OutlinePass} from './outline-pass.js';
import {GlobeControls} from './globe-controls.js';
import {attackTiming,drawAttack,unitScales,ballisticPose} from './combat-visuals.js';
import {RiggedMesh,Woodland,modelNames,treeNames,loadTexture,orientationBasis} from './model-assets.js';
import {coastalEdges,shoreDistance,beachWeight,smoothTerrainNormals} from './terrain.js';
import {UnitMotion} from './movement.js';
import { colors } from './icons.js';
import {EventTimeline} from './feedback.js';
import {terrainSlows} from './terrain.js';
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
// Broad, connected ridgelines with fine erosion, instead of equally noisy lumps.
const ridge=p=>{const q=[p[0]*13+p[2]*5,p[1]*17,p[2]*12-p[0]*4],r=1-Math.abs(noise3(q)*2-1);return Math.pow(r,2)*.86+Math.pow(1-Math.abs(noise3(mul(q,1.8))*2-1),3)*.14;};
const ground=(p,mountain=0)=>1.008+noise3(mul(p,49))*.004+mountain*(.007+ridge(p)*.078);
const vertex=`#version 300 es
precision highp float;
in vec3 position;in vec3 normal;in vec3 color;in vec3 material;in vec4 joints;in vec4 weights;in vec2 uv;in vec4 treeOrigin;in vec4 treeShape;in vec3 teamColor;out vec3 vTeamColor;
uniform float skinned;uniform mat4 bones[32];uniform float foliage;
out vec2 vUV;
uniform vec4 camera;uniform vec2 viewport;uniform float offset;uniform float mode;uniform float time;
uniform mat3 modelBasis;uniform vec3 modelOrigin;uniform float modelScale;uniform vec3 modelTint;uniform float modelFlash;
out vec3 vSurfaceNormal;out vec3 vColor;out vec3 vNormal;out vec3 vPos;out vec3 vWorld;out vec3 vMaterial;
vec3 rotate(vec3 p){float c=cos(camera.x),s=sin(camera.x);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);c=cos(camera.y);s=sin(camera.y);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
void main(){vec3 local=position,localNormal=normal;
if(skinned>.5){mat4 skin=bones[int(joints.x)]*weights.x+bones[int(joints.y)]*weights.y+bones[int(joints.z)]*weights.z+bones[int(joints.w)]*weights.w;local=(skin*vec4(local,1.)).xyz;localNormal=mat3(skin)*localNormal;}
vec3 world=modelScale>0.?modelOrigin+modelBasis*local*modelScale:local;vec3 n=modelScale>0.?modelBasis*localNormal:localNormal;
if(foliage>.5){vec3 up=normalize(treeOrigin.xyz),east=normalize(cross(abs(up.y)>.98?vec3(1,0,0):vec3(0,1,0),up)),north=cross(up,east);float c=cos(treeOrigin.w),s=sin(treeOrigin.w);mat3 basis=mat3(east*c+north*s,up,north*c-east*s);vec3 branch=position*treeShape.xyz;if(foliage<1.5)branch.x+=sin(time*1.1+treeOrigin.w+position.y*3.)*.025*position.y*position.y*treeShape.y;world=treeOrigin.xyz+basis*branch;n=normalize(basis*(localNormal/treeShape.xyz));}
vSurfaceNormal=n;vUV=uv;if(mode>2.5&&mode<3.5){vec3 q=normalize(world);float billow=sin(q.x*31.+sin(q.y*27.))*sin(q.z*28.+sin(q.x*19.));world=q*(1.078+billow*.009);}vec3 p=rotate(world);float z=camera.z-p.z;float scale=2.75;gl_Position=vec4(p.x*scale/viewport.x+offset*z,p.y*scale,z*1.001-0.02001,z);vTeamColor=foliage>1.5?teamColor:modelTint;gl_PointSize=2.;vColor=modelScale>0.?mix(mix(color,modelTint,.12),vec3(1.,.28,.10),modelFlash):color*(foliage>.5?treeShape.w:1.);vNormal=rotate(material.y>.5&&material.y<1.5?normalize(world):n);vPos=p;vWorld=world;vMaterial=material;}`;
const fragment=`#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vSurfaceNormal;in vec3 vColor;in vec3 vNormal;in vec3 vPos;in vec3 vWorld;in vec3 vMaterial;
in vec3 vTeamColor;uniform float outline;uniform sampler2D outlineSceneDepth;
uniform sampler2D treeTexture;uniform sampler2D terrainTexture;
uniform float mode;uniform float time;uniform vec4 camera;uniform sampler2D oceanNormal;uniform sampler2D oceanRough;uniform sampler2D fogTexture;uniform float preview;uniform vec4 weather[3];
out vec4 outColor;
vec3 terrainDx,terrainDy;
float hash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.43));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.07);}
vec3 tone(vec3 x){return pow(clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.),vec3(1./2.2));}
vec3 rotate(vec3 p){float c=cos(camera.x),s=sin(camera.x);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);c=cos(camera.y);s=sin(camera.y);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
// Four overlapping, independently mirrored/offset patches avoid a repeated atlas grid.
// Gradients come from continuous world coordinates, not fractured atlas UVs.
vec3 terrainPatch(vec2 q,vec2 cell,vec2 id,vec2 dx,vec2 dy){
 float seed=hash(vec3(id,17.));float angle=floor(seed*4.)*1.5707963;
 mat2 turn=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
 vec2 t=turn*q+vec2(hash(vec3(id,31.)),hash(vec3(id,53.)))*13.;
 vec2 wrapped=abs(fract(t*.5)*2.-1.);vec2 signUV=sign(fract(t*.5)-.5);
 vec2 uv=(cell+.045+wrapped*.91)*.25;
 return textureGrad(terrainTexture,uv,(turn*dx)*signUV*.2275,(turn*dy)*signUV*.2275).rgb;
}
vec3 terrainPlane(vec2 q,vec2 cell,vec2 dx,vec2 dy){
 vec2 id=floor(q),f=fract(q),w=f*f*(3.-2.*f);
 return mix(mix(terrainPatch(q,cell,id,dx,dy),terrainPatch(q,cell,id+vec2(1,0),dx,dy),w.x),
            mix(terrainPatch(q,cell,id+vec2(0,1),dx,dy),terrainPatch(q,cell,id+vec2(1,1),dx,dy),w.x),w.y);
}
vec3 groundTex(float tile,vec3 p,vec3 surfaceNormal){
 vec3 w=pow(abs(surfaceNormal),vec3(4.));w/=max(dot(w,vec3(1)),.0001);
 vec2 cell=vec2(mod(tile,4.),floor(tile/4.));vec3 q=p*24.;
 vec3 distant=textureLod(terrainTexture,(cell+.5)*.25,5.).rgb;

 vec3 sampleColor=terrainPlane(q.yz,cell,terrainDx.yz,terrainDy.yz)*w.x+terrainPlane(q.zx,cell,terrainDx.zx,terrainDy.zx)*w.y+terrainPlane(q.xy,cell,terrainDx.xy,terrainDy.xy)*w.z;
 return pow(mix(sampleColor,distant,smoothstep(2.4,4.8,camera.z)*.55),vec3(2.2));
}
void main(){if(outline>.5){float sceneDepth=texelFetch(outlineSceneDepth,ivec2(gl_FragCoord.xy),0).r;float tolerance=.000001+.75*(abs(dFdx(gl_FragCoord.z))+abs(dFdy(gl_FragCoord.z)));if(gl_FragCoord.z>sceneDepth+tolerance)discard;if(max(max(vTeamColor.r,vTeamColor.g),vTeamColor.b)<=0.)discard;outColor=vec4(vTeamColor,1.);return;}terrainDx=dFdx(vWorld)*24.;terrainDy=dFdy(vWorld)*24.;vec3 wn=normalize(vWorld),n=normalize(vNormal),eye=normalize(vec3(0,0,camera.z)-vPos),sun=normalize(vec3(-.6,.85,1.));
if(mode>3.5){if(dot(n,eye)<=.015)discard;outColor=vec4(vColor,vMaterial.z);return;}
if(mode>2.5){
 float facing=dot(n,eye);if(facing<.025)discard;
 float storm=0.;for(int i=0;i<3;i++)storm=max(storm,smoothstep(weather[i].w-.035,weather[i].w+.075,dot(wn,weather[i].xyz)));
 vec3 drift=vec3(time*.009,0,time*.004),q=wn+drift*.006;
 // Weather systems occupy distinct regions, with clear air between them.
 // Low-frequency coverage gates the small billows instead of sprinkling noise everywhere.
 vec3 warp=vec3(noise(q*5.1),noise(q*5.1+7.),noise(q*5.1+19.))*.8;
 float atlasCloud=dot(groundTex(7.,q*.045,wn),vec3(.333));float broad=mix(fbm(q*3.2+warp),atlasCloud,.22),coverage=smoothstep(.43,.65,broad+storm*.17);
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
 // Keep a faint close-up layer and reach the 50% opacity ceiling farther out.
 float zoomOpacity=mix(.10,.50,smoothstep(1.26,3.60,camera.z));
 float alpha=(1.-exp(-density*2.6))*zoomOpacity*smoothstep(.025,.30,facing);
 outColor=vec4(tone(cloud),alpha);return;
}
if(mode>1.5){float edge=pow(1.-abs(dot(n,eye)),3.);outColor=vec4(.22,.61,.77,edge*.26);return;}
float fog=preview>.5?1.:texture(fogTexture,vec2(atan(wn.z,wn.x)/6.2831853+.5,asin(clamp(wn.y,-1.,1.))/3.14159265+.5)).r;float f=fbm(wn*11.+vec3(time*.016,0,-time*.008));float visibility=smoothstep(.13,.87,fog+(f-.5)*.23);
vec3 c=pow(max(vColor,vec3(0.)),vec3(1.65))*(.29+max(dot(n,sun),0.)*.91);
if(vMaterial.y<.5&&mode<.5){
 vec3 surfaceNormal=normalize(vSurfaceNormal);
 if(dot(surfaceNormal,wn)<0.)surfaceNormal=-surfaceNormal;
 float patches=fbm(vWorld*19.),detail=fbm(vWorld*160.);float slope=1.-max(0.,dot(n,normalize(vPos)));float rock=max(smoothstep(.024,.065,length(vWorld)-1.),smoothstep(.08,.42,slope));
 float groundTile=vMaterial.z<1.5?1.:vMaterial.z<2.5?2.:vMaterial.z<3.5?12.:vMaterial.z<4.5?4.:5.;vec3 base=groundTex(groundTile,vWorld,surfaceNormal);
 if(rock>.01&&groundTile!=4.)base=mix(base,groundTex(4.,vWorld,surfaceNormal),rock*.7);
 float snow=smoothstep(1.052,1.072,length(vWorld)+patches*.005)*smoothstep(.35,.85,dot(surfaceNormal,wn));
 if(snow>.01&&groundTile!=5.)base=mix(base,groundTex(5.,vWorld,surfaceNormal),snow);
 base*=.78+patches*.32+detail*.16;
 float beach=clamp(vMaterial.x,0.,1.);if(beach>.01){vec3 sand=groundTex(3.,vWorld,surfaceNormal)*mix(.75,1.,smoothstep(1.001,1.010,length(vWorld)));base=mix(base,sand,beach);}
 vec3 rockNormal=n;
 c=base*(.25+max(dot(rockNormal,sun),0.)*.97);
}
if(vMaterial.y>1.5&&vMaterial.y<2.5){float spec=pow(max(dot(reflect(-sun,n),eye),0.),45.);c+=vec3(.8,.85,.8)*spec*.23;}
if(vMaterial.y>.5&&vMaterial.y<1.5&&mode<.5){
 vec3 weights=pow(abs(wn),vec3(4.));weights/=dot(weights,vec3(1));vec2 drift=vec2(time*.0012,-time*.0009);
 vec2 rx=texture(oceanNormal,vWorld.yz*9.+drift).xy*2.-1.;rx+=.5*(texture(oceanNormal,vWorld.yz*23.-drift*1.4).xy*2.-1.);
 vec2 ry=texture(oceanNormal,vWorld.zx*9.+drift).xy*2.-1.;ry+=.5*(texture(oceanNormal,vWorld.zx*23.-drift*1.4).xy*2.-1.);
 vec2 rz=texture(oceanNormal,vWorld.xy*9.+drift).xy*2.-1.;rz+=.5*(texture(oceanNormal,vWorld.xy*23.-drift*1.4).xy*2.-1.);
 vec3 ripple=vec3(0.,rx.x,rx.y)*weights.x+vec3(ry.y,0.,ry.x)*weights.y+vec3(rz.x,rz.y,0.)*weights.z;
 vec3 swell=vec3(cos(vWorld.z*160.+time*.8),sin(vWorld.x*147.+time*.6),cos(vWorld.y*173.-time*.7))*.025;ripple+=swell;
 ripple-=wn*dot(wn,ripple);n=normalize(rotate(wn+ripple*.085));
 float storm=0.;for(int i=0;i<3;i++)storm=max(storm,smoothstep(weather[i].w-.025,weather[i].w+.065,dot(wn,weather[i].xyz)));
 float rough=texture(oceanRough,vWorld.zx*11.+drift).r;
 float fresnel=.02+.98*pow(1.-max(dot(n,eye),0.),5.);
 vec3 reflected=reflect(-eye,n);vec3 sky=mix(vec3(.025,.07,.12),vec3(.24,.38,.52),smoothstep(-.3,1.,reflected.y));
 float cloud=fbm(reflected*7.+vec3(time*.008,0,0));sky=mix(sky,vec3(.47,.54,.58),smoothstep(.53,.8,cloud)*.42);
 float depth=smoothstep(.24,.97,vMaterial.z);vec3 water=mix(vec3(.012,.19,.18),vec3(.003,.024,.059),depth);
 water=mix(water,groundTex(6.,vWorld+vec3(drift,0.),wn),.20);water*=.85+.15*fbm(vWorld*80.);float diffuse=.52+.48*max(dot(normalize(rotate(wn)),sun),0.);
 c=mix(water*diffuse,sky,fresnel);c+=vec3(.009,.021,.03)*max(0.,dot(ripple,vec3(.6,.4,.3))+.1);
 float highlight=pow(max(dot(n,normalize(sun+eye)),0.),mix(420.,150.,rough));c+=vec3(1.,.9,.69)*highlight*1.35;
 float coast=1.-smoothstep(.03,.20,vMaterial.z);float surf=pow(.5+.5*sin(vMaterial.z*80.-time*1.2+fbm(vWorld*150.)*3.),7.);
 c=mix(c,vec3(.56,.72,.69),coast*(.2+surf*.6));c*=1.-storm*.18;
}
if(vMaterial.y>3.5&&mode<.5){vec4 leaf=texture(treeTexture,vUV);if(leaf.a<.48)discard;vec3 leafNormal=gl_FrontFacing?n:-n;float light=.40+.65*max(dot(leafNormal,sun),0.)+.14*max(dot(-leafNormal,sun),0.);c=pow(leaf.rgb,vec3(2.2))*light*vColor;}
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
  this.program=g.createProgram();g.attachShader(this.program,shader(g.VERTEX_SHADER,vertex));g.attachShader(this.program,shader(g.FRAGMENT_SHADER,fragment));['position','normal','color','material','joints','weights','uv','treeOrigin','treeShape','teamColor'].forEach((n,i)=>g.bindAttribLocation(this.program,i,n));g.linkProgram(this.program);if(!g.getProgramParameter(this.program,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(this.program));
  this.u=Object.fromEntries(['camera','viewport','offset','mode','time','oceanNormal','oceanRough','fogTexture','preview','weather[0]','modelBasis','modelOrigin','modelScale','modelTint','modelFlash','skinned','bones[0]','foliage','treeTexture','terrainTexture','outline','outlineSceneDepth'].map(n=>[n,g.getUniformLocation(this.program,n)]));
  this.outlines=new OutlinePass(g);
  this.textures=['ocean-normal.png','ocean-roughness.png'].map((file,unit)=>{const texture=g.createTexture();g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1,1,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array(unit?[160,160,160,255]:[128,128,255,255]));trackLoad(assetImage('/releases/3e854236932ca21c42456fe1/assets/forge/'+file).then(img=>{g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,img);g.generateMipmap(g.TEXTURE_2D);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.REPEAT);})).catch(e=>console.warn(e));return texture;});
  this.terrainTexture=g.createTexture();g.activeTexture(g.TEXTURE4);g.bindTexture(g.TEXTURE_2D,this.terrainTexture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1,1,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array([110,120,80,255]));g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);trackLoad(loadTexture(g,'terrain',4).then(t=>this.terrainTexture=t)).catch(e=>console.warn(e));
  this.fogTexture=g.createTexture();g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,this.fogTexture);g.texImage2D(g.TEXTURE_2D,0,g.R8,128,64,0,g.RED,g.UNSIGNED_BYTE,new Uint8Array(8192).fill(255));g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
  this.land=new Mesh(g);this.lines=new Mesh(g);this.props=new Mesh(g);this.air=new Mesh(g);this.selection=new Mesh(g);this.routes=new Mesh(g);this.clouds=new Mesh(g);this.units=new Mesh(g);
  this.effects=new EventTimeline();this.effectsMesh=new Mesh(g);this.territories=new Mesh(g);this.territoryBorders=new Mesh(g);this.models={};this.modelLoads=new Map();
  this.loadModel=kind=>{
   if(this.models[kind]||performance.now()-(this.modelLoads.get(kind)??-Infinity)<15000)return;
   const name=modelNames[kind];if(!name)return;this.modelLoads.set(kind,performance.now());
   trackLoad(Promise.all([assetBytes('/releases/3e854236932ca21c42456fe1/assets/forge/'+name+'.rig'),loadTexture(g,name)]).then(([buffer,texture])=>this.models[kind]=new RiggedMesh(g,buffer,texture))).catch(e=>console.warn(e));
  };
  this.treeInstances=[];this.treeGroups=new Map();this.propInstances=new Map();this.staticMeshes=new Map();
  this.loadStatic=(name,sway=false)=>{
   if(this.staticMeshes.has(name)||performance.now()-(this.modelLoads.get(name)??-Infinity)<15000)return;
   this.modelLoads.set(name,performance.now());
   trackLoad(Promise.all([assetBytes('/releases/3e854236932ca21c42456fe1/assets/forge/'+name+'.mesh'),loadTexture(g,name)]).then(([buffer,texture])=>this.staticMeshes.set(name,new Woodland(g,buffer,texture,sway)))).catch(e=>console.warn(e));
  };
  treeNames.forEach(name=>this.loadStatic(name,true));
  this.yaw=.15;this.pitch=.18;this.distance=3.15;this.targetDistance=3.15;this.offset=.24;this.targetOffset=.24;this.selected=-1;this.hovered=-1;this.preview=true;this.world=[];this.state=null;this.slot=0;this.clock=0;this.pointer=null;this.lastTouch=0;
  this.bind();this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
 }
 bind(){
  const c=this.canvas;this.controls=new GlobeControls(this,[c,document.getElementById('markers')].filter(Boolean));
  c.addEventListener('wheel',e=>{e.preventDefault();this.targetDistance=Math.max(1.12,Math.min(4.8,this.targetDistance+e.deltaY*.0015));},{passive:false});
 }
 setWorld(world){this.motion=new UnitMotion();this.headings=new Map();this.world=world;this.staticReady=false;this.borderCache=[];this.territorySurfaces=[];this.edgeNeighbors=world.map(t=>t.poly.map(()=>-1));const edges=new Map(),pointKey=p=>p.map(x=>x.toFixed(5)).join(',');world.forEach((t,i)=>t.poly.forEach((p,k)=>{const key=[pointKey(p),pointKey(t.poly[(k+1)%t.poly.length])].sort().join('|'),other=edges.get(key);if(other){this.edgeNeighbors[i][k]=other[0];this.edgeNeighbors[other[0]][other[1]]=i;}else edges.set(key,[i,k]);}));this.shoreEdges=coastalEdges(world,this.edgeNeighbors);this.fogLookup=new Uint16Array(8192);for(let y=0;y<64;y++)for(let x=0;x<128;x++){const lat=((y+.5)/64-.5)*Math.PI,lon=((x+.5)/128-.5)*Math.PI*2,p=[Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon)];let best=-2,idx=0;for(let i=0;i<world.length;i++){const v=world[i].p,d=p[0]*v[0]+p[1]*v[1]+p[2]*v[2];if(d>best){best=d;idx=i;}}this.fogLookup[y*128+x]=idx;}this.rebuild();}
 updateFog(){const g=this.gl,data=new Uint8Array(8192);for(let i=0;i<data.length;i++){const t=this.state?.tiles[this.fogLookup[i]];data[i]=this.preview||t?.visible?255:t?.explored?117:0;}g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,this.fogTexture);g.texSubImage2D(g.TEXTURE_2D,0,0,0,128,64,g.RED,g.UNSIGNED_BYTE,data);}
 setState(state,slot){const priorRadius=this.state?.cities?.find(c=>c.tile===this.selectedCity)?.radius;this.effects.accept(state);this.motion??=new UnitMotion();this.motion.accept(state.squads||[],performance.now());this.state=state;for(const kind of new Set((state.squads||[]).map(u=>u.kind)))this.loadModel(kind);for(const strike of state.strikes||[])this.loadModel(strike.kind===2?15:14);for(const e of this.effects.items)if(e.action==='shot'){const type=attackTiming(e,performance.now()).style.type;const name=({arrow:'arrow',shell:'shell',mortar:'mortar',burst:'bullet',bomb:'bomb',broadside:'shell',torpedo:'torpedo',rocket:'rocket',sortie:'aircraft'})[type];if(name)this.loadModel(modelNames.indexOf(name));}if(state.players?.some(p=>p.launch>0))this.loadModel(16);for(const mesh of Object.values(this.models))if(mesh.states)for(const id of mesh.states.keys())if(!state.squads?.some(u=>u.id===id))mesh.states.delete(id);this.slot=slot;this.receivedAt=performance.now();this.preview=state.phase!=='running'&&state.phase!=='ended';this.targetOffset=this.preview&&innerWidth>760?.24:0;this.updateFog();this.rebuild();if(priorRadius!==state.cities?.find(c=>c.tile===this.selectedCity)?.radius)this.frameCity(this.selectedCity);}
 focus(i){if(!this.world[i])return;const p=this.world[i].p;let yaw=-Math.atan2(p[0],p[2]);while(yaw-this.yaw>Math.PI)yaw-=Math.PI*2;while(yaw-this.yaw<-Math.PI)yaw+=Math.PI*2;this.targetFocus=[yaw,Math.atan2(p[1],Math.hypot(p[0],p[2]))];}
 frameCity(tile){if(tile==null||tile<0||!this.world[tile])return;const city=this.state?.cities?.find(c=>c.tile===tile);if(!city)return;const center=this.world[tile].p;let spread=0;for(let i=0;i<this.world.length;i++)if(this.state.tiles[i]?.city===tile)for(const p of this.world[i].poly)spread=Math.max(spread,Math.acos(Math.max(-1,Math.min(1,p.reduce((v,x,k)=>v+x*center[k],0)))));const w=this.canvas.clientWidth,h=this.canvas.clientHeight;this.targetDistance=Math.max(this.targetDistance,Math.min(4.8,Math.cos(spread)+2.75*h*Math.sin(spread)/Math.min(w*.78,h*.58)));this.focus(tile);}
 choose(i,city=false){this.selected=i;this.selectedCity=city?i:-1;this.rebuildTerritory();this.rebuildSelection();}
 setBlockedTargets(targets){this.blockedTargets=targets;this.rebuildSelection();}
 setTargets(targets){this.targets=targets;this.rebuildSelection();}
 rotate(p){const c=Math.cos(this.yaw),s=Math.sin(this.yaw),x=c*p[0]+s*p[2],z=-s*p[0]+c*p[2];return[x,Math.cos(this.pitch)*p[1]-Math.sin(this.pitch)*z,Math.sin(this.pitch)*p[1]+Math.cos(this.pitch)*z];}
 project(p){const v=this.rotate(p),w=this.canvas.clientWidth,h=this.canvas.clientHeight,z=this.distance-v[2];return{x:w*(.5+this.offset/2)+v[0]*h*1.375/z,y:h/2-v[1]*h*1.375/z,visible:v[2]>1/this.distance,z:v[2]};}
 pick(x,y){const rect=this.canvas.getBoundingClientRect();x-=rect.left;y-=rect.top;let best=-1,dist=Infinity;this.world.forEach((t,i)=>{const p=this.project(t.p);if(!p.visible)return;const d=Math.hypot(x-p.x,y-p.y);const size=this.canvas.clientHeight*.105/(this.distance-p.z);if(d<dist&&d<size){dist=d;best=i;}});return best;}
 rebuild(){if(!this.world.length)return;const land=[],lines=[],props=[],air=[],clouds=[],staticBuild=!this.staticReady;
  if(staticBuild){this.treeInstances=[];this.treeGroups=new Map(treeNames.map(n=>[n,[]]));}this.propInstances=new Map();
  let activeMat=[1,0,0];const cornerFog=new Map(),cornerTerrain=new Map();const key=p=>p.map(v=>v.toFixed(5)).join(',');
  const fogValue=i=>this.preview?1:this.state?.tiles[i]?.visible?1:this.state?.tiles[i]?.explored?.46:0;
  this.world.forEach((t,i)=>t.poly.forEach(p=>{const k=key(p),v=cornerFog.get(k)||[0,0];v[0]+=fogValue(i);v[1]++;cornerFog.set(k,v);const a=cornerTerrain.get(k)||[0,0,0];a[0]+=t.terrain===4?1:0;a[1]+=t.terrain===0?1:0;a[2]++;cornerTerrain.set(k,a);}));
  const push=(list,p,n,c)=>{list.push(...p,...n,...c);list.materials??=[];list.materials.push(...activeMat);};
  const tri=(list,a,b,c,col)=>{const n=norm(cross(add(b,mul(a,-1)),add(c,mul(a,-1))));const outward=n[0]*a[0]+n[1]*a[1]+n[2]*a[2]<0?mul(n,-1):n;[a,b,c].forEach(p=>push(list,p,outward,col));};
  this.world.forEach((t,i)=>{
   const s=this.state?.tiles[i]||{owner:-1};const height=t.terrain===0?1:1.013+(t.terrain===4?.007:0);let col=terrain[t.terrain];activeMat=[fogValue(i),t.terrain===0?1:0,t.terrain];
   if(t.terrain===0)col=t.near.some(j=>this.world[j].terrain>0)?[.025,.22,.245]:[.016,.084,.145];
   const jitter=t.terrain===0?0:((i*137)%19-9)*.001;col=col.map(c=>c+jitter);

   const shores=this.shoreEdges[i],surface=(p,m)=>{const d=shoreDistance(p,shores),blend=Math.min(1,d/.014);return 1.0018+(ground(p,m)-1.0018)*blend*blend*(3-2*blend);};
   const poly=t.poly.map(p=>mul(p,height));this.borderCache[i]??=[];if(staticBuild)this.territorySurfaces[i]=[];
   const drawGround=(a,b,c,fa,fb,fc,ma,mb,mc,da,db,dc,level)=>{
    if(level>0){const ab=norm(add(a,b)),bc=norm(add(b,c)),ca=norm(add(c,a));const fab=(fa+fb)/2,fbc=(fb+fc)/2,fca=(fc+fa)/2,mab=(ma+mb)/2,mbc=(mb+mc)/2,mca=(mc+ma)/2,dab=(da+db)/2,dbc=(db+dc)/2,dca=(dc+da)/2;
     drawGround(a,ab,ca,fa,fab,fca,ma,mab,mca,da,dab,dca,level-1);drawGround(ab,b,bc,fab,fb,fbc,mab,mb,mbc,dab,db,dbc,level-1);drawGround(ca,bc,c,fca,fbc,fc,mca,mbc,mc,dca,dbc,dc,level-1);drawGround(ab,bc,ca,fab,fbc,fca,mab,mbc,mca,dab,dbc,dca,level-1);return;
    }
    const ps=[a,b,c].map((p,k)=>mul(p,t.terrain===0?1:surface(p,[ma,mb,mc][k]))),at=land.length/9;
    for(const p of ps)this.territorySurfaces[i].push(...mul(norm(p),Math.hypot(...p)+.0012));
    tri(land,...ps,col);for(let k=0;k<3;k++){land.materials[(at+k)*3]=t.terrain===0?0:beachWeight(shoreDistance([a,b,c][k],shores));land.materials[(at+k)*3+2]=t.terrain===0?Math.min(1,shoreDistance([a,b,c][k],shores)/.055):t.terrain;}
   };
   for(let k=0;k<poly.length;k++){
    const q=t.poly[k],r=t.poly[(k+1)%poly.length],f=cornerFog.get(key(q)),h=cornerFog.get(key(r)),a=cornerTerrain.get(key(q)),b=cornerTerrain.get(key(r));
    if(staticBuild){drawGround(t.p,q,r,fogValue(i),f[0]/f[1],h[0]/h[1],t.terrain===4?1:0,a[0]/a[2],b[0]/b[2],t.terrain===0?1:0,a[1]/a[2],b[1]/b[2],t.terrain===4?4:3);
    tri(air,mul(t.p,1.078),mul(q,1.078),mul(r,1.078),[.2,.5,.6]);tri(clouds,mul(t.p,1.087),mul(q,1.087),mul(r,1.087),[1,1,1]);}
    const linecol=s.owner>=0?mix(palette[s.owner],[.11,.18,.13],.35):mix(col,[.10,.16,.12],.7);
    for(let step=0;step<8;step++){const v=step/8,w=(step+1)/8;let border=this.borderCache[i][k*8+step];if(!border){const pa=norm(mix(q,r,v)),pb=norm(mix(q,r,w));border=[pa,pb,surface(pa,(a[0]/a[2])*(1-v)+(b[0]/b[2])*v),surface(pb,(a[0]/a[2])*(1-w)+(b[0]/b[2])*w)];this.borderCache[i][k*8+step]=border;}const [pa,pb,ha,hb]=border;
     if(true){for(const [p,hp] of [[pa,ha],[pb,hb]])push(lines,mul(p,t.terrain>0?hp+.0003:1.001),p,t.terrain>0?linecol:[.035,.15,.20]);
      if(staticBuild&&t.terrain>0&&this.world[this.edgeNeighbors[i][k]]?.terrain===0){const shore=[.47,.42,.29];tri(land,mul(pa,ha),mul(pa,.999),mul(pb,.999),shore);tri(land,mul(pa,ha),mul(pb,.999),mul(pb,hb),shore);}
     }
    }
   }
   activeMat=[fogValue(i),3,0];
   const up=t.p,east=norm(cross(Math.abs(up[1])>.9?[1,0,0]:[0,1,0],up)),north=cross(up,east);
   const point=(x,y,z)=>{const p=norm(add(add(up,mul(east,x)),mul(north,z)));return mul(p,ground(p,t.terrain===4?1:0)+y);};
   const prop=(name,x=0,z=0,scale=.065,angle=0,owner=-1)=>{this.loadStatic(name);const list=this.propInstances.get(name)||[];list.push([...point(x,.002,z),angle,scale,scale,scale,1,...(palette[owner]||[0,0,0])]);this.propInstances.set(name,list);};
   if(staticBuild&&(t.terrain===2||t.terrain===1)){
    const count=t.terrain===2?9:2;
    for(let j=0;j<count;j++){
     const angle=rnd(i,j,1)*Math.PI*2,r=.041+Math.sqrt(rnd(i,j,2))*.015,x=Math.cos(angle)*r,z=Math.sin(angle)*r,p=norm(add(add(up,mul(east,x)),mul(north,z)));
     if(shoreDistance(p,shores)<.014)continue;
     const h=.034+rnd(i,j,3)*.025,width=.90+rnd(i,j,4)*.60;
     const instance=[...mul(p,surface(p,0)),rnd(i,j,5)*6.283,h*width,h,h*(.7+rnd(i,j,6)*.5),.85+rnd(i,j,7)*.25];this.treeInstances.push(instance);this.treeGroups.get(treeNames[(i+j)%3]).push(instance);
    }
   }
   if(!this.preview&&s.visible&&s.owner>=0&&t.terrain===1&&!this.state.cities.some(c=>c.tile===i))prop('farm',0,0,.066,0,s.owner);
   const discovery=this.state?.discoveries?.find(d=>d.tile===i&&!d.used);if(discovery)prop('discovery-'+discovery.kind,0,0,.095,0);
   if(t.site)prop('site',0,0,.05);
   if(s.owner>=0&&(t.capital>=0||this.state?.cities.some(c=>c.tile===i)))prop('capital-'+(this.state?.players[s.owner]?.civ||0),0,0,.085,0,s.owner);
   if(s.owner>=0&&s.building)prop('building-'+s.building,t.capital>=0?.052:0,0,.065,0,s.owner);
  });if(staticBuild){smoothTerrainNormals(land);this.land.update(land);this.air.update(air);this.clouds.update(clouds);this.staticReady=true;}this.lines.update(lines);this.props.update(props);this.rebuildTerritory();this.rebuildSelection();
 }
 rebuildTerritory(){
  if(!this.territories)return;
  const fill=[],borders=[];fill.materials=[];borders.materials=[];
  const push=(list,p,color,alpha)=>{list.push(...p,...norm(p),...color);list.materials.push(1,3,alpha);};
  const cities=new Map((this.state?.cities||[]).map(c=>[c.tile,c]));
  const expansion=new Set(cities.get(this.selectedCity)?.expansion_tiles||[]);
  if(!this.preview)for(let i=0;i<this.world.length;i++){
   const s=this.state?.tiles[i],city=s?.city!=null?cities.get(s.city):null;
   if(s?.visible&&expansion.has(i)){
    const surface=this.territorySurfaces[i]||[];
    const color=this.world[i].terrain===1?[.75,.95,.40]:[.42,.88,.82];
    for(let k=0;k<surface.length;k+=3)push(fill,surface.slice(k,k+3),color,.27);
    for(const cached of this.borderCache[i]||[]){
     const [a,b,ha,hb]=cached,pa=mul(a,ha+.003),pb=mul(b,hb+.003);
     const ia=mul(norm(mix(a,this.world[i].p,.065)),ha+.003),ib=mul(norm(mix(b,this.world[i].p,.065)),hb+.003);
     for(const p of [pa,pb,ib,pa,ib,ia])push(borders,p,color,.95);
    }
   }
   if(!s?.visible||!city)continue;
   const selected=city.tile===this.selectedCity,base=palette[city.owner],shade=(city.tile*137%19)/19;
   const color=selected?[1,.81,.38]:mix(base,shade>.5?[.52,.85,.85]:[.9,.82,.62],.18+shade*.2),t=this.world[i],surface=this.territorySurfaces[i]||[];
   for(let k=0;k<surface.length;k+=3)push(fill,surface.slice(k,k+3),color,selected?.25:.095);
   for(let edge=0;edge<t.poly.length;edge++){
    const neighbor=this.state.tiles[this.edgeNeighbors[i]?.[edge]];
    if(neighbor?.visible&&neighbor.city===s.city)continue;
    // Ground-following ribbons stay readable on mobile where GL lines are one pixel.
    for(let step=0;step<8;step++){
     const cached=this.borderCache[i]?.[edge*8+step];if(!cached)continue;
     const [a,b,ha,hb]=cached;
     for(const [width,col,alpha,lift] of [[selected?.13:.065,[.025,.08,.09],.9,.0016],[selected?.075:.03,color,selected?1:.82,.0021]]){
      const pa=mul(a,ha+lift),pb=mul(b,hb+lift),ia=mul(norm(mix(a,t.p,width)),ha+lift),ib=mul(norm(mix(b,t.p,width)),hb+lift);
      for(const p of [pa,pb,ib,pa,ib,ia])push(borders,p,col,alpha);
     }
    }
   }
  }
  this.territories.update(fill);this.territoryBorders.update(borders);
 }
 rebuildSelection(){
  const data=[],rings=[...[...(this.blockedTargets||[])].map(i=>[i,[.85,.35,.23]]),...[...(this.targets||[])].map(i=>[i,[.45,.85,.78]]),[this.selected,[1,.86,.55]]];
  for(const [i,color] of rings){
   if(!this.world[i])continue;
   const t=this.world[i];
   for(const [a,b,ha,hb] of this.borderCache[i]||[]){
    const pa=mul(a,t.terrain===0?1.008:ha+.004),pb=mul(b,t.terrain===0?1.008:hb+.004);
    const ia=mul(norm(mix(a,t.p,.07)),t.terrain===0?1.009:ha+.004),ib=mul(norm(mix(b,t.p,.07)),t.terrain===0?1.009:hb+.004);
    for(const p of [pa,pb,ib,pa,ib,ia])data.push(...p,...norm(p),...color);
   }
  }
  this.selection.update(data);
 }
 updateRoutes(time){const data=[];const segment=(a,b,col,height=1.02)=>{if(!a||!b)return;for(let j=0;j<8;j++){for(const t of[j/8,(j+1)/8]){const p=norm(mix(a,b,t));data.push(...mul(p,height),...p,...col);}}};
  for(const u of this.state?.squads||[]){if(u.owner!==this.slot||u.id!==this.routeUnit)continue;for(let i=1;i<u.path.length;i++)segment(this.world[u.path[i-1]].p,this.world[u.path[i]].p,terrainSlows(this.world[u.path[i]].terrain,u.kind)?[.95,.65,.24]:palette[u.owner],Math.max(1.02,...[u.path[i-1],u.path[i]].map(t=>this.world[t].terrain===4?1.085:1.025)));}
  for(let i=1;i<(this.previewPath?.length||0);i++)segment(this.world[this.previewPath[i-1]].p,this.world[this.previewPath[i]].p,[1,.87,.55],Math.max(1.028,...[this.previewPath[i-1],this.previewPath[i]].map(t=>this.world[t].terrain===4?1.087:1.028)));
  for(const m of this.state?.strikes||[]){const a=this.world[m.from]?.p,b=this.world[m.to]?.p;if(!a||!b)continue;for(let j=1;j<=24;j++)segment(norm(mix(a,b,(j-1)/24)),norm(mix(a,b,j/24)),[1,.45,.2],1.04+Math.sin(j/24*Math.PI)*.27);}
  this.routes.update(data);
 }
 unitPosition(s,now=performance.now()){return this.motion?.position(s,this.world,now)||{p:this.world[s.tile].p,forward:null,moving:false};}
 updateUnits(now){const data=[],elapsed=Math.min(2,(now-(this.receivedAt||now))/1000);const tri=(a,b,c,col)=>{const n=norm(cross(add(b,mul(a,-1)),add(c,mul(a,-1))));for(const p of[a,b,c])data.push(...p,...n,...col);};
  const ring=(p,r,col,height)=>{const e=norm(cross(Math.abs(p[1])>.98?[1,0,0]:[0,1,0],p)),n=cross(p,e),point=(a,rad)=>add(mul(p,height),add(mul(e,Math.cos(a)*rad),mul(n,Math.sin(a)*rad)));for(let j=0;j<32;j++){const a=j/32*Math.PI*2,b=(j+1)/32*Math.PI*2;tri(point(a,r),point(b,r),point(b,r*.87),col);tri(point(a,r),point(b,r*.87),point(a,r*.87),col);}};
  for(const s of this.state?.squads||[]){if(s.boarded_on!=null)continue;const{p}=this.unitPosition(s,now);const col=palette[s.owner]||[.75,.35,.22];ring(p,s.kind===9?.055:.032,col,this.world[s.tile].terrain===0?1.008:ground(p,this.world[s.tile].terrain===4?1:0)+.003);
   if(s.mode===2&&s.effect_until>this.state.tick){ring(p,.035+(now%1800)/1800*.13,[.25,.76,.76],1.018);}
   if(s.founding){ring(p,.038,[.94,.78,.42],ground(p,0)+.009);ring(p,.018+(now%1500)/1500*.025,[.94,.78,.42],ground(p,0)+.035);}
   if(s.mode===3&&s.effect_until>this.state.tick){ring(p,.039,[.38,.74,1],ground(p,0)+.03);}
   if(s.refit>=0){ring(p,.032+Math.sin(now*.006)*.004,[.73,.64,.97],ground(p,0)+.025);}
   if(s.left>0){ring(p,.026+(now%850)/850*.02,s.kind>=7&&s.kind<=9?[.62,.85,.87]:[.63,.52,.32],this.world[s.tile].terrain===0?1.012:ground(p,this.world[s.tile].terrain===4?1:0)+.004);}
  }
  for(const e of this.state?.events||[]){const age=(this.state.tick-e.tick)+elapsed;if(![1,2,3,4].includes(e.kind)||age>3)continue;const p=this.world[e.tile]?.p;if(!p)continue;const east=norm(cross(p,[0,1,0])),north=cross(p,east),r=(e.kind===2?.06:.025)*Math.min(1,age/2);for(let j=0;j<10;j++){const point=a=>add(mul(p,1.036),add(mul(east,Math.cos(a)*r),mul(north,Math.sin(a)*r)));tri(mul(p,1.04+Math.sin(age/3*Math.PI)*.055),point(j/10*6.283),point((j+1)/10*6.283),e.kind===3?[.39,.8,.72]:[1,.55,.18]);}}
  this.units.update(data);
 }
 updateEffects(now){
  this.projectileBodies=[];const data=[],triangle=(a,b,c,col)=>{for(const p of[a,b,c])data.push(...p,...norm(p),...col);};
  const ribbon=(a,b,width,color)=>{if(Math.hypot(...add(b,mul(a,-1)))<.000001)return;const up=norm(add(a,b)),side=mul(norm(cross(add(b,mul(a,-1)),up)),width);triangle(add(a,side),add(a,mul(side,-1)),add(b,side),color);triangle(add(b,side),add(a,mul(side,-1)),add(b,mul(side,-1)),color);};
  const ring=(p,radius,width,color,height)=>{const east=norm(cross(Math.abs(p[1])>.95?[1,0,0]:[0,1,0],p)),north=cross(p,east),at=(a,r)=>add(mul(p,height),add(mul(east,Math.cos(a)*r),mul(north,Math.sin(a)*r)));for(let j=0;j<36;j++){const a=j/36*6.283,b=(j+1)/36*6.283;triangle(at(a,radius),at(b,radius),at(b,radius-width),color);triangle(at(a,radius),at(b,radius-width),at(a,radius-width),color);}};
  for(const e of this.effects.items){
   if(now>e.end)continue;const a=this.world[e.from]?.p,b=this.world[e.to]?.p;if(!a||!b)continue;
   const age=(now-e.start)/1000,base=t=>this.world[t].terrain===0?1.012:ground(this.world[t].p,this.world[t].terrain===4?1:0)+.018;
   if(e.action==='shot'){
    drawAttack(e,now,{a,b,base,ring,ribbon,triangle,norm,add,mul,mix,cross,model:(name,p,forward,scale)=>{const kind=modelNames.indexOf(name);this.loadModel(kind);this.projectileBodies.push({kind,p,forward,scale,owner:this.state?.squads?.find(u=>u.id===e.unit)?.owner??0});}});
   }else if(e.action==='hit'){
    if(age>.5)continue;
    ring(b,.018+age*.11,.009*(1-age/.5),[1,.43,.16],base(e.to));
    const east=norm(cross(Math.abs(b[1])>.95?[1,0,0]:[0,1,0],b)),north=cross(b,east);
    for(let j=0;j<7;j++){const angle=j*6.283/7+e.id,dir=add(mul(east,Math.cos(angle)),mul(north,Math.sin(angle))),pos=add(mul(b,base(e.to)+Math.sin(Math.min(1,age/.5)*Math.PI)*.04),mul(dir,age*.08));ribbon(pos,add(pos,mul(dir,.009)),.002,[1,.8,.35]);}
   }else{
    const pos=e.action==='move'?b:a,col=e.action==='disband'?[.75,.44,.35]:e.action==='ability'?[.4,.95,.89]:[1,.82,.43];
    ring(pos,.025+Math.min(age,1.6)*.035,.004*Math.max(.2,1-age/3),col,base(e.action==='move'?e.to:e.from));
    if(e.action==='ability'&&e.kind===8&&e.value===0)for(let j=0;j<4;j++)ring(a,.012+j*.009+age*.008,.002,[.56,.85,.92],base(e.from)+age*.015+j*.004);
   }
  }
  this.effectsMesh.update(data);
 }
 drawModels(now){const g=this.gl,elapsed=Math.min(2,(now-(this.receivedAt||now))/1000);
  const draw=(kind,up,forward,radius,scale,owner,flash=0,animation)=>{const mesh=this.models[kind];if(!mesh){this.loadModel(kind);return;}g.uniformMatrix3fv(this.u.modelBasis,false,orientationBasis(up,forward,animation?.flight));g.uniform3fv(this.u.modelOrigin,add(mul(up,radius),forward?mul(norm(forward),animation?.kick||0):[0,0,0]));g.uniform1f(this.u.modelScale,scale);g.uniform1f(this.u.modelFlash,flash);g.uniform3fv(this.u.modelTint,palette[owner]||[.65,.27,.18]);mesh.draw(g.TRIANGLES,this.u,animation);};
  for(const s of this.state?.squads||[]){if(s.boarded_on!=null)continue;
   const {p,forward:stepForward,moving}=this.unitPosition(s,now);
   if(this.rotate(p)[2]<1/this.distance-.12)continue;
   this.headings??=new Map();if(stepForward)this.headings.set(s.id,stepForward);
   const shot=this.effects.items.findLast(e=>e.action==='shot'&&e.unit===s.id&&now<=e.start+e.flight),timing=shot?attackTiming(shot,now):null;
   const target=shot&&this.world[shot.to]?.p,forward=target?add(target,mul(p,-1)):stepForward||this.headings.get(s.id);
   if(target&&Math.hypot(...forward)>.001)this.headings.set(s.id,forward);
   const sea=s.kind>=7&&s.kind<=9,rig=this.models[s.kind]?.rig;
   const radius=s.kind===6?1.085+Math.sin(now*.002+s.id)*.002:sea?(s.kind===8&&s.mode===1?.995:1.004+Math.sin(now*.002+s.id)*.001):ground(p,this.world[s.tile].terrain===4?1:0)+.003;
   const attacking=timing?.active,animation={id:s.id,now,name:attacking?'attack':moving?'walk':'idle',seconds:attacking?timing.progress*(rig?.meta.clips.attack.duration||.4):now/1000+s.id*.37,kick:attacking?Math.sin(timing.progress*Math.PI)*timing.style.kick:0};
   const flash=Math.max(0,...this.effects.items.filter(e=>e.action==='hit'&&e.unit===s.id).map(e=>.85*(1-(now-e.start)/320)));
   draw(s.kind,p,forward,radius,unitScales[s.kind]||.11,s.owner,flash,animation);
  }
  for(const s of this.state?.strikes||[]){const a=this.world[s.from]?.p,b=this.world[s.to]?.p;if(!a||!b)continue;const f=Math.min(1,1-Math.max(0,s.left-elapsed)/s.total);const pose=ballisticPose(a,b,f);draw(s.kind===2?15:14,pose.up,pose.forward,pose.radius,.045,s.owner,0,{name:"idle",seconds:now/1000,flight:true});}
  for(let p=0;p<8;p++)if(this.state?.players[p]?.launch>0){const a=now*.00015+p;draw(16,norm([Math.cos(a),.4*Math.sin(a*.7),Math.sin(a)]),null,1.2,.075,p);}
  for(const projectile of this.projectileBodies||[]){const {kind,p,forward,scale,owner}=projectile;draw(kind,norm(p),forward,Math.hypot(...p),scale,owner,0,{name:'idle',seconds:now/1000,flight:true});}
  g.uniform1f(this.u.modelScale,0);
 }
 frame(now){this.clock=now/1000;const c=this.canvas,g=this.gl;const dpr=Math.min(devicePixelRatio||1,innerWidth<=760?1.4:1.8),w=Math.floor(c.clientWidth*dpr),h=Math.floor(c.clientHeight*dpr);if(c.width!==w||c.height!==h){c.width=w;c.height=h;g.viewport(0,0,w,h);this.targetOffset=this.preview&&innerWidth>760?.24:0;}
  this.controls.update(now);
  if(!this.pointer){this.distance+=(this.targetDistance-this.distance)*.09;this.offset+=(this.targetOffset-this.offset)*.06;}
  if(this.targetFocus){this.yaw+=(this.targetFocus[0]-this.yaw)*.085;this.pitch+=(this.targetFocus[1]-this.pitch)*.085;if(Math.abs(this.yaw-this.targetFocus[0])+Math.abs(this.pitch-this.targetFocus[1])<.001)this.targetFocus=null;}
  else if(this.preview&&!this.pointer&&!this.controls.moving)this.yaw+=.0007;
  this.outlines.begin(w,h);g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(this.program);g.uniform4f(this.u.camera,this.yaw,this.pitch,this.distance,0);g.uniform2f(this.u.viewport,w/h,1);g.uniform1f(this.u.offset,this.offset);g.uniform1f(this.u.time,this.clock);g.uniform1i(this.u.oceanNormal,0);g.uniform1i(this.u.oceanRough,1);g.uniform1i(this.u.fogTexture,2);g.activeTexture(g.TEXTURE4);g.bindTexture(g.TEXTURE_2D,this.terrainTexture);g.uniform1i(this.u.terrainTexture,4);g.uniform1f(this.u.preview,this.preview?1:0);g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,this.fogTexture);g.uniform4fv(this.u['weather[0]'],(this.state?.weather||[[.3,.2,.93,.89],[-.8,.3,.5,.89],[.4,-.3,-.85,.9]]).flat());this.textures.forEach((t,i)=>{g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,t);});
  g.enable(g.DEPTH_TEST);g.disable(g.CULL_FACE);g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.depthMask(false);g.uniform1f(this.u.mode,2);this.air.draw(g.TRIANGLES);g.depthMask(true);g.disable(g.BLEND);g.uniform1f(this.u.mode,0);this.land.draw(g.TRIANGLES);g.enable(g.BLEND);g.depthMask(false);g.uniform1f(this.u.mode,4);this.territories.draw(g.TRIANGLES);g.disable(g.DEPTH_TEST);this.territoryBorders.draw(g.TRIANGLES);g.enable(g.DEPTH_TEST);g.depthMask(true);g.disable(g.BLEND);g.uniform1f(this.u.mode,0);for(const [name,mesh]of this.staticMeshes){mesh.instances=mesh.sway?this.treeGroups.get(name)||[]:this.propInstances.get(name)||[];mesh.draw(this);}this.props.draw(g.TRIANGLES);g.uniform1f(this.u.mode,1);this.lines.draw(g.LINES);this.selection.draw(g.TRIANGLES);this.updateRoutes(now);this.routes.draw(g.LINES);
  g.uniform1f(this.u.mode,0);this.updateUnits(now);this.units.draw(g.TRIANGLES);this.updateEffects(now);this.drawModels(now);g.uniform1f(this.u.mode,1);this.effectsMesh.draw(g.TRIANGLES);g.enable(g.BLEND);g.depthMask(false);g.uniform1f(this.u.mode,3);this.clouds.draw(g.TRIANGLES);g.depthMask(true);
  // A depth-tested player mask uses exactly the same geometry and animation time.
  this.outlines.beginMask();g.useProgram(this.program);g.uniform1f(this.u.mode,0);g.uniform1f(this.u.outline,1);g.uniform1i(this.u.outlineSceneDepth,7);
  for(const mesh of this.staticMeshes.values())if(!mesh.sway)mesh.draw(this,true);
  this.drawModels(now);g.uniform1f(this.u.outline,0);this.outlines.composite(w/c.clientWidth);
  this.onFrame?.(now);requestAnimationFrame(this.frame);
 }
}
