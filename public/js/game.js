(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./shared.js'));
  } else {
    root.OSTGame = factory(root.OST);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (OST) {
'use strict';

const { UNIT_TYPES, CITIES, CITY_R, POP_CAP, WORLD, FACTIONS, DOCTRINES, VETERANCY } = OST;

let _id = 1;
function nid() { return _id++; }

function opp(f) { return f === 'ger' ? 'sov' : 'ger'; }

class Game {
  constructor() {
    this.clients = new Map(); // id -> { faction, ready, ai, alive, name }
    this.resetMenu();
  }

  resetMenu() {
    this.phase = 'menu'; // menu | lobby | playing | ended | busy
    this.mode = null; // single | multi
    this.hostId = null;
    this.participants = new Set();
    this.winner = null;
    this.winText = '';
    this.tickN = 0;
    this.day = 1;
    this.acc = 0;
    this.speed = 1.0; // 0 (pause), 0.5, 1.0, 2.0, 3.0
    this.difficulty = 'officer'; // recruit, officer, general, field_marshal
    this.units = [];
    this.cities = [];
    this.res = {
      ger: { i: 0, m: 0, o: 0 },
      sov: { i: 0, m: 0, o: 0 }
    };
    this.shots = [];
    this.deaths = [];
    this.alerts = [];
    this.combatEvents = []; // floating texts: ricochet, pinned, crit, etc.
    this.smokeClouds = []; // [ { x, y, r, ttl } ]
    this.strikes = []; // [ { x, y, type, fac, delay, splash, dmg, count } ]
    this.reconFlights = []; // [ { fac, x, y, r, ttl } ]
    this.doctrineCooldowns = {
      ger: {}, sov: {}
    };
    this.buffs = {
      ger: { blitz: 0 },
      sov: { order227: 0 }
    };
    this.aiFac = null;
    this.aiAcc = 0;
    this.aiPushAt = 0;
    this.endedAt = 0;
    this.starved = { ger: false, sov: false };
    this.vpHold = { ger: 0, sov: 0 };
    this.scenarioId = 'barbarossa';
    this.ceasefire = OST.CEASEFIRE;
    this.fronts = {
      north:  { ger: 0, sov: 0, lead: null },
      center: { ger: 0, sov: 0, lead: null },
      south:  { ger: 0, sov: 0, lead: null }
    };
    this.aar = {
      kills: { ger: 0, sov: 0 },
      lost: { ger: 0, sov: 0 },
      cap: { ger: 0, sov: 0 },
      built: { ger: 0, sov: 0 },
      mvp: { ger: null, sov: null },
      history: []
    };
    this._nets = { ger: new Set(), sov: new Set() };
  }

  connect(want) {
    let id = want || ('p' + nid());
    while (this.clients.has(id)) id = 'p' + nid();
    const isFirst = this.clients.size === 0 || !this.hostId;
    if (isFirst) this.hostId = id;
    this.clients.set(id, {
      faction: null,
      ready: false,
      ai: false,
      alive: true,
      name: isFirst ? 'فرمانده اول' : 'فرمانده دوم'
    });
    return id;
  }

  disconnect(id) {
    const c = this.clients.get(id);
    if (!c) return;
    this.clients.delete(id);
    if (this.phase === 'playing') {
      const remainingHumans = [...this.clients.values()].filter(x => !x.ai);
      if (!remainingHumans.length) {
        this.resetMenu();
        return;
      }
      c.ai = true;
      this.aiFac = c.faction;
    } else if (this.phase === 'lobby') {
      if (id === this.hostId && this.mode === 'single') {
        this.resetMenu();
      } else if (id === this.hostId) {
        const next = this.clients.keys().next().value;
        this.hostId = next || null;
        if (!this.hostId) this.resetMenu();
      }
    }
  }

  canSee(id) {
    const c = this.clients.get(id);
    return c ? c.faction : null;
  }

  hello(id) {
    const humans = [...this.clients.values()].filter(x => !x.ai);
    const host = id === this.hostId;
    const you = this.clients.get(id);
    const peer = [...this.clients.entries()].find(([k, v]) => k !== id && !v.ai);
    return {
      t: 'hello',
      id,
      host,
      mode: this.mode,
      phase: this.phase,
      difficulty: this.difficulty,
      you: you ? { faction: you.faction, ready: you.ready, name: you.name } : null,
      peer: peer ? { id: peer[0], faction: peer[1].faction, ready: peer[1].ready, name: peer[1].name } : null,
      scenarioId: this.scenarioId,
      allReady: this.phase === 'playing'
    };
  }

  handle(id, msg) {
    if (!msg || !msg.t) return;
    if (msg.t === 'mode') this._mode(id, msg.mode);
    else if (msg.t === 'scenario') this._scenario(id, msg.scenarioId);
    else if (msg.t === 'difficulty') this._difficulty(id, msg.difficulty);
    else if (msg.t === 'faction') this._faction(id, msg.faction);
    else if (msg.t === 'ready') this._ready(id);
    else if (msg.t === 'cancel') this._cancel();
    else if (msg.t === 'speed') this._speed(id, msg.speed);
    else if (msg.t === 'cmd') this._cmd(id, msg.c);
    else if (msg.t === 'doctrine') this._doctrineCmd(id, msg.doctrineId, msg.x, msg.y);
  }

  _mode(id, mode) {
    if (this.phase !== 'menu') return;
    this.mode = mode;
    this.phase = 'lobby';
    this.hostId = id;
    for (const [pid, c] of this.clients) {
      c.ready = false;
      c.faction = null;
      c.ai = false;
    }
    if (mode === 'single') {
      const aiId = 'ai';
      this.clients.set(aiId, { faction: null, ready: true, ai: true, alive: true, name: 'ستاد کل دشمن' });
    }
  }

  _scenario(id, sid) {
    if (this.phase !== 'lobby' || id !== this.hostId) return;
    if (OST.SCENARIOS && OST.SCENARIOS[sid]) this.scenarioId = sid;
  }

  _difficulty(id, diff) {
    if (this.phase !== 'lobby' || id !== this.hostId) return;
    if (['recruit', 'officer', 'general', 'field_marshal'].includes(diff)) {
      this.difficulty = diff;
    }
  }

  _speed(id, spd) {
    if (this.mode === 'single' && typeof spd === 'number') {
      this.speed = Math.max(0, Math.min(3, spd));
    }
  }

  _faction(id, fac) {
    if (this.phase !== 'lobby') return;
    if (fac !== 'ger' && fac !== 'sov') return;
    const c = this.clients.get(id);
    if (!c) return;
    for (const [pid, o] of this.clients) {
      if (pid !== id && o.faction === fac && !o.ai) return; // taken by human
    }
    c.faction = fac;
    if (this.mode === 'single') {
      const ai = this.clients.get('ai');
      if (ai) ai.faction = opp(fac);
    }
  }

  _ready(id) {
    if (this.phase !== 'lobby') return;
    const c = this.clients.get(id);
    if (!c || !c.faction) return;
    c.ready = true;
    this._tryStart();
  }

  _cancel() {
    this.resetMenu();
  }

  _tryStart() {
    const humans = [...this.clients.entries()].filter(([, c]) => !c.ai);
    if (this.mode === 'single') {
      const h = humans[0];
      if (h && h[1].ready && h[1].faction) {
        this.aiFac = opp(h[1].faction);
        const ai = this.clients.get('ai');
        if (ai) { ai.faction = this.aiFac; ai.ready = true; }
        this._boot([h[0], 'ai']);
      }
    } else if (this.mode === 'multi') {
      if (humans.length === 2 && humans.every(([, c]) => c.ready && c.faction)) {
        if (humans[0][1].faction !== humans[1][1].faction) {
          this._boot(humans.map(([pid]) => pid));
        }
      }
    }
  }

  _boot(ids) {
    this.phase = 'playing';
    this.tickN = 0;
    this.day = 1;
    this.acc = 0;
    this.units = [];
    this.shots = [];
    this.deaths = [];
    this.alerts = [];
    this.combatEvents = [];
    this.smokeClouds = [];
    this.strikes = [];
    this.reconFlights = [];
    this.doctrineCooldowns = { ger: {}, sov: {} };
    this.buffs = { ger: { blitz: 0 }, sov: { order227: 0 } };
    this.vpHold = { ger: 0, sov: 0 };
    this.participants = new Set(ids);

    const sc = (OST.SCENARIOS && OST.SCENARIOS[this.scenarioId]) || {
      day: 1, ceasefire: OST.CEASEFIRE,
      res: { ger: { i: 100, m: 130, o: 150 }, sov: { i: 90, m: 160, o: 100 } }
    };
    this.day = sc.day || 1;
    this.ceasefire = sc.cease !== undefined ? sc.cease : OST.CEASEFIRE;

    this.cities = CITIES.map(c => {
      const initOwner = (sc.owners && sc.owners[c.id]) ? sc.owners[c.id] : c.owner;
      return {
        id: c.id,
        owner: initOwner,
        home: c.owner,
        cap: 0,
        capFac: null,
        queue: [],
        rally: { x: c.x, y: c.y },
        factory: c.factory || 0,
        barracks: c.barracks || 1,
        depot: c.depot || 0,
        upg: null,
        sab: 0,
        cut: false
      };
    });

    this.res = {
      ger: { i: sc.res.ger.i, m: sc.res.ger.m, o: sc.res.ger.o },
      sov: { i: sc.res.sov.i, m: sc.res.sov.m, o: sc.res.sov.o }
    };

    this._spawnInitial(sc);
    this._nets = { ger: this._network('ger'), sov: this._network('sov') };
    if (typeof OST.applyOpsDay === 'function') OST.applyOpsDay(this);
  }

  _spawn(type, fac, x, y) {
    const def = UNIT_TYPES[type];
    if (!def) return null;
    let sx = x, sy = y;
    for (let k = 0; k < 8; k++) {
      let coll = false;
      for (const u of this.units) {
        if (Math.hypot(u.x - sx, u.y - sy) < (def.radius + (UNIT_TYPES[u.type] ? UNIT_TYPES[u.type].radius : 12))) {
          coll = true; break;
        }
      }
      if (!coll) break;
      sx += (Math.random() - 0.5) * 26;
      sy += (Math.random() - 0.5) * 26;
    }
    const u = {
      id: nid(),
      type,
      fac,
      x: sx,
      y: sy,
      tx: sx,
      ty: sy,
      hp: def.hp,
      maxHp: def.hp,
      ang: fac === 'ger' ? 0 : Math.PI,
      cd: Math.random() * 0.4,
      salvoLeft: def.salvo || 0,
      order: 'idle',
      targetId: 0,
      way: null,
      wi: 0,
      supplied: true,
      ent: 0,
      suppr: 0,
      xp: 0,
      rank: 0,
      kills: 0,
      healCd: 0
    };
    this.units.push(u);
    if (this.aar) this.aar.built[fac]++;
    return u;
  }

  _spawnInitial(sc) {
    const list = sc.initialUnits || [
      ['berlin', 'grenadier', 4], ['berlin', 'panzer4', 3], ['berlin', 'wespe', 1],
      ['konigsberg', 'grenadier', 3], ['konigsberg', 'sdkfz', 1], ['konigsberg', 'pak40', 1],
      ['warsaw', 'grenadier', 3], ['warsaw', 'panzer4', 2], ['warsaw', 'pzgren', 2], ['warsaw', 'pioneer', 1],
      ['krakow', 'grenadier', 3], ['krakow', 'stug3', 1],
      ['lublin', 'grenadier', 2], ['lublin', 'stuka', 1],
      ['moscow', 'strelok', 4], ['moscow', 't34', 2], ['moscow', 'katyusha', 1], ['moscow', 'gvardia', 2],
      ['leningrad', 'strelok', 3], ['leningrad', 'kv1', 1], ['leningrad', 'aa85', 1],
      ['minsk', 'strelok', 3], ['minsk', 'zis3', 1], ['minsk', 'saper', 1],
      ['kiev', 'strelok', 3], ['kiev', 't34', 2], ['kiev', 'razvedka', 1],
      ['smolensk', 'strelok', 2], ['smolensk', 'su85', 1],
      ['stalingrad', 'strelok', 2], ['stalingrad', 't34', 1], ['stalingrad', 'il2', 1],
      ['baku', 'strelok', 2]
    ];
    for (const row of list) {
      const [cid, type, n] = row;
      const c = OST.cityById(cid);
      if (!c) continue;
      const fac = UNIT_TYPES[type] ? UNIT_TYPES[type].faction : 'ger';
      for (let i = 0; i < n; i++) {
        const ox = (Math.random() - 0.5) * 60;
        const oy = (Math.random() - 0.5) * 60;
        this._spawn(type, fac, c.x + ox, c.y + oy);
      }
    }
  }

  _network(fac) {
    const cap = this.cities.find(c => c.owner === fac && OST.cityById(c.id).capital);
    if (!cap) return new Set();
    const set = new Set([cap.id]);
    const q = [cap.id];
    while (q.length) {
      const u = q.shift();
      const ns = OST.neighbors(u);
      for (let i = 0; i < ns.length; i++) {
        const v = ns[i];
        if (set.has(v)) continue;
        const cv = this.cities.find(c => c.id === v);
        if (cv && cv.owner === fac && !cv.cut) {
          set.add(v);
          q.push(v);
        }
      }
    }
    return set;
  }

  pop(fac) {
    let p = 0;
    for (const u of this.units) {
      if (u.fac === fac) p += UNIT_TYPES[u.type] ? UNIT_TYPES[u.type].pop : 1;
    }
    return p;
  }

  _cmd(pid, cmd) {
    if (!cmd) return;
    const c = this.clients.get(pid);
    if (!c || !c.faction) return;
    const fac = c.faction;
    if (cmd.k === 'move') this._orderMove(fac, cmd.ids, cmd.x, cmd.y, 'move');
    else if (cmd.k === 'attack') this._orderMove(fac, cmd.ids, cmd.x, cmd.y, 'attack', cmd.tid);
    else if (cmd.k === 'attackMove') this._orderMove(fac, cmd.ids, cmd.x, cmd.y, 'attackMove');
    else if (cmd.k === 'stop') this._stop(fac, cmd.ids);
    else if (cmd.k === 'hold') this._hold(fac, cmd.ids);
    else if (cmd.k === 'retreat') this._retreat(fac, cmd.ids);
    else if (cmd.k === 'produce') this._produce(fac, cmd.city, cmd.type);
    else if (cmd.k === 'rally') this._rally(fac, cmd.city, cmd.x, cmd.y);
    else if (cmd.k === 'upgrade') this._upgrade(fac, cmd.city, cmd.what);
  }

  _doctrineCmd(pid, doctrineId, x, y) {
    const c = this.clients.get(pid);
    if (!c || !c.faction) return;
    this._callDoctrine(c.faction, doctrineId, x, y);
  }

  _callDoctrine(fac, docId, x, y) {
    const docs = DOCTRINES[fac] || [];
    const doc = docs.find(d => d.id === docId);
    if (!doc) return false;
    const cd = (this.doctrineCooldowns[fac] && this.doctrineCooldowns[fac][docId]) || 0;
    if (cd > 0) return false;
    const r = this.res[fac];
    if (doc.cost.i && r.i < doc.cost.i) return false;
    if (doc.cost.m && r.m < doc.cost.m) return false;
    if (doc.cost.o && r.o < doc.cost.o) return false;

    // Deduct
    if (doc.cost.i) r.i -= doc.cost.i;
    if (doc.cost.m) r.m -= doc.cost.m;
    if (doc.cost.o) r.o -= doc.cost.o;
    if (!this.doctrineCooldowns[fac]) this.doctrineCooldowns[fac] = {};
    this.doctrineCooldowns[fac][docId] = doc.cd;

    // Apply action
    if (docId === 'recon_flight') {
      this.reconFlights.push({ fac, x, y, r: doc.r || 480, ttl: doc.duration || 20 });
      this.alerts.push({ fac, text: 'گشت شناسایی هوایی فعال شد', ttl: 4 });
    } else if (docId === 'artillery_strike' || docId === 'katyusha_strike') {
      this.strikes.push({
        x, y, type: docId, fac, delay: 1.5, splash: doc.splash || 150, dmg: doc.dmg || 160, count: docId === 'katyusha_strike' ? 8 : 4
      });
      this.alerts.push({ fac, text: 'آتشبار سنگین به سمت هدف شلیک شد!', ttl: 4 });
    } else if (docId === 'smoke_screen') {
      this.smokeClouds.push({ x, y, r: doc.r || 160, ttl: doc.duration || 18 });
      this.alerts.push({ fac, text: 'پرده دود استتار برپا شد', ttl: 4 });
    } else if (docId === 'blitzkrieg') {
      this.buffs.ger.blitz = doc.duration || 25;
      this.alerts.push({ fac: 'ger', text: 'عملیات بلیتس‌کریگ: حداکثر سرعت و آتش تانک‌ها!', ttl: 6 });
    } else if (docId === 'order_227') {
      this.buffs.sov.order227 = doc.duration || 25;
      this.alerts.push({ fac: 'sov', text: 'فرمان ۲۲۷: نه یک قدم به عقب!', ttl: 6 });
    }
    return true;
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
    const col = Math.ceil(Math.sqrt(us.length));
    us.forEach((u, i) => {
      const ox = (i % col) * 24 - (col * 12);
      const oy = Math.floor(i / col) * 24 - (col * 9);
      u.tx = x + ox;
      u.ty = y + oy;
      u.order = order || 'move';
      u.targetId = tid || 0;
      u.ent = 0; // moving breaks entrenchment
      this._railWay(u, u.tx, u.ty);
    });
  }

  _railWay(u, x, y) {
    u.way = null;
    u.wi = 0;
    const def = UNIT_TYPES[u.type];
    if (!def || def.cls === 'air') return;
    if (Math.hypot(x - u.x, y - u.y) < 280) return;
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

  _hold(fac, ids) {
    for (const u of this._mine(fac, ids)) {
      u.order = 'hold';
      u.tx = u.x;
      u.ty = u.y;
      u.targetId = 0;
      u.way = null;
      u.wi = 0;
    }
  }

  _retreat(fac, ids) {
    const us = this._mine(fac, ids);
    if (!us.length) return;
    const friendlyCities = this.cities.filter(c => c.owner === fac);
    if (!friendlyCities.length) return;
    us.forEach(u => {
      let best = friendlyCities[0], bd = 1e9;
      for (const fc of friendlyCities) {
        const p = OST.cityById(fc.id);
        const d = Math.hypot(u.x - p.x, u.y - p.y);
        if (d < bd) { bd = d; best = p; }
      }
      u.tx = best.x;
      u.ty = best.y;
      u.order = 'move';
      u.targetId = 0;
      u.ent = 0;
      this._railWay(u, u.tx, u.ty);
    });
  }

  _rally(fac, cityId, x, y) {
    const city = this.cities.find(c => c.id === cityId);
    if (!city || city.owner !== fac) return;
    city.rally = { x, y };
  }

  _canMake(city, def) {
    if (def.cls === 'inf' || def.cls === 'recon' || def.cls === 'eng') return city.barracks >= 1;
    if (def.cls === 'at' || def.cls === 'aa') return city.barracks >= 1 || city.factory >= 1;
    return city.factory >= 1;
  }

  _produce(fac, cityId, type) {
    const city = this.cities.find(c => c.id === cityId);
    if (!city || city.owner !== fac) return;
    const def = UNIT_TYPES[type];
    if (!def || def.faction !== fac) return;
    if (!this._canMake(city, def)) return;
    const maxQ = 3 + (city.factory || 0);
    if (city.queue.length >= maxQ) return;
    const r = this.res[fac];
    if (r.i < def.cost.i || r.m < def.cost.m || r.o < def.cost.o) return;
    if (this.pop(fac) + def.pop > POP_CAP) return;
    r.i -= def.cost.i;
    r.m -= def.cost.m;
    r.o -= def.cost.o;
    city.queue.push({ type, left: def.build, total: def.build });
  }

  _upgrade(fac, cityId, what) {
    const city = this.cities.find(c => c.id === cityId);
    if (!city || city.owner !== fac) return;
    const spec = OST.UPGRADES[what];
    if (!spec) return;
    const cur = city[what] || 0;
    if (cur >= spec.max || city.upg) return;
    const r = this.res[fac];
    if (r.i < spec.i) return;
    r.i -= spec.i;
    city.upg = { what, left: spec.t, total: spec.t };
  }

  tick(realDt) {
    if (this.phase !== 'playing') return;
    const dt = realDt * (this.mode === 'single' ? this.speed : 1.0);
    if (dt <= 0) return; // paused

    this.tickN += dt * OST.TICK;
    this.acc += dt;
    if (this.acc >= 1) {
      this.acc -= 1;
      this.day++;
      this._income();
      this._fuel();
      this._waves();
      this._frontTick();
      this._seasonEvents();
      if (typeof OST.applyOpsDay === 'function') OST.applyOpsDay(this);
    }

    // Cooldowns & Buffs decay
    for (const f of ['ger', 'sov']) {
      if (this.doctrineCooldowns[f]) {
        for (const k of Object.keys(this.doctrineCooldowns[f])) {
          this.doctrineCooldowns[f][k] = Math.max(0, this.doctrineCooldowns[f][k] - dt);
        }
      }
    }
    this.buffs.ger.blitz = Math.max(0, this.buffs.ger.blitz - dt);
    this.buffs.sov.order227 = Math.max(0, this.buffs.sov.order227 - dt);

    // Dynamic Smoke decay
    this.smokeClouds = this.smokeClouds.filter(s => (s.ttl -= dt) > 0);

    // Recon flights decay
    this.reconFlights = this.reconFlights.filter(r => (r.ttl -= dt) > 0);

    // Off-map Strikes execution
    this._processStrikes(dt);

    this._production(dt);
    this._supply();
    this._liveRail();
    this._move(dt);
    this._combat(dt);
    this._capture(dt);
    this._partisan(dt);
    this._alerts();
    this._supportAuras(dt);

    // AI thinking
    if (this.aiFac) {
      this.aiAcc += dt;
      const aiDelay = this.difficulty === 'recruit' ? 0.9 :
                      this.difficulty === 'general' ? 0.35 :
                      this.difficulty === 'field_marshal' ? 0.25 : 0.55;
      if (this.aiAcc >= aiDelay) {
        this.aiAcc = 0;
        this._ai();
      }
    }

    this._win();
    this.alerts = this.alerts.filter(a => (a.ttl -= dt) > 0);
    this.combatEvents = this.combatEvents.filter(e => (e.ttl -= dt) > 0);
  }

  _processStrikes(dt) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.delay -= dt;
      if (s.delay <= 0) {
        // Explode
        for (const u of this.units) {
          if (u.fac === s.fac) continue;
          const d = Math.hypot(u.x - s.x, u.y - s.y);
          if (d <= s.splash) {
            const factor = 1 - d / s.splash;
            const dmg = s.dmg * factor;
            u.hp -= dmg;
            u.suppr = Math.min(1.0, u.suppr + 0.6);
            this.combatEvents.push({ x: u.x, y: u.y, text: '-' + Math.round(dmg), col: '#ff5555', ttl: 1.2 });
            if (u.hp <= 0) {
              this.deaths.push([u.x, u.y, UNIT_TYPES[u.type].cls, u.fac]);
              if (this.aar) {
                this.aar.kills[s.fac]++;
                this.aar.lost[u.fac]++;
              }
            }
          }
        }
        this.strikes.splice(i, 1);
      }
    }
    this.units = this.units.filter(u => u.hp > 0);
  }

  _supportAuras(dt) {
    for (const u of this.units) {
      const def = UNIT_TYPES[u.type];
      if (!def) continue;
      // Medic aura
      if (def.aura === 'heal') {
        u.healCd = (u.healCd || 0) + dt;
        if (u.healCd >= 0.8) {
          u.healCd = 0;
          for (const ally of this.units) {
            if (ally.fac === u.fac && ally.id !== u.id && Math.hypot(ally.x - u.x, ally.y - u.y) < def.auraR) {
              const allyDef = UNIT_TYPES[ally.type];
              if (allyDef && (allyDef.cls === 'inf' || allyDef.cls === 'eng')) {
                if (ally.hp < ally.maxHp) {
                  ally.hp = Math.min(ally.maxHp, ally.hp + 12);
                }
                ally.suppr = Math.max(0, ally.suppr - 0.3);
              }
            }
          }
        }
      }
      // Commissar aura
      if (def.aura === 'rally') {
        for (const ally of this.units) {
          if (ally.fac === u.fac && Math.hypot(ally.x - u.x, ally.y - u.y) < def.auraR) {
            ally.suppr = 0; // Immune to suppression
          }
        }
      }
    }
  }

  _income() {
    const netG = this._nets.ger;
    const netS = this._nets.sov;
    const diffMul = this.aiFac === 'sov'
      ? (this.difficulty === 'recruit' ? 0.8 : this.difficulty === 'general' ? 1.25 : this.difficulty === 'field_marshal' ? 1.4 : 1.0)
      : 1.0;

    for (const c of this.cities) {
      const proto = OST.cityById(c.id);
      const net = c.owner === 'ger' ? netG : netS;
      const mul = c.cut ? 0.15 : (net.has(c.id) ? 1 : 0.28);
      const aiMult = (c.owner === this.aiFac) ? diffMul : 1.0;
      const r = this.res[c.owner];
      r.i += proto.i * mul * (1 + (c.factory || 0) * 0.14) * aiMult;
      r.m += proto.m * mul * (1 + (c.barracks || 0) * 0.10) * aiMult;
      r.o += proto.o * mul * (1 + (c.depot || 0) * 0.30) * aiMult;
      if (c.depot && net.has(c.id)) r.o += 0.16 * aiMult;
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
      let eng = 0;
      for (const u of this.units) {
        if (u.fac !== city.owner) continue;
        const d = UNIT_TYPES[u.type];
        if (d && d.cls === 'eng' && OST.dist(u, city) < 140) eng++;
      }
      if (eng) city.sab = Math.max(0, city.sab - dt * 0.4 * eng);
      else if (gar) city.sab = Math.max(0, city.sab - dt * 0.14);
      else {
        const rate = (city.home === 'sov' && city.owner === 'ger') ? 0.04 : 0.022;
        city.sab = Math.min(1, city.sab + dt * rate);
      }
      const was = city.cut;
      city.cut = city.sab >= 1;
      if (city.cut && !was) {
        this.alerts.push({
          fac: city.owner,
          text: 'پارتیزان‌ها خط‌آهن ' + OST.cityById(city.id).nameFa + ' را مسدود کردند!',
          ttl: 6
        });
      }
    }
  }

  _waves() {
    // Regular operational reserves
    const spawn = (type, fac, id, n) => {
      const city = this.cities.find(c => c.id === id && c.owner === fac);
      if (!city) return;
      for (let i = 0; i < n; i++) {
        if (this.pop(fac) + (UNIT_TYPES[type] ? UNIT_TYPES[type].pop : 1) <= POP_CAP) {
          const proto = OST.cityById(id);
          this._spawn(type, fac, proto.x + (Math.random() - 0.5) * 40, proto.y + (Math.random() - 0.5) * 40);
        }
      }
    };
    if (this.day === 10) {
      spawn('tiger', 'ger', 'berlin', 1);
      spawn('kv1', 'sov', 'moscow', 1);
    }
    if (this.day === 20) {
      spawn('ferdinand', 'ger', 'berlin', 1);
      spawn('is2', 'sov', 'gorky', 1);
    }
    if (this.day === 35) {
      spawn('me262', 'ger', 'berlin', 1);
      spawn('yak9', 'sov', 'moscow', 2);
    }
  }

  _frontTick() {
    for (const [k, f] of Object.entries(OST.FRONTS)) {
      let g = 0, s = 0;
      for (const id of f.ids) {
        const c = this.cities.find(x => x.id === id);
        if (c) { if (c.owner === 'ger') g++; else s++; }
      }
      this.fronts[k].ger = g;
      this.fronts[k].sov = s;
      this.fronts[k].lead = g > s ? 'ger' : s > g ? 'sov' : 'tie';
    }
  }

  _seasonEvents() {
    const s = OST.season(this.day);
    if (this.day === 16) {
      this.alerts.push({ fac: 'ger', text: 'فصل باران‌های پاییزی و راسپوتیتسا: تحرک زره‌پوش‌ها بشدت کند شد!', ttl: 8 });
      this.alerts.push({ fac: 'sov', text: 'فصل باران‌های پاییزی و راسپوتیتسا: تحرک زره‌پوش‌ها بشدت کند شد!', ttl: 8 });
    } else if (this.day === 32) {
      this.alerts.push({ fac: 'ger', text: 'سرمای خردکننده زمستان: رودخانه‌ها یخ بستند و عبور زرهی ممکن شد!', ttl: 8 });
      this.alerts.push({ fac: 'sov', text: 'سرمای خردکننده زمستان: رودخانه‌ها یخ بستند و عبور زرهی ممکن شد!', ttl: 8 });
    }
  }

  _fuel() {
    for (const f of ['ger', 'sov']) {
      let burn = 0;
      for (const u of this.units) {
        if (u.fac !== f) continue;
        const d = UNIT_TYPES[u.type];
        if (d && d.burn) burn += d.burn;
      }
      this.res[f].o = Math.max(0, this.res[f].o - burn);
      this.starved[f] = this.res[f].o < 2;
    }
  }

  _production(dt) {
    for (const city of this.cities) {
      if (city.queue.length) {
        const item = city.queue[0];
        item.left -= dt;
        if (item.left <= 0) {
          city.queue.shift();
          const p = OST.cityById(city.id);
          const u = this._spawn(item.type, city.owner, p.x, p.y);
          if (u && (city.rally.x !== p.x || city.rally.y !== p.y)) {
            u.tx = city.rally.x;
            u.ty = city.rally.y;
            u.order = 'move';
            this._railWay(u, u.tx, u.ty);
          }
        }
      }
      if (city.upg) {
        city.upg.left -= dt;
        if (city.upg.left <= 0) {
          city[city.upg.what] = (city[city.upg.what] || 0) + 1;
          city.upg = null;
        }
      }
    }
  }

  _supply() {
    this._nets = { ger: this._network('ger'), sov: this._network('sov') };
    for (const u of this.units) {
      const def = UNIT_TYPES[u.type];
      if (def && def.cls === 'air') { u.supplied = true; continue; }
      const near = OST.nearestCity(u.x, u.y);
      const net = u.fac === 'ger' ? this._nets.ger : this._nets.sov;
      const d = Math.hypot(u.x - near.x, u.y - near.y);
      u.supplied = (d < 450 && near.owner === u.fac && net.has(near.id)) || (d < 160 && near.owner === u.fac);
    }
  }

  _liveRail() {
    for (const u of this.units) {
      u.onLiveRail = OST.onRail(u.x, u.y);
    }
  }

  _move(dt) {
    const sea = OST.season(this.day);
    for (const u of this.units) {
      // Natural suppression recovery
      u.suppr = Math.max(0, u.suppr - dt * 0.12);

      const def = UNIT_TYPES[u.type];
      if (!def) continue;

      // Entrenchment logic: stationary infantry / guns dig in
      const moving = Math.hypot(u.tx - u.x, u.ty - u.y) > 10;
      if (!moving && (def.cls === 'inf' || def.cls === 'at' || def.cls === 'aa' || def.cls === 'eng')) {
        u.ent = Math.min(1.0, (u.ent || 0) + dt * 0.08);
      } else {
        u.ent = 0;
      }

      // Attack-move check: auto engage close enemy
      if (u.order === 'attackMove' && !u.targetId) {
        const ce = this._closestEnemy(u, def.range * 1.2);
        if (ce) u.targetId = ce.id;
      }

      if (u.order === 'attack' && u.targetId) {
        const tgt = this.units.find(x => x.id === u.targetId);
        if (tgt) {
          u.tx = tgt.x; u.ty = tgt.y;
          if (Math.hypot(tgt.x - u.x, tgt.y - u.y) <= def.range * 0.85) continue;
        } else {
          u.order = 'idle';
          u.targetId = 0;
        }
      }

      let tx = u.tx, ty = u.ty;
      if (u.way && u.way.length) {
        const wp = u.way[u.wi];
        if (wp) {
          tx = wp.x; ty = wp.y;
          if (Math.hypot(wp.x - u.x, wp.y - u.y) < 24) {
            u.wi++;
            if (u.wi >= u.way.length) { u.way = null; u.wi = 0; }
          }
        }
      }

      const dx = tx - u.x, dy = ty - u.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) {
        u.order = 'idle';
        continue;
      }

      const tf = OST.terrainFactor(u.x, u.y, def.cls, sea);
      const railBonus = (u.onLiveRail && def.cls !== 'air') ? 1.6 : 1.0;
      const fuelPen = (this.starved[u.fac] && (def.cls === 'tank' || def.cls === 'air')) ? 0.35 : 1.0;
      const supprPen = u.suppr > 0.4 ? 0.55 : 1.0;
      const rankBonus = VETERANCY[u.rank] ? (VETERANCY[u.rank].spdBonus || 1.0) : 1.0;
      const blitzBonus = (u.fac === 'ger' && this.buffs.ger.blitz > 0 && def.cls === 'tank') ? 1.35 : 1.0;

      const spd = def.speed * tf * railBonus * fuelPen * supprPen * rankBonus * blitzBonus;
      const step = Math.min(d, spd * dt * 10);
      u.x += (dx / d) * step;
      u.y += (dy / d) * step;
      u.ang = Math.atan2(dy, dx);
    }
    this._separate();
  }

  _separate() {
    for (let i = 0; i < this.units.length; i++) {
      const a = this.units[i];
      const da = UNIT_TYPES[a.type];
      if (!da || da.cls === 'air') continue;
      for (let j = i + 1; j < this.units.length; j++) {
        const b = this.units[j];
        const db = UNIT_TYPES[b.type];
        if (!db || db.cls === 'air') continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const minDist = (da.radius + db.radius) * 0.9;
        if (dist > 0 && dist < minDist) {
          const push = (minDist - dist) * 0.5;
          const nx = (b.x - a.x) / dist;
          const ny = (b.y - a.y) / dist;
          a.x -= nx * push * 0.4;
          a.y -= ny * push * 0.4;
          b.x += nx * push * 0.4;
          b.y += ny * push * 0.4;
        }
      }
    }
  }

  _closestEnemy(u, maxDist) {
    let best = null, bd = maxDist || 1e9;
    for (const o of this.units) {
      if (o.fac === u.fac) continue;
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  _pickTarget(u, def) {
    let best = null, bestScore = -1e9;
    for (const o of this.units) {
      if (o.fac === u.fac) continue;
      const d = OST.dist(u, o);
      if (d > def.range) continue;
      const ocl = UNIT_TYPES[o.type].cls;
      const mult = def.vs[ocl] || 1;
      const score = (mult * 100) - (d * 0.3) - (o.hp * 0.1);
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  _inSmoke(x, y) {
    for (const s of this.smokeClouds) {
      if (Math.hypot(x - s.x, y - s.y) <= s.r) return true;
    }
    return false;
  }

  _combat(dt) {
    for (const u of this.units) u.cd = Math.max(0, u.cd - dt);
    if (this.tickN < (this.ceasefire || OST.CEASEFIRE) * OST.TICK) return;

    const dead = new Set();
    for (const u of this.units) {
      if (dead.has(u.id)) continue;
      const def = UNIT_TYPES[u.type];
      if (!def || u.cd > 0) continue;

      const tgt = this._pickTarget(u, def);
      if (!tgt) continue;

      const d = OST.dist(u, tgt);
      if (d > def.range) continue;
      if (def.cls === 'art' && u.order === 'move') continue;

      u.ang = Math.atan2(tgt.y - u.y, tgt.x - u.x);
      const ecl = UNIT_TYPES[tgt.type].cls;
      const vs = def.vs[ecl] || 1;
      const moving = Math.hypot(u.tx - u.x, u.ty - u.y) > 10 && def.cls !== 'air';
      const movePen = moving ? 0.75 : 1.0;
      const sup = u.supplied ? 1.0 : 0.6;
      const rankBonus = VETERANCY[u.rank] ? (VETERANCY[u.rank].atkBonus || 1.0) : 1.0;

      // Armor and Flanking calculation
      let armor = UNIT_TYPES[tgt.type].armor || 1;
      if (ecl === 'tank') {
        const angleDiff = Math.abs(u.ang - tgt.ang);
        const normAngle = angleDiff > Math.PI ? (Math.PI * 2 - angleDiff) : angleDiff;
        if (normAngle < 0.6) {
          // Rear shot!
          armor = Math.max(1, armor * 0.45);
          this.combatEvents.push({ x: tgt.x, y: tgt.y, text: 'ضربه از پشت!', col: '#ffaa00', ttl: 0.9 });
        } else if (normAngle < 1.4) {
          // Flank shot!
          armor = Math.max(1, armor * 0.7);
        }
      }

      // Entrenchment cover (reduces bullet damage up to 50%)
      const cover = (def.cls === 'art' || def.smoke) ? 1.0 : (1.0 - (tgt.ent || 0) * 0.5);
      // Smoke protection
      const smokeCover = (this._inSmoke(tgt.x, tgt.y) && def.cls !== 'art') ? 0.35 : 1.0;
      // Soviet Order 227 defense buff
      const sovBuff = (tgt.fac === 'sov' && this.buffs.sov.order227 > 0 && ecl === 'inf') ? 0.6 : 1.0;

      const pen = Math.max(0.15, 1 - armor / (armor + 12));
      const dmg = def.atk * vs * pen * movePen * sup * cover * smokeCover * rankBonus * sovBuff;

      tgt.hp -= dmg;
      this.shots.push([u.x, u.y, tgt.x, tgt.y, u.fac, def.cls]);

      // XP & Veterancy gain for attacker
      u.xp = (u.xp || 0) + dmg * 0.6;
      for (let r = VETERANCY.length - 1; r >= 1; r--) {
        if (u.xp >= VETERANCY[r].xp && u.rank < r) {
          u.rank = r;
          u.maxHp = def.hp * (VETERANCY[r].hpBonus || 1.0);
          u.hp = Math.min(u.maxHp, u.hp + (u.maxHp - def.hp));
          this.combatEvents.push({ x: u.x, y: u.y, text: VETERANCY[r].stars + ' ارتقا!', col: '#ffd700', ttl: 1.4 });
          break;
        }
      }

      // Suppression applied to target
      if (def.cls === 'art' || def.splash) {
        tgt.suppr = Math.min(1.0, (tgt.suppr || 0) + 0.45);
      }

      // Splash damage
      if (def.splash) {
        for (const o of this.units) {
          if (o.id === tgt.id || o.fac === u.fac) continue;
          const sd = OST.dist(o, tgt);
          if (sd < def.splash) {
            const sDmg = dmg * 0.5 * (1 - sd / def.splash);
            o.hp -= sDmg;
            o.suppr = Math.min(1.0, (o.suppr || 0) + 0.35);
          }
        }
      }

      // Smoke deployment by Nebelwerfer
      if (def.smoke && Math.random() < 0.4) {
        this.smokeClouds.push({ x: tgt.x, y: tgt.y, r: 120, ttl: 12 });
      }

      // Salvo vs standard reload
      if (def.salvo) {
        u.salvoLeft = (u.salvoLeft || def.salvo) - 1;
        if (u.salvoLeft <= 0) {
          u.cd = def.salvoReload;
          u.salvoLeft = def.salvo;
        } else u.cd = def.cd;
      } else {
        const blitzCd = (u.fac === 'ger' && this.buffs.ger.blitz > 0) ? 0.75 : 1.0;
        u.cd = def.cd * blitzCd;
      }

      // Death check
      if (tgt.hp <= 0 && !dead.has(tgt.id)) {
        dead.add(tgt.id);
        this.deaths.push([tgt.x, tgt.y, UNIT_TYPES[tgt.type].cls, tgt.fac]);
        u.kills = (u.kills || 0) + 1;
        u.xp = (u.xp || 0) + 50;
        if (this.aar) {
          this.aar.kills[u.fac]++;
          this.aar.lost[tgt.fac]++;
        }
      }
    }
    if (dead.size) this.units = this.units.filter(u => u.hp > 0 && !dead.has(u.id));
    else this.units = this.units.filter(u => u.hp > 0);
  }

  _capture(dt) {
    if (this.tickN < (this.ceasefire || OST.CEASEFIRE) * OST.TICK) return;
    for (const city of this.cities) {
      let ger = 0, sov = 0;
      for (const u of this.units) {
        if (OST.dist(u, city) > CITY_R + 8) continue;
        const cap = UNIT_TYPES[u.type] ? UNIT_TYPES[u.type].capture : 0;
        if (u.fac === 'ger') ger += cap;
        else sov += cap;
      }
      const atkFac = ger > sov ? 'ger' : sov > ger ? 'sov' : null;
      const atk = Math.abs(ger - sov);
      if (atkFac && atk > 0) {
        if (city.owner !== atkFac) {
          city.cap = Math.max(0, city.cap - dt * atk * 0.18);
          if (city.cap <= 0) {
            city.owner = atkFac;
            city.cap = 0.05;
            city.queue = [];
            city.upg = null;
            city.sab = 0;
            city.cut = false;
            if (this.aar) this.aar.cap[atkFac]++;
            this.alerts.push({
              fac: atkFac,
              text: OST.cityById(city.id).nameFa + ' به تصرف ' + FACTIONS[atkFac].nameFa + ' درآمد!',
              ttl: 6
            });
          }
        } else {
          city.cap = Math.min(1.0, city.cap + dt * atk * 0.18);
        }
      }
    }
  }

  _alerts() {
    // Check VP holds
    const vpG = this._vpOf('ger');
    const vpS = this._vpOf('sov');
    if (vpG >= OST.VP_WIN) this.vpHold.ger = (this.vpHold.ger || 0) + (1 / OST.TICK);
    else this.vpHold.ger = 0;
    if (vpS >= OST.VP_WIN) this.vpHold.sov = (this.vpHold.sov || 0) + (1 / OST.TICK);
    else this.vpHold.sov = 0;
  }

  _win() {
    if (this.winner) return;
    const ber = this.cities.find(c => c.id === 'berlin');
    const mos = this.cities.find(c => c.id === 'moscow');
    if (ber && ber.owner === 'sov') {
      this.winner = 'sov';
      this.winText = 'سقوط برلین — ارتش سرخ پرچم پیروزی را بر فراز رایشس‌تاگ برافراشت.';
      this.phase = 'ended';
      return;
    }
    if (mos && mos.owner === 'ger') {
      this.winner = 'ger';
      this.winText = 'سقوط مسکو — ورماخت قلب اتحاد شوروی را تسخیر کرد.';
      this.phase = 'ended';
      return;
    }
    if (this.vpHold.ger >= 30) {
      this.winner = 'ger';
      this.winText = 'برتری عملیاتی ورماخت — تسلط بر ۲۴ امتیاز راهبردی جبهه شرق.';
      this.phase = 'ended';
      return;
    }
    if (this.vpHold.sov >= 30) {
      this.winner = 'sov';
      this.winText = 'برتری عملیاتی ارتش سرخ — تسلط بر ۲۴ امتیاز راهبردی جبهه شرق.';
      this.phase = 'ended';
      return;
    }
  }

  /* ---------- SMART AI ---------- */

  _ai() {
    const me = this.aiFac;
    if (!me) return;
    this._aiProduce(me);
    this._aiUpgrade(me);
    this._aiOrders(me);
    this._aiDoctrines(me);
  }

  _aiProduce(me) {
    const mine = this.units.filter(u => u.fac === me);
    const enemy = this.units.filter(u => u.fac !== me);
    const counts = { inf: 0, tank: 0, art: 0, air: 0, at: 0, recon: 0, aa: 0, eng: 0 };
    const eCounts = { inf: 0, tank: 0, art: 0, air: 0, at: 0, recon: 0, aa: 0, eng: 0 };
    for (const u of mine) counts[UNIT_TYPES[u.type] ? UNIT_TYPES[u.type].cls : 'inf']++;
    for (const u of enemy) eCounts[UNIT_TYPES[u.type] ? UNIT_TYPES[u.type].cls : 'inf']++;

    const types = OST.roster(me);
    const r = this.res[me];
    const want = [];

    // Balanced Combined Arms strategy
    if (counts.inf < 9) want.push(types.find(t => UNIT_TYPES[t].cls === 'inf'));
    if (counts.recon < 2) want.push(types.find(t => UNIT_TYPES[t].cls === 'recon'));
    if (counts.eng < 2) want.push(types.find(t => UNIT_TYPES[t].cls === 'eng'));
    if (eCounts.air >= 1 && counts.aa < 3) want.push(types.find(t => UNIT_TYPES[t].cls === 'aa'));
    if (eCounts.tank >= 2 && counts.at < 4) want.push(types.find(t => UNIT_TYPES[t].cls === 'at'));

    if (r.o >= 30) {
      if (me === 'ger') {
        if (r.i >= 190 && Math.random() < 0.4) want.push('tiger');
        else if (r.i >= 210 && Math.random() < 0.3) want.push('ferdinand');
        else want.push('panzer4');
      } else {
        if (r.i >= 200 && Math.random() < 0.4) want.push('is2');
        else if (r.i >= 84 && Math.random() < 0.5) want.push('su85');
        else want.push('t34');
      }
    }

    if (counts.art < 3) {
      if (me === 'ger') want.push(Math.random() < 0.5 ? 'wespe' : 'nebelwerfer');
      else want.push('katyusha');
    }

    if (r.o >= 35 && counts.air < 3) {
      if (me === 'ger') want.push(Math.random() < 0.4 ? 'me262' : 'stuka');
      else want.push(Math.random() < 0.5 ? 'yak9' : 'il2');
    }

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
      .slice(0, 4);

    for (const city of cities) {
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
    if (this.res[me].i < 50) return;
    const cities = this.cities.filter(c => c.owner === me && !c.upg);
    for (const city of cities) {
      if (city.factory < 1 && this.res[me].i >= 80) { this._upgrade(me, city.id, 'factory'); break; }
      if (city.barracks < 2 && this.res[me].i >= 45) { this._upgrade(me, city.id, 'barracks'); break; }
      if (city.depot < 1 && this.res[me].i >= 60 && this.res[me].o < 50) { this._upgrade(me, city.id, 'depot'); break; }
    }
  }

  _aiOrders(me) {
    const mine = this.units.filter(u => u.fac === me);
    if (!mine.length) return;

    const targets = this._aiObjective(me);
    if (!targets.length) return;

    mine.forEach((u, i) => {
      if (u.order === 'attack' && u.targetId) return;
      const tgt = targets[i % targets.length];
      const d = Math.hypot(tgt.x - u.x, tgt.y - u.y);
      if (d > 70) {
        u.tx = tgt.x + (Math.random() - 0.5) * 50;
        u.ty = tgt.y + (Math.random() - 0.5) * 50;
        u.order = 'attackMove';
        this._railWay(u, u.tx, u.ty);
      }
    });
  }

  _aiDoctrines(me) {
    const enemyClusters = [];
    const enemies = this.units.filter(u => u.fac !== me);

    for (const e of enemies) {
      let count = 0;
      for (const other of enemies) {
        if (Math.hypot(other.x - e.x, other.y - e.y) < 140) count++;
      }
      if (count >= 3) enemyClusters.push({ x: e.x, y: e.y, count });
    }

    if (enemyClusters.length) {
      const top = enemyClusters[0];
      const strikeDoc = me === 'ger' ? 'artillery_strike' : 'katyusha_strike';
      this._callDoctrine(me, strikeDoc, top.x, top.y);
    }

    if (enemies.length >= 6) {
      if (me === 'ger') this._callDoctrine('ger', 'blitzkrieg', 0, 0);
      else this._callDoctrine('sov', 'order_227', 0, 0);
    }
  }

  _aiObjective(me) {
    const enemyCities = this.cities.filter(c => c.owner !== me);
    if (!enemyCities.length) return [];
    const caps = enemyCities.filter(c => OST.cityById(c.id).capital);
    const regular = enemyCities.map(c => OST.cityById(c.id));
    if (caps.length && Math.random() < 0.35) {
      return [OST.cityById(caps[0].id)];
    }
    return regular;
  }

  _visR(u) {
    const d = UNIT_TYPES[u.type];
    return OST.visR(d ? d.cls : 'inf');
  }

  _seen(x, y, fac) {
    if (!fac) return true;
    for (const u of this.units) {
      if (u.fac !== fac) continue;
      const r = this._visR(u);
      if ((u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) < r * r) return true;
    }
    for (const c of this.cities) {
      if (c.owner !== fac) continue;
      const p = OST.cityById(c.id);
      if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < (CITY_R + 100) * (CITY_R + 100)) return true;
    }
    for (const rf of this.reconFlights) {
      if (rf.fac === fac && Math.hypot(rf.x - x, rf.y - y) < rf.r) return true;
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
    const cease = Math.max(0, Math.ceil((this.ceasefire || OST.CEASEFIRE) - this.tickN / OST.TICK));
    const units = this.units.filter(u => open || u.fac === fac || this._seen(u.x, u.y, fac));
    const shots = (this.shots || []).filter(s => open || !fac || this._seen(s[0], s[1], fac) || this._seen(s[2], s[3], fac));
    const show = (side) => open || fac === side;

    return {
      t: 'state',
      phase: this.phase,
      tick: this.tickN,
      day: this.day,
      speed: this.speed,
      difficulty: this.difficulty,
      scenarioId: this.scenarioId || 'barbarossa',
      lastOps: this.lastOps || null,
      aar: this.aar,
      season: OST.season(this.day),
      seasonFa: OST.seasonFa(OST.season(this.day)),
      winner: this.winner,
      winText: this.winText,
      fog: !open,
      cease,
      vp: { ger: this._vpOf('ger'), sov: this._vpOf('sov') },
      hold: { ger: Math.floor(this.vpHold.ger || 0), sov: Math.floor(this.vpHold.sov || 0) },
      net: { ger: netG.size, sov: netS.size },
      owned: { ger: ownedG, sov: ownedS },
      fronts: this.fronts,
      doctrines: fac ? (this.doctrineCooldowns[fac] || {}) : {},
      buffs: {
        blitz: Math.ceil(this.buffs.ger.blitz),
        order227: Math.ceil(this.buffs.sov.order227)
      },
      smokeClouds: this.smokeClouds.map(s => [Math.round(s.x), Math.round(s.y), Math.round(s.r), Math.round(s.ttl * 10) / 10]),
      reconFlights: this.reconFlights.filter(r => open || r.fac === fac).map(r => [Math.round(r.x), Math.round(r.y), Math.round(r.r)]),
      combatEvents: this.combatEvents.map(e => [Math.round(e.x), Math.round(e.y), e.text, e.col, e.ttl]),
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
        u.order, u.supplied ? 1 : 0,
        Math.round((u.ent || 0) * 100),
        u.rank || 0,
        Math.round((u.suppr || 0) * 100),
        u.kills || 0
      ]),
      shots,
      deaths: this.deaths || [],
      alerts: this.alerts.filter(a => open || !a.fac || a.fac === fac).map(a => a.text)
    };
  }
}

return Game;
}));
