var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.js
import { DurableObject } from "cloudflare:workers";
import wasm from "../../engines/01c02144ca046db03646b653664ff102a1fb057b5718fab13eee296fab37b2fe.wasm";
import legacyWasm from "../../engines/c6387ac3b9eb93c0293b803cf3f04b02beee0265c1cbb1e62dc77f94a73fa659.wasm";
import previousWasm from "../../engines/2e63a432dc38d562f41fed21783b11be05d029127abd615b32a3099232eb3a26.wasm";
import v3Wasm from "../../engines/863793bcfb627242fe42bd5d9712a70960bfa5006a529db4f9d365da8c5ea072.wasm";

// worker/wasm.js
function makeEngine(module) {
  const { exports: e } = new WebAssembly.Instance(module, {});
  const encode = new TextEncoder(), decode = new TextDecoder();
  return (request) => {
    const bytes = encode.encode(JSON.stringify(request));
    const ptr = e.alloc(bytes.length);
    new Uint8Array(e.memory.buffer, ptr, bytes.length).set(bytes);
    e.run(ptr, bytes.length);
    const result = JSON.parse(decode.decode(new Uint8Array(e.memory.buffer, e.output_ptr(), e.output_len())));
    if (!result.state) throw new Error("Simulation failed");
    return result;
  };
}
__name(makeEngine, "makeEngine");

