"""Create the edited in-game sound atlas from a licensed local 99Sounds collection.
Usage: python scripts/build-audio.py <99sounds-folder>
Requires imageio-ffmpeg. Sources remain outside the deployed game.
"""
import array, json, subprocess, sys, tempfile
from pathlib import Path
import imageio_ffmpeg

root=Path(sys.argv[1]);ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();rate=32000
def find(folder,pattern):
    files=list((root/folder).rglob(pattern))
    if len(files)!=1: raise ValueError((pattern,len(files)))
    return files[0]
sfx='02 - 99 Sound Effects'
clips=[
 ('ocean',find('08 - Water Sounds','WATRSurf_Continuous Water Surf 01*.wav'),16,True),
 ('land',find('07 - Nature Sounds','WINDVege*Moving Grass*01.wav'),16,True),
 ('rain',find('48 - Rain And Thunder','rain-window-01.wav'),12,True),
 ('click',find(sfx,'Short - Mini Popup.wav'),.28,False),
 ('confirm',find(sfx,'Short - Digital Crystal.wav'),1,False),
 ('order',find(sfx,'Swish - Nice And Clean.wav'),.85,False),
 ('impact',find(sfx,'Impact - Cease Fire.wav'),3.5,False),
 ('launch',find(sfx,'Whoosh - Mini Jet.wav'),2.5,False),
 ('nuclear',find(sfx,'Impact - Nuclear Winter.wav'),5,False),
 ('warning',find(sfx,'Short - Sad Little Sonar.wav'),1.5,False),
 ('engine',find(sfx,'Short - Pneumatic Woodpecker.wav'),1.2,False),
]
data=array.array('f');manifest={};sources=[]
for name,path,duration,loop in clips:
    raw=subprocess.check_output([ffmpeg,'-v','error','-i',str(path),'-t',str(duration+1 if loop else duration),'-af','loudnorm=I=-22:TP=-3:LRA=8','-ac','1','-ar',str(rate),'-f','f32le','-'])
    samples=array.array('f');samples.frombytes(raw)
    if loop:
        cross=min(rate,len(samples)//8);end=len(samples)-cross
        for i in range(cross):
            t=i/cross;samples[i]=samples[end+i]*(1-t)+samples[i]*t
        samples=samples[:end]
    else:
        fade=min(int(.06*rate),len(samples)//4)
        for i in range(fade):samples[-fade+i]*=1-i/fade
    manifest[name]={'start':len(data)/rate,'duration':len(samples)/rate,'loop':loop}
    data.extend(samples);data.extend([0.]*int(.12*rate))
    sources.append({'cue':name,'source':str(path.relative_to(root)),'duration':len(samples)/rate})
out=Path('public/assets/audio');out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    pcm=Path(tmp)/'atlas.f32';pcm.write_bytes(data.tobytes())
    subprocess.run([ffmpeg,'-v','error','-y','-f','f32le','-ar',str(rate),'-ac','1','-i',str(pcm),'-codec:a','libmp3lame','-b:a','80k',str(out/'game-audio.mp3')],check=True)
(out/'cues.json').write_text(json.dumps(manifest,separators=(',',':')))
Path('docs/audio-sources.json').write_text(json.dumps(sources,indent=2))
print('Audio atlas',len(data)/rate,'seconds,',(out/'game-audio.mp3').stat().st_size,'bytes')
