import test from 'node:test';
import assert from 'node:assert/strict';
import {UnitMotion,STEP_LERP_MS} from '../public/movement.js';
const world=[{p:[1,0,0]},{p:[0,1,0]},{p:[0,0,1]}];
test('friendly and path-hidden enemy tile changes animate identically and finish during cooldown',()=>{
 const motion=new UnitMotion(),friend={id:1,owner:0,tile:0,path:[0,1,2],left:0},enemy={id:2,owner:1,tile:0,path:[0],left:0};
 motion.accept([friend,enemy],0);
 friend.tile=enemy.tile=1;friend.path=[1,2];friend.left=8;enemy.path=[1];
 motion.accept([friend,enemy],1000);
 assert.deepEqual(motion.position(friend,world,1000).p,world[0].p);
 const half=motion.position(friend,world,1000+STEP_LERP_MS/2);
 assert.ok(half.moving);assert.ok(half.p[0]>0&&half.p[1]>0);
 assert.deepEqual(half,motion.position(enemy,world,1000+STEP_LERP_MS/2));
 // A stop/duplicate snapshot cannot restart or cancel the committed visual step.
 friend.path=[1];motion.accept([friend,enemy],1050);
 assert.deepEqual(motion.position(friend,world,1180).p,world[1].p);
 assert.equal(motion.position(friend,world,1180).moving,false);
 assert.equal(friend.left,8);
});
test('newly visible units do not animate from hidden history',()=>{
 const motion=new UnitMotion(),u={id:2,tile:0};motion.accept([u],0);motion.accept([],100);u.tile=2;motion.accept([u],200);
 assert.deepEqual(motion.position(u,world,200).p,world[2].p);
 assert.equal(motion.position(u,world,200).moving,false);
});