// worker/index.js
var engine = makeEngine(wasm);
var legacyEngine = makeEngine(legacyWasm);
var previousEngine = makeEngine(previousWasm);
var v3Engine = makeEngine(v3Wasm);
var json = /* @__PURE__ */ __name((data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } }), "json");
var random = /* @__PURE__ */ __name((bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, "0")).join(""), "random");
var digest = /* @__PURE__ */ __name(async (value) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((x) => x.toString(16).padStart(2, "0")).join(""), "digest");
var validOrigin = /* @__PURE__ */ __name((req) => !req.headers.get("Origin") || req.headers.get("Origin") === new URL(req.url).origin, "validOrigin");
var cleanName = /* @__PURE__ */ __name((name) => typeof name === "string" ? Array.from(name.replace(/[\u0000-\u001f\u007f]/g, "")).slice(0, 32).join("") : "", "cleanName");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, version: 4, engine: "rust-wasm" });
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!validOrigin(request)) return json({ error: 403 }, 403);
    if (Number(request.headers.get("content-length")) > 4096) return json({ error: 413 }, 413);
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const id = random(10);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(id));
      return stub.fetch(new Request(`${url.origin}/init`, { method: "POST", body: await request.text(), headers: { "X-Room": id } }));
    }
    const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{20})\/(join|ws)$/);
    if (!match) return json({ error: 404 }, 404);
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
  }
};
var Room = class extends DurableObject {
  static {
    __name(this, "Room");
  }
  constructor(ctx, env, loaded) {
    super(ctx, env);
    this.ctx = ctx;
    this.room = loaded?.room ?? null;
    if (loaded) return;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, data TEXT NOT NULL)");
      const rows = [...ctx.storage.sql.exec("SELECT data FROM room WHERE id=1")];
      if (rows.length) {
        this.room = JSON.parse(rows[0].data);
        if (this.room.rulesVersion !== 4 && this.room.phase === "lobby") {
          const old = this.room.game;
          this.room.game = engine({ op: "new", hidden_rolls: Array.from(crypto.getRandomValues(new Uint32Array(642))), seed: old.seed, count: old.players.length, difficulty: old.difficulty }).state;
          this.room.seats.forEach((seat, i) => Object.assign(this.room.game.players[i], { bot: !!seat.disconnectedAt, civ: old.players[i].civ, tag: old.players[i].tag, name: old.players[i].name }));
          this.room.rulesVersion = 4;
          this.room.intel = [];
          this.save();
        }
      }
    });
  }
  save() {
    this.ctx.storage.sql.exec("INSERT INTO room(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", JSON.stringify(this.room));
  }
  async schedule() {
    if (this.room.phase === "running") await this.ctx.storage.setAlarm(Date.now() + 2e3);
    else await this.ctx.storage.setAlarm(Date.now() + 864e5);
  }
  seatFor(hash) {
    return this.room.seats.findIndex((s) => s?.hash === hash);
  }
  simulate(request) {
    return (this.room.rulesVersion === 4 ? engine : this.room.rulesVersion === 3 ? v3Engine : this.room.rulesVersion === 2 ? previousEngine : legacyEngine)(request);
  }
  identity(slot, options) {
    const player = this.room.game.players[slot];
    if (Number.isInteger(options.civ) && options.civ >= 0 && options.civ < 8) player.civ = options.civ;
    let tag = Number.isInteger(options.tag) && options.tag >= 1e3 && options.tag <= 9999 ? options.tag : 1e3 + crypto.getRandomValues(new Uint32Array(1))[0] % 9e3;
    while (this.room.game.players.some((p, i) => i !== slot && p.tag === tag)) tag = 1e3 + (tag - 999) % 9e3;
    player.tag = tag;
    const name = cleanName(options.name);
    if (name.trim()) player.name = name;
    else if (!player.name || player.name.startsWith("Computer ")) player.name = `Wandering Fox ${slot + 1}`;
  }
  async fetch(request) {
    return this.ctx.blockConcurrencyWhile(() => this.handleFetch(request));
  }
  async handleFetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/init") {
      if (this.room) return json({ error: 409 }, 409);
      let options;
      try {
        options = JSON.parse((await request.text()).slice(0, 4096) || "{}");
      } catch {
        return json({ error: 400 }, 400);
      }
      if (!options || typeof options !== "object" || Array.isArray(options)) return json({ error: 400 }, 400);
      if (options.count !== void 0 && (!Number.isInteger(options.count) || options.count < 2 || options.count > 8)) return json({ error: 400 }, 400);
      const count = options.count ?? 8;
      const seed = Number.isInteger(options.seed) ? options.seed >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0];
      const token2 = random(32), hash = await digest(token2);
      this.room = { id: request.headers.get("X-Room"), phase: "lobby", revision: 1, createdAt: Date.now(), updatedAt: Date.now(), game: engine({ op: "new", hidden_rolls: Array.from(crypto.getRandomValues(new Uint32Array(642))), seed, count, difficulty: Number.isInteger(options.difficulty) ? Math.max(0, Math.min(2, options.difficulty)) : 1 }).state, seats: [{ hash, seq: 0, acks: [], disconnectedAt: Date.now() }] };
      this.room.rulesVersion = 4;
      this.identity(0, options);
      this.save();
      await this.schedule();
      return json({ room: this.room.id, token: token2, slot: 0, seq: 0 }, 201);
    }
    if (!this.room) return json({ error: 404 }, 404);
    if (url.pathname.endsWith("/join") && request.method === "POST") {
      let body;
      try {
        body = JSON.parse((await request.text()).slice(0, 4096) || "{}");
      } catch {
        return json({ error: 400 }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: 400 }, 400);
      const hash = typeof body.token === "string" ? await digest(body.token) : "";
      let slot2 = this.seatFor(hash);
      if (slot2 >= 0) return json({ room: this.room.id, token: body.token, slot: slot2, seq: this.room.seats[slot2].seq });
      if (this.room.phase !== "lobby") return json({ error: 409 }, 409);
      slot2 = this.room.seats.length;
      if (slot2 >= this.room.game.players.length) return json({ error: 8 }, 409);
      const token2 = random(32);
      this.room.seats.push({ hash: await digest(token2), seq: 0, acks: [], disconnectedAt: Date.now() });
      this.room.game.players[slot2].bot = true;
      this.identity(slot2, body);
      this.room.revision++;
      this.save();
      this.broadcast();
      return json({ room: this.room.id, token: token2, slot: slot2, seq: 0 });
    }
    if (!url.pathname.endsWith("/ws") || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: 400 }, 400);
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") || "").split(",").map((x) => x.trim());
    const token = protocols.find((x) => /^[a-f0-9]{64}$/.test(x));
    if (!token) return json({ error: 401 }, 401);
    const slot = this.seatFor(await digest(token));
    if (slot < 0) return json({ error: 401 }, 401);
    for (const old of this.ctx.getWebSockets()) if (old.deserializeAttachment()?.slot === slot) old.close(4001, "");
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ slot, window: Date.now(), messages: 0 });
    this.room.seats[slot].disconnectedAt = 0;
    this.room.seats[slot].lastSeen = Date.now();
    this.room.game.players[slot].bot = false;
    this.room.revision++;
    this.save();
    pair[1].send(JSON.stringify({ type: "welcome", slot, seq: this.room.seats[slot].seq, world: this.room.game.tiles.map((t) => ({ p: t.p, poly: t.poly, near: t.near, terrain: t.terrain, capital: t.capital, site: t.site })) }));
    this.broadcast();
    return new Response(null, { status: 101, webSocket: pair[0], headers: { "Sec-WebSocket-Protocol": "meridian" } });
  }
  view(slot) {
    const g = this.room.game;
    const view = this.simulate({ op: "view", state: g, player: slot }).state;
    this.room.intel ??= [];
    const memory = this.room.intel[slot] ??= [];
    view.tiles.forEach((t, i) => {
      if (t.visible) {
        memory[i] = { owner: t.owner, building: t.building };
        t.explored = true;
      } else if (memory[i]) {
        if (memory[i].owner === slot) memory[i].owner = -2;
        Object.assign(t, memory[i]);
        t.explored = true;
      } else t.explored = false;
    });
    return {
      ...view,
      type: "state",
      revision: this.room.revision,
      phase: this.room.phase,
      tick: g.tick,
      seed: g.seed,
      difficulty: g.difficulty,
      winner: g.winner,
      victory: g.victory,
      serverTime: Date.now(),
      host: slot === 0,
      humans: this.room.seats.length,
      connected: this.room.seats.map((s) => !s.disconnectedAt)
    };
  }
  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify(this.view(ws.deserializeAttachment().slot)));
      } catch {
      }
    }
    this.save();
  }
  advance() {
    if (this.room.phase !== "running") return;
    const now = Date.now();
    const ticks = Math.min(60, Math.floor((now - this.room.updatedAt) / 1e3));
    if (ticks <= 0) return;
    this.room.seats.forEach((s, i) => {
      if (!s.disconnectedAt && s.lastSeen && now - s.lastSeen > 25e3) s.disconnectedAt = now;
      if (s.disconnectedAt && now - s.disconnectedAt > 0) this.room.game.players[i].bot = true;
    });
    this.room.game = this.simulate({ op: "step", state: this.room.game, ticks }).state;
    this.room.updatedAt += ticks * 1e3;
    if (this.room.game.winner >= 0) this.room.phase = "ended";
    this.room.revision++;
  }
  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 2048) {
      ws.close(1009, "");
      return;
    }
    const a = ws.deserializeAttachment();
    const now = Date.now();
    if (now - a.window > 1e4) {
      a.window = now;
      a.messages = 0;
    }
    if (++a.messages > 50) {
      ws.close(1008, "");
      return;
    }
    ws.serializeAttachment(a);
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: "error", code: 400 }));
      return;
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      ws.send(JSON.stringify({ type: "error", code: 400 }));
      return;
    }
    if (msg.type === "ping") {
      const seat = this.room.seats[a.slot];
      seat.lastSeen = now;
      if (typeof msg.active === "boolean" && this.room.game.players[a.slot].bot === msg.active) {
        seat.disconnectedAt = msg.active ? 0 : now;
        this.room.game.players[a.slot].bot = !msg.active;
        this.room.revision++;
        this.broadcast();
      }
      ws.send(JSON.stringify({ type: "pong", time: msg.time }));
      return;
    }
    if (msg.type === "presence") {
      if (typeof msg.active !== "boolean") {
        ws.send(JSON.stringify({ type: "error", code: 400 }));
        return;
      }
      await this.ctx.blockConcurrencyWhile(async () => {
        const seat = this.room.seats[a.slot];
        seat.disconnectedAt = msg.active ? 0 : Date.now();
        seat.lastSeen = Date.now();
        this.room.game.players[a.slot].bot = !msg.active;
        this.room.revision++;
        this.broadcast();
      });
      return;
    }
    if (!Number.isSafeInteger(msg.seq) || msg.seq < 1) {
      ws.send(JSON.stringify({ type: "error", code: 400 }));
      return;
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      const seat = this.room.seats[a.slot];
      if (msg.seq <= seat.seq) {
        ws.send(JSON.stringify(seat.acks.find((x) => x.seq === msg.seq) || { type: "ack", seq: msg.seq, error: 0, duplicate: true }));
        return;
      }
      if (msg.seq !== seat.seq + 1) {
        ws.send(JSON.stringify({ type: "resync", seq: seat.seq }));
        return;
      }
      this.advance();
      let error = 0;
      if (msg.type === "start") {
        if (a.slot !== 0 || this.room.phase !== "lobby") error = 1;
        else {
          this.room.phase = "running";
          this.room.updatedAt = Date.now();
        }
      } else if (msg.type === "configure") {
        if (a.slot !== 0 || this.room.phase !== "lobby") error = 1;
        else if (!["count", "seed", "difficulty"].every((k) => msg[k] === void 0 || Number.isInteger(msg[k]) && msg[k] >= 0 && msg[k] <= 4294967295)) error = 6;
        else if (msg.count !== void 0 && (msg.count < Math.max(2, this.room.seats.length) || msg.count > 8)) error = 6;
        else {
          const count = msg.count ?? this.room.game.players.length;
          const seed = Number.isInteger(msg.seed) ? msg.seed >>> 0 : this.room.game.seed;
          const difficulty = msg.difficulty === void 0 ? this.room.game.difficulty : Math.max(0, Math.min(2, msg.difficulty));
          const old = this.room.game.players;
          this.room.game = this.simulate({ op: "new", hidden_rolls: Array.from(crypto.getRandomValues(new Uint32Array(642))), seed, count, difficulty }).state;
          this.room.intel = [];
          this.room.seats.forEach((seat2, i) => {
            this.room.game.players[i].bot = !!seat2.disconnectedAt;
            this.room.game.players[i].civ = old[i]?.civ ?? i;
            this.room.game.players[i].tag = old[i]?.tag ?? 1001 + i;
            this.room.game.players[i].name = old[i]?.name || `Wandering Fox ${i + 1}`;
          });
          for (const w of this.ctx.getWebSockets()) w.send(JSON.stringify({ type: "world", world: this.room.game.tiles.map((t) => ({ p: t.p, poly: t.poly, near: t.near, terrain: t.terrain, capital: t.capital, site: t.site })) }));
        }
      } else if (msg.type === "civ") {
        if (this.room.phase !== "lobby" || !Number.isInteger(msg.civ) || msg.civ < 0 || msg.civ > 7) error = 6;
        else this.identity(a.slot, { civ: msg.civ, name: msg.name ?? this.room.game.players[a.slot].name, tag: msg.tag ?? this.room.game.players[a.slot].tag });
      } else if (msg.type === "command") {
        if (this.room.phase !== "running") error = 1;
        else if (!(this.room.rulesVersion === 4 ? ["move", "stop", "ability", "attack", "disband", "explore", "refit", "research", "train", "upgrade"] : ["march", "build", "research", "train", "maneuver", "strike", "satellite", "doctrine"]).includes(msg.kind) || !["from", "to", "value"].every((k) => msg[k] === void 0 || Number.isInteger(msg[k]) && msg[k] >= 0 && msg[k] < (k === "value" ? 256 : 1e4))) error = 6;
        else {
          const result = this.simulate({ op: "command", state: this.room.game, player: a.slot, kind: msg.kind, from: msg.from || 0, to: msg.to || 0, value: msg.value || 0 });
          this.room.game = result.state;
          error = result.error;
        }
      } else error = 6;
      const ack = { type: "ack", seq: msg.seq, error };
      seat.seq = msg.seq;
      seat.acks.push(ack);
      seat.acks = seat.acks.slice(-32);
      this.room.revision++;
      this.save();
      await this.schedule();
      ws.send(JSON.stringify(ack));
      this.broadcast();
    });
  }
  async webSocketClose(ws, code) {
    const a = ws.deserializeAttachment();
    if (!a || !this.room) return;
    const replacement = this.ctx.getWebSockets().some((w) => w !== ws && w.deserializeAttachment()?.slot === a.slot && w.readyState === 1);
    if (!replacement) {
      this.room.seats[a.slot].disconnectedAt = Date.now();
      this.room.game.players[a.slot].bot = true;
      this.room.revision++;
      this.save();
      this.broadcast();
    }
    try {
      ws.close(code === 1005 ? 1e3 : code, "");
    } catch {
    }
  }
  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011);
  }
  async alarm() {
    if (!this.room) return;
    if (this.room.phase !== "running") {
      if (Date.now() - this.room.createdAt > 864e5) {
        for (const w of this.ctx.getWebSockets()) w.close(1e3, "");
        this.ctx.storage.sql.exec("DELETE FROM room");
        this.room = null;
      } else await this.schedule();
      return;
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      this.advance();
      this.save();
      await this.schedule();
      this.broadcast();
    });
  }
};
export {
  Room,
  index_default as default
};
//# sourceMappingURL=index.js.map
