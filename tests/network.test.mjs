import test from 'node:test';
import assert from 'node:assert/strict';
const server=(process.env.BASE_URL||'http://127.0.0.1:8793').replace(/\/$/,'');
// Use the current release like a real browser. Unversioned sockets intentionally
// target the bootstrap rules and must not attach to newly pinned rooms.
const base=server.includes('/releases/')?server:server+(await fetch(server+'/api/health').then(r=>r.json())).clientPath.replace(/\/$/,'');
async function post(path,body={}){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,...await r.json()};}
function client(room,token){
 const ws=new WebSocket(base.replace(/^http/,'ws')+`/api/rooms/${room}/ws`,['meridian',token]);const messages=[];const waiters=[];
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);messages.push(m);for(const w of [...waiters])if(w.filter(m)){waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}});
 return {ws,messages,wait(filter,from=0){const found=messages.slice(from).find(filter);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={filter,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('Timed out waiting for server message'));},15000)};waiters.push(w);});},send(m){const from=messages.length;ws.send(JSON.stringify(m));return this.wait(x=>x.type==='ack'&&x.seq===m.seq,from);}};
}
test('authoritative eight-seat lobby, private views, replay safety, reconnect and tick delivery',async()=>{
 const created=await post('/api/rooms',{seed:12345,count:8,difficulty:1});assert.equal(created.status,201);assert.match(created.token,/^[a-f0-9]{64}$/);
 const host=client(created.room,created.token);await host.wait(x=>x.type==='welcome');const initial=await host.wait(x=>x.type==='state');assert.equal(initial.host,true);assert.equal(initial.tiles.length,642);
 assert.equal(initial.rules.tactics,true);assert.equal(initial.cities.length,8);assert.equal(initial.players[0].gold,170);assert.equal(initial.players[1].gold,undefined);assert.equal(initial.squads.filter(u=>u.owner===0).length,3);
 const guestSeat=await post(`/api/rooms/${created.room}/join`);const guest=client(created.room,guestSeat.token);await guest.wait(x=>x.type==='welcome');const guestView=await guest.wait(x=>x.type==='state');assert.equal(guestView.host,false);assert.equal(guestView.players[0].gold,undefined);assert.equal(typeof guestView.players[1].gold,'number');
 const intruder=await fetch(base+`/api/rooms/${created.room}/ws`);assert.equal(intruder.status,400);
 assert.equal((await guest.send({type:'start',seq:1})).error,1);
 for(let i=2;i<8;i++)assert.equal((await post(`/api/rooms/${created.room}/join`)).slot,i);
 assert.equal((await post(`/api/rooms/${created.room}/join`)).status,409);
 assert.equal((await host.send({type:'start',seq:1})).error,0);
 const running=await host.wait(x=>x.type==='state'&&x.phase==='running');
 const capital=host.messages.find(x=>x.type==='welcome').world.findIndex(t=>t.capital===0);
 const foreign=host.messages.find(x=>x.type==='welcome').world.findIndex(t=>t.capital===1);
 assert.equal(running.tiles[foreign].owner,-2);assert.equal(running.players[1].unlocked,undefined);
 assert.equal((await host.send({type:'command',kind:'upgrade',from:foreign,value:1,player:1,seq:2})).error,3);
 const build={type:'command',kind:'upgrade',from:capital,value:1,seq:3};assert.equal((await host.send(build)).error,0);
 const afterBuild=await host.wait(x=>x.type==='state'&&x.cities.find(c=>c.tile===capital)?.production===2);const gold=afterBuild.players[0].gold;
 assert.equal((await host.send(build)).error,0);
 const reconnectStart=await post(`/api/rooms/${created.room}/join`,{token:created.token});assert.equal(reconnectStart.slot,0);assert.equal(reconnectStart.seq,3);
 const restored=client(created.room,created.token);const welcome=await restored.wait(x=>x.type==='welcome');assert.equal(welcome.seq,3);
 const restoredState=await restored.wait(x=>x.type==='state');assert.equal(restoredState.cities.find(c=>c.tile===capital).production,2);assert.ok(restoredState.players[0].gold>=gold);assert.ok(restoredState.players[0].gold<gold+20);
 assert.equal((await post(`/api/rooms/${created.room}/join`,{token:'0'.repeat(64)})).status,409);
 const ticked=await restored.wait(x=>x.type==='state'&&x.tick>=2);assert.ok(ticked.tick>=2);
 const at=restored.messages.length;restored.ws.send(JSON.stringify({type:'command',kind:'build',from:capital,value:4,seq:50}));const resync=await restored.wait(x=>x.type==='resync',at);assert.equal(resync.seq,3);
 for(const c of [host,guest,restored])c.ws.close();
});
test('reject cross-origin writes and malformed rooms',async()=>{
 const r=await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);
 assert.equal((await post('/api/rooms/not-a-room/join')).status,404);
 assert.equal((await fetch(base+'/api/health')).status,200);
 assert.equal((await post('/api/rooms',null)).status,400);
});

