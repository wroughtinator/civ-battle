import test from 'node:test';
import assert from 'node:assert/strict';
import {Globe} from '../public/globe.js';
import {GlobeControls,grabPoint,anchorPoint} from '../public/globe-controls.js';
function setup(distance=3.15){
 const canvas={clientWidth:390,clientHeight:844,style:{},getBoundingClientRect:()=>({left:12,top:30}),addEventListener(){},setPointerCapture(){}};
 const camera=Object.assign(Object.create(Globe.prototype),{canvas,yaw:.15,pitch:.18,offset:0,distance,targetDistance:distance,world:[],onSelect(){throw Error('Drag selected a tile');}});
 const controls=new GlobeControls(camera,[canvas]);
 const event=(id,x,y,time)=>({pointerId:id,clientX:x,clientY:y,timeStamp:time,pointerType:'touch',target:canvas,currentTarget:canvas});
 return {camera,controls,event};
}
for(const distance of [1.12,1.5,3.15,4.8])test(`finger anchor follows projection at distance ${distance}`,()=>{
 const {camera}=setup(distance),point=grabPoint(camera,217,442);
 anchorPoint(camera,point,252,472);
 const projected=camera.project(point);
 assert.ok(Math.hypot(projected.x+12-252,projected.y+30-472)<.05);
});
test('pinch scales immediately, pans its midpoint, and continues with one finger',()=>{
 const {camera:c,controls:g,event:e}=setup();
 g.down(e(1,167,452,0));g.down(e(2,247,452,1));
 const anchor=g.anchor,depth=c.distance-c.rotate(anchor)[2];
 g.move(e(2,287,472,20));
 assert.equal(c.distance,c.targetDistance);
 assert.ok(Math.abs((c.distance-c.rotate(anchor)[2])/depth-80/Math.hypot(120,20))<.01);
 let p=c.project(anchor);assert.ok(Math.hypot(p.x+12-227,p.y+30-462)<.05);
 g.end(e(2,287,472,22),false);
 const next=g.anchor;g.move(e(1,187,467,42));p=c.project(next);
 assert.ok(Math.hypot(p.x+12-187,p.y+30-467)<.05);
 g.end(e(1,187,467,44),false);assert.equal(c.pointer,null);assert.ok(g.moving);
 const yaw=c.yaw;g.update(44);g.update(60);assert.notEqual(c.yaw,yaw);
 for(let t=76;t<3000;t+=16)g.update(t);assert.equal(g.moving,false);
});
test('cancel never selects or flings and keeps remaining finger active',()=>{
 const {camera:c,controls:g,event:e}=setup();
 g.down(e(1,190,440,0));g.down(e(2,230,440,1));g.move(e(2,250,460,20));
 g.end(e(2,250,460,21),true);assert.ok(c.pointer);assert.equal(g.moving,false);
 g.end(e(1,190,440,22),true);assert.equal(c.pointer,null);assert.equal(g.moving,false);
});
test('holding still before release stops momentum; new touch stops a fling',()=>{
 const {controls:g,event:e}=setup();
 g.down(e(1,200,450,0));g.move(e(1,230,460,20));g.end(e(1,230,460,200),false);assert.equal(g.moving,false);
 g.down(e(1,200,450,210));g.move(e(1,230,460,230));g.end(e(1,230,460,240),false);assert.ok(g.moving);
 g.down(e(2,200,450,260));assert.equal(g.moving,false);
});
test('drag starting outside the globe stays finite and rotates',()=>{
 const {camera:c,controls:g,event:e}=setup(4.8);const yaw=c.yaw;
 g.down(e(1,15,35,0));g.move(e(1,35,55,20));assert.notEqual(c.yaw,yaw);assert.ok(Number.isFinite(c.pitch));
});
