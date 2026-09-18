import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('streamed images decode through a URL allowed by the production image policy',async t=>{
 const {assetImage}=await import('../public/loading.js');
 const headers=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
 const allowed=headers.match(/img-src\s+([^;]+)/)[1].split(/\s+/);
 const bytes=new Uint8Array([137,80,78,71]);let requests=0;
 t.mock.method(globalThis,'fetch',async()=>{requests++;return new Response(bytes);});
 for(const name of ['FileReader','Image']){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 }
 globalThis.FileReader=class {
  readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{this.result='data:application/octet-stream;base64,'+Buffer.from(buffer).toString('base64');this.onload();});}
 };
 globalThis.Image=class {
  set src(value){this.url=value;queueMicrotask(()=>allowed.includes(new URL(value).protocol)?this.onload():this.onerror());}
 };
 const image=await assetImage('/texture.png');
 assert.deepEqual(Buffer.from(image.url.split(',')[1],'base64'),Buffer.from(bytes));
 assert.equal(requests,1,'decoding does not download the image again');
});

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
