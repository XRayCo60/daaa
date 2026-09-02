'use strict';

const GFX = (() => {
  const { WORLD, CITIES, CONNECTIONS, UNIT_TYPES, FACTIONS, CITY_R, isWater, inMarsh, inCaucasus, RIVERS } = OST;

  let mapCache = null;
  let mapReady = false;

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
        if (isWater(x + 8, y + 8)) g.rect(x - 1, y - 1, step + 2, step + 2);
      }
    }
    g.fill();
    g.fillStyle = 'rgba(90,140,150,0.08)';
    g.beginPath();
    for (let y = 0; y < WORLD.H; y += step) {
      for (let x = 0; x < WORLD.W; x += step) {
        if (isWater(x + 8, y + 8) && hash(x, y) > 0.7) g.rect(x, y, step, step);
      }
    }
    g.fill();

    drawRivers(g);
    drawRails(g);

    function stamp(text, x, y, rot, size, alpha) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = 'rgba(20,16,10,' + alpha + ')';
      g.font = '700 ' + size + 'px Vazirmatn, sans-serif';
      g.fillText(text, 0, 0);
      g.restore();
    }
    stamp('اروپای اشغالی', 220, 1180, -0.45, 32, 0.38);
    stamp('گروه ارتش شمال', 1500, 520, -0.12, 22, 0.22);
    stamp('گروه ارتش مرکز', 1680, 1180, -0.05, 22, 0.22);
    stamp('گروه ارتش جنوب', 1680, 1880, 0.08, 22, 0.22);
    stamp('استپ', 3000, 1900, 0, 26, 0.2);
    stamp('قفقاز', 3800, 2280, 0.1, 24, 0.22);
    stamp('اورال', 4300, 700, 0, 28, 0.28);
    stamp('مرداب پریپیات', 1680, 1420, 0, 18, 0.3);

    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 20) {
      const n = (hash(i, 9) - 0.5) * 16;
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
    const rivers = RIVERS;
    for (const r of rivers) {
      g.strokeStyle = '#1a2c34';
      g.lineWidth = 11;
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
    if (st.season === 'mud') {
      ctx.fillStyle = 'rgba(78, 58, 28, 0.16)';
      ctx.fillRect(0, 0, WORLD.W, WORLD.H);
    } else if (st.season === 'winter') {
      ctx.fillStyle = 'rgba(210, 224, 236, 0.15)';
      ctx.fillRect(0, 0, WORLD.W, WORLD.H);
      ctx.save();
      ctx.strokeStyle = 'rgba(220,230,240,0.45)';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      for (const r of RIVERS) {
        ctx.beginPath();
        ctx.moveTo(r[0][0], r[0][1]);
        for (let i = 1; i < r.length; i++) ctx.lineTo(r[i][0], r[i][1]);
        ctx.stroke();
      }
      ctx.restore();
    }
    drawInfluence(ctx, st);
    drawLiveRails(ctx, st);
    if (st.fog) drawFog(ctx, st, myFac);
    drawCities(ctx, st, cam, hover, dtClock);
    drawShots(ctx, st);
    drawUnits(ctx, st, sel, myFac, cam);
    if (box) drawBox(ctx, box);
    ctx.restore();
  }

  function drawLiveRails(ctx, st) {
    if (!st.rails) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < CONNECTIONS.length; i++) {
      const live = st.rails[i];
      if (!live) continue;
      const A = CITIES.find(c => c.id === CONNECTIONS[i][0]);
      const B = CITIES.find(c => c.id === CONNECTIONS[i][1]);
      ctx.strokeStyle = live === 1 ? 'rgba(196,163,90,0.55)' : 'rgba(196,70,70,0.5)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFog(ctx, st, myFac) {
    if (!myFac) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD.W, WORLD.H);
    for (const u of st.units) {
      if (u.fac !== myFac) continue;
      const cls = UNIT_TYPES[u.type].cls;
      const r = cls === 'air' ? 420 : cls === 'at' ? 280 : cls === 'tank' ? 260 : cls === 'art' ? 200 : 230;
      ctx.moveTo(u.x + r, u.y);
      ctx.arc(u.x, u.y, r, 0, 6.28);
    }
    for (const c of st.cities) {
      if (c.owner !== myFac) continue;
      const r = 300 + (c.depot ? 80 : 0);
      ctx.moveTo(c.x + r, c.y);
      ctx.arc(c.x, c.y, r, 0, 6.28);
    }
    ctx.fillStyle = st.season === 'winter' ? 'rgba(8,12,18,0.58)' : 'rgba(6,8,7,0.62)';
    ctx.fill('evenodd');
    ctx.restore();
  }

  function drawInfluence(ctx, st) {
    if (!st.cities) return;
    for (const c of st.cities) {
      const col = c.owner === 'ger' ? '196,163,90' : '180,50,50';
      const grd = ctx.createRadialGradient(c.x, c.y, 24, c.x, c.y, 280);
      grd.addColorStop(0, 'rgba(' + col + ',0.18)');
      grd.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(c.x, c.y, 280, 0, 6.28); ctx.fill();
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

      if (c.cut) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, CITY_R + 6, 0, 6.28);
        ctx.strokeStyle = 'rgba(180,70,40,0.75)';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

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

      if (cam.z > 0.38 || proto.capital || proto.o > 1 || (hover && hover.kind === 'city' && hover.id === c.id)) {
        ctx.font = (proto.capital ? '700 ' : '500 ') + (cam.z > 0.65 ? '16px' : '13px') + ' Vazirmatn, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(12,10,7,0.7)';
        ctx.fillText(proto.nameFa, c.x + 1, c.y + 22);
        ctx.fillStyle = '#f0e6d0';
        ctx.fillText(proto.nameFa, c.x, c.y + 21);
        if (cam.z > 0.7) {
          ctx.font = '500 11px Vazirmatn, sans-serif';
          ctx.fillStyle = 'rgba(210,196,160,0.85)';
          const bits = [];
          if (proto.i >= 1) bits.push('صنعت');
          if (proto.o >= 1) bits.push('نفت');
          if (proto.capital) bits.push('پایتخت');
          if (proto.vp >= 2) bits.push(proto.vp + ' امتیاز');
          if (bits.length) ctx.fillText(bits.join(' · '), c.x, c.y + 36);
        }
      }
      if (cam.z > 0.5) {
        let px = c.x - 10;
        const py = c.y - CITY_R + 10;
        ctx.fillStyle = col;
        for (let i = 0; i < (c.factory || 0); i++) { ctx.fillRect(px, py, 5, 5); px += 7; }
        ctx.beginPath();
        for (let i = 0; i < (c.barracks || 0); i++) { ctx.arc(px + 3, py + 3, 2.2, 0, 6.28); px += 7; }
        ctx.fill();
        if (c.depot) {
          ctx.beginPath();
          ctx.moveTo(px + 3, py); ctx.lineTo(px + 6, py + 5); ctx.lineTo(px, py + 5);
          ctx.closePath(); ctx.fill();
        }
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
      if (u.ent > 0.35) {
        ctx.beginPath();
        ctx.arc(u.x, u.y, def.radius + 5, 0, 6.28);
        ctx.strokeStyle = 'rgba(30,40,24,' + (0.25 + u.ent * 0.45) + ')';
        ctx.lineWidth = 2.2;
        ctx.stroke();
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
      case 'pak40':
      case 'zis3':
        ctx.fillStyle = '#1a1a16';
        ctx.beginPath(); ctx.arc(-5, 7, 3.2, 0, 6.28); ctx.arc(-5, -7, 3.2, 0, 6.28); ctx.fill();
        ctx.fillStyle = col;
        ctx.fillRect(-8, -8, 5, 16);
        ctx.fillStyle = '#222';
        ctx.fillRect(-3, -1.4, 20, 2.8);
        if (type === 'pak40') markGer(ctx); else markSov(ctx);
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
