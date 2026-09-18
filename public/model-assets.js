// Offline-converted CC0 models. No glTF parser or animation framework in the bundle.
export function parseRig(buffer) {
 const view=new DataView(buffer),size=view.getUint32(0,true);
 const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,size)));
 if(meta.version!==1||meta.bones.length>32||meta.vertices%3)throw Error('Unsupported rig');
 const start=4+size,end=start+meta.vertices*24;
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
 constructor(gl,buffer){
  this.gl=gl;this.rig=parseRig(buffer);this.pose=new Float32Array(32*16);this.states=new Map();
  this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.rig.vertices,gl.STATIC_DRAW);
  for(const [location,size,type,normalized,offset] of [[0,3,gl.SHORT,true,0],[1,3,gl.SHORT,true,6],[2,3,gl.UNSIGNED_BYTE,true,12],[4,4,gl.UNSIGNED_BYTE,false,16],[5,4,gl.UNSIGNED_BYTE,true,20]]){
   gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,type,normalized,24,offset);
  }
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
  g.uniform1f(uniforms.skinned,1);g.uniformMatrix4fv(uniforms['bones[0]'],false,this.pose);g.bindVertexArray(this.vao);g.vertexAttrib3f(3,1,2,0);g.drawArrays(mode,0,this.rig.meta.vertices);g.uniform1f(uniforms.skinned,0);
 }
}

export class Woodland {
 constructor(gl,buffer,texture){
  this.gl=gl;this.texture=texture;this.count=buffer.byteLength/20;this.instances=[];
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
   // Thin the distant forest; nearby canopies retain every authored branch.
   if(globe.distance>2.3&&i%3!==0)continue;
   visible.push(...instance);
  }
  if(!visible.length)return;
  g.uniform1f(globe.u.foliage,1);g.activeTexture(g.TEXTURE3);g.bindTexture(g.TEXTURE_2D,this.texture);g.uniform1i(globe.u.treeTexture,3);
  g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.instanceBuffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(visible),g.DYNAMIC_DRAW);g.vertexAttrib3f(2,1,1,1);g.vertexAttrib3f(3,1,4,0);g.drawArraysInstanced(g.TRIANGLES,0,this.count,visible.length/8);g.uniform1f(globe.u.foliage,0);
 }
}
