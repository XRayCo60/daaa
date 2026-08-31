'use strict';

const GFX = (() => {
  const { WORLD, CITIES, CONNECTIONS, UNIT_TYPES, FACTIONS, CITY_R, isWater, inMarsh, inCaucasus } = OST;

  let mapCache = null;
  let mapReady = false;

  function hash(x, y) {
    let n = x * 374761393 + y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
  }

  function buildMap() {
    const s = 0.5;
    const w = Math.floor(WORLD.W * s);
    const h = Math.floor(WORLD.H * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.scale(s, s);

    const land = g.createLinearGradient(0, 0, 0, WORLD.H);
    land.addColorStop(0, '#c9c6b8');
    land.addColorStop(0.18, '#8a8b74');
    land.addColorStop(0.45, '#6b6e4e');
    land.addColorStop(0.72, '#7a6a48');
    land.addColorStop(1, '#5a5340');
    g.fillStyle = land;
    g.fillRect(0, 0, WORLD.W, WORLD.H);

    // biome blobs
    for (let i = 0; i < 90; i++) {
      const x = hash(i, 1) * WORLD.W;
      const y = hash(i, 2) * WORLD.H;
      const r = 80 + hash(i, 3) * 180;
      const grd = g.createRadialGradient(x, y, 8, x, y, r);
      const snow = y < 420;
      grd.addColorStop(0, snow ? 'rgba(232,230,220,0.28)' : 'rgba(48,70,36,0.18)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    }

    // Pripyat marshes
    {
      const grd = g.createRadialGradient(1180, 1020, 20, 1180, 1020, 320);
      grd.addColorStop(0, 'rgba(40,55,38,0.55)');
      grd.addColorStop(1, 'rgba(40,55,38,0)');
      g.fillStyle = grd;
      g.beginPath(); g.ellipse(1180, 1020, 300, 170, 0, 0, 6.28); g.fill();
    }

    // Caucasus ridges
    g.save();
    g.strokeStyle = 'rgba(40,32,24,0.35)';
    g.lineWidth = 7;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(2100, 1560 + i * 18);
      g.bezierCurveTo(2500, 1500 + i * 14, 2800, 1620 + i * 10, 3180, 1580 + i * 12);
      g.stroke();
    }
    g.restore();

    // water overlay by sampling
    g.fillStyle = '#1a2c34';
    g.beginPath();
    const step = 14;
    for (let y = 0; y < WORLD.H; y += step) {
      for (let x = 0; x < WORLD.W; x += step) {
        if (isWater(x + 6, y + 6)) {
          g.rect(x - 1, y - 1, step + 2, step + 2);
        }
      }
    }
    g.fill();
    // water sheen
    g.fillStyle = 'rgba(90,140,150,0.08)';
    g.beginPath();
    for (let y = 0; y < WORLD.H; y += step) {
      for (let x = 0; x < WORLD.W; x += step) {
        if (isWater(x + 6, y + 6) && hash(x, y) > 0.72) g.rect(x, y, step, step);
      }
    }
    g.fill();

    drawRivers(g);
    drawRails(g);

    // occupied Europe stamp
    g.save();
    g.translate(180, 860);
    g.rotate(-0.4);
    g.fillStyle = 'rgba(20,16,10,0.35)';
    g.font = '700 28px Vazirmatn, sans-serif';
    g.fillText('اروپای اشغالی', 0, 0);
    g.restore();

    g.save();
    g.translate(2860, 480);
    g.fillStyle = 'rgba(20,16,10,0.28)';
    g.font = '700 22px Vazirmatn, sans-serif';
    g.fillText('اورال', 0, 0);
    g.restore();

    // grain
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 16) {
      const n = (hash(i, 9) - 0.5) * 18;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    g.putImageData(img, 0, 0);

    mapCache = c;
    mapReady = true;
  }

  function drawRivers(g) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const rivers = [
      // Vistula
      [[620, 430], [700, 700], [820, 980], [780, 1280], [760, 1500]],
      // Dnieper
      [[1500, 300], [1380, 620], [1320, 900], [1400, 1240], [1480, 1500], [1520, 1720]],
      // Don
      [[2100, 900], [1980, 1100], [1920, 1480], [2000, 1700]],
      // Volga
      [[2620, 400], [2500, 700], [2420, 1000], [2380, 1320], [2500, 1600], [2700, 1780]],
      // Daugava
      [[1100, 220], [1000, 400], [920, 520]]
    ];
    for (const r of rivers) {
      g.strokeStyle = '#1a2c34';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(r[0][0], r[0][1]);
      for (let i = 1; i < r.length; i++) g.lineTo(r[i][0], r[i][1]);
      g.stroke();
      g.strokeStyle = 'rgba(70,120,130,0.35)';
      g.lineWidth = 4;
      g.stroke();
    }
  }

  function drawRails(g) {
    g.save();
    g.strokeStyle = 'rgba(30,24,16,0.45)';
    g.lineWidth = 1.6;
    g.setLineDash([6, 5]);
    for (const [a, b] of CONNECTIONS) {
      const A = CITIES.find(c => c.id === a);
      const B = CITIES.find(c => c.id === b);
      g.beginPath();
      g.moveTo(A.x, A.y);
      g.lineTo(B.x, B.y);
      g.stroke();
    }
    g.restore();
  }

  function ensureMap() {
    if (!mapReady) buildMap();
  }

  function drawWorld(ctx, cam, st, sel, box, hover, myFac, dtClock) {
    ensureMap();
    ctx.save();
    ctx.translate(cam.sw / 2, cam.sh / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);

    ctx.drawImage(mapCache, 0, 0, WORLD.W, WORLD.H);
    drawInfluence(ctx, st);
    drawCities(ctx, st, cam, hover, dtClock);
    drawShots(ctx, st);
    drawUnits(ctx, st, sel, myFac, cam);
    if (box) drawBox(ctx, box);
    ctx.restore();
  }

  function drawInfluence(ctx, st) {
    if (!st.cities) return;
    for (const c of st.cities) {
      const col = c.owner === 'ger' ? '196,163,90' : '180,50,50';
      const grd = ctx.createRadialGradient(c.x, c.y, 20, c.x, c.y, 210);
      grd.addColorStop(0, 'rgba(' + col + ',0.16)');
      grd.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(c.x, c.y, 210, 0, 6.28); ctx.fill();
    }
  }

  function drawCities(ctx, st, cam, hover, t) {
    for (const c of st.cities) {
      const proto = OST.cityById(c.id);
      const col = FACTIONS[c.owner].color;
      const pulse = c.cap > 0 ? 1 + Math.sin(t * 6) * 0.08 : 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, (CITY_R - 8) * pulse, 0, 6.28);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();
      ctx.lineWidth = proto.capital ? 4 : 2;
      ctx.strokeStyle = col;
      ctx.stroke();

      if (c.cap > 0) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, CITY_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.cap);
        ctx.strokeStyle = FACTIONS[c.capFac || (c.owner === 'ger' ? 'sov' : 'ger')].color;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // stamp
      ctx.beginPath();
      if (proto.capital) {
        star(ctx, c.x, c.y, 9, 5, 0.45);
        ctx.fillStyle = col;
        ctx.fill();
      } else {
        ctx.fillStyle = col;
        ctx.fillRect(c.x - 4, c.y - 4, 8, 8);
      }

      if (cam.z > 0.42 || proto.capital || (hover && hover.kind === 'city' && hover.id === c.id)) {
        ctx.font = (proto.capital ? '700 ' : '500 ') + (cam.z > 0.7 ? '16px' : '13px') + ' Vazirmatn, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(12,10,7,0.7)';
        ctx.fillText(proto.nameFa, c.x + 1, c.y + 22);
        ctx.fillStyle = '#f0e6d0';
        ctx.fillText(proto.nameFa, c.x, c.y + 21);
      }
    }
  }

  function star(ctx, x, y, r, n, inset) {
    ctx.moveTo(x, y - r);
    for (let i = 0; i < n * 2; i++) {
      const rr = i % 2 === 0 ? r : r * inset;
      const a = -Math.PI / 2 + i * Math.PI / n;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function drawUnits(ctx, st, sel, myFac, cam) {
    const selected = sel || new Set();
    const order = st.units.slice().sort((a, b) => a.y - b.y);
    for (const u of order) {
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.rotate(u.ang);
      const isSel = selected.has(u.id);
      if (isSel) {
        ctx.beginPath();
        ctx.arc(0, 0, UNIT_TYPES[u.type].radius + 6, 0, 6.28);
        ctx.strokeStyle = FACTIONS[u.fac].ink;
        ctx.lineWidth = 1.4 / cam.z;
        ctx.stroke();
      }
      drawUnitShape(ctx, u.type, u.fac);
      ctx.restore();

      // hp
      const def = UNIT_TYPES[u.type];
      if (u.hp < def.hp * 0.98) {
        const w = 18;
        ctx.fillStyle = '#1a140c';
        ctx.fillRect(u.x - w / 2, u.y - def.radius - 8, w, 3);
        ctx.fillStyle = u.hp < def.hp * 0.35 ? '#a33' : FACTIONS[u.fac].color;
        ctx.fillRect(u.x - w / 2, u.y - def.radius - 8, w * (u.hp / def.hp), 3);
      }
      if (!u.supplied) {
        ctx.fillStyle = '#d4b84a';
        ctx.fillRect(u.x - 2, u.y - def.radius - 12, 4, 4);
      }
    }
  }

  function hull(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function tracks(ctx, w, h, col) {
    ctx.fillStyle = '#1c1c18';
    ctx.fillRect(-w, -h, 4, h * 2);
    ctx.fillRect(w - 4, -h, 4, h * 2);
    ctx.fillStyle = col;
  }

  function markGer(ctx) {
    ctx.save();
    ctx.strokeStyle = '#efe6c8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-3, 0); ctx.lineTo(3, 0);
    ctx.moveTo(0, -3); ctx.lineTo(0, 3);
    ctx.stroke();
    ctx.restore();
  }
  function markSov(ctx) {
    ctx.save();
    ctx.fillStyle = '#c43c3c';
    ctx.beginPath();
    star(ctx, 0, 0, 2.6, 5, 0.45);
    ctx.fill();
    ctx.restore();
  }

  function drawUnitShape(ctx, type, fac) {
    const col = FACTIONS[fac].unit;
    const accent = FACTIONS[fac].color;
    ctx.lineJoin = 'round';
    switch (type) {
      case 'grenadier':
      case 'strelok':
        drawInf(ctx, type === 'strelok', col, accent);
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
      case 't34':
        tracks(ctx, 12, 8, col);
        hull(ctx, [[-10, -7], [8, -8], [14, 0], [8, 8], [-10, 7], [-13, 0]]);
        ctx.fillStyle = '#4a5a32'; ctx.fill(); ctx.strokeStyle = '#1c2414'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 5.5, 0, 0, 6.28);
        ctx.fillStyle = '#3a4a28'; ctx.fill();
        ctx.fillStyle = '#2a2a1c';
        ctx.fillRect(4, -1.1, 15, 2.2);
        markSov(ctx);
        break;
      case 'kv1':
        tracks(ctx, 14, 10, col);
        hull(ctx, [[-14, -9], [10, -9], [14, -3], [14, 3], [10, 9], [-14, 9], [-16, 0]]);
        ctx.fillStyle = '#3e4c2c'; ctx.fill(); ctx.strokeStyle = '#12180c'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#2e3a22';
        ctx.fillRect(-5, -6.5, 12, 13);
        ctx.fillRect(6, -1.3, 18, 2.6);
        markSov(ctx);
        break;
      case 'wespe':
        tracks(ctx, 11, 7, col);
        ctx.fillStyle = col;
        ctx.fillRect(-10, -6, 16, 12);
        ctx.fillStyle = '#2c2c24';
        ctx.save(); ctx.rotate(-0.15);
        ctx.fillRect(2, -2, 18, 3);
        ctx.restore();
        markGer(ctx);
        break;
      case 'katyusha':
        ctx.fillStyle = '#3a4a2a';
        ctx.fillRect(-12, -6, 20, 12);
        ctx.fillStyle = '#1a1a14';
        ctx.fillRect(-10, 6, 5, 3); ctx.fillRect(4, 6, 5, 3);
        ctx.fillStyle = '#6a3a2a';
        for (let i = 0; i < 4; i++) ctx.fillRect(-2 + i * 3.2, -8, 2.2, 14);
        markSov(ctx);
        break;
      case 'stuka':
        drawPlane(ctx, '#4a4e46', true);
        break;
      case 'il2':
        drawPlane(ctx, '#3f4f2e', false);
        break;
    }
  }

  function drawInf(ctx, soviet, col, accent) {
    const spots = [[-6, -4], [6, -3], [0, 5]];
    for (const [x, y] of spots) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, 3.1, 0, 6.28); ctx.fill();
      ctx.fillStyle = soviet ? '#3a2a1c' : '#2c2c28';
      ctx.beginPath(); ctx.arc(x, y - 3.2, 2.1, 0, 6.28); ctx.fill();
      if (soviet) {
        ctx.fillStyle = accent;
        ctx.fillRect(x - 1, y - 5, 2, 1.4);
      }
    }
  }

  function drawPlane(ctx, col, ger) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(4, 4);
    ctx.lineTo(-10, 3);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-10, -3);
    ctx.lineTo(4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a2c28';
    ctx.fillRect(-2, -12, 5, 24);
    if (ger) {
      ctx.fillStyle = '#1a1a16';
      ctx.beginPath();
      ctx.moveTo(6, 0); ctx.lineTo(14, -7); ctx.lineTo(10, 0); ctx.lineTo(14, 7);
      ctx.fill();
      markGer(ctx);
    } else markSov(ctx);
  }

  function drawShots(ctx, st) {
    if (!st.shots) return;
    for (const s of st.shots) {
      const cls = s[5];
      ctx.beginPath();
      ctx.moveTo(s[0], s[1]);
      ctx.lineTo(s[2], s[3]);
      if (cls === 'art') {
        ctx.strokeStyle = 'rgba(230,160,70,0.55)';
        ctx.lineWidth = 2.2;
      } else if (cls === 'air') {
        ctx.strokeStyle = 'rgba(255,220,120,0.7)';
        ctx.lineWidth = 1.6;
      } else {
        ctx.strokeStyle = s[4] === 'ger' ? 'rgba(230,210,140,0.7)' : 'rgba(240,180,80,0.65)';
        ctx.lineWidth = 1.1;
      }
      ctx.stroke();
    }
  }

  function drawBox(ctx, box) {
    const x = Math.min(box.x0, box.x1), y = Math.min(box.y0, box.y1);
    const w = Math.abs(box.x1 - box.x0), h = Math.abs(box.y1 - box.y0);
    ctx.fillStyle = 'rgba(196,163,90,0.08)';
    ctx.strokeStyle = 'rgba(196,163,90,0.85)';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  function drawMinimap(ctx, st, cam, myFac) {
    const w = 220, h = 124;
    const x = 14, y = ctx.canvas.height / (window.devicePixelRatio || 1) ? 0 : 0;
    // caller uses css pixel space after reset transform
    const px = 14, py = innerHeight - h - 16;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(8,7,5,0.82)';
    ctx.strokeStyle = 'rgba(196,163,90,0.35)';
    ctx.fillRect(px, py, w, h);
    ctx.strokeRect(px, py, w, h);
    const sx = w / WORLD.W, sy = h / WORLD.H;
    for (const c of st.cities) {
      ctx.fillStyle = FACTIONS[c.owner].color;
      ctx.fillRect(px + c.x * sx - 2, py + c.y * sy - 2, 4, 4);
    }
    for (const u of st.units) {
      ctx.fillStyle = u.fac === 'ger' ? '#d8c07a' : '#e07070';
      ctx.fillRect(px + u.x * sx, py + u.y * sy, 2, 2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.strokeRect(
      px + (cam.x - cam.sw / (2 * cam.z)) * sx,
      py + (cam.y - cam.sh / (2 * cam.z)) * sy,
      (cam.sw / cam.z) * sx,
      (cam.sh / cam.z) * sy
    );
    ctx.restore();
    return { px, py, w, h, sx, sy };
  }

  function drawUnitIcon(canvas, type) {
    const ctx = canvas.getContext('2d');
    const dpr = 2;
    canvas.width = 44 * dpr; canvas.height = 28 * dpr;
    canvas.style.width = '44px'; canvas.style.height = '28px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(22, 14);
    ctx.rotate(-0.15);
    ctx.scale(1.15, 1.15);
    drawUnitShape(ctx, type, UNIT_TYPES[type].faction);
  }

  function worldFromScreen(cam, sx, sy) {
    return {
      x: cam.x + (sx - cam.sw / 2) / cam.z,
      y: cam.y + (sy - cam.sh / 2) / cam.z
    };
  }

  return { buildMap, ensureMap, drawWorld, drawMinimap, drawUnitIcon, worldFromScreen, drawUnitShape };
})();
