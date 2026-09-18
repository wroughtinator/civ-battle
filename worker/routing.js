const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const redirect = path => new Response(null, {status:302, headers:{Location:path,'Cache-Control':'no-store'}});
const roomId = /^[a-f0-9]{20}$/;
const random = () => [...crypto.getRandomValues(new Uint8Array(10))].map(x=>x.toString(16).padStart(2,'0')).join('');

export function createGateway({releases, current, bootstrap, catalog}) {
  return {async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ok:true, version:4, engine:'rust-wasm', release:current, clientPath:`/releases/${current}/`});
    if (url.pathname === '/api/releases') return json(catalog);
    const scoped = url.pathname.match(/^\/releases\/([a-f0-9]{24})(\/.*)?$/);
    if (url.pathname.startsWith('/releases/') && (!scoped || !releases[scoped[1]])) return json({error:404},404);
    // Unversioned URLs remain compatible with clients already open before rollout.
    const release = scoped?.[1] ?? bootstrap;
    const path = scoped?.[2] ?? (scoped ? '/' : url.pathname);
    const asset = async (id, file) => {
      if (!releases[id].files.includes(file) || file.startsWith('_')) return json({error:404},404);
      // The asset service canonicalizes index.html to its directory. Request the
      // directory directly so its redirect cannot loop through this gateway.
      const target = new URL(`/releases/${id}/${file.endsWith('index.html')?file.slice(0,-10):file}`,url);
      const response = await env.ASSETS.fetch(new Request(target, request));
      const headers = new Headers(response.headers);
      for (const [key,value] of Object.entries(releases[id].headers)) headers.set(key,value);
      headers.set('Cache-Control','public, max-age=31536000, immutable');
      return new Response(response.body,{status:response.status,headers});
    };
    if (path.startsWith('/api/')) {
      if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({error:403},403);
      if (path === '/api/health') return json({ok:true,version:4,engine:'rust-wasm',release,clientPath:`/releases/${release}/`});
      if (Number(request.headers.get('Content-Length')) > 4096) return json({error:413},413);
      if (path === '/api/rooms' && request.method === 'POST') {
        const id = random();
        return env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(new Request(`${url.origin}/init`, {
          method:'POST',body:await request.text(),headers:{'X-Room':id,'X-Meridian-Release':current}
        }));
      }
      const match = path.match(/^\/api\/rooms\/([a-f0-9]{20})\/(join|ws|release)$/);
      if (!match) return json({error:404},404);
      const target = new URL(match[2] === 'release' ? '/release' : path,url);
      const forwarded = new Request(target,request);
      forwarded.headers.delete('X-Meridian-Release');
      if (match[2] !== 'release') forwarded.headers.set('X-Meridian-Release',release);
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(forwarded);
    }
    if (path === '/' || path === '/index.html' || path === '/legacy/index.html') {
      const id = url.searchParams.get('room');
      if (id) {
        if (!roomId.test(id)) return json({error:404},404);
        const response = await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(new Request(`${url.origin}/release`));
        if (!response.ok) return response;
        const pinned = await response.json();
        const destination = `${pinned.clientPath}?room=${id}`;
        if (url.pathname !== pinned.clientPath) return redirect(destination);
      } else if (!scoped || path === '/legacy/index.html') return redirect(`/releases/${current}/`);
      return asset(release, path === '/legacy/index.html' ? 'legacy/index.html' : 'index.html');
    }
    if (path === '/legacy/') return asset(release,'legacy/index.html');
    return asset(release,path.slice(1));
  }};
}
