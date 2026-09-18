import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {captureRelease,verifyArchives,stageReleases,retainPublished} from '../scripts/releases.mjs';
import {pinnedRoomClass} from '../worker/pinned-room.js';
import {createGateway} from '../worker/routing.js';

const A='a'.repeat(24),B='b'.repeat(24);
function context(db=new DatabaseSync(':memory:')) {
 return {db,storage:{sql:{exec(sql,...args){return db.prepare(sql).all(...args);}}},blockConcurrencyWhile:async fn=>fn()};
}
class Base {}
function rules(version) {
 return class {
  constructor(ctx,env,loaded){this.ctx=ctx;this.room=loaded.room;}
  save(){this.ctx.storage.sql.exec('INSERT INTO room(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(this.room));}
  async fetch(request){if(new URL(request.url).pathname==='/init'){this.room={rulesVersion:4,gold:100,tick:0};this.save();}return Response.json({version,...this.room});}
  async webSocketMessage(ws){this.room.gold-=version;this.room.tick++;this.save();ws.push(version);}
  async webSocketClose(ws){ws.push('close'+version);}
  async webSocketError(ws){ws.push('error'+version);}
  async alarm(){this.room.tick+=version;this.save();}
 };
}
const releases={[A]:{Room:rules(1),files:['index.html','app.js','legacy/index.html'],headers:{}},[B]:{Room:rules(20),files:['index.html','app.js'],headers:{}}};
const init=id=>new Request('https://game.test/init',{method:'POST',headers:{'X-Meridian-Release':id}});

test('room rules, commands, alarms and reconnects stay pinned after a deployment and cold start',async()=>{
 const ctx=context(), Old=pinnedRoomClass(Base,{[A]:releases[A]},A);
 const room=new Old(ctx,{});await room.fetch(init(A));const messages=[];
 await room.webSocketMessage(messages);
 const New=pinnedRoomClass(Base,releases,A), restored=new New(ctx,{});
 await restored.alarm();await restored.webSocketMessage(messages);
 const response=await (await restored.fetch(new Request('https://game.test/ws'))).json();
 assert.deepEqual(messages,[1,1]);assert.equal(response.gold,98);assert.equal(response.tick,3);assert.equal(response.version,1);
 assert.equal((await (await restored.fetch(new Request('https://game.test/release'))).json()).release,A);
 const fresh=new New(context(),{});await fresh.fetch(init(B));await fresh.alarm();
 assert.equal((await (await fresh.fetch(new Request('https://game.test/ws'))).json()).tick,20);
 const wrong=new Request('https://game.test/ws',{headers:{'X-Meridian-Release':B}});
 assert.equal((await restored.fetch(wrong)).status,409);
 await restored.webSocketClose(messages);await restored.webSocketError(messages);assert.deepEqual(messages.slice(-2),['close1','error1']);
});

test('pre-release lobbies and running games retain their existing state; unknown releases fail closed',async()=>{
 for(const phase of ['lobby','running','ended']) {
  const ctx=context();ctx.storage.sql.exec('CREATE TABLE room (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
  const original={rulesVersion:3,phase,gold:37,tick:521};
  ctx.storage.sql.exec('INSERT INTO room(id,data) VALUES(1,?)',JSON.stringify(original));
  const New=pinnedRoomClass(Base,releases,A),room=new New(ctx,{});
  const meta=await (await room.fetch(new Request('https://game.test/release'))).json();
  assert.deepEqual(meta,{release:A,clientPath:`/releases/${A}/legacy/`});
  assert.deepEqual(JSON.parse([...ctx.storage.sql.exec('SELECT data FROM room')][0].data),original);
  const Missing=pinnedRoomClass(Base,{[B]:releases[B]},B),broken=new Missing(ctx,{});
  await assert.rejects(broken.ready,/Missing immutable/);
 }
});

test('refresh and invitation URLs resolve the pinned client; new homepages choose latest',async()=>{
 const calls=[];
 const env={ROOMS:{idFromName:id=>id,get:id=>({async fetch(r){calls.push({id,path:new URL(r.url).pathname,release:r.headers.get('X-Meridian-Release')});return Response.json({release:A,clientPath:`/releases/${A}/`});}})},ASSETS:{fetch:async r=>new Response(new URL(r.url).pathname)}};
 const gateway=createGateway({releases,current:B,bootstrap:A,catalog:{}});
 const get=path=>gateway.fetch(new Request('https://game.test'+path),env);
 assert.equal((await get('/')).headers.get('Location'),`/releases/${B}/`);
 assert.equal((await get('/?room='+'1'.repeat(20))).headers.get('Location'),`/releases/${A}/?room=${'1'.repeat(20)}`);
 assert.equal((await get(`/releases/${B}/?room=${'1'.repeat(20)}`)).headers.get('Location'),`/releases/${A}/?room=${'1'.repeat(20)}`);
 assert.equal(await (await get(`/releases/${A}/?room=${'1'.repeat(20)}`)).text(),`/releases/${A}/`);
 assert.equal(await (await get('/app.js')).text(),`/releases/${A}/app.js`);
 assert.equal((await get('/releases/'+ 'c'.repeat(24)+'/app.js')).status,404);
 assert.equal((await get(`/releases/${A}/missing.js`)).status,404);
 await gateway.fetch(new Request(`https://game.test/releases/${B}/api/rooms`,{method:'POST',body:'{}'}),env);
 assert.equal(calls.at(-1).release,B);
 assert.equal(calls.at(-1).path,'/init');
 await gateway.fetch(new Request('https://game.test/api/rooms',{method:'POST',body:'{}'}),env);
 assert.equal(calls.at(-1).release,B); // even old clients must create on latest
 assert.equal((await gateway.fetch(new Request(`https://game.test/releases/${B}/api/rooms`,{method:'POST',headers:{Origin:'https://other.test'},body:'{}'}),env)).status,403);
});

test('packaging is deterministic, freezes all client URLs, shares engines, and rejects archive loss or tampering',t=>{
 const root=mkdtempSync(join(tmpdir(),'meridian-release-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const dir of ['public','worker'])mkdirSync(join(root,dir));
 writeFileSync(join(root,'public/_headers'),readFileSync(new URL('../public/_headers',import.meta.url)));
 writeFileSync(join(root,'public/index.html'),'<script type="module" src="/app.js"></script>');
 writeFileSync(join(root,'public/app.js'),"import './globe.js';fetch('/engine.wasm');fetch(`/api/rooms`);const ws=`${location.host}/api/rooms/id/ws`;location.assign('/');");
 writeFileSync(join(root,'public/globe.js'),"fetch('/assets/tank.mesh')");
 writeFileSync(join(root,'public/engine.wasm'),Buffer.from([0,97,115,109]));
 writeFileSync(join(root,'worker/engine.wasm'),Buffer.from([0,97,115,109]));
 writeFileSync(join(root,'worker/index.js'),"import wasm from './engine.wasm';export class Room {}");
 const first=captureRelease(root,root,{bootstrap:true});assert.equal(captureRelease(root,root),first);
 const archived=readFileSync(join(root,'releases',first,'public/app.js'),'utf8');
 assert.match(archived,/import '\.\/globe.js'/);assert.match(archived,new RegExp(`/releases/${first}/engine.wasm`));
 assert.match(archived,new RegExp(`/releases/${first}/api/rooms`));assert.match(archived,/location.assign\('\/'\)/);
 writeFileSync(join(root,'public/app.js'),"fetch('/api/rooms'); // changed client");
 const second=captureRelease(root,root);assert.notEqual(second,first);
 const catalog=stageReleases(root);assert.equal(catalog.current,second);assert.equal(catalog.bootstrap,first);
 // Streamed textures become data images; the packaged policy must permit them.
 const headers=JSON.parse(readFileSync(join(root,'releases',second,'release.json'))).headers;
 const policy=headers['Content-Security-Policy'];
 const directive=name=>policy.split(';').map(s=>s.trim().split(/\s+/)).find(parts=>parts[0]===name).slice(1);
 assert.ok(directive('img-src').includes('data:'),'startup textures require data: images');
 assert.ok(!directive('script-src').includes('data:'),'data access stays limited to images and styles');
 retainPublished(catalog,{...catalog,releases:{[first]:catalog.releases[first]}});
 assert.throws(()=>retainPublished({...catalog,releases:{[second]:catalog.releases[second]}},catalog),/Refusing to remove/);
 writeFileSync(join(root,'releases',first,'public/app.js'),'tampered');
 assert.throws(()=>verifyArchives(root),/Immutable release changed/);
});

test('checked-in releases remain complete and immutable',()=>{verifyArchives(process.cwd());});
