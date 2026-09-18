"""Pack carlosjorgereis' CC0 tree01.dae and its two color maps for WebGL.
Usage: python scripts/export-tree.py <extracted tree01.zip directory>
"""
import sys,struct,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image,ImageEnhance
root=Path(sys.argv[1]);doc=ET.parse(root/'tree01.dae');ns={'c':'http://www.collada.org/2005/11/COLLADASchema'}
out=Path('public/assets');atlas=Image.new('RGBA',(512,256))
for i,name in enumerate(['Tree-Branch-PNG-Image.png','tree02_trunc.png']):
 im=Image.open(root/'Textures'/name).convert('RGBA');im=ImageEnhance.Color(im).enhance(.72);atlas.paste(im,(i*256,0))
atlas.save(out/'woodland.webp',quality=85,method=6)
records=[]
for geom in doc.findall('.//c:geometry',ns):
 sources={}
 for s in geom.findall('c:mesh/c:source',ns):
  stride=int(s.find('.//c:accessor',ns).attrib['stride']);v=list(map(float,s.find('c:float_array',ns).text.split()));sources[s.attrib['id']]=[v[i:i+stride] for i in range(0,len(v),stride)]
 verts={v.attrib['id']:v.find('c:input',ns).attrib['source'][1:] for v in geom.findall('c:mesh/c:vertices',ns)}
 for tri in geom.findall('c:mesh/c:triangles',ns):
  inputs={v.attrib['semantic']:(int(v.attrib['offset']),v.attrib['source'][1:]) for v in tri.findall('c:input',ns)};stride=max(v[0] for v in inputs.values())+1
  indices=list(map(int,tri.find('c:p',ns).text.split()));leaf='leaves' in tri.attrib['material']
  for j in range(0,len(indices),stride):
   def get(name):
    off,src=inputs[name];return sources[verts.get(src,src)][indices[j+off]]
   p=get('VERTEX');n=get('NORMAL');uv=get('TEXCOORD');records.append((p,n,uv,leaf))
lo=min(p[1] for p,_,_,_ in records);hi=max(p[1] for p,_,_,_ in records);height=hi-lo
buf=bytearray()
for p,n,uv,leaf in records:
 p=[p[0]/height,(p[1]-lo)/height,p[2]/height]
 # Inset UVs to avoid sampling the other atlas half in distant mip levels.
 uv=[(min(1,max(0,uv[0]))*.98+.01+(0 if leaf else 1))*.5,1-(min(1,max(0,uv[1]))*.98+.01)]
 buf+=struct.pack('<6h4B2H',*[max(-32767,min(32767,round(x*32767))) for x in [*p,*n]],255,255,255,255,*[round(x*65535) for x in uv])
(out/'woodland.mesh').write_bytes(buf)
print('Tree triangles',len(records)//3,'mesh bytes',len(buf),'texture bytes',(out/'woodland.webp').stat().st_size)
