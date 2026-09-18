"""Blender offline converter. Runtime format: 16-byte vertices, XYZ/NXYZ int16 + RGBA8.
Run with --factory-startup --disable-autoexec. Sources and licenses in docs/ASSETS.md.
No Blender, glTF runtime, or large source files are shipped to the browser.
"""
import bpy, struct, sys, math
from pathlib import Path
from mathutils import Vector

kind = sys.argv[sys.argv.index('--')+1]
if kind == 'tank':
    root=bpy.data.objects['T72_hull']
    objects=[root]+list(root.children_recursive)
elif kind == 'recon':
    objects=[bpy.data.objects['HUMVEE']]
else:
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
objects=[o for o in objects if o.type=='MESH']
if kind=='submarine':
    for obj in objects:
        if len(obj.data.vertices)>200:
            bpy.context.view_layer.objects.active=obj
            modifier=obj.modifiers.new('Mobile mesh budget','DECIMATE');modifier.ratio=.3
            bpy.ops.object.modifier_apply(modifier=modifier.name)
verts=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
low=Vector([min(v[k] for v in verts) for k in range(3)])
high=Vector([max(v[k] for v in verts) for k in range(3)])
center=(low+high)*.5
scale=max(high-low)
def remap(v):
    return Vector((v.y,v.z,v.x)) if kind in ('tank','recon') else Vector((v.x,v.z,-v.y))
def color(mat):
    c=list(mat.diffuse_color[:3]) if mat else [.18,.22,.24]
    if mat and mat.use_nodes:
        output=next((n for n in mat.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output),None)
        links=list(output.inputs['Surface'].links) if output else []
        n=links[0].from_node if links else None
        if n and n.type=='BSDF_PRINCIPLED': c=list(n.inputs['Base Color'].default_value[:3])
    if kind=='submarine': c=[.045,.063,.073]
    # Convert author linear material colors to display values for our sRGB palette.
    return [max(12,min(235,round(x**(1/2.2)*255))) for x in c]
data=bytearray()
for obj in objects:
    mesh=obj.data;mesh.calc_loop_triangles()
    normal_matrix=obj.matrix_world.to_3x3().inverted().transposed()
    for tri in mesh.loop_triangles:
        mat=mesh.materials[tri.material_index] if len(mesh.materials)>tri.material_index else None
        col=color(mat)
        for vi in tri.vertices:
            v=mesh.vertices[vi]
            p=obj.matrix_world@v.co
            p=remap(Vector(((p.x-center.x)/scale,(p.y-center.y)/scale,(p.z-low.z)/scale)))
            normal=remap(normal_matrix@(v.normal if tri.use_smooth else tri.normal)).normalized()
            ints=[max(-32767,min(32767,round(x*32767))) for x in [*p,*normal]]
            data.extend(struct.pack('<6h4B',*ints,*col,255))
out=Path('public/assets')/(kind+'.mesh')
out.write_bytes(data)
print('EXPORTED',kind,'triangles',len(data)//48,'bytes',len(data))
