// Authored low-poly silhouettes for the three-era expansion. All parts and
// articulated animation tracks are baked by the existing Rust Asset Forge.
export function authorEraModels(Model,human,wheels,vehicleClips){
 for(const name of ['slinger','pikeman','herbalist','musketeer','medic']){
  const m=new Model(name),early=['slinger','pikeman','herbalist'].includes(name);human(m,early?8:name==='medic'?7:4);
  if(early){const helmet=m.parts.find(p=>p.name==='helmet');helmet.size=[.22,.035,.21];helmet.material=0;helmet.color=[123,91,55];}
  if(name==='slinger'){
   m.add('sling-strap',[0,-.20,.18],[.018,.43,.018],8,{parent:'right-arm',rotation:[35,0,0]});m.add('stone',[0,-.43,.18],[.09,.08,.07],10,{parent:'right-arm'});m.add('stone-bag',[-.16,-.18,.05],[.18,.19,.15],8,{parent:'body'});
   m.animations=m.animations.filter(c=>c.name!=='attack');m.clip('attack',.6,[['right-arm',[[0,[-30,0,30]],[.2,[-170,0,40]],[.4,[-250,0,20]],[.6,[-390,0,30]]]]]);
  }
  if(name==='pikeman'){
   m.cyl('shaft',[0,.03,.12],[.028,1.3,.028],0,{parent:'right-arm',rotation:[30,0,0],segments:5});m.cyl('point',[0,.73,0],[.09,.22,.05],6,{parent:'shaft',taper:.02,segments:4});m.add('round-shield',[0,-.18,.10],[.24,.29,.05],13,{parent:'left-arm'});
  }
  if(name==='herbalist'){
   m.add('satchel',[-.18,-.13,.02],[.17,.25,.16],8,{parent:'body'});m.cyl('staff',[0,-.1,.07],[.025,.95,.025],0,{parent:'right-arm',segments:5});
   for(const [i,x,y]of[[0,0,.42],[1,.08,.34],[2,-.08,.34]])m.add('leaf'+i,[x,y,0],[.12,.19,.025],2,{parent:'staff',rotation:[0,0,x*250]});
  }
  if(name==='musketeer'){
   m.add('hat-brim',[0,.13,0],[.38,.035,.33],5,{parent:'head'});m.add('hat',[0,.23,0],[.22,.19,.20],5,{parent:'head'});m.add('rifle-stock',[0,-.2,.18],[.055,.065,.40],0,{parent:'right-arm'});m.cyl('barrel',[0,-.2,.53],[.025,.40,.025],5,{parent:'right-arm',rotation:[90,0,0],segments:5});m.add('bayonet',[0,-.2,.80],[.022,.025,.17],6,{parent:'right-arm'});
  }
  if(name==='medic'){
   m.add('medical-bag',[-.07,-.24,0],[.25,.23,.19],7,{parent:'left-arm'});m.add('cross-a',[0,-.23,.10],[.14,.045,.015],3,{parent:'left-arm'});m.add('cross-b',[0,-.23,.11],[.045,.14,.015],3,{parent:'left-arm'});m.add('bandage',[0,-.18,.12],[.15,.07,.15],7,{parent:'right-arm'});
  }
  m.finish();
 }
 {
  const m=new Model('lancer');m.add('horse',[0,.45,0],[.30,.32,.64],1);
  for(const x of[-.10,.10])for(const z of[-.23,.23])m.add('leg'+x+z,[x,-.14,z],[.08,.40,.09],1,{parent:'horse',pivot:[0,.15,0]});
  m.add('neck',[0,.23,.27],[.19,.35,.18],1,{parent:'horse',rotation:[-20,0,0]});m.add('head',[0,.41,.36],[.19,.17,.3],1,{parent:'horse'});m.add('barding',[0,.12,.13],[.33,.12,.43],6,{parent:'horse'});m.add('rider',[0,.35,-.05],[.23,.29,.18],6,{parent:'horse'});m.add('helmet',[0,.24,0],[.20,.23,.20],6,{parent:'rider'});m.add('plume',[0,.42,0],[.06,.22,.12],11,{parent:'rider'});m.add('arm',[.16,.10,0],[.085,.30,.1],6,{parent:'rider',pivot:[0,.12,0]});m.cyl('lance',[0,0,.39],[.024,1.4,.024],0,{parent:'arm',rotation:[75,0,0],segments:5});m.cyl('tip',[0,.78,0],[.08,.18,.08],6,{parent:'lance',taper:.02,segments:4});m.add('pennant',[.10,.50,0],[.20,.17,.018],11,{parent:'lance',taper:.1});
  m.clip('walk',.65,m.parts.filter(p=>p.name.startsWith('leg')).map((p,i)=>[p.name,[[0,[i%2?30:-30,0,0]],[.325,[i%2?-30:30,0,0]],[.65,[i%2?30:-30,0,0]]]]));m.cycle('attack','arm',0,25,.6);m.finish();
 }
 for(const name of ['palisade','bulwark','ram','supply-cart','mortar-team']){
  const m=new Model(name);m.add('hull',[0,.20,0],[.58,.13,.52],0);wheels(m,[-.31,.31].flatMap(x=>[-.18,.18].map(z=>[x,.12,z])),.12);
  if(name==='palisade'){
   for(let i=0;i<5;i++)m.cyl('stake'+i,[(i-2)*.145,.53,.22],[.12,.73,.12],0,{segments:5,taper:.60});
   m.add('crossbar',[0,.38,.15],[.8,.08,.08],1);m.cycle('attack','crossbar',0,8,.5);
  }else if(name==='bulwark'){
   m.add('shield',[0,.58,.22],[.86,.78,.10],5,{taper:.9});for(const x of[-.36,0,.36])m.add('brace'+x,[x,.45,.15],[.045,.52,.045],6);m.add('window',[0,.7,.276],[.29,.055,.012],15);m.cycle('attack','shield',0,6,.5);
  }else if(name==='ram'){
   for(const x of[-.23,.23])m.add('support'+x,[x,.49,0],[.08,.56,.11],0);m.add('roof',[0,.84,0],[.72,.20,.74],7,{taper:.1});m.cyl('beam',[0,.50,.08],[.21,1.0,.21],0,{rotation:[90,0,0]});m.add('ram-head',[0,.50,.64],[.31,.30,.20],6,{taper:.7});m.clip('attack',.65,[['beam',[[0,[0,0,0]],[.3,[9,0,0]],[.65,[0,0,0]]]],['ram-head',[[0,[0,0,0]],[.3,[-12,0,0]],[.65,[0,0,0]]]]]);
  }else if(name==='supply-cart'){
   for(const x of[-.17,.17])m.add('crate'+x,[x,.44,0],[.28,.35,.42],0);m.cyl('barrel',[0,.74,-.05],[.27,.48,.27],8,{rotation:[0,0,90]});m.add('tool',[0,.62,.24],[.41,.04,.07],6);m.add('flagpole',[.28,.64,-.21],[.025,.87,.025],0);m.add('flag',[.40,1.03,-.21],[.24,.16,.025],7);m.cycle('idle','flag',1,12,2);m.cycle('attack','tool',2,18,.6);
  }else{
   m.cyl('mortar',[0,.50,.04],[.18,.65,.18],5,{rotation:[32,0,0]});m.cyl('mouth',[0,.34,0],[.22,.045,.22],6,{parent:'mortar'});for(const x of[-.18,.18])m.add('brace'+x,[x,.34,-.10],[.035,.45,.035],6,{rotation:[15,0,x*100]});m.cycle('attack','mortar',0,12,.6);
  }
  // Wheel motion supplies travel without pretending a wall walks like infantry.
  m.clip('walk',.8,m.parts.filter(p=>p.name.startsWith('wheel')).map(p=>[p.name,[[0,[0,0,0]],[.4,[0,180,0]],[.8,[0,360,0]]]]));m.finish();
 }
 for(const name of ['canoe','outrigger','fireboat','ironclad','chain-boom','transport']){
  const m=new Model(name),metal=['ironclad','chain-boom','transport'].includes(name),wide=name==='transport'?.45:.28;
  m.add('hull',[0,.08,0],[wide,.19,.96],metal?5:0,{taper:.65});m.add('bow',[0,.09,.48],[wide,.20,.28],metal?6:0,{rotation:[90,0,0],taper:.05});
  if(name==='canoe'||name==='outrigger'){
   m.add('seat',[0,.18,0],[.24,.05,.17],1);
   for(const x of[-.23,.23])m.add('oar'+x,[x,.14,-.05],[.025,.025,.66],0,{rotation:[0,x*140,0]});
   if(name==='outrigger'){m.add('float',[-.48,.06,0],[.09,.10,.74],0);for(const z of[-.22,.22])m.add('spar'+z,[-.25,.12,z],[.50,.025,.025],0);m.add('mast',[0,.57,0],[.035,.9,.035],0);m.add('sail',[.18,.66,0],[.34,.65,.024],7,{taper:.08});}
   m.clip('walk',1,[-.23,.23].map(x=>['oar'+x,[[0,[0,-20,10]],[.5,[0,20,-10]],[1,[0,-20,10]]]]));m.cycle('attack','seat',0,9,.5);
  }else if(name==='fireboat'){
   for(const z of[-.25,0,.25])m.cyl('oil'+z,[0,.24,z],[.21,.23,.21],8);m.add('wick',[0,.45,.2],[.025,.32,.025],0);m.cyl('flame',[0,.65,.2],[.15,.29,.14],14,{taper:.04,segments:5});m.cycle('idle','flame',2,12,.5);m.cycle('attack','flame',0,38,.5);
  }else if(name==='chain-boom'){
   for(const x of[-.40,0,.40])m.cyl('buoy'+x,[x,.16,.2],[.23,.33,.23],5);
   m.add('chain',[0,.40,.22],[1.04,.06,.06],6);m.add('winch',[0,.27,-.14],[.21,.17,.24],6);m.cycle('walk','winch',0,40,1);m.cycle('attack','chain',0,8,.6);
  }else if(name==='ironclad'){
   m.add('casemate',[0,.29,0],[.37,.27,.62],6,{taper:.60});m.cyl('funnel',[0,.60,-.12],[.09,.47,.09],5);m.cyl('gun',[0,.33,.42],[.07,.35,.07],5,{rotation:[90,0,0]});m.cycle('attack','gun',0,14,.5);
  }else{
   m.add('hold',[0,.18,0],[.39,.12,.63],0);m.add('bridge',[0,.36,-.33],[.30,.34,.24],6);m.add('ramp',[0,.16,.42],[.40,.025,.45],6,{pivot:[0,0,-.18]});m.cycle('attack','ramp',0,25,1);
  }
  if(name!=='fireboat')m.cycle('idle','hull',2,2,2);m.finish();
 }
 {
  const m=new Model('balloon');m.cyl('envelope',[0,.95,0],[.80,.95,.80],7,{segments:10,taper:.65});m.cyl('top',[0,1.47,0],[.52,.22,.52],7,{segments:10,taper:.10});m.add('basket',[0,.17,0],[.24,.26,.24],0);
  for(const x of[-.12,.12])for(const z of[-.12,.12])m.add('rope'+x+z,[x,.43,z],[.012,.48,.012],8);m.add('lens',[0,.24,.17],[.10,.08,.16],13);m.cycle('idle','envelope',2,3,3);m.cycle('walk','basket',2,7,1.5);m.cycle('attack','lens',1,35,1);m.finish();
 }
 for(const name of ['flak','radar-truck','shield-truck','rocket-battery']){
  const m=new Model(name);m.add('hull',[0,.24,0],[.42,.18,.74],4);wheels(m,[-.25,.25].flatMap(x=>[-.25,.25].map(z=>[x,.13,z])),.13);m.add('cab',[0,.44,.23],[.4,.29,.24],4);m.add('glass',[0,.49,.357],[.32,.12,.01],15);
  if(name==='flak'){
   m.cyl('turret',[0,.43,-.13],[.35,.16,.35],4);for(const x of[-.12,.12])m.cyl('gun'+x,[x,.18,.13],[.035,.58,.035],5,{parent:'turret',rotation:[40,0,0],segments:5});vehicleClips(m,'turret');
  }else if(name==='radar-truck'){
   m.add('mast',[0,.69,-.16],[.045,.79,.045],6);m.cyl('dish',[0,1.02,-.16],[.55,.09,.55],6,{rotation:[55,0,0],taper:.35,segments:10});m.add('antenna',[0,1.10,-.02],[.02,.20,.02],13);vehicleClips(m,'dish');m.animations=m.animations.filter(c=>c.name!=='idle');m.cycle('idle','dish',1,70,3);
  }else if(name==='shield-truck'){
   m.add('screen',[0,.78,.37],[.91,.58,.07],15);m.add('frame',[0,1.08,.37],[.96,.05,.10],6);for(const x of[-.45,.45])m.add('post'+x,[x,.72,.37],[.045,.78,.08],6);m.add('emitter',[0,.78,.42],[.20,.20,.06],13);vehicleClips(m,'screen');m.animations=m.animations.filter(c=>c.name!=='idle');m.cycle('idle','emitter',2,15,1);
  }else{
   m.add('rack',[0,.59,-.17],[.50,.32,.49],4,{rotation:[-25,0,0]});for(const x of[-.16,0,.16])for(const y of[-.08,.08])m.cyl('rocket'+x+y,[x,y,.10],[.10,.57,.10],6,{parent:'rack',rotation:[90,0,0],segments:6});vehicleClips(m,'rack');
  }
  m.finish();
 }
}
