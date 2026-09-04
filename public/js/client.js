'use strict';

(() => {
  const { WORLD, UNIT_TYPES, CITIES, CITY_R, FACTIONS, POP_CAP, roster, isWater, DOCTRINES } = OST;

  const $ = (id) => document.getElementById(id);
  const screens = {
    menu: $('screen-menu'),
    lobby: $('screen-lobby'),
    game: $('screen-game')
  };

  function show(name) {
    for (const k of Object.keys(screens)) screens[k].classList.toggle('on', k === name);
  }

  /* ---------- AUDIO SYNTH ENGINE ---------- */
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
  function boom(vol, deep) {
    if (muted) return;
    try {
      const a = audio();
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sawtooth';
      o.frequency.value = deep ? 65 : 95;
      o.frequency.exponentialRampToValueAtTime(25, a.currentTime + 0.35);
      g.gain.value = vol || 0.06;
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.4);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + 0.4);
    } catch (_) { /* ignore */ }
  }
  function shotSfx(cls) {
    if (muted) return;
    try {
      const a = audio();
      if (cls === 'art') {
        boom(0.08, true);
      } else if (cls === 'tank') {
        boom(0.06, false);
      } else {
        beep(350 + Math.random() * 100, 0.05, 'square', 0.02);
      }
    } catch (_) { /* ignore */ }
  }
  function victoryFanfare() {
    if (muted) return;
    [392, 523, 659, 784].forEach((f, i) => {
      setTimeout(() => beep(f, 0.4, 'triangle', 0.08), i * 180);
    });
  }
  function defeatFanfare() {
    if (muted) return;
    [440, 392, 330, 220].forEach((f, i) => {
      setTimeout(() => beep(f, 0.5, 'sawtooth', 0.07), i * 220);
    });
  }

  /* ---------- STATE & NETWORKING ---------- */
  let mode = null; // single | multi
  let localGame = null;
  let myId = null;
  let myFac = null;
  let isHost = false;
  let difficulty = 'officer';
  let snapA = null, snapB = null, snapAt = 0;
  const SNAP = 80;
  let lastShotCount = 0;

  let activeDoctrineTarget = null; // doctrine id awaiting map click
  const controlGroups = {}; // 1..9 -> Set of unit ids
  let lastGroupTap = { key: null, time: 0 };

  const canvas = $('c');
  const ctx = canvas.getContext('2d');
  const cam = { x: 2000, y: 1400, z: 0.65, sw: window.innerWidth, sh: window.innerHeight };
  let mmBox = null;

  let mySel = new Set();
  let selectedCity = null;
  let box = null;
  let panning = false, pan0 = { x: 0, y: 0, cx: 0, cy: 0 };
  const keys = {};

  const FILE = location.protocol === 'file:';

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    cam.sw = window.innerWidth;
    cam.sh = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function send(msg) {
    if (mode === 'single' || FILE) {
      if (!localGame) return;
      localGame.handle(myId || 'p1', msg);
    } else {
      fetch('api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg)
      }).catch(() => {});
    }
  }

  function initLocal() {
    localGame = new OSTGame();
    myId = localGame.connect('p1');
    isHost = true;
  }

  function connectNet() {
    if (FILE) { initLocal(); return; }
    fetch('api/join', { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        myId = d.id;
        isHost = d.host;
      })
      .catch(() => initLocal());
  }
  connectNet();

  // Polling loop for networking
  setInterval(async () => {
    if (localGame) {
      const state = localGame.serialize(myId);
      const h = localGame.hello(myId);
      applyHello(h);
      applySnap(state);
    } else if (!FILE) {
      try {
        const snap = await fetch('api/snap').then(r => r.json());
        if (snap && snap.state) applySnap(snap.state);
      } catch (_) {}
    }
  }, SNAP);

  function applyHello(h) {
    if (!h) return;
    isHost = h.host;
    if (h.difficulty) difficulty = h.difficulty;
    if (h.you && h.you.faction) myFac = h.you.faction;

    if (h.phase === 'menu') show('menu');
    else if (h.phase === 'lobby') {
      show('lobby');
      renderLobby(h);
    } else if (h.phase === 'playing') {
      show('game');
    }
  }

  function applySnap(raw) {
    if (!raw) return;
    snapA = snapB;
    snapB = unpackState(raw);
    snapAt = performance.now();

    if (snapB.shots && snapB.shots.length > lastShotCount) {
      const newShots = snapB.shots.slice(lastShotCount);
      newShots.forEach(s => shotSfx(s[5]));
    }
    lastShotCount = (snapB.shots || []).length;

    if (snapB.phase === 'playing') {
      show('game');
      refreshHud(snapB);
      refreshProd(snapB);
      refreshSel(snapB);
      refreshIntel(snapB);
      refreshDoctrines(snapB);
      refreshCmdBar(snapB);
    } else if (snapB.phase === 'ended') {
      showEnd(snapB);
    }
  }

  function unpackState(msg) {
    const cities = (msg.cities || []).map(c => ({
      id: c[0], owner: c[1], cap: c[2] / 100, capFac: c[3],
      queue: (c[4] || []).map(q => ({ type: q[0], left: q[1] })),
      rally: { x: c[5], y: c[6] },
      factory: c[7] || 0, barracks: c[8] || 0, depot: c[9] || 0,
      upg: c[10] || null,
      cut: !!c[11],
      x: 0, y: 0
    }));
    for (const c of cities) {
      const p = OST.cityById(c.id);
      if (p) { c.x = p.x; c.y = p.y; }
    }
    const units = (msg.units || []).map(u => ({
      id: u[0], type: u[1], fac: u[2], x: u[3], y: u[4], hp: u[5], ang: u[6],
      order: u[7], supplied: !!u[8], ent: (u[9] || 0) / 100,
      rank: u[10] || 0, suppr: u[11] || 0, kills: u[12] || 0
    }));
    return {
      phase: msg.phase, tick: msg.tick, day: msg.day, speed: msg.speed,
      season: msg.season, seasonFa: msg.seasonFa, fog: !!msg.fog, cease: msg.cease || 0,
      winner: msg.winner, winText: msg.winText,
      res: msg.res, pop: msg.pop, vp: msg.vp, hold: msg.hold,
      net: msg.net, owned: msg.owned, starved: msg.starved,
      fronts: msg.fronts || null, doctrines: msg.doctrines || {}, buffs: msg.buffs || {},
      smokeClouds: msg.smokeClouds || [], reconFlights: msg.reconFlights || [],
      combatEvents: msg.combatEvents || [],
      cities, units, shots: msg.shots || [], deaths: msg.deaths || [],
      alerts: msg.alerts || [],
      scenarioId: msg.scenarioId || 'barbarossa',
      lastOps: msg.lastOps || null,
      aar: msg.aar || null
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

  /* ---------- MENU & LOBBY ---------- */
  $('btn-single').onclick = () => {
    beep(440, 0.08, 'square', 0.03);
    mode = 'single';
    if (!localGame) initLocal();
    send({ t: 'mode', mode: 'single' });
  };
  $('btn-multi').onclick = () => {
    beep(440, 0.08, 'square', 0.03);
    mode = 'multi';
    send({ t: 'mode', mode: 'multi' });
  };

  function renderLobby(h) {
    // Scenarios
    const scenBox = $('ops-row');
    if (scenBox && OST.SCENARIOS) {
      const keys = Object.keys(OST.SCENARIOS);
      if (scenBox.childElementCount !== keys.length) {
        scenBox.innerHTML = '';
        for (const k of keys) {
          const sc = OST.SCENARIOS[k];
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ops-card';
          btn.dataset.scen = k;
          btn.textContent = sc.nameFa;
          btn.onclick = () => {
            beep(400, 0.06, 'triangle', 0.03);
            send({ t: 'scenario', scenarioId: k });
          };
          scenBox.appendChild(btn);
        }
      }
      for (const b of scenBox.children) {
        b.classList.toggle('on', b.dataset.scen === h.scenarioId);
      }
      const activeSc = OST.SCENARIOS[h.scenarioId];
      if (activeSc && $('ops-brief')) {
        $('ops-brief').textContent = (activeSc.briefFa || []).join(' ');
      }
    }

    // Difficulty buttons
    const diffButtons = document.querySelectorAll('.diff-btn');
    diffButtons.forEach(btn => {
      btn.classList.toggle('on', btn.dataset.diff === difficulty);
      btn.onclick = () => {
        beep(360, 0.05, 'triangle', 0.03);
        difficulty = btn.dataset.diff;
        send({ t: 'difficulty', difficulty });
      };
    });

    // Faction picks
    $('pick-ger').classList.toggle('on', myFac === 'ger');
    $('pick-sov').classList.toggle('on', myFac === 'sov');
    $('pick-ger').onclick = () => { beep(350, 0.06, 'square', 0.03); send({ t: 'faction', faction: 'ger' }); };
    $('pick-sov').onclick = () => { beep(350, 0.06, 'square', 0.03); send({ t: 'faction', faction: 'sov' }); };

    // Ready / Cancel
    $('btn-ready').disabled = !myFac;
    $('btn-ready').onclick = () => { beep(520, 0.1, 'sine', 0.05); send({ t: 'ready' }); };
    $('btn-cancel').onclick = () => { beep(300, 0.08, 'sine', 0.03); send({ t: 'cancel' }); };
  }

  /* ---------- HUD & GAME PLAY ---------- */
  function refreshHud(st) {
    $('hud-day').textContent = 'روز ' + (st.day || 1);
    if ($('hud-season')) $('hud-season').textContent = st.seasonFa || 'تابستان';

    if (myFac && st.res && st.res[myFac]) {
      const r = st.res[myFac];
      $('r-i').textContent = r.i;
      $('r-m').textContent = r.m;
      $('r-o').textContent = r.o;
      $('r-pop').textContent = st.pop[myFac] || 0;
      $('r-net').textContent = st.net[myFac] || 0;
      $('r-vp').textContent = st.vp[myFac] || 0;
    }

    // Fronts
    if (st.fronts) {
      for (const f of ['north', 'center', 'south']) {
        const el = $('f-' + f);
        if (el && st.fronts[f]) {
          const info = st.fronts[f];
          el.querySelector('b').textContent = info.ger + ' : ' + info.sov;
          el.classList.toggle('lead-ger', info.lead === 'ger');
          el.classList.toggle('lead-sov', info.lead === 'sov');
        }
      }
    }

    // Alerts
    const tBox = $('toasts');
    if (tBox && st.alerts) {
      tBox.innerHTML = st.alerts.slice(-3).map(a => '<div class="toast">' + a + '</div>').join('');
    }
  }

  function refreshDoctrines(st) {
    if (!myFac) return;
    const docs = DOCTRINES[myFac] || [];
    const container = $('doc-buttons');
    if (!container) return;

    if (container.childElementCount !== docs.length) {
      container.innerHTML = '';
      for (const d of docs) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'doc-btn';
        btn.dataset.doc = d.id;

        const name = document.createElement('b');
        name.textContent = d.nameFa;
        btn.appendChild(name);

        const cost = document.createElement('small');
        cost.className = 'doc-cost';
        cost.textContent = (d.cost.i ? d.cost.i + '⚙ ' : '') + (d.cost.m ? d.cost.m + '♟ ' : '') + (d.cost.o ? d.cost.o + '◆' : '');
        btn.appendChild(cost);

        btn.onclick = () => {
          const cd = (st.doctrines && st.doctrines[d.id]) || 0;
          if (cd > 0) return;
          if (d.id === 'blitzkrieg' || d.id === 'order_227') {
            send({ t: 'doctrine', doctrineId: d.id, x: 0, y: 0 });
            beep(520, 0.15, 'triangle', 0.05);
          } else {
            // Enter targeting mode
            activeDoctrineTarget = activeDoctrineTarget === d.id ? null : d.id;
            beep(420, 0.08, 'sine', 0.04);
            refreshDoctrines(st);
          }
        };

        container.appendChild(btn);
      }
    }

    for (const btn of container.children) {
      const docId = btn.dataset.doc;
      const d = docs.find(x => x.id === docId);
      const cd = Math.ceil((st.doctrines && st.doctrines[docId]) || 0);
      const r = st.res[myFac];
      const affordable = (!d.cost.i || r.i >= d.cost.i) && (!d.cost.m || r.m >= d.cost.m) && (!d.cost.o || r.o >= d.cost.o);

      btn.disabled = cd > 0 || !affordable;
      btn.classList.toggle('active-target', activeDoctrineTarget === docId);

      let overlay = btn.querySelector('.doc-cd-overlay');
      if (cd > 0) {
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'doc-cd-overlay';
          btn.appendChild(overlay);
        }
        overlay.textContent = cd + 's';
      } else if (overlay) {
        overlay.remove();
      }
    }
  }

  function refreshCmdBar(st) {
    const cmdBar = $('cmd-bar');
    if (!cmdBar) return;
    const hasSel = mySel.size > 0;
    cmdBar.classList.toggle('hidden', !hasSel);
  }

  // Hook command buttons
  $('cmd-atk').onclick = () => { keys['KeyA'] = true; beep(320, 0.05, 'triangle', 0.03); };
  $('cmd-stop').onclick = () => { send({ t: 'cmd', c: { k: 'stop', ids: [...mySel] } }); beep(280, 0.05, 'triangle', 0.03); };
  $('cmd-hold').onclick = () => { send({ t: 'cmd', c: { k: 'hold', ids: [...mySel] } }); beep(300, 0.05, 'triangle', 0.03); };
  $('cmd-retreat').onclick = () => { send({ t: 'cmd', c: { k: 'retreat', ids: [...mySel] } }); beep(240, 0.05, 'triangle', 0.03); };

  // Speed controls
  document.querySelectorAll('.spd-btn').forEach(btn => {
    btn.onclick = () => {
      const spd = Number(btn.dataset.spd);
      send({ t: 'speed', speed: spd });
      document.querySelectorAll('.spd-btn').forEach(b => b.classList.toggle('on', Number(b.dataset.spd) === spd));
      beep(400, 0.05, 'sine', 0.03);
    };
  });

  // Sound toggle
  $('btn-mute').onclick = () => {
    muted = !muted;
    $('btn-mute').textContent = muted ? '🔇' : '♪';
  };

  /* ---------- PRODUCTION ---------- */
  function refreshProd(st) {
    if (!selectedCity || !myFac) { $('prod').classList.add('hidden'); return; }
    const city = st.cities.find(c => c.id === selectedCity);
    if (!city || city.owner !== myFac) { $('prod').classList.add('hidden'); selectedCity = null; return; }
    $('prod').classList.remove('hidden');

    const proto = OST.cityById(city.id);
    $('prod-name').textContent = proto.nameFa;
    const bits = [];
    if (proto.capital) bits.push('پایتخت');
    bits.push((proto.vp || 1) + ' امتیاز');
    if (city.factory) bits.push('کارخانه ' + city.factory);
    if (city.barracks) bits.push('سربازخانه ' + city.barracks);
    if (city.depot) bits.push('انبار');
    $('prod-own').textContent = bits.join(' · ');

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
    const slots = 3 + (city.factory || 0);
    for (const b of box.children) {
      const d = UNIT_TYPES[b.dataset.type];
      const can = (d.cls === 'inf' || d.cls === 'recon' || d.cls === 'eng') ? city.barracks >= 1
        : (d.cls === 'at' || d.cls === 'aa') ? (city.barracks >= 1 || city.factory >= 1)
        : city.factory >= 1;
      const ok = can && r.i >= d.cost.i && r.m >= d.cost.m && r.o >= d.cost.o && st.pop[myFac] + d.pop <= POP_CAP && city.queue.length < slots;
      b.classList.toggle('off', !ok);
      b.title = can ? '' : ((d.cls === 'inf' || d.cls === 'recon' || d.cls === 'eng') ? 'سربازخانه لازم است' : 'کارخانه لازم است');
    }

    $('prod-q').textContent = city.queue.length
      ? 'صف ساخت: ' + city.queue.map(q => UNIT_TYPES[q.type].nameFa + ' (' + Math.ceil(q.left) + 's)').join(' ← ')
      : 'صف تولید خالی است';

    // Upgrades
    const up = $('prod-upg');
    if (up) {
      const keys = Object.keys(OST.UPGRADES);
      if (up.childElementCount !== keys.length) {
        up.innerHTML = '';
        for (const k of keys) {
          const spec = OST.UPGRADES[k];
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'ubtn';
          b.dataset.what = k;
          b.onclick = () => {
            send({ t: 'cmd', c: { k: 'upgrade', city: selectedCity, what: k } });
            beep(260, 0.06, 'triangle', 0.03);
          };
          up.appendChild(b);
        }
      }
      for (const b of up.children) {
        const k = b.dataset.what;
        const spec = OST.UPGRADES[k];
        const n = city[k] || 0;
        const busy = !!city.upg;
        const maxed = n >= spec.max;
        b.textContent = spec.nameFa + ' ' + n + '/' + spec.max + ' · ' + spec.i + '⚙';
        b.disabled = busy || maxed || r.i < spec.i;
        b.classList.toggle('off', b.disabled);
      }
    }
  }

  function refreshSel(st) {
    if (!mySel.size) { $('sel').classList.add('hidden'); return; }
    const us = st.units.filter(u => mySel.has(u.id) && u.fac === myFac);
    if (!us.length) { $('sel').classList.add('hidden'); mySel.clear(); return; }
    $('sel').classList.remove('hidden');
    $('sel').classList.toggle('sov', myFac === 'sov');

    if (us.length === 1) {
      const u = us[0];
      const d = UNIT_TYPES[u.type];
      $('sel-name').textContent = d.nameFa + (u.rank ? ' ' + OST.VETERANCY[u.rank].stars : '');
      $('sel-role').textContent = d.roleFa + (u.supplied ? '' : ' — فاقد تدارکات') + (u.ent > 0.3 ? ' · سنگربندی‌شده' : '');
      $('sel-hpbar').style.width = Math.max(0, 100 * u.hp / d.hp) + '%';
      $('sel-count').textContent = d.name + ' · انهدام: ' + (u.kills || 0);
    } else {
      $('sel-name').textContent = us.length + ' یگان رزمی';
      $('sel-role').textContent = 'دسته متمرکز جبهه';
      const avgHp = us.reduce((s, u) => s + u.hp / UNIT_TYPES[u.type].hp, 0) / us.length;
      $('sel-hpbar').style.width = (avgHp * 100) + '%';
      $('sel-count').textContent = us.map(u => UNIT_TYPES[u.type].nameFa).slice(0, 4).join('، ') + (us.length > 4 ? '...' : '');
    }
  }

  function refreshIntel(st) {
    const el = $('intel');
    if (!el) return;
    if (selectedCity) {
      const dossier = OST.intelCity && OST.intelCity(selectedCity);
      const proto = OST.cityById(selectedCity);
      if (!dossier || !proto) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      $('intel-title').textContent = proto.nameFa;
      $('intel-role').textContent = dossier.roleFa || '';
      $('intel-body').innerHTML = (dossier.bodyFa || []).slice(0, 4).map(p => '<p>' + p + '</p>').join('');
      return;
    }
    if (mySel.size === 1 && st) {
      const u = st.units.find(x => mySel.has(x.id));
      const du = u && OST.intelUnit && OST.intelUnit(u.type);
      const def = u && UNIT_TYPES[u.type];
      if (du && def) {
        el.classList.remove('hidden');
        $('intel-title').textContent = def.nameFa + (u.rank ? ' ' + OST.VETERANCY[u.rank].stars : '');
        $('intel-role').textContent = def.roleFa;
        $('intel-body').innerHTML = (du.howFa || []).map(p => '<p>' + p + '</p>').join('');
        return;
      }
    }
    el.classList.add('hidden');
  }

  function showEnd(st) {
    const el = $('end');
    el.classList.remove('hidden');
    const win = st.winner === myFac;
    if (win) victoryFanfare(); else defeatFanfare();
    $('end-kicker').textContent = win ? 'پیروزی قاطع' : 'شکست راهبردی';
    $('end-title').textContent = st.winText || '';
    $('end-sub').textContent = win
      ? (myFac === 'ger' ? 'ورماخت به پیروزی تاریخی در جبهه شرق دست یافت.' : 'ارتش سرخ برلین را تسخیر و رایش را درهم شکست.')
      : 'جبهه نبرد فروپاشید.';

    const box = $('end-aar');
    if (box && st.aar) {
      const a = st.aar;
      const me = myFac || 'ger';
      box.innerHTML =
        '<span>دشمنان منهدم‌شده: <b>' + (a.kills[me] || 0) + '</b></span>' +
        '<span>تلفات خودی: <b>' + (a.lost[me] || 0) + '</b></span>' +
        '<span>شهرهای تسخیرشده: <b>' + (a.cap[me] || 0) + '</b></span>' +
        '<span>یگان‌های ساخته‌شده: <b>' + (a.built[me] || 0) + '</b></span>';
    }

    $('end-restart').onclick = () => {
      el.classList.add('hidden');
      send({ t: 'cancel' });
    };
  }

  /* ---------- INPUT & CONTROLS ---------- */
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Escape') {
      mySel.clear();
      selectedCity = null;
      activeDoctrineTarget = null;
      closeBook();
    }
    if (e.code === 'KeyH' && !e.ctrlKey) { toggleBook(); }
    if (e.code === 'Space') {
      e.preventDefault();
      const curSpd = (snapB && snapB.speed !== undefined) ? snapB.speed : 1;
      const nextSpd = curSpd > 0 ? 0 : 1;
      send({ t: 'speed', speed: nextSpd });
      document.querySelectorAll('.spd-btn').forEach(b => b.classList.toggle('on', Number(b.dataset.spd) === nextSpd));
    }
    if (e.code === 'KeyA' && (e.ctrlKey || e.metaKey)) {
      // Select all friendly units on screen
      e.preventDefault();
      selectAllOnScreen();
    }
    // Control groups (1..9)
    if (e.code.startsWith('Digit') && !e.altKey) {
      const num = e.code.replace('Digit', '');
      if (e.ctrlKey) {
        // Assign group
        e.preventDefault();
        controlGroups[num] = new Set(mySel);
        beep(480, 0.05, 'sine', 0.03);
      } else {
        // Select group
        e.preventDefault();
        const now = performance.now();
        if (controlGroups[num] && controlGroups[num].size) {
          mySel = new Set(controlGroups[num]);
          beep(440, 0.05, 'sine', 0.03);
          if (lastGroupTap.key === num && now - lastGroupTap.time < 300) {
            // Focus camera on group
            focusCameraOnSelection();
          }
          lastGroupTap = { key: num, time: now };
        }
      }
    }
  });

  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  function selectAllOnScreen() {
    const st = lerpWorld();
    if (!st || !myFac) return;
    mySel.clear();
    for (const u of st.units) {
      if (u.fac !== myFac) continue;
      const sx = (u.x - cam.x) * cam.z + cam.sw / 2;
      const sy = (u.y - cam.y) * cam.z + cam.sh / 2;
      if (sx >= 0 && sx <= cam.sw && sy >= 0 && sy <= cam.sh) {
        mySel.add(u.id);
      }
    }
    beep(380, 0.06, 'triangle', 0.03);
  }

  function focusCameraOnSelection() {
    const st = lerpWorld();
    if (!st) return;
    const us = st.units.filter(u => mySel.has(u.id));
    if (!us.length) return;
    let sx = 0, sy = 0;
    us.forEach(u => { sx += u.x; sy += u.y; });
    cam.x = sx / us.length;
    cam.y = sy / us.length;
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    const st = lerpWorld();
    if (!st || !myFac) return;
    const w = GFX.worldFromScreen(cam, e.clientX, e.clientY);

    // Check minimap click
    if (mmBox && e.clientX >= mmBox.px && e.clientX <= mmBox.px + mmBox.w &&
        e.clientY >= mmBox.py && e.clientY <= mmBox.py + mmBox.h) {
      cam.x = (e.clientX - mmBox.px) / mmBox.sx;
      cam.y = (e.clientY - mmBox.py) / mmBox.sy;
      return;
    }

    // Check doctrine targeting click
    if (activeDoctrineTarget && e.button === 0) {
      send({ t: 'doctrine', doctrineId: activeDoctrineTarget, x: w.x, y: w.y });
      activeDoctrineTarget = null;
      beep(500, 0.1, 'triangle', 0.05);
      return;
    }

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panning = true;
      pan0 = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
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

  function leftClick(st, w, shift) {
    // City click
    const nearCity = st.cities.find(c => Math.hypot(c.x - w.x, c.y - w.y) < CITY_R + 8);
    if (nearCity) {
      selectedCity = nearCity.id;
      if (!shift) mySel.clear();
      beep(320, 0.05, 'triangle', 0.03);
      return;
    }
    selectedCity = null;

    // Unit click
    const clickedUnit = st.units.find(u => Math.hypot(u.x - w.x, u.y - w.y) < (UNIT_TYPES[u.type] ? UNIT_TYPES[u.type].radius + 8 : 16));
    if (clickedUnit) {
      if (clickedUnit.fac === myFac) {
        if (!shift) mySel.clear();
        if (mySel.has(clickedUnit.id)) mySel.delete(clickedUnit.id);
        else mySel.add(clickedUnit.id);
        beep(360, 0.05, 'sine', 0.03);
      }
      return;
    }

    if (!shift) mySel.clear();
  }

  function boxSelect(st, b, shift) {
    if (!shift) mySel.clear();
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    for (const u of st.units) {
      if (u.fac === myFac && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) {
        mySel.add(u.id);
      }
    }
    if (mySel.size) beep(400, 0.06, 'triangle', 0.03);
  }

  function rightClick(st, w) {
    if (!mySel.size) return;
    const enemy = st.units.find(u => u.fac !== myFac && Math.hypot(u.x - w.x, u.y - w.y) < (UNIT_TYPES[u.type] ? UNIT_TYPES[u.type].radius + 8 : 16));
    if (enemy) {
      send({ t: 'cmd', c: { k: 'attack', ids: [...mySel], tid: enemy.id, x: enemy.x, y: enemy.y } });
      beep(460, 0.06, 'square', 0.03);
    } else {
      send({ t: 'cmd', c: { k: 'move', ids: [...mySel], x: w.x, y: w.y } });
      beep(380, 0.05, 'sine', 0.03);
    }
  }

  /* ---------- BOOK ---------- */
  function toggleBook() {
    const el = $('book');
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) renderBook();
  }
  function closeBook() { $('book').classList.add('hidden'); }
  $('btn-book').onclick = toggleBook;
  $('book-close').onclick = closeBook;

  function renderBook() {
    const nav = $('book-nav');
    const page = $('book-page');
    if (!OST.BOOK || !nav) return;
    nav.innerHTML = '';
    OST.BOOK.forEach((ch, i) => {
      const b = document.createElement('button');
      b.textContent = ch.titleFa;
      b.onclick = () => {
        for (const c of nav.children) c.classList.remove('on');
        b.classList.add('on');
        page.innerHTML = '<h3>' + ch.titleFa + '</h3>' + (ch.paras || []).map(p => '<p>' + p + '</p>').join('');
      };
      if (i === 0) {
        b.classList.add('on');
        page.innerHTML = '<h3>' + ch.titleFa + '</h3>' + (ch.paras || []).map(p => '<p>' + p + '</p>').join('');
      }
      nav.appendChild(b);
    });
  }

  /* ---------- MAIN RENDER LOOP ---------- */
  let lastTime = performance.now();
  function loop(now) {
    const dt = (now - lastTime) * 0.001;
    lastTime = now;

    // Keyboard Pan
    const panSpeed = 750 / cam.z;
    if (keys['KeyW'] || keys['ArrowUp']) cam.y -= panSpeed * dt;
    if (keys['KeyS'] || keys['ArrowDown']) cam.y += panSpeed * dt;
    if (keys['KeyA'] || keys['ArrowLeft']) cam.x -= panSpeed * dt;
    if (keys['KeyD'] || keys['ArrowRight']) cam.x += panSpeed * dt;

    cam.x = Math.max(100, Math.min(WORLD.W - 100, cam.x));
    cam.y = Math.max(100, Math.min(WORLD.H - 100, cam.y));

    const st = lerpWorld();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (st && st.phase === 'playing') {
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.translate(cam.sw / 2, cam.sh / 2);
      ctx.scale(cam.z, cam.z);
      ctx.translate(-cam.x, -cam.y);

      GFX.drawWorld(ctx, cam, st, mySel, box, null, myFac, dt);
      ctx.restore();

      // Draw Minimap on screen HUD
      ctx.save();
      ctx.scale(dpr, dpr);
      mmBox = GFX.drawMinimap(ctx, st, cam, myFac);
      ctx.restore();
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

})();
