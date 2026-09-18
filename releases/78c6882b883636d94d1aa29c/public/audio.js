// A bounded Web Audio mixer. Every event comes from the authenticated player's view.
export class Soundscape {
 constructor(){this.enabled=localStorage.getItem('meridian:muted')!=='1';this.ready=false;this.voices=0;this.loops={};this.lastCue=new Map();this.lastMix=0;this.seen=new Set();}
 async unlock(){if(!this.enabled)return;try{
  if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=.55;const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;this.master.connect(limiter).connect(this.ctx.destination);}
  await this.ctx.resume();if(this.loading||this.ready)return;
  this.loading=true;const [manifest,response]=await Promise.all([fetch('/releases/78c6882b883636d94d1aa29c/assets/audio/cues.json').then(r=>r.json()),fetch('/releases/78c6882b883636d94d1aa29c/assets/audio/game-audio.mp3')]);this.cues=manifest;this.buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());this.ready=true;
  for(const name of ['ocean','land','rain']){const cue=this.cues[name],src=this.ctx.createBufferSource(),gain=this.ctx.createGain(),filter=this.ctx.createBiquadFilter();src.buffer=this.buffer;src.loop=true;src.loopStart=cue.start;src.loopEnd=cue.start+cue.duration;gain.gain.value=0;filter.type='lowpass';filter.frequency.value=6500;src.connect(filter).connect(gain).connect(this.master);src.start(0,cue.start);this.loops[name]={gain,filter};}
 }catch(e){this.loading=false;console.warn('Audio unavailable',e);}}
 toggle(){this.enabled=!this.enabled;localStorage.setItem('meridian:muted',this.enabled?'0':'1');if(this.master)this.master.gain.setTargetAtTime(this.enabled?.55:0,this.ctx.currentTime,.1);if(this.enabled){this.unlock();this.play('confirm',.25);}return this.enabled;}
 play(name,volume=.35,pan=0,rate=1){if(!this.enabled||!this.ready||document.hidden||this.voices>=12)return;const now=this.ctx.currentTime,cue=this.cues[name];if(!cue||now-(this.lastCue.get(name)||-99)<.07)return;this.lastCue.set(name,now);const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),panner=this.ctx.createStereoPanner();source.buffer=this.buffer;source.playbackRate.value=rate;gain.gain.value=volume;panner.pan.value=Math.max(-1,Math.min(1,pan));source.connect(gain).connect(panner).connect(this.master);source.start(0,cue.start,cue.duration);this.voices++;source.onended=()=>{this.voices--;source.disconnect();gain.disconnect();panner.disconnect();};}
 pickup(){
  if(!this.enabled||!this.ctx||document.hidden||this.ctx.state!=='running'||this.voices>=12)return;
  const now=this.ctx.currentTime;
  if(now-(this.lastCue.get('pickup')??-99)<.1)return;
  this.lastCue.set('pickup',now);
  // A soft ascending major arpeggio, with a bell-like octave shimmer.
  for(const [i,hz] of [523.25,659.25,783.99,1046.5].entries()){
   const osc=this.ctx.createOscillator(),gain=this.ctx.createGain(),start=now+i*.085;
   osc.type='sine';osc.frequency.value=hz;
   gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.17,start+.008);gain.gain.exponentialRampToValueAtTime(.001,start+.65);
   osc.connect(gain).connect(this.master);osc.start(start);osc.stop(start+.7);this.voices++;
   osc.onended=()=>{this.voices--;osc.disconnect();gain.disconnect();};
  }
 }
 command(kind,value){const sounds={move:'order',stop:'click',ability:'launch',upgrade:'engine',march:'order',build:'engine',research:'confirm',train:'engine',maneuver:'order',strike:value===2?'warning':'launch',satellite:'launch',start:'confirm',configure:'click',civ:'click'};this.play(sounds[kind]||'click',kind==='strike'?.36:.24,0,kind==='train'?.85:1);}
 events(state,previous,world,globe,slot){if(!previous||previous.phase!=='running')return;
  for(const e of state.events||[]){if(state.feedback&&[1,2].includes(e.kind))continue;const key=`${e.tick}:${e.kind}:${e.tile}:${e.player}`;if(this.seen.has(key)||e.tick<=previous.tick-2)continue;this.seen.add(key);if(this.seen.size>300)this.seen.delete(this.seen.values().next().value);const p=globe.project(world[e.tile].p),global=e.kind===6||e.kind===9;const own=e.player===slot;
   if(!p.visible&&!global&&!own)continue;
   const volume=global?.42:own?.24:.14,pan=p.x/globe.canvas.clientWidth*2-1;
   this.play(e.kind===9?'nuclear':e.kind===6?'warning':e.kind>=7||e.kind===1||e.kind===2?'impact':e.kind>=4?'launch':'confirm',volume,pan);
  }
  const p=state.players[slot],old=previous.players[slot];if(old.research>=0&&p.research<0)this.play('confirm',.33,0,1.3);
  if(state.tiles.some((t,i)=>t.owner===slot&&previous.tiles[i]?.work>0&&t.work===0&&t.building))this.play('confirm',.22,0,.85);
  if(state.phase==='ended'&&previous.phase!=='ended')this.play('confirm',.4,0,.7);
 }
 mix(globe,state,now){if(!this.ready||now-this.lastMix<180)return;this.lastMix=now;const t=this.ctx.currentTime;if(document.hidden){this.master.gain.setTargetAtTime(0,t,.1);return;}this.master.gain.setTargetAtTime(this.enabled?.55:0,t,.15);let sea=0,land=0,storm=0,total=0;
  for(let i=0;i<globe.world.length;i++){const p=globe.rotate(globe.world[i].p),weight=Math.max(0,p[2]-.82)**3;if(!weight)continue;total+=weight;if(globe.world[i].terrain===0)sea+=weight;else land+=weight;storm+=(state?.tiles[i]?.storm||0)*weight;}
  const close=Math.max(.15,Math.min(1,(4.1-globe.distance)/2.6));if(total){this.loops.ocean.gain.gain.setTargetAtTime(sea/total*.42*close,t,.7);this.loops.land.gain.gain.setTargetAtTime(land/total*.2*close,t,.7);this.loops.rain.gain.gain.setTargetAtTime(storm/total*.38*close,t,.7);for(const loop of Object.values(this.loops))loop.filter.frequency.setTargetAtTime(1200+close*5200,t,.6);}
 }
}
