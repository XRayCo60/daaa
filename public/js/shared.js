(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OST = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WORLD = { W: 5200, H: 2800 };
  const TICK = 12;
  const POP_CAP = 52;
  const CITY_R = 52;

  const FACTIONS = {
    ger: {
      id: 'ger', nameFa: 'ورماخت', name: 'Wehrmacht',
      color: '#c4a35a', colorDark: '#6e5a2c', ink: '#d9c48a', unit: '#4c5146'
    },
    sov: {
      id: 'sov', nameFa: 'ارتش سرخ', name: 'Red Army',
      color: '#c43c3c', colorDark: '#6e1515', ink: '#e06a6a', unit: '#3f4f2e'
    }
  };

  const CITIES = [
    { id: 'berlin',     x: 380,  y: 1420, nameFa: 'برلین',       name: 'Berlin',      owner: 'ger', i: 2.20, m: 1.20, o: 0.48, capital: true  },
    { id: 'konigsberg', x: 900,  y: 740,  nameFa: 'کونیگسبرگ',   name: 'Königsberg',  owner: 'ger', i: 0.85, m: 0.50, o: 0.08, capital: false },
    { id: 'warsaw',     x: 1080, y: 1340, nameFa: 'ورشو',        name: 'Warschau',    owner: 'ger', i: 1.10, m: 0.70, o: 0.10, capital: false },
    { id: 'krakow',     x: 980,  y: 1720, nameFa: 'کراکوف',      name: 'Krakau',      owner: 'ger', i: 0.70, m: 0.45, o: 0.06, capital: false },
    { id: 'lublin',     x: 1260, y: 1520, nameFa: 'لوبلین',      name: 'Lublin',      owner: 'ger', i: 0.50, m: 0.35, o: 0.04, capital: false },
    { id: 'kaunas',     x: 1320, y: 880,  nameFa: 'کاوناس',      name: 'Kaunas',      owner: 'sov', i: 0.48, m: 0.32, o: 0.03, capital: false },
    { id: 'riga',       x: 1400, y: 540,  nameFa: 'ریگا',        name: 'Riga',        owner: 'sov', i: 0.62, m: 0.42, o: 0.05, capital: false },
    { id: 'vilna',      x: 1480, y: 980,  nameFa: 'ویلنا',       name: 'Vilna',       owner: 'sov', i: 0.50, m: 0.34, o: 0.03, capital: false },
    { id: 'brest',      x: 1520, y: 1300, nameFa: 'برست',        name: 'Brest',       owner: 'sov', i: 0.55, m: 0.38, o: 0.04, capital: false },
    { id: 'lvov',       x: 1420, y: 1800, nameFa: 'لووف',        name: 'Lwów',        owner: 'sov', i: 0.68, m: 0.44, o: 0.06, capital: false },
    { id: 'minsk',      x: 1920, y: 1140, nameFa: 'مینسک',       name: 'Minsk',       owner: 'sov', i: 0.95, m: 0.62, o: 0.08, capital: false },
    { id: 'gomel',      x: 2040, y: 1520, nameFa: 'گومل',        name: 'Gomel',       owner: 'sov', i: 0.55, m: 0.38, o: 0.05, capital: false },
    { id: 'pskov',      x: 1920, y: 640,  nameFa: 'پسکوف',       name: 'Pskov',       owner: 'sov', i: 0.48, m: 0.32, o: 0.03, capital: false },
    { id: 'kiev',       x: 2160, y: 1760, nameFa: 'کیف',         name: 'Kiev',        owner: 'sov', i: 1.25, m: 0.80, o: 0.14, capital: false },
    { id: 'odessa',     x: 2040, y: 2200, nameFa: 'اودسا',       name: 'Odessa',      owner: 'sov', i: 0.70, m: 0.45, o: 0.12, capital: false },
    { id: 'sevastopol', x: 2180, y: 2460, nameFa: 'سواستوپول',   name: 'Sevastopol',  owner: 'sov', i: 0.50, m: 0.30, o: 0.08, capital: false },
    { id: 'leningrad',  x: 2180, y: 360,  nameFa: 'لنینگراد',    name: 'Leningrad',   owner: 'sov', i: 1.60, m: 1.05, o: 0.16, capital: false },
    { id: 'smolensk',   x: 2480, y: 1060, nameFa: 'اسمولنسک',    name: 'Smolensk',    owner: 'sov', i: 0.72, m: 0.48, o: 0.06, capital: false },
    { id: 'bryansk',    x: 2580, y: 1340, nameFa: 'بریانسک',     name: 'Bryansk',     owner: 'sov', i: 0.60, m: 0.40, o: 0.05, capital: false },
    { id: 'kharkov',    x: 2720, y: 1720, nameFa: 'خارکف',       name: 'Kharkov',     owner: 'sov', i: 1.05, m: 0.68, o: 0.14, capital: false },
    { id: 'kursk',      x: 2780, y: 1500, nameFa: 'کورسک',       name: 'Kursk',       owner: 'sov', i: 0.58, m: 0.40, o: 0.05, capital: false },
    { id: 'tula',       x: 3000, y: 1180, nameFa: 'تولا',        name: 'Tula',        owner: 'sov', i: 0.85, m: 0.52, o: 0.08, capital: false },
    { id: 'moscow',     x: 3280, y: 980,  nameFa: 'مسکو',        name: 'Moscow',      owner: 'sov', i: 2.50, m: 1.45, o: 0.28, capital: true  },
    { id: 'gorky',      x: 3920, y: 860,  nameFa: 'گورکی',       name: 'Gorky',       owner: 'sov', i: 1.35, m: 0.70, o: 0.14, capital: false },
    { id: 'voronezh',   x: 3280, y: 1600, nameFa: 'ورونژ',       name: 'Voronezh',    owner: 'sov', i: 0.80, m: 0.52, o: 0.10, capital: false },
    { id: 'rostov',     x: 3000, y: 2140, nameFa: 'روستوف',      name: 'Rostov',      owner: 'sov', i: 0.78, m: 0.50, o: 0.32, capital: false },
    { id: 'stalingrad', x: 3720, y: 1880, nameFa: 'استالینگراد', name: 'Stalingrad',  owner: 'sov', i: 1.20, m: 0.82, o: 0.30, capital: false },
    { id: 'maikop',     x: 3280, y: 2360, nameFa: 'مایکوپ',      name: 'Maikop',      owner: 'sov', i: 0.35, m: 0.22, o: 1.55, capital: false },
    { id: 'baku',       x: 4680, y: 2340, nameFa: 'باکو',        name: 'Baku',        owner: 'sov', i: 0.42, m: 0.28, o: 3.40, capital: false }
  ];

  const CONNECTIONS = [
    ['berlin', 'konigsberg'], ['berlin', 'warsaw'], ['berlin', 'krakow'],
    ['konigsberg', 'kaunas'], ['konigsberg', 'warsaw'],
    ['warsaw', 'lublin'], ['warsaw', 'brest'], ['warsaw', 'krakow'],
    ['krakow', 'lvov'], ['krakow', 'lublin'],
    ['lublin', 'brest'], ['lublin', 'lvov'],
    ['kaunas', 'vilna'], ['kaunas', 'riga'], ['kaunas', 'brest'],
    ['riga', 'pskov'], ['riga', 'vilna'],
    ['vilna', 'minsk'], ['vilna', 'pskov'],
    ['brest', 'minsk'], ['brest', 'gomel'],
    ['lvov', 'kiev'], ['lvov', 'odessa'],
    ['minsk', 'smolensk'], ['minsk', 'gomel'], ['minsk', 'pskov'],
    ['gomel', 'kiev'], ['gomel', 'bryansk'], ['gomel', 'kharkov'],
    ['kiev', 'kharkov'], ['kiev', 'odessa'],
    ['odessa', 'sevastopol'], ['odessa', 'rostov'],
    ['pskov', 'leningrad'], ['pskov', 'smolensk'],
    ['leningrad', 'smolensk'], ['leningrad', 'moscow'],
    ['smolensk', 'moscow'], ['smolensk', 'bryansk'], ['smolensk', 'tula'],
    ['bryansk', 'tula'], ['bryansk', 'kursk'], ['bryansk', 'kharkov'],
    ['kharkov', 'kursk'], ['kharkov', 'rostov'], ['kharkov', 'voronezh'],
    ['kursk', 'voronezh'], ['kursk', 'tula'],
    ['tula', 'moscow'], ['tula', 'voronezh'],
    ['moscow', 'gorky'], ['moscow', 'voronezh'],
    ['voronezh', 'stalingrad'], ['voronezh', 'rostov'],
    ['rostov', 'stalingrad'], ['rostov', 'maikop'], ['rostov', 'sevastopol'],
    ['stalingrad', 'gorky'], ['stalingrad', 'baku'],
    ['maikop', 'baku']
  ];

  const UNIT_TYPES = {
    grenadier: {
      faction: 'ger', cls: 'inf', name: 'Grenadier', nameFa: 'گرنادیر', roleFa: 'پیاده',
      cost: { i: 10, m: 48, o: 0 }, build: 9,
      hp: 120, speed: 18, range: 70, atk: 10, armor: 1, cd: 0.65,
      vs: { inf: 1, tank: 0.28, art: 1.05, air: 0.38, at: 0.7 },
      capture: 1, radius: 9, pop: 1, burn: 0
    },
    panzer4: {
      faction: 'ger', cls: 'tank', name: 'Panzer IV', nameFa: 'پانزر ۴', roleFa: 'تانک متوسط',
      cost: { i: 96, m: 18, o: 28 }, build: 16,
      hp: 240, speed: 26, range: 96, atk: 20, armor: 7, cd: 1.05,
      vs: { inf: 1.35, tank: 1, art: 1.2, air: 0.18, at: 1.1 },
      capture: 0.35, radius: 15, pop: 2, burn: 0.16
    },
    tiger: {
      faction: 'ger', cls: 'tank', name: 'Tiger I', nameFa: 'ببر', roleFa: 'تانک سنگین',
      cost: { i: 190, m: 24, o: 62 }, build: 28,
      hp: 440, speed: 16, range: 118, atk: 38, armor: 13, cd: 1.35,
      vs: { inf: 1.15, tank: 1.55, art: 1.25, air: 0.15, at: 1.2 },
      capture: 0.25, radius: 18, pop: 3, burn: 0.28
    },
    wespe: {
      faction: 'ger', cls: 'art', name: 'Wespe', nameFa: 'وسپه', roleFa: 'توپخانه',
      cost: { i: 70, m: 14, o: 10 }, build: 15,
      hp: 140, speed: 15, range: 230, atk: 22, armor: 3, cd: 2.4,
      vs: { inf: 1.7, tank: 0.72, art: 1.1, air: 0.05, at: 0.9 },
      capture: 0.15, radius: 13, pop: 2, splash: 42, burn: 0.06
    },
    stuka: {
      faction: 'ger', cls: 'air', name: 'Ju 87 Stuka', nameFa: 'اشتوکا', roleFa: 'هوایی',
      cost: { i: 86, m: 10, o: 32 }, build: 18,
      hp: 95, speed: 72, range: 86, atk: 28, armor: 1, cd: 1.6,
      vs: { inf: 1.1, tank: 2.1, art: 1.4, air: 0.4, at: 1.3 },
      capture: 0, radius: 14, pop: 2, burn: 0.22
    },
    strelok: {
      faction: 'sov', cls: 'inf', name: 'Strelok', nameFa: 'تفنگدار', roleFa: 'پیاده',
      cost: { i: 8, m: 38, o: 0 }, build: 8,
      hp: 108, speed: 19, range: 68, atk: 9, armor: 1, cd: 0.62,
      vs: { inf: 1, tank: 0.26, art: 1.05, air: 0.36, at: 0.7 },
      capture: 1, radius: 9, pop: 1, burn: 0
    },
    t34: {
      faction: 'sov', cls: 'tank', name: 'T-34', nameFa: 'تی-۳۴', roleFa: 'تانک متوسط',
      cost: { i: 74, m: 16, o: 20 }, build: 13,
      hp: 215, speed: 30, range: 90, atk: 18, armor: 6, cd: 0.95,
      vs: { inf: 1.3, tank: 1, art: 1.15, air: 0.18, at: 1.05 },
      capture: 0.35, radius: 14, pop: 2, burn: 0.14
    },
    kv1: {
      faction: 'sov', cls: 'tank', name: 'KV-1', nameFa: 'کی‌وی-۱', roleFa: 'تانک سنگین',
      cost: { i: 160, m: 22, o: 46 }, build: 24,
      hp: 410, speed: 15, range: 108, atk: 32, armor: 12, cd: 1.3,
      vs: { inf: 1.1, tank: 1.4, art: 1.2, air: 0.15, at: 1.15 },
      capture: 0.25, radius: 18, pop: 3, burn: 0.24
    },
    katyusha: {
      faction: 'sov', cls: 'art', name: 'BM-13 Katyusha', nameFa: 'کاتیوشا', roleFa: 'راکت‌انداز',
      cost: { i: 64, m: 14, o: 16 }, build: 15,
      hp: 125, speed: 22, range: 250, atk: 16, armor: 2, cd: 0.12,
      vs: { inf: 1.85, tank: 0.85, art: 1.15, air: 0.05, at: 0.9 },
      capture: 0.12, radius: 13, pop: 2, splash: 50, salvo: 8, salvoReload: 7.5, burn: 0.08
    },
    il2: {
      faction: 'sov', cls: 'air', name: 'Il-2', nameFa: 'ایل-۲', roleFa: 'هوایی',
      cost: { i: 78, m: 10, o: 24 }, build: 17,
      hp: 115, speed: 66, range: 80, atk: 24, armor: 2, cd: 1.45,
      vs: { inf: 1.35, tank: 1.7, art: 1.3, air: 0.4, at: 1.2 },
      capture: 0, radius: 14, pop: 2, burn: 0.18
    },
    pak40: {
      faction: 'ger', cls: 'at', name: 'PaK 40', nameFa: 'پاک ۴۰', roleFa: 'ضدتانک',
      cost: { i: 42, m: 12, o: 4 }, build: 11,
      hp: 90, speed: 14, range: 130, atk: 26, armor: 2, cd: 1.5,
      vs: { inf: 0.35, tank: 2.6, art: 0.7, air: 0.08, at: 1 },
      capture: 0.1, radius: 11, pop: 1, burn: 0.03
    },
    zis3: {
      faction: 'sov', cls: 'at', name: 'ZiS-3', nameFa: 'زیس-۳', roleFa: 'ضدتانک',
      cost: { i: 36, m: 10, o: 3 }, build: 10,
      hp: 85, speed: 15, range: 125, atk: 22, armor: 2, cd: 1.35,
      vs: { inf: 0.4, tank: 2.3, art: 0.7, air: 0.08, at: 1 },
      capture: 0.1, radius: 11, pop: 1, burn: 0.03
    }
  };

  const VP = {
    berlin: 8, moscow: 8, leningrad: 3, stalingrad: 3, baku: 3,
    kiev: 2, warsaw: 2
  };
  const CEASEFIRE = 40;
  const VP_WIN = 24;
  const UPGRADES = {
    factory: { i: 80, t: 18, max: 2, nameFa: 'کارخانه' },
    barracks: { i: 45, t: 12, max: 2, nameFa: 'سربازخانه' },
    depot: { i: 60, t: 15, max: 1, nameFa: 'انبار' }
  };

  CITIES.forEach(c => {
    c.vp = VP[c.id] || 0;
    c.barracks = 1;
    c.depot = 0;
    c.factory = 0;
    if (c.id === 'berlin' || c.id === 'moscow') { c.factory = 2; c.depot = 1; }
    else if (c.id === 'gorky' || c.id === 'kharkov' || c.id === 'warsaw' || c.id === 'stalingrad' || c.id === 'leningrad') c.factory = 1;
  });

  function season(day) {
    if (day < 16) return 'summer';
    if (day < 28) return 'mud';
    return 'winter';
  }
  function seasonFa(s) {
    return s === 'summer' ? 'تابستان · خشک' : s === 'mud' ? 'گل‌آلود' : 'زمستان';
  }

  function roster(fac) {
    return Object.keys(UNIT_TYPES).filter(k => UNIT_TYPES[k].faction === fac);
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function cityById(id) {
    for (let i = 0; i < CITIES.length; i++) if (CITIES[i].id === id) return CITIES[i];
    return null;
  }
  function neighbors(id) {
    const out = [];
    for (let i = 0; i < CONNECTIONS.length; i++) {
      const e = CONNECTIONS[i];
      if (e[0] === id) out.push(e[1]);
      else if (e[1] === id) out.push(e[0]);
    }
    return out;
  }
  function pathCities(fromId, toId) {
    if (fromId === toId) return [fromId];
    const q = [fromId];
    const prev = { [fromId]: null };
    while (q.length) {
      const u = q.shift();
      const ns = neighbors(u);
      for (let i = 0; i < ns.length; i++) {
        const v = ns[i];
        if (v in prev) continue;
        prev[v] = u;
        if (v === toId) {
          const chain = [v];
          let p = u;
          while (p) { chain.push(p); p = prev[p]; }
          chain.reverse();
          return chain;
        }
        q.push(v);
      }
    }
    return [fromId, toId];
  }

  function distToSeg(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const den = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / den));
    return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
  }

  function onRail(x, y) {
    for (let i = 0; i < CONNECTIONS.length; i++) {
      const A = cityById(CONNECTIONS[i][0]);
      const B = cityById(CONNECTIONS[i][1]);
      if (distToSeg(x, y, A.x, A.y, B.x, B.y) < 30) return true;
    }
    return false;
  }

  function isWater(x, y) {
    if (x < 10 || y < 10 || x > WORLD.W - 10 || y > WORLD.H - 10) return true;
    if (y < 280 && x < 2500) return true;
    if (y < 380 && x < 1600) return true;
    if (y < 480 && x < 900) return true;
    if ((x - 2280) * (x - 2280) / (160 * 160) + (y - 220) * (y - 220) / (90 * 90) < 1) return true;
    const crimea = x > 1980 && x < 2360 && y > 2260 && y < 2520;
    if (!crimea && y > 2520 && x > 1200 && x < 3400) return true;
    if (!crimea && y > 2580 && x > 900 && x < 3800) return true;
    if (!crimea && y > 2420 && x > 2360 && x < 3100) return true;
    if (x > 4880 && y > 1960) return true;
    if (x > 4760 && y > 2140) return true;
    return false;
  }

  function inMarsh(x, y) {
    return (x - 1780) * (x - 1780) / (380 * 380) + (y - 1420) * (y - 1420) / (220 * 220) < 1;
  }
  function inCaucasus(x, y) {
    return y > 2180 && x > 3000 && x < 4600 && y < 2500 && !isWater(x, y);
  }
  function inForest(x, y) {
    if (isWater(x, y) || inMarsh(x, y)) return false;
    const n = Math.sin(x * 0.012) * Math.cos(y * 0.01) + Math.sin((x + y) * 0.007);
    return n > 0.55 && y > 420 && y < 2000;
  }
  function terrainFactor(x, y, cls) {
    if (cls === 'air') return 1;
    if (isWater(x, y)) return 0.08;
    if (inMarsh(x, y)) return cls === 'tank' || cls === 'art' || cls === 'at' ? 0.38 : 0.64;
    if (inCaucasus(x, y)) return 0.5;
    if (inForest(x, y)) return 0.7;
    return 1;
  }
  function nearestCity(x, y) {
    let best = CITIES[0], bd = 1e9;
    for (let i = 0; i < CITIES.length; i++) {
      const c = CITIES[i];
      const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  return {
    WORLD, TICK, POP_CAP, CITY_R, CEASEFIRE, VP_WIN, UPGRADES,
    FACTIONS, CITIES, CONNECTIONS, UNIT_TYPES,
    roster, dist, clamp, cityById, neighbors, pathCities,
    isWater, inMarsh, inCaucasus, inForest, terrainFactor, nearestCity,
    onRail, distToSeg, season, seasonFa
  };
}));
