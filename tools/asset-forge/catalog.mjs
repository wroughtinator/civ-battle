// Reproducible source authoring for every active game model. Image sources are separate.
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'models');mkdirSync(out,{recursive:true});
const colors=[[123,91,55],[80,60,40],[71,96,39],[42,67,40],[88,95,70],[52,56,58],[160,164,158],[168,151,114],[75,48,31],[179,132,98],[136,133,116],[135,81,53],[29,49,76],[159,129,55],[158,133,62],[33,58,72]];
const catalog=[];
class Model {
 constructor(name,category='unit'){this.name=name;this.category=category;this.parts=[];this.animations=[];}
 add(name,position,size,material=4,options={}){const p={name,position,size,material,color:colors[material],...options};if(typeof p.parent==='string')p.parent=this.id(p.parent);this.parts.push(p);return name;}
 id(name){const n=this.parts.findIndex(p=>p.name===name);if(n<0)throw Error(`Unknown parent ${name}`);return n;}
 cyl(name,pos,size,mat=5,options={}){return this.add(name,pos,size,mat,{shape:'cylinder',segments:8,...options});}
 clip(name,duration,tracks){this.animations.push({name,duration,tracks:tracks.map(([part,keys])=>({part:this.id(part),keys:keys.map(([time,rotation])=>({time,rotation}))}))});}
 cycle(name,part,axis,amount,duration=1){const v=x=>[0,0,0].map((_,i)=>i===axis?x:0);this.clip(name,duration,[[part,[[0,v(-amount)],[duration/2,v(amount)],[duration,v(-amount)]]]]);}
 finish(){if(this.category==='unit'){
  if(!this.animations.some(c=>c.name==='idle'))this.cycle('idle',this.parts[0].name,2,1,2);
  if(!this.animations.some(c=>c.name==='walk'))this.cycle('walk',this.parts[0].name,0,2,.8);
  if(!this.animations.some(c=>c.name==='attack'))this.cycle('attack',this.parts[0].name,0,5,.6);
 }if(this.category==='tree')for(const p of this.parts)for(const field of ['position','size','pivot'])if(p[field])p[field]=p[field].map(v=>v*.9);
 if(this.parts.length>32)throw Error(`${this.name}: too many parts ${this.parts.length}`);
 const data={name:this.name,texture_size:256,parts:this.parts,animations:this.animations};writeFileSync(join(out,this.name+'.json'),JSON.stringify(data,null,2)+'\n');catalog.push({name:this.name,category:this.category,parts:this.parts.length,clips:this.animations.map(c=>c.name)});}
}
function human(m,mat=4){
 m.add('body',[0,.59,0],[.31,.35,.19],mat,{taper:.86});m.add('head',[0,.30,0],[.21,.23,.20],9,{parent:'body'});
 m.add('helmet',[0,.11,0],[.25,.10,.24],mat,{parent:'head'});
 for(const [name,x]of[['left',-.215],['right',.215]]){m.add(name+'-arm',[x,.11,0],[.11,.35,.12],mat,{parent:'body',pivot:[0,.13,0]});m.add(name+'-leg',[x*.43,-.20,0],[.12,.39,.14],8,{parent:'body',pivot:[0,.16,0]});}
 for(const x of[-.045,.045])m.add('eye'+x,[x,.02,.103],[.027,.027,.008],5,{parent:'head'});
 m.cycle('idle','body',2,1.5,2);
 m.clip('walk',.8,['left-leg','right-leg','left-arm','right-arm'].map((p,i)=>[p,[[0,[i%2?25:-25,0,0]],[.4,[i%2?-25:25,0,0]],[.8,[i%2?25:-25,0,0]]]]));
 m.clip('attack',.6,[['right-arm',[[0,[0,0,0]],[.25,[-90,0,-15]],[.36,[30,0,10]],[.6,[0,0,0]]]],['body',[[0,[0,0,0]],[.25,[0,-12,0]],[.6,[0,0,0]]]]]);
}
for(const name of['guard','archer','scout','engineer','recon']){
 const m=new Model(name);human(m,name==='scout'?8:name==='engineer'?7:4);
 if(name==='guard'){m.add('shield',[-.07,-.19,.11],[.28,.37,.055],0,{parent:'left-arm'});m.add('blade',[0,-.17,.27],[.045,.035,.44],6,{parent:'right-arm'});m.add('guard',[0,-.17,.08],[.16,.05,.04],13,{parent:'right-arm'});}
 if(name==='archer'){
  for(const [i,y,z,r]of[[0,-.02,.18,-25],[1,-.14,.23,0],[2,-.26,.18,25]])m.add('bow'+i,[0,y,z],[.025,.17,.027],0,{parent:'left-arm',rotation:[r,0,0]});
  m.add('bowstring',[0,-.14,.12],[.008,.4,.008],7,{parent:'left-arm'});m.add('quiver',[.1,-.03,-.17],[.13,.28,.12],8,{parent:'body'});m.add('drawn-arrow',[0,-.17,.21],[.015,.015,.35],0,{parent:'right-arm'});
  m.animations=m.animations.filter(c=>c.name!=='attack');m.clip('attack',.6,[['left-arm',[[0,[-70,0,0]],[.4,[-85,0,0]],[.6,[-70,0,0]]]],['right-arm',[[0,[-65,0,0]],[.3,[-80,-45,0]],[.42,[-80,0,0]],[.6,[-65,0,0]]]]]);
 }
 if(name==='scout'){m.add('pack',[0,0,-.15],[.26,.3,.14],7,{parent:'body'});m.add('knife',[0,-.2,.14],[.035,.03,.22],6,{parent:'right-arm'});}
 if(name==='engineer'){m.add('battery',[0,-.03,-.17],[.27,.36,.16],6,{parent:'body'});m.cyl('antenna',[.12,.38,-.19],[.012,.55,.012],6,{parent:'body',segments:4});m.cyl('dish',[.12,.57,-.19],[.28,.055,.28],6,{parent:'body',taper:.25});m.add('tool',[0,-.17,.14],[.07,.07,.24],13,{parent:'right-arm'});}
 if(name==='recon'){m.add('vest',[0,.02,.105],[.28,.24,.035],8,{parent:'body'});m.add('rifle',[0,-.18,.24],[.05,.08,.42],5,{parent:'right-arm'});m.add('stock',[0,-.17,.015],[.045,.10,.12],0,{parent:'right-arm'});}
 m.finish();
}
function wheels(m,positions,r=.16){for(const [i,p]of positions.entries())m.cyl('wheel'+i,p,[r*2,.075,r*2],5,{rotation:[0,0,90],segments:8});}
function vehicleClips(m,turret){m.cycle('idle',turret||'hull',1,2,2);const ws=m.parts.filter(p=>p.name.startsWith('wheel'));m.clip('walk',1,ws.length?ws.map(p=>[p.name,[[0,[0,0,0]],[.25,[0,90,0]],[.5,[0,180,0]],[.75,[0,270,0]],[1,[0,360,0]]]]):[['hull',[[0,[1,0,0]],[.5,[-1,0,0]],[1,[1,0,0]]]]]);m.clip('attack',.6,[[turret||'hull',[[0,[0,0,0]],[.12,[-9,0,0]],[.6,[0,0,0]]]]]);}
{
 const m=new Model('tank');m.add('hull',[0,.23,0],[.57,.22,.85],4,{taper:.8});m.add('turret',[0,.2,.02],[.35,.18,.39],4,{parent:'hull',taper:.8});m.cyl('barrel',[0,.03,.39],[.06,.58,.06],5,{parent:'turret',rotation:[90,0,0],segments:8});
 for(const x of[-.32,.32]){m.add('track'+x,[x,.14,0],[.14,.24,.91],5);for(const z of[-.3,0,.3])m.cyl('wheel'+x+z,[x,.14,z],[.20,.15,.20],6,{rotation:[0,0,90],segments:6});}m.add('hatch',[0,.315,.02],[.15,.035,.15],5,{parent:'hull'});vehicleClips(m,'turret');m.finish();
}
{
 const m=new Model('artillery');m.add('hull',[0,.23,0],[.34,.17,.45],4);wheels(m,[[-.28,.17,0],[.28,.17,0]],.17);m.add('gun',[0,.32,.04],[.15,.15,.23],4);m.cyl('barrel',[0,.10,.29],[.075,.65,.075],5,{parent:'gun',rotation:[72,0,0]});m.add('shield',[0,.34,.07],[.54,.37,.045],4);for(const x of[-.12,.12])m.add('trail'+x,[x,.13,-.39],[.045,.07,.55],4,{rotation:[-15,x*70,0]});vehicleClips(m,'gun');m.finish();
}
{
 const m=new Model('launcher');m.add('hull',[0,.20,0],[.34,.15,.85],4);m.add('cab',[0,.34,.30],[.33,.22,.24],4);m.add('glass',[0,.38,.427],[.28,.10,.008],15);wheels(m,[-.2,.2].flatMap(x=>[-.3,-.12,.12,.3].map(z=>[x,.12,z])),.1);m.cyl('rack',[0,.42,-.10],[.17,.78,.17],6,{rotation:[60,0,0]});m.cyl('nose',[0,.40,0],[.17,.22,.17],5,{parent:'rack',taper:.05});vehicleClips(m,'rack');m.finish();
}
{
 const m=new Model('cavalry');m.add('horse',[0,.45,0],[.28,.3,.6],8);for(const x of[-.09,.09])for(const z of[-.20,.20])m.add('leg'+x+z,[x,-.12,z],[.075,.39,.08],8,{parent:'horse',pivot:[0,.16,0]});m.add('neck',[0,.22,.24],[.17,.36,.17],8,{parent:'horse',rotation:[-25,0,0]});m.add('muzzle',[0,.39,.37],[.16,.14,.3],8,{parent:'horse'});m.add('mane',[0,.26,.14],[.08,.35,.14],5,{parent:'horse'});m.add('tail',[0,-.01,-.35],[.07,.34,.07],5,{parent:'horse',rotation:[-25,0,0]});m.add('rider',[0,.36,-.05],[.23,.29,.17],4,{parent:'horse'});m.add('head',[0,.21,0],[.17,.19,.17],9,{parent:'rider'});m.add('helmet',[0,.31,0],[.20,.07,.20],4,{parent:'rider'});m.add('arm',[.16,.08,0],[.08,.29,.1],4,{parent:'rider',pivot:[0,.11,0]});m.cyl('lance',[0,-.05,.25],[.022,.95,.022],0,{parent:'arm',rotation:[60,0,0],segments:4});m.cyl('spear-tip',[0,.5,0],[.075,.16,.075],6,{parent:'lance',taper:.03,segments:4});m.clip('walk',.7,m.parts.filter(p=>p.name.startsWith('leg')).map((p,i)=>[p.name,[[0,[i%2?25:-25,0,0]],[.35,[i%2?-25:25,0,0]],[.7,[i%2?25:-25,0,0]]]]));m.cycle('attack','arm',0,30,.5);m.finish();
}
{
 const m=new Model('settler');m.add('hull',[0,.25,0],[.42,.17,.64],0);m.add('canvas',[0,.48,0],[.43,.37,.63],7,{taper:.8});wheels(m,[-.25,.25].flatMap(x=>[-.23,.23].map(z=>[x,.17,z])),.16);for(const x of[-.16,.16])m.add('handle'+x,[x,.26,.50],[.035,.045,.38],0);m.add('crate',[0,.38,-.41],[.3,.22,.17],0);m.cyl('roll',[0,.71,0],[.25,.38,.25],7,{rotation:[0,0,90]});vehicleClips(m,'canvas');m.finish();
}
for(const name of['fleet','carrier','submarine']){
 const m=new Model(name);m.add('hull',[0,.04,0],[name==='carrier'?.40:.25,.15,.95],name==='submarine'?5:6,{taper:.82});m.add('bow',[0,.04,.49],[name==='carrier'?.40:.25,.14,.27],name==='submarine'?5:6,{rotation:[90,0,0],taper:.04});
 if(name==='submarine'){m.cyl('round-hull',[0,.015,-.02],[.29,.95,.29],5,{rotation:[90,0,0]});m.add('sail',[0,.18,-.05],[.12,.24,.24],5,{taper:.8});m.cyl('periscope',[0,.37,-.04],[.015,.18,.015],6,{segments:4});m.add('planes',[0,.06,-.36],[.5,.035,.11],5);}
 else{m.add('deck',[0,.12,0],[name==='carrier'?.44:.25,.03,.99],5);m.add('bridge',[name==='carrier'?.13:0,.23,-.06],[.16,.2,.22],6);m.add('windows',[name==='carrier'?.13:0,.27,.055],[.14,.055,.012],15);m.cyl('mast',[.05,.48,-.11],[.022,.4,.022],6,{segments:4});m.add('radar',[0,.17,0],[.23,.04,.07],5,{parent:'mast'});
 if(name==='carrier'){m.add('runway',[0,.138,0],[.022,.008,.88],7);for(const z of[-.27,.23]){m.add('plane'+z,[-.09,.17,z],[.035,.035,.2],6);m.add('wing'+z,[-.09,.18,z],[.22,.015,.05],6);}}
 else{m.cyl('gun',[0,.19,.29],[.15,.11,.15],6);m.cyl('gun-barrel',[0,.025,.15],[.025,.25,.025],5,{parent:'gun',rotation:[90,0,0],segments:6});for(const z of[-.35,-.23])m.add('vls'+z,[0,.15,z],[.17,.03,.08],4);}}
 m.cycle('idle','hull',2,1.5,2);m.cycle('walk',name==='submarine'?'planes':'radar',1,12,1);m.cycle('attack',name==='fleet'?'gun':name==='carrier'?'radar':'planes',0,10,.5);m.finish();
}
function aircraft(name,category){const m=new Model(name,category);m.cyl('hull',[0,.1,0],[.10,.85,.10],6,{rotation:[90,0,0],taper:.45});m.add('wing',[0,.1,0],[.96,.035,.15],4,{taper:.75});m.add('tail-wing',[0,.13,-.33],[.35,.025,.08],4);m.add('tail',[0,.19,-.32],[.025,.19,.13],4);m.add('canopy',[0,.15,.22],[.07,.055,.19],15);m.add('propeller',[0,-.43,0],[.29,.02,.022],5,{parent:'hull'});m.cycle('idle','propeller',1,80,.4);m.cycle('walk','wing',2,3,.8);m.cycle('attack','hull',0,7,.5);return m;}
aircraft('drone','unit').finish();aircraft('aircraft','projectile').finish();
for(const name of['missile','nuke','rocket','torpedo','bomb','shell','mortar','bullet','arrow']){
 const m=new Model(name,'projectile'),arrow=name==='arrow',radius=arrow?.018:name==='bullet'?.06:name==='nuke'?.18:.11,mat=arrow?0:name==='torpedo'?5:6;
 m.cyl('body',[0,0,0],[radius,.65,radius],mat,{rotation:[90,0,0],segments:6});m.cyl('nose',[0,.4,0],[radius,.2,radius],arrow?6:5,{parent:'body',taper:.03,segments:arrow?4:6});
 if(!['bullet','shell','mortar'].includes(name))for(let i=0;i<4;i++)m.add('fin'+i,[Math.cos(i*Math.PI/2)*radius*.6,-.24,Math.sin(i*Math.PI/2)*radius*.6],[radius*.09,.22,radius*1.4],arrow?7:4,{parent:'body',rotation:[0,i*90,0]});m.cycle('idle','body',1,5,1);m.finish();
}
{
 const m=new Model('satellite','orbital');m.add('bus',[0,0,0],[.25,.25,.25],13);for(const x of[-.35,.35])m.add('panel'+x,[x,0,0],[.42,.025,.35],12,{parent:'bus'});m.cyl('dish',[0,.23,0],[.30,.11,.30],6,{taper:.1,parent:'bus'});m.cycle('idle','bus',1,15,3);m.finish();
}
for(const name of['tree-oak','tree-pine','tree-birch']){
 const m=new Model(name,'tree');m.cyl('trunk',[0,.38,0],[name==='tree-birch'?.09:.13,.76,.13],1,{taper:.65,segments:6});
 if(name==='tree-pine'){for(let i=0;i<3;i++)m.cyl('crown'+i,[0,.48+i*.18,0],[.70-i*.13,.38,.70-i*.13],3,{segments:7,taper:.04});}
 else {for(const [i,x,z,y,s]of[[0,0,0,.78,.6],[1,-.19,.08,.63,.4],[2,.20,-.04,.7,.43],[3,.04,.18,.86,.42]])m.cyl('crown'+i,[x,y,z],[s,.37,s],2,{segments:7,taper:.50,rotation:[0,i*47,0]});for(const x of[-.15,.15])m.cyl('branch'+x,[x,.52,0],[.04,.4,.04],1,{rotation:[0,0,-x*230],segments:5});}m.finish();
}
function house(m,name='house',x=0,z=0,scale=1){m.add(name,[x,.20*scale,z],[.60*scale,.4*scale,.50*scale],10);m.add(name+'-roof',[x,.5*scale,z],[.72*scale,.25*scale,.62*scale],11,{taper:.08});m.add(name+'-door',[x,.12*scale,z+.253*scale],[.13*scale,.24*scale,.012],0);}
for(let i=0;i<8;i++){
 const m=new Model('capital-'+i,'prop');
 if(i===1||i===5){m.add('pyramid',[0,.32,0],[.8,.64,.8],10,{taper:.04});if(i===5)m.add('temple',[0,.57,0],[.22,.18,.22],10);}
 else if(i===4||i===6){for(let j=0;j<3;j++){m.add('tier'+j,[0,.13+j*.23,0],[.55-j*.1,.23,.55-j*.1],10);m.add('roof'+j,[0,.29+j*.23,0],[.7-j*.12,.14,.7-j*.12],11,{taper:.1});}}
 else{m.add('floor',[0,.04,0],[.8,.08,.65],10);for(const x of[-.28,0,.28])m.cyl('column'+x,[x,.26,.21],[.08,.44,.08],10,{segments:6});m.add('hall',[0,.23,-.13],[.65,.4,.34],10);m.add('roof',[0,.54,0],[.86,.23,.7],11,{taper:.1});}
 m.add('steps',[0,.025,.41],[.4,.05,.18],10);m.finish();
}
for(let b=1;b<=7;b++){
 const m=new Model('building-'+b,'prop');
 if(b===1){for(let j=0;j<5;j++)m.add('crop'+j,[(j-2)*.15,.06,0],[.07,.12,.8],14);}
 if(b===2)house(m);
 if(b===3){house(m,'workshop');m.cyl('chimney',[.2,.66,-.13],[.11,.55,.11],10,{segments:5});}
 if(b===4){m.add('keep',[0,.23,0],[.7,.46,.7],10);for(const x of[-.34,.34])for(const z of[-.34,.34])m.add('tower'+x+z,[x,.35,z],[.20,.70,.20],10);m.add('gate',[0,.13,.36],[.2,.26,.015],0);}
 if(b===5){m.add('quay',[0,.05,0],[.9,.1,.7],0);m.cyl('mast',[0,.4,0],[.035,.7,.035],0,{segments:4});m.add('sail',[.16,.51,0],[.29,.37,.02],7,{taper:.12});}
 if(b===6){m.add('pad',[0,.03,0],[.9,.06,.9],5);m.cyl('rocket',[0,.43,0],[.14,.75,.14],6,{segments:6});m.cyl('nose',[0,.87,0],[.14,.16,.14],13,{taper:.03,segments:6});m.add('gantry',[.22,.44,0],[.06,.88,.06],4);}
 if(b===7){house(m,'factory',0,0,.8);for(const x of[-.23,.20])m.cyl('stack'+x,[x,.55,-.16],[.1,.75,.1],5,{segments:6});}
 m.finish();
}
{
 const m=new Model('farm','prop');for(const x of[-.3,.3])for(let j=0;j<4;j++)m.add('row'+x+j,[x,.04,(j-1.5)*.19],[.34,.08,.08],14);m.finish();
 const site=new Model('site','prop');for(const [i,x,z]of[[0,-.25,.2],[1,.25,.2],[2,0,-.25]])site.add('crate'+i,[x,.12,z],[.25,.24,.25],5);site.cyl('antenna',[0,.4,0],[.025,.8,.025],6,{segments:4});site.finish();
}
// All unopened discoveries share the chest silhouette introduced on main.
for(let k=0;k<10;k++){
 const m=new Model('discovery-'+k,'prop');
 m.add('chest',[0,.20,0],[.72,.4,.5],0);
 m.cyl('rounded-lid',[0,.39,0],[.5,.72,.30],0,{rotation:[0,0,90],segments:8});
 for(const x of[-.25,.25]){
  m.add('front-band'+x,[x,.20,.258],[.065,.4,.022],13);
  m.add('back-band'+x,[x,.20,-.258],[.065,.4,.022],13);
  m.cyl('lid-band'+x,[x,.39,0],[.515,.067,.315],13,{rotation:[0,0,90],segments:8});
 }
 m.add('lock',[0,.30,.28],[.10,.14,.035],13);m.finish();
}
writeFileSync(join(root,'catalog.json'),JSON.stringify({version:1,materials:'sources/materials.png',terrain:'sources/terrain.png',models:catalog},null,2)+'\n');console.log(`Authored ${catalog.length} models`);
