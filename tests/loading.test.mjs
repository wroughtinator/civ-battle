import test from 'node:test';
import assert from 'node:assert/strict';

test('asset bytes preserve streamed chunks even without a length header',async t=>{
 const {assetBytes}=await import('../public/loading.js');
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3,4,5]));c.close();}})));
 assert.deepEqual([...new Uint8Array(await assetBytes('/asset'))],[1,2,3,4,5]);
});
test('HTTP asset failures reject instead of decoding an error page',async t=>{
 const {assetBytes}=await import('../public/loading.js');
 t.mock.method(globalThis,'fetch',async()=>new Response('Missing',{status:404}));
 await assert.rejects(assetBytes('/missing'),/Asset unavailable/);
});
test('readiness waits for work discovered by another loading task',async()=>{
 const {trackLoad,assetsReady}=await import('../public/loading.js?nested');
 let release,done=false;
 trackLoad(Promise.resolve().then(()=>{trackLoad(new Promise(resolve=>release=()=>{done=true;resolve();}));}));
 const ready=assetsReady();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(done,false);release();await ready;assert.equal(done,true);
});
test('a caught renderer asset failure still prevents startup readiness',async()=>{
 const {trackLoad,assetsReady}=await import('../public/loading.js?failure');
 await trackLoad(Promise.reject(Error('Texture failed'))).catch(()=>{});
 await assert.rejects(assetsReady(),/Texture failed/);
});
