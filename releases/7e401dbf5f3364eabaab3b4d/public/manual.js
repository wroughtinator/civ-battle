import {icon,iconNames} from './icons.js';
import {manualEntries,unitDetails,contextDetails} from './manual-data.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class Manual {
 constructor(root,context){
  this.root=root;this.context=context;this.backdrop=document.createElement('div');this.backdrop.className='manual-backdrop hidden';document.body.append(this.backdrop);this.backdrop.onclick=()=>this.close();this.opened=false;this.picking=false;this.selected='book';
  document.addEventListener('pointerdown',e=>{this.down=[e.clientX,e.clientY];},true);
  // Native disabled buttons do not dispatch clicks consistently. Pointer-up inspection
  // and a capture-phase click shield make them inspectable without issuing commands.
  document.addEventListener('pointerup',e=>{
   if(!this.picking||this.root.contains(e.target))return;
   if(this.down&&Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])>9)return;
   const button=e.target.closest('button'),symbol=e.target.closest('[data-icon],[data-help]')||button?.querySelector('[data-icon]');
   if(symbol){e.preventDefault();e.stopImmediatePropagation();this.ignoreClick=true;this.open(symbol.dataset.icon||symbol.dataset.help,button?.getAttribute('aria-label')||symbol.closest('[aria-label]')?.getAttribute('aria-label')||'');setTimeout(()=>this.ignoreClick=false,400);}
  },true);
  document.addEventListener('click',e=>{if(this.ignoreClick||this.picking&&!this.root.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{
   if(!this.opened)return;
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.close();}
   if(e.key==='Tab'&&!this.picking){const nodes=[...this.root.querySelectorAll('button,input')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  },true);
 }
 open(key=this.selected,context=''){
  if(!this.opened)this.returnFocus=document.activeElement;
  this.opened=true;this.backdrop.classList.remove('hidden');this.picking=false;this.selected=manualEntries[key]?key:'book';this.detailContext=context;
  document.body.classList.remove('manual-picking');this.root.classList.remove('hidden','picking');this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');
  this.root.innerHTML=`<div class="manual-head"><div>${icon('book')}<strong>Field manual</strong></div><button id="manual-close" aria-label="Close manual">${icon('close')}</button></div><div class="manual-tools"><button id="manual-pick">${icon('eye')}Pick an icon in the game</button><input id="manual-search" type="search" placeholder="Search icons or rules" aria-label="Search manual"></div><article id="manual-detail" aria-live="polite"></article><div class="manual-catalog" aria-label="Icon catalogue"></div>`;
  this.root.querySelector('#manual-close').onclick=()=>this.close();this.root.querySelector('#manual-pick').onclick=()=>this.pick();
  this.root.querySelector('#manual-search').oninput=e=>this.catalog(e.target.value);
  this.catalog('');this.detail();this.root.querySelector('#manual-close').focus({preventScroll:true});
 }
 detail(){const [title,body]=manualEntries[this.selected],extra=unitDetails(this.selected,this.context().state),context=contextDetails(this.detailContext);this.root.querySelector('#manual-detail').innerHTML=`<h2>${icon(this.selected)}${escape(title)}</h2>${this.detailContext?`<p class="manual-context">${escape(this.detailContext)}</p>`:''}${context?`<p>${escape(context)}</p>`:''}<p>${escape(body)}</p>${extra?`<p class="manual-stats">${escape(extra)}</p>`:''}`;}
 catalog(query){const q=query.trim().toLowerCase(),keys=iconNames.filter(k=>[k,...manualEntries[k]].join(' ').toLowerCase().includes(q)),grid=this.root.querySelector('.manual-catalog');grid.innerHTML=keys.length?keys.map(k=>`<button data-entry="${k}" aria-label="Explain ${escape(manualEntries[k][0])}" aria-pressed="${k===this.selected}">${icon(k)}<span>${escape(manualEntries[k][0])}</span></button>`).join(''):'<p>No matching icons. Try “settle”, “move” or “health”.</p>';grid.querySelectorAll('button').forEach(b=>b.onclick=()=>{this.selected=b.dataset.entry;this.detailContext='';this.detail();grid.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',n===b));this.root.querySelector('#manual-detail').scrollIntoView({block:'nearest'});});}
 pick(){this.backdrop.classList.add('hidden');this.picking=true;document.body.classList.add('manual-picking');this.root.classList.add('picking');this.root.setAttribute('aria-modal','false');this.root.innerHTML=`<p>${icon('book')}Tap any icon—even a disabled action.</p><div><button id="manual-back">Browse manual</button><button id="manual-close" aria-label="Close manual">${icon('close')}</button></div>`;this.root.querySelector('#manual-back').onclick=()=>this.open();this.root.querySelector('#manual-close').onclick=()=>this.close();}
 close(){this.backdrop.classList.add('hidden');this.opened=false;this.picking=false;this.root.classList.add('hidden');document.body.classList.remove('manual-picking');if(this.returnFocus?.isConnected)this.returnFocus.focus({preventScroll:true});}
}
