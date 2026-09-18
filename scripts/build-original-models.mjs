// Original small military meshes, dedicated to CC0. All units use the same 16-byte format.
import{writeFileSync}from'node:fs';
const normal=p=>{const l=Math.hypot(...p);return p.map(v=>v/l);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((v,i)=>v-b[i]);
let verts=[];
function tri(a,b,c,col){const n=normal(cross(sub(b,a),sub(c,a)));for(const p of[a,b,c])verts.push([...p,...n,...col]);}
function quad(a,b,c,d,col){tri(a,b,c,col);tri(a,c,d,col);}
function box(x,y,z,w,h,d,col){const p=[[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2]],q=p.map(v=>[v[0],v[1]+h,v[2]]);for(let i=0;i<4;i++)quad(p[i],p[(i+1)%4],q[(i+1)%4],q[i],col);quad(q[0],q[1],q[2],q[3],col);}
function cylinder(a,b,r,col,sides=12,r2=r){const up=normal(sub(b,a)),east=normal(cross(Math.abs(up[1])>.95?[1,0,0]:[0,1,0],up)),north=cross(up,east),ring=(p,r,angle)=>p.map((v,i)=>v+(east[i]*Math.cos(angle)+north[i]*Math.sin(angle))*r);for(let i=0;i<sides;i++){const p=ring(a,r,i/sides*6.283185),q=ring(a,r,(i+1)/sides*6.283185),u=ring(b,r2,i/sides*6.283185),v=ring(b,r2,(i+1)/sides*6.283185);quad(p,q,v,u,col);tri(a,q,p,col);tri(b,u,v,col);}}
function save(name){const bytes=Buffer.alloc(verts.length*16);verts.forEach((v,i)=>{for(let k=0;k<6;k++)bytes.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(v[k]*32767))),i*16+k*2);for(let k=0;k<3;k++)bytes[i*16+12+k]=Math.round(v[k+6]*255);bytes[i*16+15]=255;});writeFileSync(`public/assets/${name}.mesh`,bytes);console.log(name,verts.length/3,'triangles',bytes.length,'bytes');verts=[];}
const steel=[.32,.39,.41],deck=[.23,.29,.31],dark=[.075,.095,.11],light=[.6,.64,.62],blue=[.055,.18,.3];
// Guided-missile frigate: tapered hull, bridge, VLS cells, radar mast, deck gun and helipad.
const sections=[[-.5,.012],[-.37,.095],[.29,.11],[.47,.075]],top=[];
for(let i=0;i<sections.length-1;i++){const[z,w]=sections[i],[zz,ww]=sections[i+1];quad([-w,.045,z],[-ww,.045,zz],[ww,.045,zz],[w,.045,z],deck);for(const sign of[-1,1])quad([w*sign,.045,z],[ww*sign,.045,zz],[ww*.7*sign,-.025,zz],[w*.7*sign,-.025,z],steel);}
box(0,.045,-.045,.155,.085,.22,steel);box(0,.13,-.065,.13,.045,.1,light);box(0,.156,-.116,.103,.014,.002,blue);box(0,.045,.16,.17,.075,.13,steel);
cylinder([0,.13,-.025],[0,.36,-.025],.012,steel,8,.006);box(0,.27,-.025,.13,.016,.035,light);box(0,.2,-.025,.07,.033,.03,dark);
for(const x of[-.035,.035])for(let i=0;i<4;i++)box(x,.047,-.19-i*.025,.025,.003,.018,dark);
cylinder([0,.045,-.34],[0,.083,-.34],.043,light,10,.027);cylinder([0,.071,-.34],[0,.082,-.45],.007,steel,8);
for(const x of[-.059,.059])box(x,.047,.36,.002,.002,.13,light);box(0,.047,.3,.12,.002,.002,light);box(0,.047,.42,.12,.002,.002,light);box(0,.048,.36,.08,.001,.005,light);save('fleet');
// Fixed-wing reconnaissance/strike UAV, deliberately distinct from a missile.
cylinder([0,.04,-.46],[0,.04,.32],.033,light,12,.014);cylinder([0,.04,-.5],[0,.04,-.43],.004,dark,10,.032);
quad([-.46,.052,.015],[-.45,.052,.085],[.45,.052,.085],[.46,.052,.015],steel);quad([-.46,.05,.015],[-.45,.047,.085],[0,.028,.15],[0,.028,-.07],light);quad([.46,.05,.015],[.45,.047,.085],[0,.028,.15],[0,.028,-.07],light);
quad([0,.04,.28],[-.13,.15,.39],[-.13,.15,.43],[0,.04,.36],steel);quad([0,.04,.28],[.13,.15,.39],[.13,.15,.43],[0,.04,.36],steel);cylinder([0,.04,.33],[0,.04,.38],.022,dark,8);box(0,.04,.39,.15,.008,.01,dark);for(const x of[-.12,.12])cylinder([x,.005,-.04],[x,.005,.14],.009,dark,8);save('drone');
for(const name of['missile','nuke']){const radius=name==='nuke'?.055:.035;cylinder([0,.06,-.36],[0,.06,.33],radius,light,12);cylinder([0,.06,-.5],[0,.06,-.36],.001,dark,12,radius);cylinder([0,.06,.33],[0,.06,.4],radius,steel,12,radius*.65);for(let k=0;k<4;k++){const a=k/4*Math.PI*2,pt=(r,z)=>[Math.cos(a)*r,.06+Math.sin(a)*r,z];quad(pt(radius,.16),pt(.16,.33),pt(.16,.39),pt(radius,.31),steel);}save(name);}
// Gold bus and paired blue photovoltaic arrays.
box(0,0,0,.19,.15,.19,[.63,.45,.15]);for(const sign of[-1,1]){box(sign*.3,.075,0,.35,.009,.28,blue);for(let x=0;x<5;x++)box(sign*(.135+x*.075),.085,0,.003,.002,.28,light);for(let z of[-.14,0,.14])box(sign*.3,.085,z,.35,.002,.003,light);}cylinder([0,.15,0],[0,.28,0],.013,light,8);cylinder([0,.27,0],[0,.3,0],.1,light,16,.01);save('satellite');

