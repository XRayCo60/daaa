(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./shared.js'));
  } else {
    root.OSTGame = factory(root.OST);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (OST) {
'use strict';

const { UNIT_TYPES, CITIES, CITY_R, POP_CAP, WORLD, FACTIONS } = OST;

let _id = 1;
function nid() { return _id++; }

function opp(f) { return f === 'ger' ? 'sov' : 'ger'; }

class Game {
  constructor() {
    this.clients = new Map(); // id -> { faction, ready, ai, alive, name }
    this.resetMenu();
  }

  resetMenu() {
    this.phase = 'menu'; // menu | lobby | playing | ended | busy (client-only)
    this.mode = null; // single | multi
    this.hostId = null;
    this.participants = new Set();
    this.winner = null;
    this.winText = '';
    this.tickN = 0;
    this.day = 1;
    this.acc = 0;
    this.units = [];
    this.cities = [];
    this.res = {
      ger: { i: 0, m: 0, o: 0 },
      sov: { i: 0, m: 0, o: 0 }
    };
    this.shots = [];
    this.deaths = [];
    this.alerts = [];
    this.aiFac = null;
    this.aiAcc = 0;
    this.aiPushAt = 0;
    this.endedAt = 0;
    this.starved = { ger: false, sov: false };
    this.humanFac = null;
    for (const [id, c] of this.clients) {
      c.faction = null;
      c.ready = false;
      c.ai = false;
    }
  }

  connect(want) {
    const id = want || ('p' + nid());
    if (!this.clients.has(id)) {
      this.clients.set(id, { faction: null, ready: false, ai: false, alive: true });
    }
    return id;
  }

  disconnect(id) {
    const c = this.clients.get(id);
    this.clients.delete(id);
    if (!c) return;
    if (this.phase === 'lobby') {
      c.ready = false;
      if (id === this.hostId && this.mode === 'single') { this.resetMenu(); return; }
      const humans = [...this.clients.values()].filter(x => !x.ai);
      if (humans.length === 0) this.resetMenu();
    } else if (this.phase === 'playing' && this.mode === 'multi' && c.faction && !this.aiFac) {
      this.aiFac = c.faction;
      this.aiPushAt = this.tickN + 40;
      this.alerts.push({ fac: opp(c.faction), text: 'حریف قطع شد — ستاد کل جبههٔ مقابل را گرفت', ttl: 6 });
    } else if (this.phase === 'playing' && this.mode === 'single') {
      // host left
      this.resetMenu();
    }
  }

  canSee(id) {
    if (this.phase !== 'playing' && this.phase !== 'ended') return false;
    return this.participants.has(id);
  }

  hello(id) {
    if (this.phase === 'lobby' && this.mode === 'single' && id !== this.hostId) {
      return { t: 'hello', id, phase: 'busy', mode: this.mode, players: [] };
    }
    if ((this.phase === 'playing' || this.phase === 'ended') && !this.participants.has(id)) {
      return { t: 'hello', id, phase: 'busy', mode: this.mode, players: [] };
    }
    const players = [];
    for (const [pid, c] of this.clients) {
      if (this.mode === 'single' && pid !== this.hostId && pid !== id) continue;
      players.push({
        id: pid,
        you: pid === id,
        faction: c.faction,
        ready: c.ready
      });
    }
    return {
      t: 'hello',
      id,
      phase: this.phase,
      mode: this.mode,
      players,
      winner: this.winner,
      winText: this.winText
    };
  }

  handle(id, msg) {
    if (!msg || typeof msg !== 'object') return;
    const c = this.clients.get(id);
    if (!c) return;
    const t = msg.t;
    if (t === 'mode') this._mode(id, msg.mode);
    else if (t === 'faction') this._faction(id, msg.faction);
    else if (t === 'ready') this._ready(id);
    else if (t === 'cancel') this._cancel(id);
    else if (t === 'cmd' && this.phase === 'playing') this._cmd(id, msg.c);
    else if (t === 'leave') {
      if (this.phase !== 'playing') this.resetMenu();
    }
  }

  _mode(id, mode) {
    if (this.phase === 'playing' || this.phase === 'ended') return;
    if (mode === 'multi') {
      if (this.phase === 'lobby' && this.mode === 'multi') return;
      if (this.phase === 'lobby' && this.mode === 'single') return;
      this.phase = 'lobby';
      this.mode = 'multi';
      this.hostId = id;
      return;
    }
    if (mode === 'single') {
      if (this.phase === 'lobby') return;
      this.phase = 'lobby';
      this.mode = 'single';
      this.hostId = id;
    }
  }

  _faction(id, fac) {
    if (this.phase !== 'lobby') return;
    if (fac !== 'ger' && fac !== 'sov') return;
    const c = this.clients.get(id);
    for (const [pid, o] of this.clients) {
      if (pid !== id && o.faction === fac && !o.ai) return; // taken
    }
    c.faction = fac;
    c.ready = false;
  }

  _ready(id) {
    if (this.phase !== 'lobby') return;
    const c = this.clients.get(id);
    if (!c.faction) return;
    c.ready = true;
    this._tryStart();
  }

  _cancel() {
    if (this.phase === 'playing') return;
    this.resetMenu();
  }

  _tryStart() {
    const humans = [...this.clients.entries()].filter(([, c]) => !c.ai);
    if (this.mode === 'single') {
      const h = humans.find(([, c]) => c.ready && c.faction);
      if (!h) return;
      this.humanFac = h[1].faction;
      this.aiFac = opp(h[1].faction);
      this._boot([h[0]]);
      return;
    }
    if (this.mode === 'multi') {
      const ready = humans.filter(([, c]) => c.ready && c.faction);
      if (ready.length < 2) return;
      const f0 = ready[0][1].faction;
      const f1 = ready[1][1].faction;
      if (f0 === f1) return;
      this.humanFac = null;
      this.aiFac = null;
      this._boot([ready[0][0], ready[1][0]]);
    }
  }

  _boot(ids) {
    this.participants = new Set(ids || []);
    this.phase = 'playing';
    this.winner = null;
    this.tickN = 0;
    this.day = 1;
    this.acc = 0;
    this.shots = [];
    this.deaths = [];
    this.alerts = [];
    this.aiAcc = 0;
    this.aiPushAt = OST.TICK * 90;
    this.starved = { ger: false, sov: false };
    this.res = {
      ger: { i: 90, m: 120, o: 150 },
      sov: { i: 80, m: 160, o: 90 }
    };
    this.vpHold = { ger: 0, sov: 0 };
    this.events = { siberia: false, mud: false, winter: false };
    this.waves = { g1: false, g2: false, s1: false, s2: false };
    this.frontHold = { north: { ger: 0, sov: 0 }, center: { ger: 0, sov: 0 }, south: { ger: 0, sov: 0 } };
    this.frontBoom = { north: null, center: null, south: null };
    this._nets = { ger: new Set(), sov: new Set() };
    this.cities = CITIES.map(c => ({
      id: c.id, x: c.x, y: c.y,
      owner: c.owner,
      home: c.owner,
      cap: 0,
      capFac: null,
      queue: [],
      rally: { x: c.x + (c.owner === 'ger' ? 80 : -80), y: c.y },
      lastAlert: 0,
      factory: c.factory || 0,
      barracks: c.barracks || 0,
      depot: c.depot || 0,
      upg: null,
      fort: 0,
      sab: 0,
      cut: false
    }));
    this.units = [];
    this._spawnInitial();
    this.alerts.push({ fac: null, text: 'آتش‌بس ' + OST.CEASEFIRE + ' ثانیه. ذخیره را با راه‌آهن به محور بفرست.', ttl: 8 });
  }

  _spawn(type, fac, x, y) {
    const def = UNIT_TYPES[type];
    if (!def) return null;
    let px = x, py = y;
    for (let k = 0; k < 8; k++) {
      if (!OST.isWater(px, py)) break;
      px = x + (Math.random() - 0.5) * 80;
      py = y + (Math.random() - 0.5) * 80;
    }
    const u = {
      id: nid(),
      type, fac,
      x: px, y: py,
      hp: def.hp,
      ang: fac === 'ger' ? 0 : Math.PI,
      tx: px, ty: py,
      order: 'idle',
      targetId: 0,
      cd: 0,
      salvoLeft: def.salvo || 0,
      supplied: true,
      ent: 0,
      way: null,
      wi: 0
    };
    this.units.push(u);
    return u;
  }

  _spawnInitial() {
    const scatter = (list) => {
      for (const [type, fac, cx, cy, n] of list) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const r = 28 + (i % 3) * 18;
          this._spawn(type, fac, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
      }
    };
    const C = (id) => OST.cityById(id);
    scatter([
      ['grenadier', 'ger', C('warsaw').x, C('warsaw').y, 2],
      ['grenadier', 'ger', C('konigsberg').x, C('konigsberg').y, 1],
      ['grenadier', 'ger', C('krakow').x, C('krakow').y, 1],
      ['grenadier', 'ger', C('berlin').x + 40, C('berlin').y, 2],
      ['panzer4', 'ger', C('berlin').x + 70, C('berlin').y - 20, 1],
      ['pak40', 'ger', C('warsaw').x - 30, C('warsaw').y + 40, 1]
    ]);
    scatter([
      ['strelok', 'sov', C('brest').x, C('brest').y, 1],
      ['strelok', 'sov', C('lvov').x, C('lvov').y, 1],
      ['strelok', 'sov', C('kaunas').x, C('kaunas').y, 1],
      ['strelok', 'sov', C('riga').x, C('riga').y, 1],
      ['strelok', 'sov', C('minsk').x, C('minsk').y, 2],
      ['strelok', 'sov', C('kiev').x, C('kiev').y, 1],
      ['strelok', 'sov', C('smolensk').x, C('smolensk').y, 1],
      ['strelok', 'sov', C('moscow').x, C('moscow').y, 2],
      ['strelok', 'sov', C('gorky').x, C('gorky').y, 1],
      ['zis3', 'sov', C('kiev').x - 20, C('kiev').y + 30, 1]
    ]);
  }

  _network(fac) {
    const cap = this.cities.find(c => c.owner === fac && OST.cityById(c.id).capital);
    const owned = new Set();
    for (const c of this.cities) if (c.owner === fac && !c.cut) owned.add(c.id);
    const net = new Set();
    if (!cap) return net;
    const q = [cap.id];
    net.add(cap.id);
    while (q.length) {
      const u = q.shift();
      const ns = OST.neighbors(u);
      for (let i = 0; i < ns.length; i++) {
        const v = ns[i];
        if (owned.has(v) && !net.has(v)) { net.add(v); q.push(v); }
      }
    }
    return net;
  }

  pop(fac) {
    let n = 0;
    for (const u of this.units) if (u.fac === fac) n += UNIT_TYPES[u.type].pop;
    return n;
  }

  _cmd(pid, cmd) {
    if (!cmd) return;
    const c = this.clients.get(pid);
    if (!c || !c.faction) return;
    const fac = c.faction;
    if (cmd.k === 'move') this._orderMove(fac, cmd.ids, cmd.x, cmd.y, 'move');
    else if (cmd.k === 'attack') this._orderMove(fac, cmd.ids, cmd.x, cmd.y, 'attack', cmd.tid);
    else if (cmd.k === 'stop') this._stop(fac, cmd.ids);
    else if (cmd.k === 'produce') this._produce(fac, cmd.city, cmd.type);
    else if (cmd.k === 'rally') this._rally(fac, cmd.city, cmd.x, cmd.y);
    else if (cmd.k === 'upgrade') this._upgrade(fac, cmd.city, cmd.what);
  }

  _mine(fac, ids) {
    const set = new Set(ids || []);
    return this.units.filter(u => u.fac === fac && set.has(u.id));
  }

  _orderMove(fac, ids, x, y, order, tid) {
    x = OST.clamp(x, 20, WORLD.W - 20);
    y = OST.clamp(y, 20, WORLD.H - 20);
    const us = this._mine(fac, ids);
    if (!us.length) return;
    // formation offset
    const col = Math.ceil(Math.sqrt(us.length));
    us.forEach((u, i) => {
      const ox = (i % col) * 22 - (col * 11);
      const oy = Math.floor(i / col) * 22 - (col * 8);
      u.tx = x + ox;
      u.ty = y + oy;
      u.order = order;
      u.targetId = tid || 0;
      this._railWay(u, u.tx, u.ty);
    });
  }

  _railWay(u, x, y) {
    u.way = null;
    u.wi = 0;
    const def = UNIT_TYPES[u.type];
    if (!def || def.cls === 'air') return;
    if (Math.hypot(x - u.x, y - u.y) < 260) return;
    const from = OST.nearestCity(u.x, u.y);
    const to = OST.nearestCity(x, y);
    if (!from || !to || from.id === to.id) return;
    const chain = OST.pathCities(from.id, to.id);
    if (!chain || chain.length < 2) return;
    const pts = [];
    for (let i = 0; i < chain.length; i++) {
      const c = OST.cityById(chain[i]);
      if (i === 0 && Math.hypot(u.x - c.x, u.y - c.y) < 80) continue;
      pts.push({ x: c.x, y: c.y });
    }
    pts.push({ x, y });
    u.way = pts;
    u.wi = 0;
  }

  _stop(fac, ids) {
    for (const u of this._mine(fac, ids)) {
      u.order = 'idle';
      u.tx = u.x;
      u.ty = u.y;
      u.targetId = 0;
      u.way = null;
      u.wi = 0;
    }
  }

  _rally(fac, cityId, x, y) {
    const city = this.cities.find(c => c.id === cityId);
    if (!city || city.owner !== fac) return;
    city.rally = { x, y };
  }

  _canMake(city, def) {
    if (def.cls === 'inf') return city.barracks >= 1;
    if (def.cls === 'at') return city.barracks >= 1 || city.factory >= 1;
    return city.factory >= 1;
  }

  _produce(fac, cityId, type) {
    const def = UNIT_TYPES[type];
    if (!def || def.faction !== fac) return;
    const city = this.cities.find(c => c.id === cityId);
    if (!city || city.owner !== fac) return;
    if (!this._canMake(city, def)) return;
    const slots = 3 + (city.factory || 0);
    if (city.queue.length >= slots) return;
    if (this.pop(fac) + def.pop > POP_CAP) return;
    const r = this.res[fac];
    if (r.i < def.cost.i || r.m < def.cost.m || r.o < def.cost.o) return;
    r.i -= def.cost.i;
    r.m -= def.cost.m;
    r.o -= def.cost.o;
    const spd = 1 + (city.factory || 0) * 0.16 + (def.cls === 'inf' ? (city.barracks || 0) * 0.18 : 0);
    city.queue.push({ type, left: def.build / spd });
  }

  _upgrade(fac, cityId, what) {
    const spec = OST.UPGRADES[what];
    if (!spec) return;
    const city = this.cities.find(c => c.id === cityId);
    if (!city || city.owner !== fac || city.upg) return;
    if ((city[what] || 0) >= spec.max) return;
    const r = this.res[fac];
    if (r.i < spec.i) return;
    r.i -= spec.i;
    city.upg = { what, left: spec.t };
  }

  tick(dt) {
    if (this.phase !== 'playing') return;
    this.tickN++;
    this.shots = [];
    this.deaths = [];
    this._nets = { ger: this._network('ger'), sov: this._network('sov') };
    this.acc += dt;
    if (this.acc >= 1) {
      this.acc -= 1;
      this._income();
      this._fuel();
      this._partisan(1);
      this._frontTick(1);
      if (this.tickN % (OST.TICK * 25) === 0) {
        this.day++;
        this._seasonEvents();
      }
    }
    if (this.tickN === OST.CEASEFIRE * OST.TICK) {
      this.alerts.push({ fac: null, text: 'آتش‌بس تمام شد — آتش آزاد', ttl: 6 });
    }
    this._waves();
    this._production(dt);
    this._supply();
    this._move(dt);
    this._separate();
    this._combat(dt);
    this._capture(dt);
    this._alerts();
    if (this.aiFac) {
      this.aiAcc += dt;
      if (this.aiAcc >= 0.55) {
        this.aiAcc = 0;
        this._ai();
      }
    }
    this._win();
    this.alerts = this.alerts.filter(a => (a.ttl -= dt) > 0);
  }

  _income() {
    const netG = this._nets.ger;
    const netS = this._nets.sov;
    for (const c of this.cities) {
      const proto = OST.cityById(c.id);
      const net = c.owner === 'ger' ? netG : netS;
      const mul = c.cut ? 0.15 : (net.has(c.id) ? 1 : 0.28);
      const r = this.res[c.owner];
      r.i += proto.i * mul * (1 + (c.factory || 0) * 0.12);
      r.m += proto.m * mul * (1 + (c.barracks || 0) * 0.08);
      r.o += proto.o * mul * (1 + (c.depot || 0) * 0.28);
      if (c.depot && net.has(c.id)) r.o += 0.14;
    }
    for (const f of ['ger', 'sov']) {
      this.res[f].i = Math.min(999, this.res[f].i);
      this.res[f].m = Math.min(999, this.res[f].m);
      this.res[f].o = Math.min(999, this.res[f].o);
    }
  }

  _vpOf(fac) {
    let v = 0;
    for (const c of this.cities) {
      if (c.owner === fac) v += OST.cityById(c.id).vp || 0;
    }
    return v;
  }

  _partisan(dt) {
    for (const city of this.cities) {
      if (city.owner === city.home) {
        city.sab = 0;
        city.cut = false;
        continue;
      }
      let gar = 0;
      for (const u of this.units) {
        if (u.fac === city.owner && OST.dist(u, city) < 120) gar++;
      }
      if (gar) city.sab = Math.max(0, city.sab - dt * 0.12);
      else {
        const rate = (city.home === 'sov' && city.owner === 'ger') ? 0.04 : 0.022;
        city.sab = Math.min(1, city.sab + dt * rate);
      }
      const was = city.cut;
      city.cut = city.sab >= 1;
      if (city.cut && !was) {
        this.alerts.push({
          fac: city.owner,
          text: 'پارتیزان خط آهن ' + OST.cityById(city.id).nameFa + ' را بست',
          ttl: 6
        });
      }
    }
  }

  _waves() {
    const t = this.tickN / OST.TICK;
    const spawn = (type, fac, id, n) => {
      const city = this.cities.find(c => c.id === id && c.owner === fac);
      if (!city) return;
      for (let i = 0; i < n; i++) {
        if (this.pop(fac) + (UNIT_TYPES[type].pop || 1) > POP_CAP) return;
        this._spawn(type, fac, city.x + (Math.random() - 0.5) * 40, city.y + (Math.random() - 0.5) * 40);
      }
    };
    if (!this.waves.g1 && t >= 90) {
      this.waves.g1 = true;
      spawn('grenadier', 'ger', 'warsaw', 2);
      spawn('panzer4', 'ger', 'warsaw', 1);
      this.alerts.push({ fac: 'ger', text: 'موج دوم زرهی به ورشو رسید', ttl: 6 });
    }
    if (!this.waves.g2 && t >= 160) {
      this.waves.g2 = true;
      spawn('grenadier', 'ger', 'berlin', 1);
      spawn('wespe', 'ger', 'berlin', 1);
      this.alerts.push({ fac: 'ger', text: 'ذخیرهٔ برلین آمادهٔ اعزام است', ttl: 6 });
    }
    if (!this.waves.s1 && t >= 100) {
      this.waves.s1 = true;
      spawn('strelok', 'sov', 'moscow', 3);
      this.alerts.push({ fac: 'sov', text: 'بسیج مسکو — سه لشکر پیاده', ttl: 6 });
    }
    if (!this.waves.s2 && t >= 170) {
      this.waves.s2 = true;
      spawn('t34', 'sov', 'gorky', 1);
      spawn('strelok', 'sov', 'gorky', 1);
      this.alerts.push({ fac: 'sov', text: 'زره از گورکی به خط آمد', ttl: 6 });
    }
  }

  _frontTick(dt) {
    for (const [k, f] of Object.entries(OST.FRONTS)) {
      let ger = 0;
      for (const id of f.ids) {
        const c = this.cities.find(x => x.id === id);
        if (c && c.owner === 'ger') ger++;
      }
      const n = f.ids.length;
      const sov = n - ger;
      const hold = this.frontHold[k];
      if (ger === n) hold.ger += dt; else hold.ger = 0;
      if (sov === n) hold.sov += dt; else hold.sov = 0;
      if (hold.ger >= 20 && this.frontBoom[k] !== 'ger') {
        this.frontBoom[k] = 'ger';
        this.alerts.push({ fac: null, text: 'محور ' + f.nameFa + ' فرو ریخت — ورماخت', ttl: 7 });
      }
      if (hold.sov >= 20 && this.frontBoom[k] !== 'sov') {
        this.frontBoom[k] = 'sov';
        this.alerts.push({ fac: null, text: 'محور ' + f.nameFa + ' تثبیت شد — ارتش سرخ', ttl: 7 });
      }
    }
  }

  _frontSnap() {
    const out = {};
    for (const [k, f] of Object.entries(OST.FRONTS)) {
      let g = 0;
      for (const id of f.ids) {
        const c = this.cities.find(x => x.id === id);
        if (c && c.owner === 'ger') g++;
      }
      out[k] = { g, n: f.ids.length, nameFa: f.nameFa };
    }
    return out;
  }

  _seasonEvents() {
    const s = OST.season(this.day);
    if (s === 'mud' && !this.events.mud) {
      this.events.mud = true;
      this.alerts.push({ fac: null, text: 'گل‌آلود — جاده‌ها بسته، راه‌آهن هنوز باز است', ttl: 7 });
    }
    if (s === 'winter' && !this.events.winter) {
      this.events.winter = true;
      this.alerts.push({ fac: null, text: 'زمستان رسید — موتورها یخ می‌زنند', ttl: 7 });
    }
    if (this.day >= 18 && !this.events.siberia) {
      this.events.siberia = true;
      const hub = this.cities.find(c => c.id === 'moscow' && c.owner === 'sov')
        || this.cities.find(c => c.id === 'gorky' && c.owner === 'sov')
        || this.cities.find(c => c.owner === 'sov');
      if (hub) {
        const room = Math.max(0, POP_CAP - this.pop('sov'));
        let left = room;
        for (let i = 0; i < 4 && left >= 1; i++) {
          const a = i * 1.5;
          this._spawn('strelok', 'sov', hub.x + Math.cos(a) * 40, hub.y + Math.sin(a) * 40);
          left -= 1;
        }
        if (left >= 2) this._spawn('t34', 'sov', hub.x + 50, hub.y);
        this.alerts.push({ fac: null, text: 'لشکرهای سیبری به جبهه رسیدند', ttl: 7 });
      }
    }
  }

  _fuel() {
    for (const f of ['ger', 'sov']) {
      let burn = 0;
      for (const u of this.units) {
        if (u.fac !== f) continue;
        const def = UNIT_TYPES[u.type];
        if (!def.burn) continue;
        const moving = Math.hypot(u.tx - u.x, u.ty - u.y) > 14 || (u.way && u.wi < (u.way.length || 0));
        if (moving) burn += def.burn * (this._liveRail(u.x, u.y, u.fac) ? 0.55 : 1);
      }
      this.res[f].o = Math.max(0, this.res[f].o - burn);
      const was = this.starved[f];
      this.starved[f] = this.res[f].o <= 0.2;
      if (this.starved[f] && !was) {
        this.alerts.push({ fac: f, text: 'نفت تمام شد — تانک و هواپیما فلج می‌شوند', ttl: 6 });
      }
    }
  }

  _production(dt) {
    for (const city of this.cities) {
      if (city.upg) {
        city.upg.left -= dt;
        if (city.upg.left <= 0) {
          const w = city.upg.what;
          city[w] = (city[w] || 0) + 1;
          city.upg = null;
          this.alerts.push({
            fac: city.owner,
            text: OST.cityById(city.id).nameFa + ' — ' + (OST.UPGRADES[w] ? OST.UPGRADES[w].nameFa : w) + ' آماده',
            ttl: 4
          });
        }
      }
      if (!city.queue.length) continue;
      const q = city.queue[0];
      q.left -= dt;
      if (q.left <= 0) {
        const def = UNIT_TYPES[q.type];
        if (this.pop(city.owner) + (def ? def.pop : 0) <= POP_CAP) {
          const u = this._spawn(q.type, city.owner, city.x + (Math.random() - 0.5) * 36, city.y + (Math.random() - 0.5) * 36);
          if (u && city.rally) {
            u.tx = city.rally.x;
            u.ty = city.rally.y;
            u.order = 'move';
            this._railWay(u, u.tx, u.ty);
          }
        }
        city.queue.shift();
      }
    }
  }

  _supply() {
    const nets = this._nets;
    for (const u of this.units) {
      const def = UNIT_TYPES[u.type];
      if (def.cls === 'air') { u.supplied = true; continue; }
      let ok = false;
      const net = nets[u.fac];
      for (const c of this.cities) {
        if (c.owner !== u.fac || !net.has(c.id)) continue;
        const reach = 380 + (c.depot ? 180 : 0);
        if (OST.dist(u, c) < reach) { ok = true; break; }
      }
      u.supplied = ok;
    }
  }

  _liveRail(x, y, fac) {
    const net = this._nets[fac];
    if (!net) return false;
    for (let i = 0; i < OST.CONNECTIONS.length; i++) {
      const e = OST.CONNECTIONS[i];
      const A = this.cities.find(c => c.id === e[0]);
      const B = this.cities.find(c => c.id === e[1]);
      if (!A || !B || A.owner !== fac || B.owner !== fac) continue;
      if (A.cut || B.cut || !net.has(A.id) || !net.has(B.id)) continue;
      if (OST.distToSeg(x, y, A.x, A.y, B.x, B.y) < 34) return true;
    }
    return false;
  }

  _move(dt) {
    for (const u of this.units) {
      const def = UNIT_TYPES[u.type];
      if (u.targetId) {
        const t = this.units.find(x => x.id === u.targetId);
        if (t) {
          if (OST.dist(u, t) < 340) {
            u.way = null;
            u.tx = t.x;
            u.ty = t.y;
          }
        } else {
          u.targetId = 0;
          if (u.order === 'attack') u.order = 'idle';
        }
      }
      let gx = u.tx, gy = u.ty;
      if (u.way && u.wi < u.way.length) {
        gx = u.way[u.wi].x;
        gy = u.way[u.wi].y;
        if (Math.hypot(gx - u.x, gy - u.y) < 22) {
          u.wi++;
          if (u.wi >= u.way.length) u.way = null;
          else { gx = u.way[u.wi].x; gy = u.way[u.wi].y; }
        }
      }
      const dx = gx - u.x, dy = gy - u.y;
      const d = Math.hypot(dx, dy);
      const holdGun = (def.cls === 'art' || def.cls === 'at') && u.cd > 0 && u.order !== 'move';
      if (holdGun) continue;
      if ((def.cls === 'art' || def.cls === 'at') && u.order !== 'move') {
        const enemy = this._closestEnemy(u, def.range);
        if (enemy) continue;
      }
      if (d < 8) {
        if (u.order === 'move') u.order = 'idle';
        if (def.cls !== 'air') u.ent = Math.min(1, (u.ent || 0) + dt / (def.cls === 'inf' || def.cls === 'at' ? 6 : 10));
        continue;
      }
      u.ent = Math.max(0, (u.ent || 0) - dt * 2);
      let ang = Math.atan2(dy, dx);
      const sup = u.supplied ? 1 : 0.55;
      const fuel = (this.starved[u.fac] && (def.cls === 'tank' || def.cls === 'air' || def.cls === 'art')) ? 0.38 : 1;
      const onLive = def.cls !== 'air' && this._liveRail(u.x, u.y, u.fac);
      const road = def.cls === 'air' ? 1 : 0.4;
      const rail = onLive ? 2.75 : 1;
      const sea = OST.season(this.day);
      let weather = 1;
      if (def.cls !== 'air') {
        if (sea === 'mud' && !onLive) weather = 0.48;
        if (sea === 'winter') {
          weather = def.cls === 'inf' ? 0.82 : 0.66;
          if (u.fac === 'ger') weather *= 0.88;
        }
      }
      const spd = def.speed * OST.terrainFactor(u.x, u.y, def.cls, sea) * sup * fuel * rail * weather * road;
      let nx = u.x + Math.cos(ang) * spd * dt;
      let ny = u.y + Math.sin(ang) * spd * dt;
      if (def.cls !== 'air' && OST.isWater(nx, ny)) {
        let found = false;
        for (let a = 0.35; a <= 2.2; a += 0.35) {
          for (const s of [-1, 1]) {
            const a2 = ang + s * a;
            const tx = u.x + Math.cos(a2) * spd * dt;
            const ty = u.y + Math.sin(a2) * spd * dt;
            if (!OST.isWater(tx, ty)) {
              ang = a2; nx = tx; ny = ty; found = true; break;
            }
          }
          if (found) break;
        }
        if (!found) continue;
      }
      u.x = OST.clamp(nx, 16, WORLD.W - 16);
      u.y = OST.clamp(ny, 16, WORLD.H - 16);
      u.ang = ang;
    }
  }

  _separate() {
    const n = this.units.length;
    for (let i = 0; i < n; i++) {
      const a = this.units[i];
      const da = UNIT_TYPES[a.type];
      if (da.cls === 'air') continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.units[j];
        const db = UNIT_TYPES[b.type];
        if (db.cls === 'air') continue;
        if (a.fac !== b.fac) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = da.radius + db.radius + 2;
        if (d < min) {
          const push = (min - d) * 0.45;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  _closestEnemy(u, range) {
    let best = null, bd = range;
    for (const e of this.units) {
      if (e.fac === u.fac) continue;
      const d = OST.dist(u, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  _pickTarget(u, def) {
    let best = null, score = 1e9;
    const acq = def.range * (def.cls === 'art' ? 1.05 : 1.35);
    for (const e of this.units) {
      if (e.fac === u.fac) continue;
      const d = OST.dist(u, e);
      if (d > acq) continue;
      const ecl = UNIT_TYPES[e.type].cls;
      let s = d;
      if (def.cls === 'air' && ecl === 'tank') s *= 0.45;
      if (def.cls === 'tank' && ecl === 'art') s *= 0.65;
      if (def.cls === 'art' && ecl === 'inf') s *= 0.8;
      if (def.cls === 'at' && ecl === 'tank') s *= 0.32;
      if (def.cls === 'tank' && ecl === 'at') s *= 0.55;
      if (s < score) { score = s; best = e; }
    }
    return best;
  }

  _combat(dt) {
    for (const u of this.units) u.cd = Math.max(0, u.cd - dt);
    if (this.tickN < OST.CEASEFIRE * OST.TICK) return;
    const dead = new Set();
    for (const u of this.units) {
      if (dead.has(u.id)) continue;
      const def = UNIT_TYPES[u.type];
      if (u.cd > 0) continue;
      const tgt = this._pickTarget(u, def);
      if (!tgt) continue;
      const d = OST.dist(u, tgt);
      if (d > def.range) continue;
      if (def.cls === 'art' && u.order === 'move') continue;
      u.ang = Math.atan2(tgt.y - u.y, tgt.x - u.x);
      const ecl = UNIT_TYPES[tgt.type].cls;
      const vs = def.vs[ecl] || 1;
      const moving = Math.hypot(u.tx - u.x, u.ty - u.y) > 12 && def.cls !== 'air';
      const movePen = moving ? 0.75 : 1;
      const sup = u.supplied ? 1 : 0.6;
      const armor = UNIT_TYPES[tgt.type].armor;
      const pen = 1 - armor / (armor + 10);
      const cover = 1 - (tgt.ent || 0) * 0.4;
      const dmg = def.atk * vs * pen * movePen * sup * cover;
      tgt.hp -= dmg;
      this.shots.push([u.x, u.y, tgt.x, tgt.y, u.fac, def.cls]);
      if (def.splash) {
        for (const o of this.units) {
          if (o.id === tgt.id || o.fac === u.fac) continue;
          const sd = OST.dist(o, tgt);
          if (sd < def.splash) o.hp -= dmg * 0.45 * (1 - sd / def.splash);
        }
      }
      if (def.salvo) {
        u.salvoLeft = (u.salvoLeft || def.salvo) - 1;
        if (u.salvoLeft <= 0) {
          u.cd = def.salvoReload;
          u.salvoLeft = def.salvo;
        } else u.cd = def.cd;
      } else u.cd = def.cd;

      if (tgt.hp <= 0 && !dead.has(tgt.id)) {
        dead.add(tgt.id);
        this.deaths.push([tgt.x, tgt.y, UNIT_TYPES[tgt.type].cls, tgt.fac]);
      }
    }
    if (dead.size) this.units = this.units.filter(u => u.hp > 0 && !dead.has(u.id));
    else this.units = this.units.filter(u => u.hp > 0);
  }

  _capture(dt) {
    if (this.tickN < OST.CEASEFIRE * OST.TICK) return;
    for (const city of this.cities) {
      let ger = 0, sov = 0;
      for (const u of this.units) {
        if (OST.dist(u, city) > CITY_R + 8) continue;
        const cap = UNIT_TYPES[u.type].capture;
        if (u.fac === 'ger') ger += cap;
        else sov += cap;
      }
      const atkFac = ger > sov ? 'ger' : sov > ger ? 'sov' : null;
      const atk = Math.abs(ger - sov);
      const def = city.owner === 'ger' ? ger : sov;
      if (atkFac && atkFac !== city.owner && atk > 0.4) {
        city.capFac = atkFac;
        const fort = 1 + (city.barracks || 0) * 0.15 + (city.depot || 0) * 0.25 + (city.factory || 0) * 0.08;
        city.cap = Math.min(1, city.cap + dt * (0.035 + atk * 0.018) / fort);
        if (city.cap >= 1) {
          const prev = city.owner;
          city.owner = atkFac;
          city.cap = 0;
          city.queue = [];
          city.rally = { x: city.x + (atkFac === 'ger' ? 70 : -70), y: city.y };
          this.alerts.push({
            fac: null,
            text: (atkFac === 'ger' ? 'ورماخت' : 'ارتش سرخ') + ' ' + OST.cityById(city.id).nameFa + ' را گرفت',
            ttl: 5
          });
          if (OST.cityById(city.id).capital) {
            this.winner = atkFac;
            this.winText = city.id === 'moscow'
              ? 'مسکو سقوط کرد'
              : 'برلین سقوط کرد';
          }
          void prev;
        }
      } else if (!atkFac || atkFac === city.owner) {
        city.cap = Math.max(0, city.cap - dt * 0.12);
        if (city.cap <= 0) city.capFac = null;
      }
    }
  }

  _alerts() {
    for (const city of this.cities) {
      const proto = OST.cityById(city.id);
      if (this.tickN - city.lastAlert < OST.TICK * 10) continue;
      let threat = 0;
      for (const u of this.units) {
        if (u.fac !== city.owner && OST.dist(u, city) < 220) threat += 1;
      }
      if (threat >= 3) {
        city.lastAlert = this.tickN;
        this.alerts.push({
          fac: city.owner,
          text: proto.nameFa + (proto.capital ? ' — پایتخت زیر آتش است' : ' در خطر است'),
          ttl: 4
        });
      }
    }
  }

  _win() {
    if (this.winner) {
      this.phase = 'ended';
      this.endedAt = Date.now();
      return;
    }
    const gerC = this.cities.filter(c => c.owner === 'ger').length;
    const sovC = this.cities.filter(c => c.owner === 'sov').length;
    const gerU = this.units.some(u => u.fac === 'ger');
    const sovU = this.units.some(u => u.fac === 'sov');
    if (gerC === 0 && !gerU) {
      this.winner = 'sov';
      this.winText = 'ورماخت از هم پاشید';
      this.phase = 'ended';
      this.endedAt = Date.now();
      return;
    }
    if (sovC === 0 && !sovU) {
      this.winner = 'ger';
      this.winText = 'ارتش سرخ از هم پاشید';
      this.phase = 'ended';
      this.endedAt = Date.now();
      return;
    }
    const dt = 1 / OST.TICK;
    for (const f of ['ger', 'sov']) {
      const v = this._vpOf(f);
      if (v >= OST.VP_WIN) this.vpHold[f] += dt;
      else this.vpHold[f] = 0;
      if (this.vpHold[f] >= 30) {
        this.winner = f;
        this.winText = f === 'ger' ? 'ورماخت جبهه را قفل کرد' : 'ارتش سرخ جبهه را قفل کرد';
        this.phase = 'ended';
        this.endedAt = Date.now();
        return;
      }
    }
  }

  /* ---------- AI ---------- */

  _ai() {
    const me = this.aiFac;
    if (!me) return;
    this._aiProduce(me);
    this._aiUpgrade(me);
    this._aiOrders(me);
  }

  _aiProduce(me) {
    const mine = this.units.filter(u => u.fac === me);
    const enemy = this.units.filter(u => u.fac !== me);
    const counts = { inf: 0, tank: 0, art: 0, air: 0, at: 0 };
    const eCounts = { inf: 0, tank: 0, art: 0, air: 0, at: 0 };
    for (const u of mine) counts[UNIT_TYPES[u.type].cls]++;
    for (const u of enemy) eCounts[UNIT_TYPES[u.type].cls]++;
    const types = OST.roster(me);
    const r = this.res[me];
    const oilLow = r.o < 40;
    const want = [];
    if (counts.inf < 8) want.push(types.find(t => UNIT_TYPES[t].cls === 'inf'));
    if (eCounts.tank >= 1 && counts.at < 3) want.push(types.find(t => UNIT_TYPES[t].cls === 'at'));
    if (!oilLow && counts.tank < (eCounts.tank + 2)) {
      want.push(types.find(t => UNIT_TYPES[t].cls === 'tank' && t !== 'tiger' && t !== 'kv1'));
      if (eCounts.tank >= 4) want.push(types.find(t => t === 'tiger' || t === 'kv1'));
    }
    if (counts.art < 3) want.push(types.find(t => UNIT_TYPES[t].cls === 'art'));
    if (!oilLow && counts.air < 2) want.push(types.find(t => UNIT_TYPES[t].cls === 'air'));
    if (!want.length) want.push(types.find(t => UNIT_TYPES[t].cls === 'inf'));

    const enemyCities = this.cities.filter(c => c.owner !== me);
    const cities = this.cities.filter(c => c.owner === me && !c.queue.length)
      .sort((a, b) => {
        if (!enemyCities.length) return 0;
        let da = 1e9, db = 1e9;
        for (const e of enemyCities) {
          da = Math.min(da, OST.dist(a, e));
          db = Math.min(db, OST.dist(b, e));
        }
        return da - db;
      })
      .slice(0, 3);
    for (const city of cities) {
      // pick affordable from want, else cheapest inf
      let pick = null;
      for (const t of want) {
        if (!t) continue;
        const d = UNIT_TYPES[t];
        if (r.i >= d.cost.i && r.m >= d.cost.m && r.o >= d.cost.o && this.pop(me) + d.pop <= POP_CAP) {
          pick = t; break;
        }
      }
      if (!pick) {
        const inf = types.find(t => UNIT_TYPES[t].cls === 'inf');
        const d = UNIT_TYPES[inf];
        if (r.i >= d.cost.i && r.m >= d.cost.m) pick = inf;
      }
      if (pick) this._produce(me, city.id, pick);
    }
  }

  _aiUpgrade(me) {
    if (this.res[me].i < 45) return;
    const cities = this.cities.filter(c => c.owner === me && !c.upg);
    for (const city of cities) {
      if (city.factory < 1 && this.res[me].i >= 80) { this._upgrade(me, city.id, 'factory'); return; }
    }
    for (const city of cities) {
      if (city.depot < 1 && city.factory >= 1 && this.res[me].i >= 60) { this._upgrade(me, city.id, 'depot'); return; }
    }
    for (const city of cities) {
      if (city.barracks < 2 && this.res[me].i >= 90) { this._upgrade(me, city.id, 'barracks'); return; }
    }
  }

  _aiOrders(me) {
    const mine = this.units.filter(u => u.fac === me);
    const enemy = this.units.filter(u => u.fac !== me);
    const myCities = this.cities.filter(c => c.owner === me);
    const theirCities = this.cities.filter(c => c.owner !== me);
    if (!mine.length) return;

    // retreat wounded
    for (const u of mine) {
      const def = UNIT_TYPES[u.type];
      if (u.hp < def.hp * 0.28 && myCities.length) {
        let best = myCities[0], bd = 1e9;
        for (const c of myCities) {
          const d = OST.dist(u, c);
          if (d < bd) { bd = d; best = c; }
        }
        u.order = 'move'; u.targetId = 0;
        this._orderMove(me, [u.id], best.x, best.y, 'move');
      }
    }

    // defend threatened cities
    const defenders = new Set();
    for (const city of myCities) {
      let threat = 0;
      for (const e of enemy) if (OST.dist(e, city) < 280) threat++;
      if (threat < 2) continue;
      const near = mine
        .filter(u => !defenders.has(u.id) && UNIT_TYPES[u.type].cls !== 'air')
        .sort((a, b) => OST.dist(a, city) - OST.dist(b, city))
        .slice(0, Math.min(6, 2 + threat));
      for (const u of near) {
        defenders.add(u.id);
        u.tx = city.x + (Math.random() - 0.5) * 50;
        u.ty = city.y + (Math.random() - 0.5) * 50;
        u.order = 'attack';
      }
    }

    // artillery stay behind nearest friendlies
    for (const u of mine) {
      if (UNIT_TYPES[u.type].cls !== 'art') continue;
      if (defenders.has(u.id)) continue;
      let friend = null, fd = 1e9;
      for (const o of mine) {
        if (o.id === u.id) continue;
        if (UNIT_TYPES[o.type].cls === 'inf' || UNIT_TYPES[o.type].cls === 'tank') {
          const d = OST.dist(u, o);
          if (d < fd) { fd = d; friend = o; }
        }
      }
      if (friend) {
        const back = me === 'ger' ? -70 : 70;
        u.tx = friend.x + back;
        u.ty = friend.y;
        u.order = 'attack';
      }
    }

    // air hunts tanks
    for (const u of mine) {
      if (UNIT_TYPES[u.type].cls !== 'air') continue;
      let t = null, td = 1e9;
      for (const e of enemy) {
        if (UNIT_TYPES[e.type].cls !== 'tank') continue;
        const d = OST.dist(u, e);
        if (d < td) { td = d; t = e; }
      }
      if (!t) t = enemy[0];
      if (t) { u.tx = t.x; u.ty = t.y; u.order = 'attack'; u.targetId = t.id; }
    }

    // periodic push toward next objective
    const pushing = this.tickN >= this.aiPushAt;
    if (pushing) this.aiPushAt = this.tickN + OST.TICK * (18 + Math.random() * 10);

    const idle = mine.filter(u => !defenders.has(u.id) && UNIT_TYPES[u.type].cls !== 'air' && UNIT_TYPES[u.type].cls !== 'art');
    if (!idle.length || !theirCities.length) return;

    const objective = this._aiObjective(me, theirCities, myCities);
    if (!objective) return;

    if (pushing) {
      const ids = idle.filter(u => u.hp >= UNIT_TYPES[u.type].hp * 0.28).map(u => u.id);
      if (ids.length) this._orderMove(me, ids, objective.x, objective.y, 'attack');
    }
  }

  _aiObjective(me, theirCities, myCities) {
    const chain = me === 'ger'
      ? ['brest', 'kaunas', 'lvov', 'minsk', 'smolensk', 'kiev', 'moscow', 'kharkov', 'stalingrad', 'baku', 'leningrad']
      : ['brest', 'lublin', 'warsaw', 'kaunas', 'krakow', 'berlin', 'riga', 'konigsberg'];
    for (const id of chain) {
      const c = this.cities.find(x => x.id === id && x.owner !== me);
      if (c) return c;
    }
    // nearest enemy city to our front
    let best = theirCities[0], bd = 1e9;
    for (const t of theirCities) {
      for (const m of myCities) {
        const d = OST.dist(t, m);
        if (d < bd) { bd = d; best = t; }
      }
    }
    return best;
  }

  _visR(u) {
    const cls = UNIT_TYPES[u.type].cls;
    if (cls === 'air') return 420;
    if (cls === 'at') return 280;
    if (cls === 'tank') return 260;
    if (cls === 'art') return 200;
    return 230;
  }

  _seen(x, y, fac) {
    for (const u of this.units) {
      if (u.fac !== fac) continue;
      if (Math.hypot(u.x - x, u.y - y) < this._visR(u)) return true;
    }
    for (const c of this.cities) {
      if (c.owner !== fac) continue;
      const r = 300 + (c.depot ? 80 : 0) + (OST.cityById(c.id).capital ? 80 : 0);
      if (Math.hypot(c.x - x, c.y - y) < r) return true;
    }
    return false;
  }

  serialize(pid) {
    const viewer = pid ? this.clients.get(pid) : null;
    const fac = viewer && viewer.faction;
    const open = this.phase === 'ended' || !fac;
    const netG = this._network('ger');
    const netS = this._network('sov');
    const ownedG = this.cities.filter(c => c.owner === 'ger').length;
    const ownedS = this.cities.filter(c => c.owner === 'sov').length;
    const cease = Math.max(0, Math.ceil(OST.CEASEFIRE - this.tickN / OST.TICK));
    const units = this.units.filter(u => open || u.fac === fac || this._seen(u.x, u.y, fac));
    const shots = (this.shots || []).filter(s => open || !fac || this._seen(s[0], s[1], fac) || this._seen(s[2], s[3], fac));
    const show = (side) => open || fac === side;
    return {
      t: 'state',
      phase: this.phase,
      tick: this.tickN,
      day: this.day,
      season: OST.season(this.day),
      winner: this.winner,
      winText: this.winText,
      fog: !open,
      cease,
      vp: { ger: this._vpOf('ger'), sov: this._vpOf('sov') },
      hold: { ger: Math.floor(this.vpHold.ger || 0), sov: Math.floor(this.vpHold.sov || 0) },
      net: { ger: netG.size, sov: netS.size },
      owned: { ger: ownedG, sov: ownedS },
      starved: {
        ger: show('ger') ? !!this.starved.ger : false,
        sov: show('sov') ? !!this.starved.sov : false
      },
      res: {
        ger: show('ger')
          ? { i: Math.floor(this.res.ger.i), m: Math.floor(this.res.ger.m), o: Math.floor(this.res.ger.o) }
          : { i: 0, m: 0, o: 0 },
        sov: show('sov')
          ? { i: Math.floor(this.res.sov.i), m: Math.floor(this.res.sov.m), o: Math.floor(this.res.sov.o) }
          : { i: 0, m: 0, o: 0 }
      },
      pop: {
        ger: show('ger') ? this.pop('ger') : 0,
        sov: show('sov') ? this.pop('sov') : 0
      },
      cities: this.cities.map(c => [
        c.id, c.owner, Math.round(c.cap * 100), c.capFac || '',
        (open || c.owner === fac) ? c.queue.map(q => [q.type, Math.ceil(q.left)]) : [],
        Math.round(c.rally.x), Math.round(c.rally.y),
        c.factory || 0, c.barracks || 0, c.depot || 0,
        (open || c.owner === fac) && c.upg ? [c.upg.what, Math.ceil(c.upg.left)] : null,
        c.cut ? 1 : 0
      ]),
      units: units.map(u => [
        u.id, u.type, u.fac,
        Math.round(u.x * 10) / 10, Math.round(u.y * 10) / 10,
        Math.round(u.hp), Math.round(u.ang * 100) / 100,
        u.supplied ? 1 : 0,
        Math.round((u.ent || 0) * 10) / 10
      ]),
      shots,
      deaths: open || !fac ? this.deaths : this.deaths.filter(d => this._seen(d[0], d[1], fac)),
      alerts: this.alerts.map(a => ({ fac: a.fac, text: a.text })),
      fronts: this._frontSnap(),
      rails: OST.CONNECTIONS.map(e => {
        const A = this.cities.find(c => c.id === e[0]);
        const B = this.cities.find(c => c.id === e[1]);
        if (!A || !B || A.owner !== B.owner || A.cut || B.cut) return 0;
        const net = this._nets[A.owner];
        if (!net || !net.has(A.id) || !net.has(B.id)) return 0;
        return A.owner === 'ger' ? 1 : 2;
      })
    };
  }
}

return { Game };
}));
