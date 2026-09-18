import test from 'node:test';
import assert from 'node:assert/strict';
import {Soundscape} from '../public/audio.js';

function storage(t,descriptor){
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,...descriptor});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
}

test('blocked storage access does not abort audio initialization or mute controls',t=>{
 storage(t,{get(){throw new DOMException('Access denied','SecurityError');}});
 const sound=new Soundscape();
 assert.equal(sound.enabled,true);
 assert.equal(sound.toggle(),false);
 let resumed=false;
 sound.unlock=()=>{resumed=true;};
 assert.equal(sound.toggle(),true);
 assert.equal(resumed,true);
});

test('failed preference writes still update the active mixer',t=>{
 storage(t,{value:{getItem:()=>null,setItem(){throw new DOMException('Storage full','QuotaExceededError');}}});
 const sound=new Soundscape();let gain;
 sound.ctx={currentTime:2};
 sound.master={gain:{setTargetAtTime(value){gain=value;}}};
 assert.equal(sound.toggle(),false);
 assert.equal(gain,0);
});

test('available storage preserves and updates the mute preference',t=>{
 const values=new Map([['meridian:muted','1']]);
 storage(t,{value:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}});
 const sound=new Soundscape();sound.unlock=()=>{};
 assert.equal(sound.enabled,false);
 assert.equal(sound.toggle(),true);
 assert.equal(values.get('meridian:muted'),'0');
 assert.equal(sound.toggle(),false);
 assert.equal(values.get('meridian:muted'),'1');
});
