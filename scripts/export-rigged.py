import bpy,sys,struct,json,math
from pathlib import Path
from mathutils import Matrix,Vector
# Convert the author's skin and animations, not a sequence of duplicated meshes.
kind=sys.argv[sys.argv.index('--')+1]
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
objects=[o for o in bpy.data.objects if o.type=='MESH']
arm.animation_data.action=None
for track in arm.animation_data.nla_tracks: track.mute=True
arm.data.pose_position='REST';bpy.context.view_layer.update()
# Modest reduction preserves painted vertex colors and all bone weights.
for obj in objects:
 bpy.context.view_layer.objects.active=obj
 dec=obj.modifiers.new('Mobile budget','DECIMATE');dec.ratio=.55
 bpy.ops.object.modifier_apply(modifier=dec.name)
points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)])
scale=high.z-low.z
# Blender Z up -> renderer Y up; model faces -Z, matching movement heading.
C=Matrix(((1/scale,0,0,-(low.x+high.x)/2/scale),(0,0,1/scale,-low.z/scale),(0,-1/scale,0,(low.y+high.y)/2/scale),(0,0,0,1)))
bones=list(arm.data.bones);ids={b.name:i for i,b in enumerate(bones)}
textures={}
for mat in bpy.data.materials:
 node=next((n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None) if mat.node_tree else None
 if node:
  im=node.image
  path=Path(bpy.data.filepath).parent.parent/'Textures'/im.name
  if path.exists():im.filepath=str(path);im.reload()
  textures[mat.name]=(list(im.pixels),*im.size)
vertices=bytearray()
for obj in objects:
 mesh=obj.data;mesh.calc_loop_triangles();M=obj.matrix_world.copy();N=(C@M).to_3x3().inverted().transposed()
 for tri in mesh.loop_triangles:
  mat=mesh.materials[tri.material_index] if mesh.materials else None
  tex=textures.get(mat.name) if mat else None
  # Palette-painted faces: sampling centroid avoids bleeding across atlas cells.
  uv=sum((mesh.uv_layers.active.data[l].uv for l in tri.loops),Vector((0,0)))/3 if mesh.uv_layers.active else Vector((0,0))
  col=[.55,.6,.55]
  if tex:
   pix,w,h=tex;offset=(min(h-1,max(0,int(uv.y*h)))*w+min(w-1,max(0,int(uv.x*w))))*4
   col=pix[offset:offset+3]
  col=[max(0,min(255,round(c**(1/2.2)*255))) for c in col]
  for vi in tri.vertices:
   v=mesh.vertices[vi];p=C@M@v.co;n=(N@(v.normal if tri.use_smooth else tri.normal)).normalized()
   weights=[(ids[obj.vertex_groups[g.group].name],g.weight) for g in v.groups if obj.vertex_groups[g.group].name in ids and g.weight>.001]
   if obj.parent_type=='BONE':weights=[(ids[obj.parent_bone],1)]
   weights=sorted(weights,key=lambda v:-v[1])[:4] or [(0,1)]
   total=sum(w for _,w in weights);js=[j for j,_ in weights];ws=[round(w/total*255) for _,w in weights];ws[0]+=255-sum(ws)
   js+= [0]*(4-len(js));ws+=[0]*(4-len(ws))
   vertices+=struct.pack('<6h4B8B',*[max(-32767,min(32767,round(x*32767))) for x in [*p,*n]],*col,255,*js,*ws)
arm.data.pose_position='POSE'
actions={'idle':'Idle_Weapon','walk':'Run_Weapon' if kind=='guard' else 'Run_Holding' if kind=='archer' else 'Run','attack':'Sword_Attack' if kind=='guard' else 'Bow_Attack_Shoot' if kind=='archer' else 'Dagger_Attack'}
clips={};matrices=bytearray();fps=bpy.context.scene.render.fps
for name,source in actions.items():
 action=bpy.data.actions.get(source) or bpy.data.actions['Idle'];arm.animation_data.action=action
 if action.slots:arm.animation_data.action_slot=action.slots[0]
 start,end=action.frame_range;duration=(end-start)/fps;count=max(2,math.ceil(duration*20)+1)
 clips[name]={'offset':len(matrices)//4,'frames':count,'duration':duration,'source':action.name}
 for k in range(count):
  frame=start+(end-start)*k/(count-1);bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
  for b in bones:
   m=C@arm.matrix_world@arm.pose.bones[b.name].matrix@b.matrix_local.inverted()@arm.matrix_world.inverted()@C.inverted()
   matrices+=struct.pack('<16f',*[m[r][c] for c in range(4) for r in range(4)])
meta={'version':1,'vertices':len(vertices)//24,'bones':[b.name for b in bones],'clips':clips}
header=json.dumps(meta,separators=(',',':')).encode();header+=b' '*((-len(header))%4)
out=Path('public/assets')/(kind+'.rig');out.write_bytes(struct.pack('<I',len(header))+header+vertices+matrices)
print('EXPORTED',kind,'triangles',len(vertices)//72,'bones',len(bones),'bytes',out.stat().st_size)
