'use strict';

const GFX = (() => {
  const { WORLD, CITIES, CONNECTIONS, UNIT_TYPES, FACTIONS, CITY_R, isWater, inMarsh, inCaucasus, RIVERS, VETERANCY } = OST;

  let mapCache = null;
  let mapReady = false;
  let fogCache = null;
  let fogG = null;
  const FOG_S = 0.4;

  // Particle systems
  const weatherParticles = [];
  const craters = []; // lingering battlefield craters [ { x, y, r, alpha } ]
  const smokePuffs = []; // visual smoke particle effects

  function hash(x, y) {
    let n = x * 374761393 + y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
  }

  function buildMap() {
    const s = 0.42;
    const w = Math.floor(WORLD.W * s);
    const h = Math.floor(WORLD.H * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.scale(s, s);

    const land = g.createLinearGradient(0, 0, 0, WORLD.H);
    land.addColorStop(0, '#cfcab8');
    land.addColorStop(0.16, '#8e8d72');
    land.addColorStop(0.42, '#6c704e');
    land.addColorStop(0.7, '#7a6c4a');
    land.addColorStop(1, '#5c5340');
    g.fillStyle = land;
    g.fillRect(0, 0, WORLD.W, WORLD.H);

    for (let i = 0; i < 140; i++) {
      const x = hash(i, 1) * WORLD.W;
      const y = hash(i, 2) * WORLD.H;
      const r = 90 + hash(i, 3) * 220;
      const grd = g.createRadialGradient(x, y, 10, x, y, r);
      const snow = y < 520;
      grd.addColorStop(0, snow ? 'rgba(236,232,220,0.32)' : 'rgba(48,72,36,0.2)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    }

    {
      const grd = g.createRadialGradient(1780, 1420, 30, 1780, 1420, 420);
      grd.addColorStop(0, 'rgba(36,52,34,0.62)');
      grd.addColorStop(1, 'rgba(36,52,34,0)');
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(1780, 1420, 380, 220, 0, 0, 6.28); g.fill();
    }

    g.save();
    g.strokeStyle = 'rgba(40,32,24,0.4)';
    g.lineWidth = 8;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.moveTo(3000, 2200 + i * 16);
      g.bezierCurveTo(3600, 2140 + i * 12, 4100, 2280 + i * 10, 4600, 2220 + i * 12);
      g.stroke();
    }
    g.restore();

    g.strokeStyle = 'rgba(40,36,28,0.12)';
    g.lineWidth = 1;
    for (let x = 0; x < WORLD.W; x += 200) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, WORLD.H); g.stroke();
    }
    for (let y = 0; y < WORLD.H; y += 200) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD.W, y); g.stroke();
    }

    g.fillStyle = '#1a2c34';
    g.beginPath();
    const step = 16;
    for (let y = 0; y < WORLD.H; y += step) {
      for (let x = 0; x < WORLD.W; x += step) {
        if (isWater(x, y)) g.rect(x - step / 2, y - step / 2, step, step);
      }
    }
    g.fill();

    drawRivers(g);
    drawRails(g);

    stamp(g, 'BALTIC SEA', 700, 260, -0.15, 36, 0.22);
    stamp(g, 'BLACK SEA', 2600, 2600, 0.05, 48, 0.22);
    stamp(g, 'CASPIAN SEA', 4960, 2460, -0.4, 40, 0.22);
    stamp(g, 'PRIPYAT MARSHES', 1780, 1420, 0, 28, 0.25);
    stamp(g, 'CAUCASUS', 3800, 2300, 0.08, 44, 0.24);

    return c;
  }

  function stamp(g, text, x, y, rot, size, alpha) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(235,225,200,' + alpha + ')';
    g.font = '900 ' + size + 'px "Cinzel", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.letterSpacing = '6px';
    g.fillText(text, 0, 0);
    g.restore();
  }

  function drawRivers(g) {
    g.save();
    g.strokeStyle = '#233842';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const r of RIVERS) {
      g.lineWidth = 14;
      g.beginPath();
      for (let i = 0; i < r.length; i++) {
        const [x, y] = r[i];
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.lineWidth = 7;
      g.strokeStyle = '#325262';
      g.stroke();
    }
    g.restore();
  }

  function drawRails(g) {
    g.save();
    g.strokeStyle = 'rgba(28,24,18,0.55)';
    g.lineWidth = 3;
    for (const [a, b] of CONNECTIONS) {
      const ca = OST.cityById(a);
      const cb = OST.cityById(b);
      if (!ca || !cb) continue;
      g.beginPath();
      g.moveTo(ca.x, ca.y);
      g.lineTo(cb.x, cb.y);
      g.stroke();
    }
    g.restore();
  }

  function ensureMap() {
    if (!mapReady) { mapCache = buildMap(); mapReady = true; }
  }

  function drawWorld(ctx, cam, st, sel, box, hover, myFac, dtClock) {
    ensureMap();
    ctx.save();
    ctx.drawImage(mapCache, 0, 0, WORLD.W, WORLD.H);

    drawLiveRails(ctx, st);
    drawInfluence(ctx, st);
    drawCraters(ctx);
    drawSmokeClouds(ctx, st);
    drawCities(ctx, st, cam, hover, dtClock);
    drawUnits(ctx, st, sel, myFac, cam);
    drawShots(ctx, st);
    drawStrikes(ctx, st);
    drawCombatEvents(ctx, st);
    drawWeather(ctx, cam, st);

    if (st && st.fog) drawFog(ctx, st, myFac);
    if (box) drawBox(ctx, box);

    ctx.restore();
  }

  function drawCraters(ctx) {
    ctx.save();
    for (let i = craters.length - 1; i >= 0; i--) {
      const cr = craters[i];
      ctx.fillStyle = 'rgba(18,14,10,' + (cr.alpha * 0.4) + ')';
      ctx.beginPath();
      ctx.ellipse(cr.x, cr.y, cr.r, cr.r * 0.7, cr.rot || 0, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }

  function addCrater(x, y, r) {
    craters.push({ x, y, r: r || 16, rot: Math.random() * 3.14, alpha: 1.0 });
    if (craters.length > 80) craters.shift();
  }

  function drawLiveRails(ctx, st) {
    if (!st) return;
    const netG = new Set();
    const netS = new Set();
    const capG = st.cities.find(c => c[0] === 'berlin' && c[1] === 'ger');
    const capS = st.cities.find(c => c[0] === 'moscow' && c[1] === 'sov');
    const byId = new Map(st.cities.map(c => [c[0], c]));
    function flood(rootId, owner, out) {
      if (!rootId) return;
      const q = [rootId];
      out.add(rootId);
      while (q.length) {
        const u = q.shift();
        for (const v of OST.neighbors(u)) {
          if (out.has(v)) continue;
          const cv = byId.get(v);
          if (cv && cv[1] === owner && !cv[8]) { out.add(v); q.push(v); }
        }
      }
    }
    if (capG) flood('berlin', 'ger', netG);
    if (capS) flood('moscow', 'sov', netS);

    ctx.save();
    ctx.lineWidth = 2.4;
    for (const [a, b] of CONNECTIONS) {
      const ca = OST.cityById(a);
      const cb = OST.cityById(b);
      const gLive = netG.has(a) && netG.has(b);
      const sLive = netS.has(a) && netS.has(b);
      if (!gLive && !sLive) continue;
      ctx.strokeStyle = gLive && sLive ? '#c49a44' : gLive ? '#d4b35e' : '#d45e5e';
      ctx.beginPath();
      ctx.moveTo(ca.x, ca.y);
      ctx.lineTo(cb.x, cb.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSmokeClouds(ctx, st) {
    if (!st || !st.smokeClouds) return;
    ctx.save();
    for (const [x, y, r, ttl] of st.smokeClouds) {
      const alpha = Math.min(0.65, ttl * 0.15);
      const grd = ctx.createRadialGradient(x, y, 10, x, y, r);
      grd.addColorStop(0, 'rgba(220, 220, 215, ' + alpha + ')');
      grd.addColorStop(0.6, 'rgba(170, 165, 155, ' + (alpha * 0.7) + ')');
      grd.addColorStop(1, 'rgba(120, 115, 105, 0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWeather(ctx, cam, st) {
    if (!st) return;
    const sea = st.season;
    ctx.save();
    if (sea === 'winter') {
      // Winter frosted tint
      ctx.fillStyle = 'rgba(220, 235, 255, 0.08)';
      ctx.fillRect(0, 0, WORLD.W, WORLD.H);

      // Snowflakes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      const t = performance.now() * 0.001;
      for (let i = 0; i < 70; i++) {
        const sx = (hash(i, 4) * WORLD.W + t * 40 * (i % 3 + 1)) % WORLD.W;
        const sy = (hash(i, 5) * WORLD.H + t * 70 * (i % 2 + 1)) % WORLD.H;
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + (i % 3), 0, 6.28);
        ctx.fill();
      }
    } else if (sea === 'mud') {
      // Mud rain tint
      ctx.fillStyle = 'rgba(70, 60, 45, 0.06)';
      ctx.fillRect(0, 0, WORLD.W, WORLD.H);

      // Rain streaks
      ctx.strokeStyle = 'rgba(180, 200, 215, 0.35)';
      ctx.lineWidth = 1.2;
      const t = performance.now() * 0.002;
      ctx.beginPath();
      for (let i = 0; i < 90; i++) {
        const rx = (hash(i, 6) * WORLD.W + t * 60) % WORLD.W;
        const ry = (hash(i, 7) * WORLD.H + t * 240) % WORLD.H;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + 6, ry + 16);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFog(ctx, st, myFac) {
    if (!myFac) return;
    const fw = Math.ceil(WORLD.W * FOG_S);
    const fh = Math.ceil(WORLD.H * FOG_S);
    if (!fogCache || fogCache.width !== fw || fogCache.height !== fh) {
      fogCache = document.createElement('canvas');
      fogCache.width = fw; fogCache.height = fh;
      fogG = fogCache.getContext('2d');
    }
    const fg = fogG;
    fg.save();
    fg.setTransform(1, 0, 0, 1, 0, 0);
    fg.clearRect(0, 0, fw, fh);
    fg.fillStyle = 'rgba(12,10,8,0.86)';
    fg.fillRect(0, 0, fw, fh);
    fg.scale(FOG_S, FOG_S);
    fg.globalCompositeOperation = 'destination-out';
    fg.fillStyle = '#000';

    for (const u of st.units) {
      if (u.fac !== myFac) continue;
      const d = UNIT_TYPES[u.type];
      const r = OST.visR(d ? d.cls : 'inf');
      fg.beginPath(); fg.arc(u.x, u.y, r, 0, 6.28); fg.fill();
    }
    for (const c of st.cities) {
      if (c.owner !== myFac) continue;
      fg.beginPath(); fg.arc(c.x, c.y, CITY_R + 110, 0, 6.28); fg.fill();
    }
    if (st.reconFlights) {
      for (const [rx, ry, rr] of st.reconFlights) {
        fg.beginPath(); fg.arc(rx, ry, rr, 0, 6.28); fg.fill();
      }
    }
    fg.restore();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fogCache, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  function drawInfluence(ctx, st) {
    if (!st) return;
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (const c of st.cities) {
      const col = FACTIONS[c.owner].color;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(c.x, c.y, CITY_R + 80, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCities(ctx, st, cam, hover, t) {
    if (!st) return;
    for (const c of st.cities) {
      const p = OST.cityById(c.id);
      const isCap = p.capital;
      const isHov = hover && hover.id === c.id;
      const fac = FACTIONS[c.owner];

      ctx.save();
      ctx.translate(c.x, c.y);

      // Capture ring
      if (c.cap < 1.0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, CITY_R + 4, -1.57, -1.57 + c.cap * 6.28);
        ctx.stroke();
      }

      // Base circle
      ctx.fillStyle = isCap ? '#201a12' : '#2a2620';
      ctx.strokeStyle = fac.color;
      ctx.lineWidth = isCap ? 4 : isHov ? 3.2 : 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, CITY_R, 0, 6.28);
      ctx.fill(); ctx.stroke();

      // Flag / star icon
      if (isCap) {
        star(ctx, 0, -8, 14, 5, 0.45);
        ctx.fillStyle = fac.color; ctx.fill();
      }

      // City Name
      ctx.fillStyle = '#f0ebe0';
      ctx.font = 'bold 13px "Vazirmatn", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.nameFa, 0, isCap ? 14 : 4);

      // Industry / VP indicators
      ctx.font = '10px "Vazirmatn", sans-serif';
      ctx.fillStyle = 'rgba(220,210,190,0.85)';
      ctx.fillText(p.vp ? (p.vp + '★') : '', 0, isCap ? 26 : 17);

      // Sabotage / Partisan warning
      if (c.cut) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 11px "Vazirmatn", sans-serif';
        ctx.fillText('⚠ قطع', 0, -CITY_R - 6);
      }

      ctx.restore();
    }
  }

  function star(ctx, x, y, r, n, inset) {
    ctx.save();
    ctx.beginPath();
    ctx.translate(x, y);
    ctx.moveTo(0, 0 - r);
    for (let i = 0; i < n; i++) {
      ctx.rotate(Math.PI / n);
      ctx.lineTo(0, 0 - (r * inset));
      ctx.rotate(Math.PI / n);
      ctx.lineTo(0, 0 - r);
    }
    ctx.closePath();
    ctx.restore();
  }

  function drawUnits(ctx, st, sel, myFac, cam) {
    if (!st || !st.units) return;
    for (const u of st.units) {
      const def = UNIT_TYPES[u.type];
      if (!def) continue;
      const isSel = sel && sel.has(u.id);

      ctx.save();
      ctx.translate(u.x, u.y);

      // Entrenchment trench circle
      if (u.ent && u.ent > 0.2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(140, 115, 80, 0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, def.radius + 7, 0, 6.28);
        ctx.stroke();
        ctx.restore();
      }

      // Selection indicator
      if (isSel) {
        ctx.strokeStyle = '#44ddff';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, def.radius + 6, 0, 6.28);
        ctx.stroke();
      }

      // Rotation & Unit rendering
      ctx.rotate(u.ang);
      drawUnitShape(ctx, u.type, u.fac);
      ctx.restore();

      // Health bar & Veterancy stars
      ctx.save();
      ctx.translate(u.x, u.y);
      const hpPct = Math.max(0, Math.min(1, u.hp / def.hp));
      const bw = 24, bh = 3.5;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-bw / 2, -def.radius - 12, bw, bh);
      ctx.fillStyle = hpPct > 0.5 ? '#44cc55' : hpPct > 0.25 ? '#ddaa22' : '#dd3333';
      ctx.fillRect(-bw / 2, -def.radius - 12, bw * hpPct, bh);

      // Veterancy Stars
      if (u.rank && u.rank > 0) {
        const starsText = VETERANCY[u.rank] ? VETERANCY[u.rank].stars : '';
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 9px "Cinzel", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(starsText, 0, -def.radius - 15);
      }

      // Suppression indicator
      if (u.suppr && u.suppr > 30) {
        ctx.fillStyle = '#ffaa33';
        ctx.fillRect(-bw / 2, -def.radius - 7, (bw * (u.suppr / 100)), 2);
      }

      ctx.restore();
    }
  }

  function hull(ctx, pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.closePath();
  }

  function tracks(ctx, w, h, col) {
    ctx.fillStyle = '#1e1f1c';
    ctx.fillRect(-w, -h, w * 2, 3.2);
    ctx.fillRect(-w, h - 3.2, w * 2, 3.2);
  }

  function markGer(ctx) {
    ctx.fillStyle = '#111';
    ctx.fillRect(-2, -2, 4, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1, -1, 2, 2);
  }

  function markSov(ctx) {
    star(ctx, 0, 0, 3.5, 5, 0.45);
    ctx.fillStyle = '#e03030'; ctx.fill();
  }

  function drawUnitShape(ctx, type, fac) {
    const col = FACTIONS[fac].unit;
    const accent = FACTIONS[fac].color;
    ctx.lineJoin = 'round';

    switch (type) {
      case 'grenadier':
      case 'strelok':
      case 'pzgren':
      case 'gvardia':
      case 'pioneer':
      case 'saper':
        drawInf(ctx, type === 'strelok' || type === 'gvardia' || type === 'saper', col, accent);
        if (type === 'pioneer' || type === 'saper') {
          ctx.strokeStyle = accent; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(8, 4); ctx.lineTo(12, -6); ctx.stroke();
        }
        if (type === 'pzgren' || type === 'gvardia') {
          ctx.fillStyle = accent; ctx.fillRect(-2, 8, 4, 2);
        }
        break;

      case 'sanitaeter':
        ctx.fillStyle = '#dedad2';
        ctx.fillRect(-8, -6, 16, 12);
        ctx.fillStyle = '#cc2222';
        ctx.fillRect(-2, -4, 4, 8);
        ctx.fillRect(-4, -2, 8, 4);
        break;

      case 'komissar':
        ctx.fillStyle = '#2b3820';
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#cc2222';
        ctx.fillRect(-4, -7, 8, 3);
        markSov(ctx);
        break;

      case 'sdkfz':
      case 'razvedka':
        ctx.fillStyle = col;
        ctx.fillRect(-9, -5, 16, 10);
        ctx.fillStyle = '#1a1a16';
        ctx.beginPath(); ctx.arc(-5, 6, 2.4, 0, 6.28); ctx.arc(5, 6, 2.4, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#2a2c26';
        ctx.fillRect(4, -1, 10, 2);
        if (type === 'sdkfz') markGer(ctx); else markSov(ctx);
        break;

      case 'pak40':
      case 'zis3':
      case 'bs3':
        ctx.fillStyle = '#1a1a16';
        ctx.beginPath(); ctx.arc(-3, 6, 2.8, 0, 6.28); ctx.arc(3, 6, 2.8, 0, 6.28); ctx.fill();
        ctx.fillStyle = col;
        ctx.fillRect(-6, -4, 12, 8);
        ctx.fillStyle = '#151515';
        ctx.fillRect(4, -1.2, type === 'bs3' ? 22 : 16, 2.4);
        if (type === 'pak40') markGer(ctx); else markSov(ctx);
        break;

      case 'flak88':
      case 'aa85':
        ctx.fillStyle = '#1a1a16';
        ctx.beginPath(); ctx.arc(-4, 6, 3, 0, 6.28); ctx.arc(6, 6, 3, 0, 6.28); ctx.fill();
        ctx.fillStyle = col;
        ctx.fillRect(-7, -4, 14, 8);
        ctx.save();
        ctx.rotate(-0.9);
        ctx.fillStyle = '#222';
        ctx.fillRect(0, -1.3, 19, 2.6);
        ctx.restore();
        if (type === 'flak88') markGer(ctx); else markSov(ctx);
        break;

      case 'stug3':
        tracks(ctx, 11, 7, col);
        hull(ctx, [[-10, -6], [10, -5], [12, 0], [10, 5], [-10, 6], [-12, 0]]);
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = '#2a2c26';
        ctx.fillRect(6, -1.2, 14, 2.4);
        markGer(ctx);
        break;

      case 'panzer4':
        tracks(ctx, 12, 8, col);
        hull(ctx, [[-11, -7], [10, -6], [12, -2], [12, 2], [10, 6], [-11, 7], [-13, 3], [-13, -3]]);
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = '#3a3e36';
        ctx.fillRect(-3, -5, 9, 10);
        ctx.fillStyle = '#2a2c26';
        ctx.fillRect(6, -1.2, 16, 2.4);
        markGer(ctx);
        break;

      case 'tiger':
        tracks(ctx, 14, 10, col);
        hull(ctx, [[-14, -9], [11, -8], [15, -3], [15, 3], [11, 8], [-14, 9], [-16, 4], [-16, -4]]);
        ctx.fillStyle = '#55564c'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#3d3f36';
        ctx.fillRect(-4, -6, 11, 12);
        ctx.fillStyle = '#222';
        ctx.fillRect(6, -1.4, 22, 2.8);
        markGer(ctx);
        break;

      case 'ferdinand':
        tracks(ctx, 15, 10, col);
        hull(ctx, [[-15, -9], [12, -8], [14, 0], [12, 8], [-15, 9]]);
        ctx.fillStyle = '#656658'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#44463d';
        ctx.fillRect(-10, -7, 14, 14);
        ctx.fillStyle = '#111';
        ctx.fillRect(4, -1.5, 26, 3.0);
        markGer(ctx);
        break;

      case 't34':
        tracks(ctx, 12, 8, col);
        hull(ctx, [[-12, -6], [8, -6], [13, 0], [8, 6], [-12, 6]]);
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = '#2f3b23';
        ctx.beginPath(); ctx.arc(1, 0, 4.8, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#1f2818';
        ctx.fillRect(4, -1.1, 15, 2.2);
        markSov(ctx);
        break;

      case 'su85':
        tracks(ctx, 12, 8, col);
        hull(ctx, [[-12, -6], [8, -6], [13, 0], [8, 6], [-12, 6]]);
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = '#242e1b';
        ctx.fillRect(-6, -5, 12, 10);
        ctx.fillStyle = '#111';
        ctx.fillRect(6, -1.3, 20, 2.6);
        markSov(ctx);
        break;

      case 'kv1':
      case 'is2':
        tracks(ctx, 14, 9, col);
        hull(ctx, [[-14, -8], [10, -7], [13, 0], [10, 7], [-14, 8]]);
        ctx.fillStyle = type === 'is2' ? '#324026' : '#3c482f'; ctx.fill();
        ctx.strokeStyle = '#1a2212'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#24301a';
        ctx.beginPath(); ctx.ellipse(-1, 0, 6.5, 5.5, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#151c0f';
        ctx.fillRect(5, -1.4, type === 'is2' ? 24 : 18, 2.8);
        markSov(ctx);
        break;

      case 'wespe':
      case 'nebelwerfer':
      case 'katyusha':
        if (type === 'katyusha') {
          ctx.fillStyle = '#2e3824';
          ctx.fillRect(-10, -5, 18, 10);
          ctx.fillStyle = '#1a1a16';
          ctx.beginPath(); ctx.arc(-6, 6, 2.4, 0, 6.28); ctx.arc(6, 6, 2.4, 0, 6.28); ctx.fill();
          ctx.fillStyle = '#4a543e';
          for (let i = -3; i <= 3; i += 2) ctx.fillRect(-8, i * 1.5, 20, 1.2);
          markSov(ctx);
        } else if (type === 'nebelwerfer') {
          ctx.fillStyle = '#1a1a16';
          ctx.beginPath(); ctx.arc(-4, 5, 2.5, 0, 6.28); ctx.arc(4, 5, 2.5, 0, 6.28); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.28); ctx.fill();
          ctx.fillStyle = '#111';
          for (let i = 0; i < 6; i++) {
            const an = (i / 6) * 6.28;
            ctx.fillRect(Math.cos(an) * 3, Math.sin(an) * 3, 2, 2);
          }
          markGer(ctx);
        } else {
          tracks(ctx, 10, 7, col);
          ctx.fillStyle = col;
          ctx.fillRect(-8, -5, 14, 10);
          ctx.fillStyle = '#1a1a16';
          ctx.fillRect(2, -1.3, 16, 2.6);
          markGer(ctx);
        }
        break;

      case 'stuka':
      case 'me262':
        drawPlane(ctx, col, true, type === 'me262');
        markGer(ctx);
        break;

      case 'il2':
      case 'yak9':
        drawPlane(ctx, col, false, false);
        markSov(ctx);
        break;
    }
  }

  function drawInf(ctx, soviet, col, accent) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 6.28); ctx.fill();
    ctx.fillStyle = soviet ? '#502018' : '#222620';
    ctx.beginPath(); ctx.arc(0, -1, 3.2, 0, 6.28); ctx.fill();
    ctx.strokeStyle = '#1a1a16'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(10, 2); ctx.stroke();
  }

  function drawPlane(ctx, col, ger, jet) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-10, -4); ctx.lineTo(-14, 0); ctx.lineTo(-10, 4);
    ctx.closePath(); ctx.fill();
    // Wings
    ctx.fillStyle = ger ? '#555c4d' : '#3f4f30';
    ctx.beginPath();
    if (jet) {
      // Swept wings for Me 262
      ctx.moveTo(2, -18); ctx.lineTo(4, 0); ctx.lineTo(2, 18); ctx.lineTo(-4, 0);
    } else {
      ctx.moveTo(0, -16); ctx.lineTo(4, 0); ctx.lineTo(0, 16); ctx.lineTo(-4, 0);
    }
    ctx.closePath(); ctx.fill();
  }

  function drawShots(ctx, st) {
    if (!st || !st.shots) return;
    ctx.save();
    for (const s of st.shots) {
      const [x0, y0, x1, y1, fac, cls] = s;
      ctx.strokeStyle = fac === 'ger' ? '#ffdf7a' : '#ff7a7a';
      ctx.lineWidth = cls === 'art' ? 2.8 : cls === 'tank' ? 2.0 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // Muzzle flash / impact spark
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x1, y1, cls === 'art' ? 4 : 2, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStrikes(ctx, st) {
    if (!st || !st.strikes) return;
    ctx.save();
    for (const [sx, sy, type, fac, delay] of st.strikes) {
      ctx.strokeStyle = fac === 'ger' ? 'rgba(255,200,50,0.8)' : 'rgba(255,80,50,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(sx, sy, 120, 0, 6.28);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCombatEvents(ctx, st) {
    if (!st || !st.combatEvents) return;
    ctx.save();
    for (const [x, y, text, col, ttl] of st.combatEvents) {
      const alpha = Math.min(1.0, ttl);
      ctx.fillStyle = col || '#fff';
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px "Vazirmatn", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y - 18 - (1.5 - ttl) * 14);
    }
    ctx.restore();
  }

  function drawBox(ctx, box) {
    ctx.save();
    ctx.fillStyle = 'rgba(100, 200, 255, 0.15)';
    ctx.strokeStyle = '#44ccff';
    ctx.lineWidth = 1.2;
    const x = Math.min(box.x0, box.x1);
    const y = Math.min(box.y0, box.y1);
    const w = Math.abs(box.x1 - box.x0);
    const h = Math.abs(box.y1 - box.y0);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawMinimap(ctx, st, cam, myFac) {
    const w = 240, h = 135;
    const px = 16, py = innerHeight - h - 18;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = 'rgba(12, 10, 8, 0.90)';
    ctx.strokeStyle = 'rgba(196, 163, 90, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(px, py, w, h);
    ctx.strokeRect(px, py, w, h);

    const sx = w / WORLD.W, sy = h / WORLD.H;

    // Cities
    if (st && st.cities) {
      for (const c of st.cities) {
        ctx.fillStyle = FACTIONS[c.owner].color;
        ctx.beginPath();
        ctx.arc(px + c.x * sx, py + c.y * sy, 3, 0, 6.28);
        ctx.fill();
      }
    }

    // Units
    if (st && st.units) {
      for (const u of st.units) {
        ctx.fillStyle = u.fac === 'ger' ? '#d8c07a' : '#e07070';
        ctx.fillRect(px + u.x * sx - 1, py + u.y * sy - 1, 2.4, 2.4);
      }
    }

    // Camera viewport rectangle
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    const vx = px + (cam.x - cam.sw / (2 * cam.z)) * sx;
    const vy = py + (cam.y - cam.sh / (2 * cam.z)) * sy;
    const vw = (cam.sw / cam.z) * sx;
    const vh = (cam.sh / cam.z) * sy;
    ctx.strokeRect(vx, vy, vw, vh);

    ctx.restore();
    return { px, py, w, h, sx, sy };
  }

  function drawUnitIcon(canvas, type) {
    const ctx = canvas.getContext('2d');
    canvas.width = 44; canvas.height = 36;
    ctx.clearRect(0, 0, 44, 36);
    ctx.save();
    ctx.translate(22, 18);
    const d = UNIT_TYPES[type];
    if (d) drawUnitShape(ctx, type, d.faction);
    ctx.restore();
  }

  function worldFromScreen(cam, sx, sy) {
    return {
      x: cam.x + (sx - cam.sw / 2) / cam.z,
      y: cam.y + (sy - cam.sh / 2) / cam.z
    };
  }

  return { buildMap, ensureMap, drawWorld, drawMinimap, drawUnitIcon, worldFromScreen, drawUnitShape, addCrater };
})();
