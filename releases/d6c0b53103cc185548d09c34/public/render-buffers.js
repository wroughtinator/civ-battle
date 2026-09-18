// Persistent staging/GPU storage for meshes that change during play.
export class Mesh {
 constructor(gl,retain=true){
  this.gl=gl;this.retain=retain;this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();this.count=0;this.capacity=0;this.packed=new Float32Array(0);
  gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  for(let i=0;i<4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,48,i*12);}
 }
 update(data){
  const g=this.gl,length=data.length/9*12;this.count=data.length/9;
  if(!length)return;
  g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);
  if(length>this.capacity){this.capacity=Math.max(length,Math.ceil(this.capacity*1.5));this.packed=new Float32Array(this.capacity);g.bufferData(g.ARRAY_BUFFER,this.packed.byteLength,g.DYNAMIC_DRAW);}
  const packed=this.packed,materials=data.materials;
  for(let i=0,j=0;i<data.length;i+=9,j+=12){
   for(let k=0;k<9;k++)packed[j+k]=data[i+k];
   packed[j+9]=materials?materials[i/3]:1;packed[j+10]=materials?materials[i/3+1]:0;packed[j+11]=materials?materials[i/3+2]:0;
  }
  g.bufferSubData(g.ARRAY_BUFFER,0,packed.subarray(0,length));
  // Large immutable terrain meshes do not need a second copy on the CPU.
  if(!this.retain){this.packed=new Float32Array(0);this.capacity=0;}
 }
 updateChunks(chunks){
  const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0);this.count=length/12;
  if(!length)return;
  const g=this.gl;g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);
  if(length>this.capacity){this.capacity=Math.max(length,Math.ceil(this.capacity*1.5));this.packed=new Float32Array(this.capacity);g.bufferData(g.ARRAY_BUFFER,this.packed.byteLength,g.DYNAMIC_DRAW);}
  let offset=0;for(const chunk of chunks){this.packed.set(chunk,offset);offset+=chunk.length;}
  g.bufferSubData(g.ARRAY_BUFFER,0,this.packed.subarray(0,length));
 }
 draw(mode){if(!this.count)return;this.gl.bindVertexArray(this.vao);this.gl.drawArrays(mode,0,this.count);}
}

// Every unit shares one annulus. Only its origin, radius and color change.
export class UnitRings {
 constructor(gl){
  this.gl=gl;this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();this.instances=gl.createBuffer();this.capacity=0;this.data=new Float32Array(0);this.count=0;
  const vertices=[];
  for(let j=0;j<32;j++){
   const a=j/32*Math.PI*2,b=(j+1)/32*Math.PI*2;
   for(const [angle,r] of [[a,1],[b,1],[b,.87],[a,1],[b,.87],[a,.87]])vertices.push(Math.cos(angle)*r,0,Math.sin(angle)*r);
  }
  gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);
  for(const [loc,size,offset] of [[7,4,0],[8,4,16],[9,3,32]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,44,offset);gl.vertexAttribDivisor(loc,1);}
 }
 reset(){this.count=0;}
 add(p,r,color,height){
  const offset=this.count*11;
  if(offset+11>this.data.length){const next=new Float32Array(Math.max(11*128,this.data.length*2));next.set(this.data);this.data=next;}
  const d=this.data;d[offset]=p[0]*height;d[offset+1]=p[1]*height;d[offset+2]=p[2]*height;d[offset+3]=0;
  d[offset+4]=r;d[offset+5]=1;d[offset+6]=r;d[offset+7]=1;d[offset+8]=color[0];d[offset+9]=color[1];d[offset+10]=color[2];this.count++;
 }
 draw(globe){
  if(!this.count)return;const g=this.gl;
  g.bindVertexArray(this.vao);g.bindBuffer(g.ARRAY_BUFFER,this.instances);
  if(this.data.length>this.capacity){this.capacity=this.data.length;g.bufferData(g.ARRAY_BUFFER,this.data.byteLength,g.DYNAMIC_DRAW);}
  g.bufferSubData(g.ARRAY_BUFFER,0,this.data.subarray(0,this.count*11));
  g.vertexAttrib3f(1,0,1,0);g.vertexAttrib3f(2,1,1,1);g.vertexAttrib3f(3,1,0,0);
  g.uniform1f(globe.u.foliage,4);g.drawArraysInstanced(g.TRIANGLES,0,192,this.count);g.uniform1f(globe.u.foliage,0);
 }
}

// Only fields consumed by static scenery/territory geometry belong here.
// Store a value snapshot: callers may mutate a state object between updates.
export function sceneryKey(state,preview){
 return JSON.stringify([preview,(state.tiles||[]).map(t=>[t.owner,t.visible,t.explored,t.building,t.city]),
  (state.cities||[]).map(c=>[c.tile,c.owner,c.expansion_tiles]),(state.players||[]).map(p=>p.civ),
  (state.discoveries||[]).map(d=>[d.tile,d.kind,d.used])]);
}