test('research goals reach authority, allow immediate replacement and keep rival queues private',async t=>{
 const made=await post('/api/rooms',{seed:42,count:2});
 const joined=await post(`/api/rooms/${made.room}/join`);
 const host=client(made.room,made.token),guest=client(made.room,joined.token);
 t.after(()=>{host.ws.close();guest.ws.close();});
 await Promise.all([host.wait(m=>m.type==='welcome'),guest.wait(m=>m.type==='welcome')]);
 assert.equal((await host.send({type:'start',seq:1})).error,0);
 const running=await host.wait(m=>m.type==='state'&&m.phase==='running');
 assert.equal(running.rules.specs.length,36);assert.equal(running.rules.order_interval,0);
 assert.equal((await host.send({type:'command',kind:'plan',value:3,seq:2})).error,0);
 assert.equal((await host.send({type:'command',kind:'plan',value:10,seq:3})).error,0);
 const planned=await host.wait(m=>m.type==='state'&&m.players[0].research_queue?.includes(3));
 const rival=await guest.wait(m=>m.type==='state'&&m.revision>=planned.revision);
 assert.equal(rival.players[0].research_queue,undefined);
 assert.equal((await host.send({type:'command',kind:'plan',value:255,seq:4})).error,0);
 const stopped=await host.wait(m=>m.type==='state'&&m.revision>planned.revision&&m.players[0].research_queue?.length===0);
 assert.equal(stopped.players[0].research,-1,'cancellation stops active research too');
});
test('simultaneous invitations cannot overbook the eight-player lobby',async()=>{
 const host=await post('/api/rooms',{seed:42,count:8});
 const joins=await Promise.all(Array.from({length:12},()=>post(`/api/rooms/${host.room}/join`)));
 const accepted=joins.filter(x=>x.status===200);assert.equal(accepted.length,7);assert.equal(new Set(accepted.map(x=>x.slot)).size,7);assert.equal(joins.filter(x=>x.status===409).length,5);
});
test('configurable seats and live Unicode names survive regeneration and reconnect',async t=>{
 const made=await post('/api/rooms',{seed:43,count:2,name:'Mighty Mango',difficulty:2});
 const host=client(made.room,made.token);t.after(()=>host.ws.close());
 await host.wait(m=>m.type==='welcome');const first=await host.wait(m=>m.type==='state');
 assert.equal(first.players.length,2);assert.equal(first.players[0].name,'Mighty Mango');assert.equal(first.players[1].name,'Computer 2');
 const joined=await post(`/api/rooms/${made.room}/join`,{name:'Cosmic Kiwi'});
 const guest=client(made.room,joined.token);t.after(()=>guest.ws.close());await guest.wait(m=>m.type==='welcome');
 const name='<b>🌍</b>'+ '🥭'.repeat(40);const expected=Array.from(name).slice(0,32).join('');
 const cursor=host.messages.length;
 assert.equal((await guest.send({type:'civ',civ:5,name,seq:1})).error,0);
 const changed=await host.wait(m=>m.type==='state'&&m.players[1].name===expected,cursor);
 assert.equal(Array.from(changed.players[1].name).length,32);assert.equal(changed.players[1].civ,5);
 assert.equal((await host.send({type:'configure',count:6,seed:321,difficulty:0,seq:1})).error,0);
 const reset=await guest.wait(m=>m.type==='state'&&m.seed===321);
 assert.equal(reset.players.length,6);assert.equal(reset.players[1].name,expected);assert.equal(reset.difficulty,0);
 const reconnect=await post(`/api/rooms/${made.room}/join`,{token:joined.token});assert.equal(reconnect.slot,1);assert.equal(reconnect.seq,1);
 assert.equal((await host.send({type:'start',seq:2})).error,0);
 assert.equal((await guest.send({type:'civ',civ:0,name:'Changed during play',seq:2})).error,6);
 assert.equal((await guest.send({type:'command',kind:'research',value:999,seq:3})).error,6);
 assert.equal((await guest.send({type:'command',kind:'research',value:3,seq:4})).error,6);
});