// Original v4 pieces: recognizable silhouettes at phone scale, shared compact vertex format.
const cloth=[.30,.40,.29],bronze=[.52,.39,.20],skin=[.61,.46,.32];
function person(x=0,z=0,y=0){cylinder([x-.045,y,z],[x-.04,y+.19,z],.032,dark,6);cylinder([x+.045,y,z],[x+.04,y+.19,z],.032,dark,6);box(x,y+.16,z,.16,.21,.11,cloth);cylinder([x,y+.38,z],[x,y+.49,z],.062,skin,8);cylinder([x,y+.46,z],[x,y+.5,z],.068,steel,10,.04);cylinder([x-.095,y+.2,z],[x-.1,y+.35,z],.028,cloth,6);cylinder([x+.095,y+.2,z],[x+.1,y+.35,z],.028,cloth,6);}
for(const name of ['guard','archer','scout','engineer']){person();if(name==='guard'){cylinder([.14,0,-.04],[.14,.75,-.04],.008,bronze,6);cylinder([.14,.75,-.04],[.14,.87,-.04],.034,light,6,.001);box(-.1,.17,-.09,.17,.23,.026,bronze);}if(name==='archer'){for(let i=0;i<8;i++){const a=(i/8-0.5)*Math.PI,b=((i+1)/8-.5)*Math.PI;cylinder([.13+Math.cos(a)*.1,.33+Math.sin(a)*.23,-.09],[.13+Math.cos(b)*.1,.33+Math.sin(b)*.23,-.09],.009,bronze,5);}cylinder([.13,.1,-.09],[.13,.56,-.09],.002,light,4);}if(name==='scout'){box(0,.2,.09,.15,.2,.12,bronze);cylinder([.14,0,0],[.14,.75,0],.008,bronze,5);quad([.14,.73,0],[.34,.63,0],[.14,.55,0],[.14,.73,0],cloth);}if(name==='engineer'){box(0,.18,.11,.17,.27,.13,light);cylinder([0,.46,.13],[0,.73,.13],.005,steel,6);cylinder([0,.7,.13],[0,.75,.13],.095,light,10,.01);}save(name);}
// Horse, four legs, mane, saddle and rider.
box(0,.23,0,.20,.20,.48,bronze);for(const x of[-.07,.07])for(const z of[-.18,.18])cylinder([x,0,z],[x,.28,z],.025,dark,6);cylinder([0,.34,-.19],[0,.56,-.28],.08,bronze,8,.055);box(0,.51,-.33,.13,.10,.21,bronze);box(0,.33,-.15,.035,.19,.17,dark);person(0,.035,.25);cylinder([.14,.36,0],[.14,.94,-.18],.008,light,6);save('cavalry');
// Towed artillery: gun shield, split trail and large wheels.
for(const x of[-.22,.22])cylinder([x-.035,.13,0],[x+.035,.13,0],.14,dark,12);box(0,.13,0,.35,.12,.23,steel);box(0,.18,-.10,.39,.20,.035,steel);cylinder([0,.23,0],[0,.37,-.58],.035,steel,12);for(const x of[-.12,.12])cylinder([x,.13,.05],[x*1.7,.015,.5],.02,steel,6);save('artillery');
// Settler wagon, rolled canvas, supplies and an accompanying person.
box(0,.12,0,.36,.10,.48,bronze);box(0,.22,0,.34,.22,.45,[.72,.66,.48]);for(const x of[-.21,.21])for(const z of[-.15,.15])cylinder([x-.018,.12,z],[x+.018,.12,z],.11,dark,10);for(const z of[-.22,.22])cylinder([-.19,.21,z],[.19,.21,z],.012,bronze,6);person(.34,.1);box(0,.2,.31,.24,.13,.12,cloth);save('settler');
// Carrier with island, runway and visible parked aircraft.
box(0,0,0,.34,.065,.95,steel);quad([-.17,.065,-.48],[0,.065,-.61],[.17,.065,-.48],[.17,.065,.48],deck);box(.1,.065,.08,.12,.14,.22,light);cylinder([.1,.2,.08],[.1,.38,.08],.01,steel,8);box(.1,.3,.08,.13,.015,.04,dark);for(const z of[-.3,-.13,.05,.23,.4])box(-.055,.067,z,.012,.002,.07,light);for(const z of[-.24,.25]){box(-.09,.07,z,.15,.008,.027,light);box(-.09,.072,z,.025,.014,.13,light);}save('carrier');
// Ballistic launcher truck, four axles and elevated missile canister.
box(0,.09,0,.28,.10,.67,cloth);box(0,.17,-.25,.27,.15,.18,cloth);box(0,.22,-.344,.22,.07,.002,blue);for(const x of[-.16,.16])for(const z of[-.25,-.12,.13,.27])cylinder([x-.018,.08,z],[x+.018,.08,z],.074,dark,10);cylinder([0,.22,.28],[0,.53,-.25],.075,light,12);cylinder([0,.53,-.25],[0,.59,-.35],.075,dark,12,.001);save('launcher');
