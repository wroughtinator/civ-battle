import test from 'node:test';
import assert from 'node:assert/strict';
import {iconNames} from '../public/icons.js';
import {manualEntries,unitDetails} from '../public/manual-data.js';
import {EventTimeline,actionSymbol} from '../public/feedback.js';
import {abilities} from '../public/planning.js';

test('every icon and every unit action has a manual entry and a feedback symbol',()=>{
 for(const key of iconNames){assert.ok(manualEntries[key]?.[0]);assert.ok(manualEntries[key]?.[1].length>30,key);}
 for(let kind=0;kind<14;kind++)for(const a of abilities(kind))assert.ok(manualEntries[actionSymbol({action:'ability',kind,value:a.value})]);
 assert.match(manualEntries.settle[1],/four hex steps/);
 assert.match(manualEntries.settle[1],/45 seconds/);
});

test('authoritative presentation events deduplicate, survive repeated snapshots, and skip stale replays',()=>{
 const timeline=new EventTimeline(),cue={id:10,tick:100,action:'shot',duration:2,from:1,to:2,kind:2};
 assert.equal(timeline.accept({seed:1,tick:100,feedback:[cue]},1000).length,1);
 assert.equal(timeline.items[0].flight,2000);
 assert.equal(timeline.accept({seed:1,tick:101,feedback:[cue]},2000).length,0);
 assert.equal(timeline.accept({seed:1,tick:110,feedback:[{...cue,id:11}]},10000).length,0);
 assert.equal(timeline.accept({seed:2,tick:100,feedback:[cue]},11000).length,1);
});
