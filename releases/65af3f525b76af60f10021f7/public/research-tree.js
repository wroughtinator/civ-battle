import {roster,units} from './roster.js';

// Positions follow the prerequisite graph; each era contains several discovery steps.
export function researchTreeMarkup(player,icon){
 const techs=units.filter(u=>u.researchable).sort((a,b)=>a.tree[0]-b.tree[0]||a.tree[1]-b.tree[1]),queue=player.research_queue||[];
 const point=k=>{const [column,row]=units[k].tree;return {x:54+column*152,y:96+row*94};};
 const ancestors=k=>new Set(units[k].prerequisites.flatMap(p=>[p,...ancestors(p)]));
 const links=techs.flatMap(u=>u.prerequisites.filter(p=>!u.prerequisites.some(q=>q!==p&&ancestors(q).has(p))).map(p=>{
  const a=point(p),b=point(u.id),lit=queue.includes(u.id)||player.research===u.id;
  return `<path class="${lit?'planned':player.unlocked.includes(u.id)?'complete':''}" d="M ${a.x+76} ${a.y+34} C ${a.x+114} ${a.y+34}, ${b.x-38} ${b.y+34}, ${b.x} ${b.y+34}"/>`;
 })).join('');
 return `<div class="tree-scroll" aria-label="Research tree; tap empty space to cancel research"><div class="research-map">
 ${roster.eras.map((e,i)=>`<section class="research-era" style="left:${i*456}px;--era:${e.color}" aria-label="${e.name}"><div class="research-era-heading">${icon(e.icon)}<span>${i+1}</span></div></section>`).join('')}
 <svg class="research-links" viewBox="0 0 1430 770" aria-hidden="true">${links}</svg>
 ${techs.map(u=>{
  const k=u.id,done=player.unlocked.includes(k),busy=player.research===k,queued=queue.includes(k),a=point(k);
  const status=done?'Researched; cancel research':busy?'Researching; restart research':queued?'Queued; research toward':'Research toward';
  const progress=busy?1-player.research_left/u.research_seconds:0;
  return `<button data-tech="${k}" class="tree-node ${done?'done':busy?'studying':queued?'queued':''}" style="left:${a.x}px;top:${a.y}px;--progress:${progress*100}%" aria-label="${status} ${u.name}" aria-pressed="${busy||queued}">${icon(u.icon)}<span>${done?icon('check'):busy?icon('flask')+player.research_left:queued?icon('hourglass'):icon('coin')+u.research_cost}</span>${busy?'<i class="research-progress"></i>':''}</button>`;
 }).join('')}</div></div>`;
}
