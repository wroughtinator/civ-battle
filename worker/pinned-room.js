// The stable Durable Object delegates all gameplay and socket handling to the
// immutable release chosen when its room was created. Never substitute latest.
const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store'}});

export function pinnedRoomClass(Base, releases, bootstrap) {
  return class PinnedRoom extends Base {
    constructor(ctx, env) {
      super(ctx, env);
      this.ctx = ctx;
      this.env = env;
      this.ready = ctx.blockConcurrencyWhile(async () => {
        ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
        ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS deployment (id INTEGER PRIMARY KEY, release TEXT NOT NULL)');
        const row = [...ctx.storage.sql.exec('SELECT data FROM room WHERE id=1')][0];
        const pin = [...ctx.storage.sql.exec('SELECT release FROM deployment WHERE id=1')][0];
        if (pin || row) {
          // Rooms predating release IDs get the captured production build, never latest.
          const id = pin?.release ?? bootstrap;
          this.attach(id, row ? JSON.parse(row.data) : null);
          if (!pin) this.persistPin(id);
        }
      });
    }
    attach(id, room) {
      if (!releases[id]) throw Error(`Missing immutable room release: ${id}`);
      this.release = id;
      this.game = new releases[id].Room(this.ctx, this.env, {room});
    }
    persistPin(id) {
      this.ctx.storage.sql.exec('INSERT INTO deployment(id,release) VALUES(1,?)', id);
    }
    metadata() {
      const legacy = (this.game.room.rulesVersion ?? 1) < 4 ? 'legacy/' : '';
      return {release:this.release, clientPath:`/releases/${this.release}/${legacy}`};
    }
    async fetch(request) {
      await this.ready;
      const path = new URL(request.url).pathname;
      if (path === '/init') {
        return this.ctx.blockConcurrencyWhile(async () => {
          if (this.game) return json({error:409},409);
          const id = request.headers.get('X-Meridian-Release');
          if (!releases[id]) return json({error:400},400);
          this.attach(id, null);
          const response = await this.game.fetch(request);
          if (response.ok) this.persistPin(id);
          else this.game = null;
          return response;
        });
      }
      if (!this.game?.room) return json({error:404},404);
      if (path === '/release') return json(this.metadata());
      const expected = request.headers.get('X-Meridian-Release');
      if (expected && expected !== this.release && path.endsWith('/ws') && request.headers.get('Upgrade')?.toLowerCase()==='websocket') {
        // No gameplay connection or commands are accepted from a mismatched client.
        // Older v4 clients already reload on a non-tactics state; their legacy URL
        // is resolved by the gateway to this room's actual, current client.
        const pair=new WebSocketPair();pair[1].accept();
        pair[1].send(JSON.stringify({type:'state',reload:`${this.metadata().clientPath}?room=${this.game.room.id}`,rules:{tactics:false}}));
        pair[1].close(1000,'');
        return new Response(null,{status:101,webSocket:pair[0],headers:{'Sec-WebSocket-Protocol':'meridian'}});
      }
      if (expected && expected !== this.release && !path.endsWith('/join')) return json({error:409,...this.metadata()},409);
      return this.game.fetch(request);
    }
    async webSocketMessage(...args) { await this.ready; return this.game.webSocketMessage(...args); }
    async webSocketClose(...args) { await this.ready; return this.game.webSocketClose(...args); }
    async webSocketError(...args) { await this.ready; return this.game.webSocketError(...args); }
    async alarm() { await this.ready; if (this.game) return this.game.alarm(); }
  };
}
