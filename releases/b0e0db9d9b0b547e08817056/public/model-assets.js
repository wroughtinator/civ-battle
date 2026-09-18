// Asset Forge packed rigid rigs and instanced props. No runtime glTF dependency.
import {units} from './roster.js';
export const modelNames=[...units.map(u=>u.model),'missile','nuke','satellite','arrow','shell','mortar','bullet','bomb','torpedo','rocket','aircraft'];
export const treeNames=['tree-oak','tree-pine','tree-birch'];
export function orientationBasis(up,forward,flight=false){
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=p=>p.map(v=>v/Math.hypot(...p));
 let vertical=up,east=norm(cross(Math.abs(up[1])>.98?[1,0,0]:[0,1,0],up)),north=cross(up,east);
 if(forward&&Math.hypot(...forward)>.00001){const dot=forward.reduce((s,v,i)=>s+v*up[i],0),tangent=forward.map((v,i)=>v-up[i]*dot);if(Math.hypot(...tangent)>.00001){north=norm(tangent);east=norm(cross(up,north));}if(flight){north=norm(forward);const right=cross(up,north);if(Math.hypot(...right)>.00001)east=norm(right);vertical=norm(cross(north,east));}}
 return [...east,...vertical,...north];
}
export async function loadTexture(gl,name,unit=3){
 const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error(`Texture unavailable: ${name}`));img.src=`/releases/b0e0db9d9b0b547e08817056/assets/forge/${name}.png`;});
 const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return texture;
}
export function parseRig(buffer) {
 if(buffer.byteLength<8)throw Error('Truncated rig');
 const view=new DataView(buffer),size=view.getUint32(0,true);
 if(size>buffer.byteLength-4)throw Error('Truncated rig header');
 const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,size)));
 if(![1,2].includes(meta.version)||!meta.bones.length||meta.bones.length>32||!Number.isInteger(meta.vertices)||meta.vertices<3||meta.vertices%3)throw Error('Unsupported rig');
 const stride=meta.version===2?28:24,start=4+size,end=start+meta.vertices*stride;
 if(end>buffer.byteLength||end%4||(buffer.byteLength-end)%4)throw Error('Truncated rig vertices');
 meta.stride=stride;
 const frames=new Float32Array(buffer,end);
 for(const clip of Object.values(meta.clips))if(clip.frames<2||clip.duration<=0||clip.offset+clip.frames*meta.bones.length*16>frames.length)throw Error('Invalid animation');
 return {meta,vertices:new Uint8Array(buffer,start,end-start),frames};
}

export function sampleRig(rig,name,seconds,out,loop=true) {
 const clip=rig.meta.clips[name]||rig.meta.clips.idle,stride=rig.meta.bones.length*16;
 const phase=loop?((seconds%clip.duration)+clip.duration)%clip.duration:Math.max(0,Math.min(clip.duration,seconds));
 const frame=phase/clip.duration*(clip.frames-1),a=Math.floor(frame),b=Math.min(a+1,clip.frames-1),mix=frame-a;
 for(let i=0;i<stride;i++){const x=rig.frames[clip.offset+a*stride+i];out[i]=x+(rig.frames[clip.offset+b*stride+i]-x)*mix;}
 return out;
}

export class RiggedMesh {
 constructor(gl,buffer,texture){
  this.gl=gl;this.texture=texture;this.rig=parseRig(buffer);this.pose=new Float32Array(32*16);this.states=new Map();
  this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.rig.vertices,gl.STATIC_DRAW);
  for(const [location,size,type,normalized,offset] of [[0,3,gl.SHORT,true,0],[1,3,gl.SHORT,true,6],[2,3,gl.UNSIGNED_BYTE,true,12],[4,4,gl.UNSIGNED_BYTE,false,16],[5,4,gl.UNSIGNED_BYTE,true,20]]){
   gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,type,normalized,this.rig.meta.stride,offset);
  }
  if(this.rig.meta.version===2){gl.enableVertexAttribArray(6);gl.vertexAttribPointer(6,2,gl.UNSIGNED_SHORT,true,28,24);}
 }
 draw(mode,uniforms,animation={name:'idle',seconds:0}){
  const g=this.gl;sampleRig(this.rig,animation.name,animation.seconds,this.pose,animation.name!=='attack');
  // A short crossfade prevents the run/idle pose from popping at tile arrivals.
  if(animation.id!==undefined){
   let state=this.states.get(animation.id);
   if(!state){state={name:animation.name,last:new Float32Array(this.pose),from:null,start:0};this.states.set(animation.id,state);}
   if(state.name!==animation.name){state.name=animation.name;state.from=new Float32Array(state.last);state.start=animation.now;}
   const blend=Math.min(1,(animation.now-state.start)/80);
   if(state.from&&blend<1)for(let i=0;i<this.pose.length;i++)this.pose[i]=state.from[i]*(1-blend)+this.pose[i]*blend;
   state.last.set(this.pose);
  }
  if(this.texture){g.activeTexture(g.TEXTURE3);g.bindTexture(g.TEXTURE_2D,this.texture);g.uniform1i(uniforms.treeTexture,3);}
  g.uniform1f(uniforms.skinned,1);g.uniformMatrix4fv(uniforms['bones[0]'],false,this.pose);g.bindVertexArray(this.vao);g.vertexAttrib3f(3,1,this.texture?4:2,0);g.drawArrays(mode,0,this.rig.meta.vertices);g.uniform1f(uniforms.skinned,0);
 }
}

export class Woodland {
 constructor(gl,buffer,texture,sway=true){
  if(buffer.byteLength%60)throw Error('Invalid instanced mesh');
  this.gl=gl;this.texture=texture;this.count=buffer.byteLength/20;this.instances=[];this.sway=sway;
  this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();this.instanceBuffer=gl.createBuffer();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,buffer,gl.STATIC_DRAW);
  for(const [loc,size,type,offset] of [[0,3,gl.SHORT,0],[1,3,gl.SHORT,6],[6,2,gl.UNSIGNED_SHORT,16]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,type,true,20,offset);}
  gl.bindBuffer(gl.ARRAY_BUFFER,this.instanceBuffer);
  for(const loc of [7,8]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,4,gl.FLOAT,false,32,(loc-7)*16);gl.vertexAttribDivisor(loc,1);}
 }
 draw(globe){
  const g=this.gl,visible=[];
  for(let i=0;i<this.instances.length;i++){
   const instance=this.instances[i],p=instance.slice(0,3),v=globe.rotate(p);
   if(v[2]<1/globe.distance-.10)continue;
   visible.push(...instance);
  }
  if(!visible.length)return;
  g.uniform1f(globe.u.foliage,this.sway?1:2);g.activeTexture(g.TEXTURE3);g.bindTexture(g.TEXTURE_2D,this.texture);g.uniform1i(globe.u.treeTexture,3);
  g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.instanceBuffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(visible),g.DYNAMIC_DRAW);g.vertexAttrib3f(2,1,1,1);g.vertexAttrib3f(3,1,4,0);g.drawArraysInstanced(g.TRIANGLES,0,this.count,visible.length/8);g.uniform1f(globe.u.foliage,0);
 }
}
