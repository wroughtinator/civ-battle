import test from 'node:test';
import assert from 'node:assert/strict';
import {iconNames} from '../public/icons.js';
import {manualEntries,unitDetails} from '../public/manual-data.js';
import {EventTimeline,FeedbackLayer,actionSymbol,pickupSymbols} from '../public/feedback.js';
import {abilities} from '../public/planning.js';

test('every icon and every unit action has a manual entry and a feedback symbol',()=>{
 for(const key of iconNames){assert.ok(manualEntries[key]?.[0]);assert.ok(manualEntries[key]?.[1].length>30,key);}
 for(let kind=0;kind<36;kind++)for(const a of abilities(kind))assert.ok(manualEntries[actionSymbol({action:'ability',kind,value:a.value})]);
 assert.match(manualEntries.settle[1],/four hex steps/);
 assert.match(manualEntries.settle[1],/25 seconds/);
});

test('authoritative presentation events deduplicate, survive repeated snapshots, and skip stale replays',()=>{
 const timeline=new EventTimeline(),cue={id:10,tick:100,action:'shot',duration:2,from:1,to:2,kind:2};
 assert.equal(timeline.accept({seed:1,tick:100,feedback:[cue]},1000).length,1);
 assert.equal(timeline.items[0].flight,2000);
 assert.equal(timeline.accept({seed:1,tick:101,feedback:[cue]},2000).length,0);
 assert.equal(timeline.accept({seed:1,tick:110,feedback:[{...cue,id:11}]},10000).length,0);
 assert.equal(timeline.accept({seed:2,tick:100,feedback:[cue]},11000).length,1);
});

test('pickup rewards use only known symbols and stay visible for four seconds',()=>{
 for(let value=0;value<10;value++)for(const symbol of pickupSymbols({value,amount:20}))assert.ok(iconNames.includes(symbol),symbol);
 assert.deepEqual(pickupSymbols({value:7,amount:0}),['coin']);
 const timeline=new EventTimeline(),state={seed:1,tick:10,feedback:[{id:1,tick:10,action:'pickup',value:1,amount:35}]};
 assert.equal(timeline.accept(state,1000)[0].end,5000);
 assert.equal(timeline.accept(state,2000).length,0);
});

test('pickup and damage feedback show exact amounts, owner outlines, rise and expire',()=>{
 const previous=globalThis.document;
 const node=()=>({children:[],style:{setProperty(k,v){this[k]=v;}},setAttribute(){},append(child){this.children.push(child);},remove(){this.removed=true;}});
 globalThis.document={createElement:node,body:node()};
 try{
  const layer=new FeedbackLayer({pickup(){},play(){}});
  const state={seed:1,tick:10,feedback:[{id:1,tick:10,action:'pickup',owner:0,to:0,amount:102},{id:2,tick:10,action:'hit',owner:1,to:0,amount:17}]};
  layer.accept(state);layer.accept(state);assert.equal(layer.nodes.length,2);
  const [gold,damage]=layer.nodes;
  assert.match(gold.el.innerHTML,/data-icon="coin"/);assert.equal(gold.el.children[0].textContent,'+102');
  assert.equal(damage.el.style['--player-outline'],'#f23d3d66');
  assert.equal(damage.el.textContent,'−17');
  const globe={world:[{p:[0,0,1]}],project:()=>({visible:true,x:100,y:200})};
  layer.update(gold.e.start,globe);const top=parseFloat(gold.el.style.top);
  layer.update(gold.e.start+3700,globe);assert.ok(parseFloat(gold.el.style.top)<top);assert.ok(gold.el.style.opacity<1);
  layer.update(gold.e.start+4100,globe);assert.equal(layer.nodes.length,0);assert.ok(gold.el.removed);
 }finally{globalThis.document=previous;}
});
