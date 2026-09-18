const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Intersect the perspective ray with the globe, then undo the camera rotation.
export function grabPoint(camera,x,y){
 const {canvas,distance:d,offset,yaw,pitch}=camera,r=canvas.getBoundingClientRect(),f=canvas.clientHeight*1.375;
 const u=(x-r.left-canvas.clientWidth*(.5+offset/2))/f,v=-(y-r.top-canvas.clientHeight/2)/f;
 const a=1+u*u+v*v,disc=d*d-a*(d*d-1);
 if(disc<0)return null;
 const t=(d-Math.sqrt(disc))/a,X=u*t,Y=v*t,Z=d-t;
 const py=Math.cos(pitch)*Y+Math.sin(pitch)*Z,pz=-Math.sin(pitch)*Y+Math.cos(pitch)*Z;
 return [Math.cos(yaw)*X-Math.sin(yaw)*pz,py,Math.sin(yaw)*X+Math.cos(yaw)*pz];
}

// Solve against the same perspective projection used by the renderer. A small
// bounded Newton step keeps dragging stable near the silhouette and poles.
export function anchorPoint(camera,point,x,y){
 const r=camera.canvas.getBoundingClientRect();x-=r.left;y-=r.top;
 for(let i=0;i<12;i++){
  const p=camera.project(point),ex=x-p.x,ey=y-p.y;
  if(Math.hypot(ex,ey)<.02)break;
  const eps=.00001,yaw=camera.yaw,pitch=camera.pitch;
  camera.yaw=yaw+eps;const a=camera.project(point);camera.yaw=yaw;
  camera.pitch=pitch+eps;const b=camera.project(point);camera.pitch=pitch;
  const ax=(a.x-p.x)/eps,ay=(a.y-p.y)/eps,bx=(b.x-p.x)/eps,by=(b.y-p.y)/eps,det=ax*by-ay*bx;
  if(Math.abs(det)<.001)break;
  const dyaw=clamp((ex*by-ey*bx)/det,-.12,.12),dpitch=clamp((ey*ax-ex*ay)/det,-.12,.12);
  let improved=false;
  for(let step=1;step>=1/32;step/=2){
   camera.yaw=yaw+dyaw*step;camera.pitch=clamp(pitch+dpitch*step,-1.48,1.48);
   const next=camera.project(point);
   if(Math.hypot(x-next.x,y-next.y)<Math.hypot(ex,ey)){improved=true;break;}
  }
  if(!improved){camera.yaw=yaw;camera.pitch=pitch;break;}
 }
}

export class GlobeControls{
 constructor(camera,surfaces){
  this.camera=camera;this.pointers=new Map();this.velocity=[0,0];this.lastMove=0;this.suppressClick=false;
  for(const surface of surfaces){
   surface.style.touchAction='none';
   surface.addEventListener('pointerdown',e=>this.down(e));
   surface.addEventListener('pointermove',e=>this.move(e));
   surface.addEventListener('pointerup',e=>this.end(e,false));
   surface.addEventListener('pointercancel',e=>this.end(e,true));
   surface.addEventListener('lostpointercapture',e=>this.end(e,true));
   surface.addEventListener('click',e=>{if(this.suppressClick){e.preventDefault();e.stopImmediatePropagation();this.suppressClick=false;}},true);
  }
 }
 center(){const p=[...this.pointers.values()].slice(0,2);return {x:p.reduce((n,v)=>n+v.x,0)/p.length,y:p.reduce((n,v)=>n+v.y,0)/p.length,span:p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0};}
 rebase(time){const c=this.center();this.anchor=this.pointers.size?grabPoint(this.camera,c.x,c.y):null;this.lastMove=time;this.velocity=[0,0];}
 down(e){
  if(e.pointerType==='mouse'&&e.button!==0)return;
  const c=this.camera;this.suppressClick=false;c.targetFocus=null;c.targetDistance=c.distance;
  const p={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false,target:e.target};
  this.pointers.set(e.pointerId,p);c.pointer=p;
  // Capture the stable marker button instead of its SVG child.
  (e.target.closest?.('.marker')||e.currentTarget).setPointerCapture(e.pointerId);
  if(this.pointers.size>1)for(const p of this.pointers.values())p.moved=true;
  this.rebase(e.timeStamp);
 }
 move(e){
  const c=this.camera,p=this.pointers.get(e.pointerId);
  if(!p){if(e.pointerType!=='touch')c.hovered=c.pick(e.clientX,e.clientY);return;}
  const before=this.center();p.x=e.clientX;p.y=e.clientY;
  if(Math.hypot(p.x-p.sx,p.y-p.sy)>8)p.moved=true;
  if(!p.moved)return;
  const after=this.center(),yaw=c.yaw,pitch=c.pitch;
  if(before.span>10&&after.span>10){
   const z=this.anchor?c.rotate(this.anchor)[2]:1;
   c.distance=c.targetDistance=clamp(z+(c.distance-z)*before.span/after.span,1.12,4.8);
  }
  if(this.anchor)anchorPoint(c,this.anchor,after.x,after.y);
  else{
   const scale=(c.distance-1)/(c.canvas.clientHeight*1.375);
   c.yaw+=(after.x-before.x)*scale;c.pitch=clamp(c.pitch+(after.y-before.y)*scale,-1.48,1.48);
   this.anchor=grabPoint(c,after.x,after.y);
  }
  const dt=Math.max(8,e.timeStamp-this.lastMove),blend=1-Math.exp(-dt/35);
  this.velocity=this.velocity.map((v,i)=>v*(1-blend)+clamp(([c.yaw-yaw,c.pitch-pitch][i])/dt,-.006,.006)*blend);
  this.lastMove=e.timeStamp;
 }
 end(e,cancelled){
  const p=this.pointers.get(e.pointerId);if(!p)return;
  this.suppressClick=cancelled||p.moved;
  if(!cancelled&&!p.moved&&p.target===this.camera.canvas){const i=this.camera.pick(e.clientX,e.clientY);if(i>=0)this.camera.onSelect(i);}
  this.pointers.delete(e.pointerId);this.camera.pointer=this.pointers.values().next().value||null;
  if(this.pointers.size)this.rebase(e.timeStamp);
  else if(cancelled||e.timeStamp-this.lastMove>100||!p.moved)this.velocity=[0,0];
 }
 update(now){
  const dt=clamp(now-(this.lastFrame??now),0,64);this.lastFrame=now;
  if(this.pointers.size)return;
  if(this.camera.targetFocus){this.velocity=[0,0];return;}
  const decay=Math.exp(-dt/260),travel=260*(1-decay);
  this.camera.yaw+=this.velocity[0]*travel;
  this.camera.pitch=clamp(this.camera.pitch+this.velocity[1]*travel,-1.48,1.48);
  this.velocity=this.velocity.map(v=>Math.abs(v*decay)<.000005?0:v*decay);
 }
 get moving(){return this.velocity.some(v=>v!==0);}
}
