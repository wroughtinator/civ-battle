// Mask/depth/postprocess architecture: https://threejs.org/docs/pages/OutlinePass.html
// Original WebGL2 implementation: one shared player mask, two bounded dilation passes.
// The horizontal pass carries nearest-edge distance, giving the vertical pass rounded
// Euclidean strokes instead of the square corners produced by a box dilation.
const vertex=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
uniform sampler2D sceneTexture,maskTexture,depthTexture,edgeTexture;
uniform int horizontal;uniform float radius;
out vec4 outColor;
ivec2 bounded(ivec2 p){return clamp(p,ivec2(0),textureSize(maskTexture,0)-1);}
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);float depth=texelFetch(depthTexture,p,0).r;
 float best=100.;vec3 color=vec3(0.);
 if(horizontal==1){
  for(int x=-7;x<=7;x++){
   float d=abs(float(x));if(d>radius+.75||d>=best)continue;
   ivec2 q=bounded(p+ivec2(x,0));vec4 mask=texelFetch(maskTexture,q,0);
   if(mask.a>.5&&texelFetch(depthTexture,q,0).r<=depth+.000001){best=d;color=mask.rgb;}
  }
  outColor=best<99.?vec4(color,1.-best/8.):vec4(0.);return;
 }
 vec4 scene=texelFetch(sceneTexture,p,0);
 if(texelFetch(maskTexture,p,0).a>.5){outColor=scene;return;}
 for(int y=-7;y<=7;y++){
  if(abs(float(y))>radius+.75)continue;
  ivec2 q=bounded(p+ivec2(0,y));vec4 edge=texelFetch(edgeTexture,q,0);
  if(edge.a<=0.)continue;
  float dx=(1.-edge.a)*8.,d=length(vec2(dx,float(y)));
  if(d<best&&texelFetch(depthTexture,q,0).r<=depth+.000001){best=d;color=edge.rgb;}
 }
 float coverage=1.-smoothstep(radius-.75,radius+.75,best);
 outColor=vec4(mix(scene.rgb,color,coverage),max(scene.a,coverage));
}`;

export class OutlinePass {
 constructor(gl){
  this.gl=gl;this.width=0;this.height=0;this.resources=[];
  const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
  this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
  gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.u=Object.fromEntries(['sceneTexture','maskTexture','depthTexture','edgeTexture','horizontal','radius'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
  this.vao=gl.createVertexArray();
 }
 resize(width,height){
  if(this.width===width&&this.height===height)return;
  const g=this.gl;for(const [kind,value]of this.resources)g[kind](value);this.resources=[];this.width=width;this.height=height;
  const texture=(depth=false)=>{
   const t=g.createTexture();this.resources.push(['deleteTexture',t]);g.activeTexture(g.TEXTURE5);g.bindTexture(g.TEXTURE_2D,t);
   g.texImage2D(g.TEXTURE_2D,0,depth?g.DEPTH_COMPONENT24:g.RGBA8,width,height,0,depth?g.DEPTH_COMPONENT:g.RGBA,depth?g.UNSIGNED_INT:g.UNSIGNED_BYTE,null);
   for(const key of[g.TEXTURE_MIN_FILTER,g.TEXTURE_MAG_FILTER])g.texParameteri(g.TEXTURE_2D,key,g.NEAREST);
   for(const key of[g.TEXTURE_WRAP_S,g.TEXTURE_WRAP_T])g.texParameteri(g.TEXTURE_2D,key,g.CLAMP_TO_EDGE);return t;
  };
  const framebuffer=(color,depth)=>{const f=g.createFramebuffer();this.resources.push(['deleteFramebuffer',f]);g.bindFramebuffer(g.FRAMEBUFFER,f);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,color,0);if(depth)g.framebufferTexture2D(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.TEXTURE_2D,depth,0);this.check();return f;};
  this.color=texture();this.depth=texture(true);this.mask=texture();this.maskDepth=texture(true);this.edge=texture();
  this.resolved=framebuffer(this.color,this.depth);this.maskTarget=framebuffer(this.mask,this.maskDepth);this.edgeTarget=framebuffer(this.edge);
  // Preserve scene antialiasing: resolve multisampled color and depth before the mask.
  this.scene=g.createFramebuffer();this.resources.push(['deleteFramebuffer',this.scene]);g.bindFramebuffer(g.FRAMEBUFFER,this.scene);
  const colorSamples=g.getInternalformatParameter(g.RENDERBUFFER,g.RGBA8,g.SAMPLES),depthSamples=g.getInternalformatParameter(g.RENDERBUFFER,g.DEPTH_COMPONENT24,g.SAMPLES);
  const samples=Math.max(0,...Array.from(colorSamples).filter(n=>n<=4&&depthSamples.includes(n)));
  for(const [format,attachment]of[[g.RGBA8,g.COLOR_ATTACHMENT0],[g.DEPTH_COMPONENT24,g.DEPTH_ATTACHMENT]]){const r=g.createRenderbuffer();this.resources.push(['deleteRenderbuffer',r]);g.bindRenderbuffer(g.RENDERBUFFER,r);g.renderbufferStorageMultisample(g.RENDERBUFFER,samples,format,width,height);g.framebufferRenderbuffer(g.FRAMEBUFFER,attachment,g.RENDERBUFFER,r);}
  this.check();
 }
 check(){if(this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER)!==this.gl.FRAMEBUFFER_COMPLETE)throw Error('Outline render target incomplete');}
 begin(width,height){const g=this.gl;this.resize(width,height);g.bindFramebuffer(g.FRAMEBUFFER,this.scene);g.activeTexture(g.TEXTURE7);g.bindTexture(g.TEXTURE_2D,this.depth);g.depthMask(true);g.depthFunc(g.LESS);}
 beginMask(){
  const g=this.gl;g.bindFramebuffer(g.READ_FRAMEBUFFER,this.scene);g.bindFramebuffer(g.DRAW_FRAMEBUFFER,this.resolved);
  g.blitFramebuffer(0,0,this.width,this.height,0,0,this.width,this.height,g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT,g.NEAREST);
  g.bindFramebuffer(g.FRAMEBUFFER,this.maskTarget);g.clearColor(0,0,0,0);g.depthMask(true);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.disable(g.BLEND);g.enable(g.DEPTH_TEST);g.depthFunc(g.LESS);
  g.activeTexture(g.TEXTURE7);g.bindTexture(g.TEXTURE_2D,this.depth);
 }
 composite(pixelRatio){
  const g=this.gl;g.disable(g.DEPTH_TEST);g.disable(g.BLEND);g.useProgram(this.program);g.bindVertexArray(this.vao);
  for(const [i,name,t]of[[5,'sceneTexture',this.color],[6,'maskTexture',this.mask],[7,'depthTexture',this.depth],[8,'edgeTexture',this.edge]]){g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,t);g.uniform1i(this.u[name],i);}
  g.uniform1f(this.u.radius,Math.min(6,3*pixelRatio));g.uniform1i(this.u.horizontal,1);
  // Avoid sampling a texture attached to the currently bound framebuffer.
  g.activeTexture(g.TEXTURE8);g.bindTexture(g.TEXTURE_2D,this.mask);
  g.bindFramebuffer(g.FRAMEBUFFER,this.edgeTarget);g.drawArrays(g.TRIANGLES,0,3);
  g.bindFramebuffer(g.FRAMEBUFFER,null);g.bindTexture(g.TEXTURE_2D,this.edge);g.uniform1i(this.u.horizontal,0);g.drawArrays(g.TRIANGLES,0,3);
  g.depthMask(true);g.depthFunc(g.LESS);
 }
 dispose(){const g=this.gl;for(const [kind,value]of this.resources)g[kind](value);this.resources=[];g.deleteProgram(this.program);g.deleteVertexArray(this.vao);}
}
