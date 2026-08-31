'use strict';

(() => {
  const { WORLD, UNIT_TYPES, CITIES, CITY_R, FACTIONS, POP_CAP, roster, isWater } = OST;

  const $ = (id) => document.getElementById(id);
  const screens = {
    menu: $('screen-menu'),
    lobby: $('screen-lobby'),
    game: $('screen-game')
  };

  function show(name) {
    for (const k of Object.keys(screens)) screens[k].classList.toggle('on', k === name);
  }

  /* ---------- audio ---------- */
  let muted = false;
  let ac = null;
  function audio() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function beep(freq, dur, type, vol) {
    if (muted) return;
    try {
      const a = audio();
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.value = vol || 0.04;
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur);
    } catch (_) { /* ignore */ }
  }
  function boom() {
    if (muted) return;
    try {
      const a = audio();
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 90;
      o.frequency.exponentialRampToValueAtTime(30, a.currentTime + 0.25);
      g.gain.value = 0.05;
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.3);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + 0.3);
    } catch (_) { /* ignore */ }
  }
  $('btn-mute').onclick = () => {
    muted = !muted;
    $('btn-mute').textContent = muted ? '×' : '♪';
  };

  /* ---------- net ---------- */
  let ws = null;
  let myId = null;
  let myFac = null;
  let meta = { phase: 'menu', mode: null, players: [] };
  let snapA = null, snapB = null, snapAt = 0;
  const SNAP = 1000 / 12;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');
    ws.onopen = () => {};
    ws.onclose = () => setTimeout(connect, 1200);
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'hello') onHello(msg);
      else if (msg.t === 'state') onState(msg);
    };
  }
  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  function onHello(msg) {
    myId = msg.id;
    meta = msg;
    if (msg.phase === 'playing' || msg.phase === 'ended') {
      const me = (msg.players || []).find(p => p.you);
      if (me && me.faction) myFac = me.faction;
      if (!screens.game.classList.contains('on')) enterGame();
    } else if (msg.phase === 'lobby') {
      $('busy').classList.add('hidden');
      showLobby();
    } else {
      show('menu');
      $('busy').classList.toggle('hidden', msg.phase !== 'busy');
      const waiting = msg.phase === 'menu' && (msg.players || []).length && msg.mode === 'multi';
      $('btn-join').classList.toggle('hidden', !waiting);
    }
    paintLobby();
  }

  function onState(msg) {
    snapA = snapB;
    snapB = normalize(msg);
    snapAt = performance.now();
    if (msg.phase === 'playing' || msg.phase === 'ended') {
      if (screens.game.classList.contains('on') === false) enterGame();
      applyHud(snapB);
      if (msg.alerts) for (const a of msg.alerts) toast(a);
      if (msg.deaths && msg.deaths.length) {
        for (const d of msg.deaths) spawnFx(d[0], d[1]);
        boom();
      }
    }
    if (msg.phase === 'ended') showEnd(msg);
    if (msg.phase === 'menu' && screens.game.classList.contains('on')) {
      show('menu');
    }
  }

  function normalize(msg) {
    const cities = (msg.cities || []).map(c => ({
      id: c[0], owner: c[1], cap: c[2] / 100, capFac: c[3] || null,
      queue: (c[4] || []).map(q => ({ type: q[0], left: q[1] })),
      rally: { x: c[5], y: c[6] },
      x: 0, y: 0
    }));
    for (const c of cities) {
      const p = OST.cityById(c.id);
      c.x = p.x; c.y = p.y;
    }
    const units = (msg.units || []).map(u => ({
      id: u[0], type: u[1], fac: u[2], x: u[3], y: u[4], hp: u[5], ang: u[6], supplied: !!u[7]
    }));
    return {
      phase: msg.phase, tick: msg.tick, day: msg.day,
      winner: msg.winner, winText: msg.winText,
      res: msg.res, pop: msg.pop,
      cities, units, shots: msg.shots || [], deaths: msg.deaths || [],
      alerts: msg.alerts || []
    };
  }

  function lerpWorld() {
    if (!snapB) return null;
    if (!snapA) return snapB;
    const t = Math.min(1, (performance.now() - snapAt) / SNAP);
    const map = new Map(snapA.units.map(u => [u.id, u]));
    const units = snapB.units.map(u => {
      const p = map.get(u.id);
      if (!p) return u;
      let da = u.ang - p.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      return {
        ...u,
        x: p.x + (u.x - p.x) * t,
        y: p.y + (u.y - p.y) * t,
        ang: p.ang + da * t
      };
    });
    return { ...snapB, units, shots: t < 0.7 ? snapB.shots : [] };
  }

  /* ---------- menu / lobby ---------- */
  $('btn-single').onclick = () => { beep(440, 0.08, 'square', 0.03); send({ t: 'mode', mode: 'single' }); };
  $('btn-multi').onclick = () => { beep(440, 0.08, 'square', 0.03); send({ t: 'mode', mode: 'multi' }); };
  $('btn-join').onclick = () => send({ t: 'mode', mode: 'multi' });
  $('pick-ger').onclick = () => pick('ger');
  $('pick-sov').onclick = () => pick('sov');
  $('btn-ready').onclick = () => { beep(520, 0.1, 'triangle', 0.04); send({ t: 'ready' }); };
  $('btn-cancel').onclick = () => send({ t: 'cancel' });
  $('btn-copy').onclick = () => {
    navigator.clipboard.writeText(location.href).catch(() => {});
    $('btn-copy').textContent = 'کپی شد';
    setTimeout(() => { $('btn-copy').textContent = 'رونوشت'; }, 1200);
  };

  function pick(fac) {
    send({ t: 'faction', faction: fac });
    beep(360, 0.07, 'square', 0.03);
  }

  function showLobby() {
    show('lobby');
    $('share-url').textContent = location.href;
    $('url-box').classList.toggle('hidden', meta.mode !== 'multi');
    paintLobby();
  }

  function paintLobby() {
    if (meta.phase !== 'lobby') return;
    const players = meta.players || [];
    const me = players.find(p => p.you);
    const gerTaken = players.some(p => !p.you && p.faction === 'ger');
    const sovTaken = players.some(p => !p.you && p.faction === 'sov');
    $('pick-ger').classList.toggle('on', me && me.faction === 'ger');
    $('pick-sov').classList.toggle('on', me && me.faction === 'sov');
    $('pick-ger').classList.toggle('taken', gerTaken);
    $('pick-sov').classList.toggle('taken', sovTaken);
    $('btn-ready').disabled = !(me && me.faction);
    $('btn-ready').classList.toggle('go', me && me.ready);
    $('btn-ready').textContent = me && me.ready ? 'منتظر حریف…' : 'آماده‌ام';
    if (meta.mode === 'single') {
      $('lobby-kicker').textContent = 'نبرد تک‌نفره';
      $('lobby-sub').textContent = 'جبهه را انتخاب کن. ستاد کل، طرف دیگر را فرماندهی می‌کند.';
      $('lobby-status').textContent = me && me.faction
        ? (me.faction === 'ger' ? 'ورماخت — ضربهٔ اول، نفت کم' : 'ارتش سرخ — عمق و باکو')
        : 'یک جبهه را لمس کن';
      $('url-box').classList.add('hidden');
    } else {
      $('lobby-kicker').textContent = 'نبرد دونفره';
      $('lobby-sub').textContent = 'هر کس یک جبهه. وقتی هر دو آماده باشند جنگ شروع می‌شود.';
      const n = players.length;
      const lines = players.map(p => {
        const who = p.you ? 'تو' : 'حریف';
        const f = p.faction ? FACTIONS[p.faction].nameFa : 'بدون جبهه';
        return who + ' — ' + f + (p.ready ? ' ✓' : '');
      });
      $('lobby-status').textContent = (n < 2 ? 'منتظر بازیکن دوم…  ' : '') + lines.join('   |   ');
      $('url-box').classList.remove('hidden');
    }
  }

  /* ---------- game ---------- */
  const canvas = $('c');
  const ctx = canvas.getContext('2d');
  const cam = { x: 1100, y: 900, z: 0.55, sw: innerWidth, sh: innerHeight };
  let intro = 1;
  let mySel = new Set();
  let box = null;
  let hover = null;
  let selectedCity = null;
  let keys = {};
  let panning = false;
  let pan0 = { x: 0, y: 0, cx: 0, cy: 0 };
  let mm = { px: 14, py: 0, w: 220, h: 124, sx: 1, sy: 1 };
  const fx = [];
  let hintT = 0;

  function enterGame() {
    show('game');
    const me = (meta.players || []).find(p => p.you);
    if (me && me.faction) myFac = me.faction;
    $('hud-fac').textContent = myFac ? FACTIONS[myFac].nameFa : '';
    $('hud-fac').className = myFac || '';
    intro = 1;
    cam.x = myFac === 'sov' ? 1900 : 900;
    cam.y = 900;
    cam.z = 0.42;
    mySel = new Set();
    selectedCity = null;
    $('end').classList.add('hidden');
    $('hint').classList.remove('out');
    hintT = performance.now();
    fit();
    buildProdIcons();
    beep(180, 0.4, 'sawtooth', 0.03);
  }

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cam.sw = innerWidth; cam.sh = innerHeight;
    canvas.width = cam.sw * dpr;
    canvas.height = cam.sh * dpr;
    canvas.style.width = cam.sw + 'px';
    canvas.style.height = cam.sh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', fit);

  function applyHud(st) {
    if (!myFac || !st.res) return;
    const r = st.res[myFac];
    $('r-i').textContent = r.i;
    $('r-m').textContent = r.m;
    $('r-o').textContent = r.o;
    $('r-pop').textContent = st.pop[myFac];
    $('hud-day').textContent = 'روز ' + st.day + ' — ژوئن ۱۹۴۱';
    refreshProd(st);
    refreshSel(st);
  }

  const seenToasts = new Set();
  function toast(a) {
    if (a.fac && myFac && a.fac !== myFac) return;
    const key = a.text + Math.floor(performance.now() / 2000);
    if (seenToasts.has(key)) return;
    seenToasts.add(key);
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = a.text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function spawnFx(x, y) {
    for (let i = 0; i < 10; i++) {
      fx.push({
        x, y,
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80,
        life: 0.45 + Math.random() * 0.25,
        r: 3 + Math.random() * 6
      });
    }
  }

  function showEnd(st) {
    const el = $('end');
    el.classList.remove('hidden');
    const win = st.winner === myFac;
    $('end-kicker').textContent = win ? 'پیروزی' : 'شکست';
    $('end-title').textContent = st.winText || '';
    $('end-sub').textContent = win
      ? (myFac === 'ger' ? 'رایش بر شرق چیره شد.' : 'مسکو ایستاد. رایش درهم شکست.')
      : 'جبهه فرو ریخت.';
  }

  /* production */
  function buildProdIcons() {
    /* filled when city selected */
  }
  function refreshProd(st) {
    if (!selectedCity || !myFac) { $('prod').classList.add('hidden'); return; }
    const city = st.cities.find(c => c.id === selectedCity);
    if (!city || city.owner !== myFac) { $('prod').classList.add('hidden'); selectedCity = null; return; }
    $('prod').classList.remove('hidden');
    const proto = OST.cityById(city.id);
    $('prod-name').textContent = proto.nameFa;
    $('prod-own').textContent = proto.capital ? 'پایتخت' : 'شهر';
    const types = roster(myFac);
    const box = $('prod-cards');
    if (box.childElementCount !== types.length) {
      box.innerHTML = '';
      for (const t of types) {
        const d = UNIT_TYPES[t];
        const b = document.createElement('button');
        b.className = 'pcard';
        b.dataset.type = t;
        const cv = document.createElement('canvas');
        GFX.drawUnitIcon(cv, t);
        b.appendChild(cv);
        const name = document.createElement('b');
        name.textContent = d.nameFa;
        b.appendChild(name);
        const cost = document.createElement('small');
        cost.textContent = (d.cost.i ? d.cost.i + '⚙ ' : '') + (d.cost.m ? d.cost.m + '♟ ' : '') + (d.cost.o ? d.cost.o + '◆' : '');
        b.appendChild(cost);
        b.onclick = () => {
          send({ t: 'cmd', c: { k: 'produce', city: selectedCity, type: t } });
          beep(300, 0.06, 'square', 0.03);
        };
        box.appendChild(b);
      }
    }
    const r = st.res[myFac];
    for (const b of box.children) {
      const d = UNIT_TYPES[b.dataset.type];
      const ok = r.i >= d.cost.i && r.m >= d.cost.m && r.o >= d.cost.o && st.pop[myFac] + d.pop <= POP_CAP && city.queue.length < 3;
      b.classList.toggle('off', !ok);
    }
    $('prod-q').textContent = city.queue.length
      ? 'صف: ' + city.queue.map(q => UNIT_TYPES[q.type].nameFa + ' ' + q.left + 'ث').join(' ← ')
      : 'صف خالی';
  }

  function refreshSel(st) {
    if (!mySel.size) { $('sel').classList.add('hidden'); return; }
    const us = st.units.filter(u => mySel.has(u.id) && u.fac === myFac);
    if (!us.length) { $('sel').classList.add('hidden'); mySel.clear(); return; }
    $('sel').classList.remove('hidden');
    $('sel').classList.toggle('sov', myFac === 'sov');
    const first = UNIT_TYPES[us[0].type];
    if (us.length === 1) {
      $('sel-name').textContent = first.nameFa;
      $('sel-role').textContent = first.roleFa + (us[0].supplied ? '' : ' — بی‌تدارکات');
      $('sel-hpbar').style.width = Math.max(0, 100 * us[0].hp / first.hp) + '%';
      $('sel-count').textContent = first.name;
    } else {
      $('sel-name').textContent = us.length + ' یگان';
      $('sel-role').textContent = 'گروه رزمی';
      const hp = us.reduce((s, u) => s + u.hp / UNIT_TYPES[u.type].hp, 0) / us.length;
      $('sel-hpbar').style.width = (hp * 100) + '%';
      $('sel-count').textContent = us.map(u => UNIT_TYPES[u.type].nameFa).join('، ');
    }
  }

  /* input */
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Escape') { mySel.clear(); selectedCity = null; }
    if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    const st = lerpWorld();
    if (!st || !myFac) return;
    const w = GFX.worldFromScreen(cam, e.clientX, e.clientY);
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panning = true;
      pan0 = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
      return;
    }
    // minimap
    if (hitMinimap(e.clientX, e.clientY)) {
      cam.x = (e.clientX - mm.px) / mm.sx;
      cam.y = (e.clientY - mm.py) / mm.sy;
      return;
    }
    if (e.button === 2) {
      rightClick(st, w);
      return;
    }
    if (e.button === 0) {
      box = { x0: w.x, y0: w.y, x1: w.x, y1: w.y, sx: e.clientX, sy: e.clientY };
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (panning) {
      cam.x = pan0.cx - (e.clientX - pan0.x) / cam.z;
      cam.y = pan0.cy - (e.clientY - pan0.y) / cam.z;
      return;
    }
    if (box) {
      const w = GFX.worldFromScreen(cam, e.clientX, e.clientY);
      box.x1 = w.x; box.y1 = w.y;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (panning) { panning = false; return; }
    const st = lerpWorld();
    if (!st) { box = null; return; }
    if (e.button === 0 && box) {
      const w = GFX.worldFromScreen(cam, e.clientX, e.clientY);
      const dx = e.clientX - box.sx, dy = e.clientY - box.sy;
      if (Math.hypot(dx, dy) < 6) leftClick(st, w, e.shiftKey);
      else boxSelect(st, box, e.shiftKey);
    }
    box = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = GFX.worldFromScreen(cam, e.clientX, e.clientY);
    cam.z = Math.max(0.32, Math.min(1.85, cam.z * (e.deltaY > 0 ? 0.9 : 1.11)));
    const after = GFX.worldFromScreen(cam, e.clientX, e.clientY);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
  }, { passive: false });

  function hitMinimap(x, y) {
    return x >= mm.px && x <= mm.px + mm.w && y >= mm.py && y <= mm.py + mm.h;
  }

  function leftClick(st, w, add) {
    const u = pickUnit(st, w.x, w.y, myFac);
    if (u) {
      if (!add) mySel.clear();
      mySel.add(u.id);
      selectedCity = null;
      beep(520, 0.04, 'square', 0.02);
      return;
    }
    const city = pickCity(st, w.x, w.y);
    if (city && city.owner === myFac) {
      selectedCity = city.id;
      mySel.clear();
      beep(400, 0.05, 'triangle', 0.02);
      return;
    }
    if (!add) { mySel.clear(); selectedCity = null; }
  }

  function boxSelect(st, b, add) {
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    if (!add) mySel.clear();
    for (const u of st.units) {
      if (u.fac !== myFac) continue;
      if (u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) mySel.add(u.id);
    }
    if (mySel.size) selectedCity = null;
  }

  function rightClick(st, w) {
    if (selectedCity) {
      send({ t: 'cmd', c: { k: 'rally', city: selectedCity, x: w.x, y: w.y } });
      beep(280, 0.05, 'square', 0.02);
      return;
    }
    if (!mySel.size) return;
    const ids = [...mySel];
    const enemy = pickUnit(st, w.x, w.y, null);
    if (enemy && enemy.fac !== myFac) {
      send({ t: 'cmd', c: { k: 'attack', ids, x: enemy.x, y: enemy.y, tid: enemy.id } });
    } else {
      send({ t: 'cmd', c: { k: 'move', ids, x: w.x, y: w.y } });
    }
    beep(240, 0.05, 'square', 0.025);
  }

  function pickUnit(st, x, y, fac) {
    let best = null, bd = 22;
    for (const u of st.units) {
      if (fac && u.fac !== fac) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      const r = UNIT_TYPES[u.type].radius + 8;
      if (d < r && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  function pickCity(st, x, y) {
    for (const c of st.cities) {
      if (Math.hypot(c.x - x, c.y - y) < CITY_R) return c;
    }
    return null;
  }

  /* loop */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const st = lerpWorld();
    if (screens.game.classList.contains('on') && st) {
      if (intro > 0) {
        intro = Math.max(0, intro - dt * 0.45);
        cam.z = 0.38 + (1 - intro) * 0.18;
      }
      const sp = 520 * dt / cam.z;
      if (keys.KeyW || keys.ArrowUp) cam.y -= sp;
      if (keys.KeyS || keys.ArrowDown) cam.y += sp;
      if (keys.KeyA || keys.ArrowLeft) cam.x -= sp;
      if (keys.KeyD || keys.ArrowRight) cam.x += sp;
      const e = 18;
      if (now - (window._mxHover || 0) < 400) { /* skip */ }
      cam.x = Math.max(200, Math.min(WORLD.W - 200, cam.x));
      cam.y = Math.max(140, Math.min(WORLD.H - 140, cam.y));

      ctx.setTransform((window.devicePixelRatio || 1) > 2 ? 2 : Math.min(window.devicePixelRatio || 1, 2), 0, 0, Math.min(window.devicePixelRatio || 1, 2), 0, 0);
      ctx.clearRect(0, 0, cam.sw, cam.sh);
      GFX.drawWorld(ctx, cam, st, mySel, box, hover, myFac, now / 1000);

      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const s = GFX.worldFromScreen; // draw in world via same transform — simpler overlay
        void s;
        if (p.life <= 0) fx.splice(i, 1);
      }
      // fx in screen space after world
      ctx.save();
      ctx.translate(cam.sw / 2, cam.sh / 2);
      ctx.scale(cam.z, cam.z);
      ctx.translate(-cam.x, -cam.y);
      for (const p of fx) {
        ctx.fillStyle = 'rgba(230,140,40,' + Math.max(0, p.life) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
      }
      ctx.restore();

      mm = GFX.drawMinimap(ctx, st, cam, myFac) || mm;
      mm.py = cam.sh - mm.h - 16;
      // redraw minimap at correct css coords (drawMinimap used innerHeight)
      // already uses innerHeight inside — OK

      if (now - hintT > 7000) $('hint').classList.add('out');
    }
    requestAnimationFrame(frame);
  }

  // edge scroll
  let mx = 0, my = 0;
  window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
  setInterval(() => {
    if (!screens.game.classList.contains('on')) return;
    const m = 14, sp = 10 / cam.z;
    if (mx < m) cam.x -= sp;
    if (mx > innerWidth - m) cam.x += sp;
    if (my < m) cam.y -= sp;
    if (my > innerHeight - m) cam.y += sp;
  }, 16);

  document.body.addEventListener('click', () => { try { audio(); } catch (_) {} }, { once: true });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => GFX.buildMap());
  }
  GFX.ensureMap();
  connect();
  requestAnimationFrame(frame);
})();
