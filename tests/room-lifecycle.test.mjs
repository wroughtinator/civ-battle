import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/const (?:engine|legacyEngine|previousEngine|v3Engine) = makeEngine\(.*\);/g,'').replace('export default {','const worker = {').replace('export class Room','class Room')+'\nglobalThis.Room=Room;';
function fixture(){
 const fresh=()=>({players:Array.from({length:3},(_,i)=>({name:`Player ${i}`,civ:i,tag:1000+i,bot:false})),tiles:[],winner:-1,tick:0,seed:42,difficulty:1});
 const simulate=({op,state})=>({state:op==='new'?fresh():state});
 const sandbox={DurableObject:class {},engine:simulate,legacyEngine:simulate,previousEngine:simulate,v3Engine:simulate,crypto,Date,Response,URL,TextEncoder,Uint8Array,Uint32Array};
 vm.runInNewContext(source,sandbox);
 const sockets=Array.from({length:3},(_,slot)=>({readyState:1,messages:[],a:{slot,hash:`hash${slot}`,window:Date.now(),messages:0},deserializeAttachment(){return this.a;},serializeAttachment(a){this.a=a;},send(m){this.messages.push(JSON.parse(m));},close(){this.readyState=3;}}));
 const ctx={storage:{sql:{exec(){}},async setAlarm(){}},getWebSockets:()=>sockets.filter(s=>s.readyState===1),blockConcurrencyWhile:fn=>fn()};
 const room=new sandbox.Room(ctx,{}, {room:{phase:'running',rulesVersion:4,revision:1,updatedAt:Date.now()-2100,game:fresh(),seats:sockets.map((_,i)=>({hash:`hash${i}`,seq:0,acks:[],disconnectedAt:0}))}});
 const send=async(i,type,extra={})=>{await room.webSocketMessage(sockets[i],JSON.stringify({type,seq:room.room.seats[i].seq+1,...extra}));return sockets[i].messages.findLast(m=>m.type==='ack');};
 return {room,sockets,send};
}
test('everyone retains victory until returning; rematch resets once and waits for connected players',async()=>{
 const {room,send}=fixture();room.room.game.winner=1;room.room.game.victory=2;room.advance();
 for(let i=0;i<3;i++)assert.equal(room.view(i).result.player.name,'Player 1');
 assert.equal((await send(1,'lobby')).error,0);
 assert.equal(room.room.phase,'lobby');assert.equal(room.room.game.winner,-1);
 assert.equal(room.view(1).result,null);assert.equal(room.view(0).result.winner,1);
 const restored=new room.constructor(room.ctx,{}, {room:JSON.parse(JSON.stringify(room.room))});assert.equal(restored.view(2).result.winner,1);
 assert.equal((await send(0,'start')).error,1);
 assert.equal((await send(0,'lobby')).error,0);assert.equal((await send(2,'lobby')).error,0);
 assert.equal((await send(0,'start')).error,0);assert.equal(room.room.phase,'running');
});
test('leaving frees a lobby seat, transfers host, revokes old socket and token',async()=>{
 const {room,sockets,send}=fixture();room.room.phase='lobby';
 assert.equal((await send(0,'leave')).error,0);const host=room.hostSlot();assert.ok([1,2].includes(host));assert.equal(room.view(host).host,true);assert.equal(room.view(1).humans,2);assert.equal(room.seatFor('hash0'),-1);
 const response=await room.handleFetch(new Request('https://example.test/api/rooms/abc/join',{method:'POST',body:'{}'}));const joined=await response.json();assert.equal(joined.slot,0);
 assert.equal(room.view(0).result,null);assert.equal(room.hostSlot(),host);
 const restored=new room.constructor(room.ctx,{}, {room:JSON.parse(JSON.stringify(room.room))});assert.equal(restored.hostSlot(),host);
 assert.equal((await send(host,'configure',{difficulty:2})).error,0);assert.equal((await send(3-host,'start')).error,1);assert.equal((await send(host,'start')).error,0);
 await room.webSocketMessage(sockets[0],JSON.stringify({type:'presence',active:true}));assert.equal(room.room.game.players[0].bot,true);
 await room.webSocketClose(sockets[0],1000);assert.equal(room.room.seats[0].seq,0);
});
test('running game leave uses AI and return is rejected before victory',async()=>{
 const {room,send}=fixture();assert.equal((await send(1,'lobby')).error,1);assert.equal((await send(1,'leave')).error,0);assert.equal(room.room.game.players[1].bot,true);assert.equal(room.room.phase,'running');
});

test('closing the host connection transfers a lobby to a connected player',async()=>{
 const {room,sockets,send}=fixture();room.room.phase='lobby';
 sockets[0].readyState=3;await room.webSocketClose(sockets[0],1000);
 const host=room.hostSlot();assert.ok([1,2].includes(host));
 assert.equal(room.view(host).host,true);
 // Returning to the old seat must not take ownership back.
 room.room.seats[0].disconnectedAt=0;assert.equal(room.hostSlot(),host);
 assert.equal((await send(host,'configure',{difficulty:2})).error,0);
 assert.equal((await send(host,'start')).error,0);
});