test('hidden tabs hand control to AI and returning or reconnecting humans reclaim their seat',async t=>{
 const made=await post('/api/rooms',{seed:6201,name:'Presence Test'});const host=client(made.room,made.token);t.after(()=>host.ws.close());await host.wait(m=>m.type==='welcome');await host.wait(m=>m.type==='state');
 const watcherSeat=await post(`/api/rooms/${made.room}/join`,{name:'Observer'});const watcher=client(made.room,watcherSeat.token);t.after(()=>watcher.ws.close());await watcher.wait(m=>m.type==='welcome');await watcher.wait(m=>m.type==='state');
 assert.equal((await host.send({type:'start',seq:1})).error,0);
 let cursor=host.messages.length;host.ws.send(JSON.stringify({type:'presence',active:false}));const away=await host.wait(m=>m.type==='state'&&m.players[0].bot,cursor);assert.equal(away.connected[0],false);
 cursor=host.messages.length;host.ws.send(JSON.stringify({type:'presence',active:true}));const back=await host.wait(m=>m.type==='state'&&!m.players[0].bot,cursor);assert.equal(back.connected[0],true);assert.equal(back.players[0].name,'Presence Test');
 const joined=await post(`/api/rooms/${made.room}/join`); // Running lobbies do not admit new seats.
 assert.equal(joined.status,409);
 cursor=host.messages.length;host.ws.send(JSON.stringify({type:'presence',active:false}));await host.wait(m=>m.type==='state'&&m.players[0].bot,cursor);
 cursor=host.messages.length;host.ws.send(JSON.stringify({type:'ping',time:Date.now(),active:true}));const resumed=await host.wait(m=>m.type==='state'&&!m.players[0].bot,cursor);assert.equal(resumed.connected[0],true);
 cursor=watcher.messages.length;host.ws.close();const disconnected=await watcher.wait(m=>m.type==='state'&&m.players[0].bot,cursor);assert.equal(disconnected.connected[0],false);
 const again=client(made.room,made.token);t.after(()=>again.ws.close());await again.wait(m=>m.type==='welcome');const restored=await again.wait(m=>m.type==='state');assert.equal(restored.players[0].bot,false);assert.equal(restored.connected[0],true);
});

test('two humans can start alone on a full globe, resizing never removes joined humans',async t=>{
 for(const count of [0,1,9,2.5,'2',null])assert.equal((await post('/api/rooms',{count})).status,400);
 const made=await post('/api/rooms',{seed:42,count:2,difficulty:2,name:'Duel Host'});
 assert.equal(made.status,201);
 const host=client(made.room,made.token);t.after(()=>host.ws.close());
 const welcome=await host.wait(m=>m.type==='welcome');const initial=await host.wait(m=>m.type==='state');
 assert.equal(initial.players.length,2);assert.equal(initial.tiles.length,642);assert.equal(initial.cities.length,2);assert.deepEqual(initial.rules.victory_modes,['conquest','space']);
 const capitals=welcome.world.filter(t=>t.capital>=0);assert.equal(capitals.length,2);
 const separation=Math.acos(capitals[0].p.reduce((sum,v,i)=>sum+v*capitals[1].p[i],0));
 assert.ok(separation<Math.PI/2,'neighbouring starts should be on the same hemisphere');
 const joined=await post(`/api/rooms/${made.room}/join`,{name:'Duel Guest'});assert.equal(joined.slot,1);
 const guest=client(made.room,joined.token);t.after(()=>guest.ws.close());await guest.wait(m=>m.type==='welcome');
 const both=await guest.wait(m=>m.type==='state'&&m.humans===2);assert.ok(both.players.every(p=>!p.bot));
 assert.equal((await post(`/api/rooms/${made.room}/join`)).status,409);
 assert.equal((await guest.send({type:'configure',count:8,seq:1})).error,1);
 for(const [i,count] of [1,9,2.5].entries())assert.equal((await host.send({type:'configure',count,seq:i+1})).error,6);
 assert.equal((await host.send({type:'configure',count:3,seq:4})).error,0);
 const bigger=await guest.wait(m=>m.type==='state'&&m.players.length===3);
 assert.equal(bigger.difficulty,2);assert.equal(bigger.players[1].name,'Duel Guest');assert.equal(bigger.players[2].bot,true);
 assert.equal((await host.send({type:'configure',count:2,seq:5})).error,0);
 const smaller=await guest.wait(m=>m.type==='state'&&m.players.length===2&&m.revision>bigger.revision);
 assert.ok(smaller.players.every(p=>!p.bot));
 assert.equal((await host.send({type:'start',seq:6})).error,0);
 const running=await guest.wait(m=>m.type==='state'&&m.phase==='running'&&m.tick>=2);
 assert.equal(running.players.length,2);assert.ok(running.players.every(p=>!p.bot));
 assert.equal(running.players[0].gold,undefined);assert.equal(typeof running.players[1].gold,'number');
 assert.equal((await host.send({type:'configure',count:8,seq:7})).error,1);
 const rejoin=await post(`/api/rooms/${made.room}/join`,{token:joined.token});assert.equal(rejoin.slot,1);
 const reconnected=client(made.room,joined.token);t.after(()=>reconnected.ws.close());await reconnected.wait(m=>m.type==='welcome');
 const restored=await reconnected.wait(m=>m.type==='state');assert.equal(restored.players.length,2);assert.equal(restored.players[1].name,'Duel Guest');

 // A full three-human lobby cannot be shrunk to two, even by its host.
 const trio=await post('/api/rooms',{seed:42,count:3});
 await Promise.all([post(`/api/rooms/${trio.room}/join`),post(`/api/rooms/${trio.room}/join`)]);
 const trioHost=client(trio.room,trio.token);t.after(()=>trioHost.ws.close());await trioHost.wait(m=>m.type==='welcome');await trioHost.wait(m=>m.type==='state');
 assert.equal((await trioHost.send({type:'configure',count:2,seq:1})).error,6);
});
