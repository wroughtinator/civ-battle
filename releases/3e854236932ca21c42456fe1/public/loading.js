// Track actual asset transfers and GPU preparation during startup only.
const pending=new Set(),downloads=[];
let failure=null,finished=false,discovered=false,started=performance.now(),lastProgress=started,percent=0;
const element=id=>globalThis.document?.getElementById(id);
export function trackLoad(promise){
 if(finished)return promise;
 pending.add(promise);
 promise.then(()=>pending.delete(promise),error=>{pending.delete(promise);loadingFailed(error);});
 return promise;
}
export async function assetBytes(url){
 const item={loaded:0,total:0,done:false};if(!finished)downloads.push(item);
 const response=await fetch(url);if(!response.ok)throw Error(`Asset unavailable: ${url}`);
 // Encoded Content-Length is not the decoded stream size.
 if(!response.headers.get('Content-Encoding'))item.total=Number(response.headers.get('Content-Length'))||0;
 const chunks=[];const reader=response.body?.getReader();
 if(reader){for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);item.loaded+=value.byteLength;lastProgress=performance.now();}}
 else{const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);item.loaded=bytes.length;}
 item.total=item.loaded;item.done=true;
 const bytes=new Uint8Array(item.loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes.buffer;
}
export async function assetImage(url){
 const blob=new Blob([await assetBytes(url)]),src=URL.createObjectURL(blob),img=new Image();
 try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error(`Texture unavailable: ${url}`));img.src=src;});return img;}
 finally{URL.revokeObjectURL(src);}
}
export async function assetsReady(){
 discovered=true;
 while(pending.size){await Promise.all([...pending]);}
 if(failure)throw failure;
}
function update(){
 if(finished||failure)return;
 const received=downloads.reduce((sum,d)=>sum+d.loaded,0);
 const known=downloads.filter(d=>d.total),average=known.length?known.reduce((sum,d)=>sum+d.total,0)/known.length:262144;
 const total=downloads.reduce((sum,d)=>sum+Math.max(d.loaded,d.total||average),0);
 percent=Math.max(percent,total?Math.min(discovered?95:45,Math.floor(received/total*95)):0);
 const progress=element('loading-progress');if(progress)progress.value=percent;
 if(element('loading-percent'))element('loading-percent').textContent=`${percent}%`;
 const remaining=Math.max(0,total-received),elapsed=(performance.now()-started)/1000;
 const seconds=Math.max(1,Math.ceil(remaining/(received/elapsed))),stalled=performance.now()-lastProgress>10000;
 const text=stalled?'Still loading — waiting for the connection…':remaining&&received&&elapsed>1?`About ${seconds} ${seconds===1?'second':'seconds'} remaining`:percent>=95?'Preparing your globe…':'Estimating time remaining…';
 if(stalled&&element('loading-retry'))element('loading-retry').hidden=false;
 if(element('loading-detail'))element('loading-detail').textContent=text;
}
const timer=globalThis.document?setInterval(update,200):null;
export function loadingStage(text){if(element('loading-title'))element('loading-title').textContent=text;}
export function loadingFailed(error){
 failure=error;clearInterval(timer);loadingStage('Couldn’t load the game');
 if(element('loading-detail'))element('loading-detail').textContent='Check your connection and try again.';
 if(element('loading-retry'))element('loading-retry').hidden=false;
}
export async function finishLoading(){
 await assetsReady();finished=true;clearInterval(timer);
 element('loading-progress').value=100;element('loading-percent').textContent='100%';loadingStage('Ready to play');element('loading-detail').textContent='Your world is ready.';
 const screen=element('loading-screen');screen.classList.add('leaving');
 setTimeout(()=>{screen.remove();for(const child of document.body.children)child.inert=false;document.body.removeAttribute('aria-busy');},matchMedia('(prefers-reduced-motion: reduce)').matches?0:450);
}
if(element('loading-screen')){
 for(const child of document.body.children)if(child.id!=='loading-screen'&&child.tagName!=='SCRIPT')child.inert=true;
 element('loading-retry').onclick=()=>location.reload();
 // Module download and evaluation errors also leave a usable retry screen.
 if(document.querySelector('script[data-game-boot]'))import('./app.js').catch(loadingFailed);
}
