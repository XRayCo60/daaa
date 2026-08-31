(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OST = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WORLD = { W: 3600, H: 2000 };
  const TICK = 12;
  const POP_CAP = 40;
  const CITY_R = 58;

  const FACTIONS = {
    ger: {
      id: 'ger',
      nameFa: 'ورماخت',
      name: 'Wehrmacht',
      color: '#c4a35a',
      colorDark: '#6e5a2c',
      ink: '#d9c48a',
      unit: '#4c5146'
    },
    sov: {
      id: 'sov',
      nameFa: 'ارتش سرخ',
      name: 'Red Army',
      color: '#c43c3c',
      colorDark: '#6e1515',
      ink: '#e06a6a',
      unit: '#3f4f2e'
    }
  };

  const CITIES = [
    { id: 'berlin',     x: 300,  y: 1040, nameFa: 'برلین',      name: 'Berlin',      owner: 'ger', i: 1.50, m: 0.95, o: 0.38, capital: true  },
    { id: 'konigsberg', x: 690,  y: 560,  nameFa: 'کونیگسبرگ',  name: 'Königsberg',  owner: 'ger', i: 0.70, m: 0.42, o: 0.06, capital: false },
    { id: 'warsaw',     x: 820,  y: 980,  nameFa: 'ورشو',       name: 'Warschau',    owner: 'ger', i: 0.85, m: 0.55, o: 0.08, capital: false },
    { id: 'krakow',     x: 740,  y: 1280, nameFa: 'کراکوف',     name: 'Krakau',      owner: 'ger', i: 0.55, m: 0.38, o: 0.04, capital: false },
    { id: 'riga',       x: 1000, y: 400,  nameFa: 'ریگا',       name: 'Riga',        owner: 'sov', i: 0.55, m: 0.40, o: 0.04, capital: false },
    { id: 'minsk',      x: 1280, y: 820,  nameFa: 'مینسک',      name: 'Minsk',       owner: 'sov', i: 0.70, m: 0.50, o: 0.05, capital: false },
    { id: 'kiev',       x: 1400, y: 1240, nameFa: 'کیف',        name: 'Kiev',        owner: 'sov', i: 0.90, m: 0.62, o: 0.10, capital: false },
    { id: 'smolensk',   x: 1640, y: 760,  nameFa: 'اسمولنسک',   name: 'Smolensk',    owner: 'sov', i: 0.55, m: 0.40, o: 0.04, capital: false },
    { id: 'leningrad',  x: 1500, y: 270,  nameFa: 'لنینگراد',   name: 'Leningrad',   owner: 'sov', i: 1.15, m: 0.80, o: 0.12, capital: false },
    { id: 'moscow',     x: 2120, y: 700,  nameFa: 'مسکو',       name: 'Moscow',      owner: 'sov', i: 1.70, m: 1.10, o: 0.22, capital: true  },
    { id: 'gorky',      x: 2620, y: 620,  nameFa: 'گورکی',      name: 'Gorky',       owner: 'sov', i: 1.05, m: 0.55, o: 0.10, capital: false },
    { id: 'kharkov',    x: 1780, y: 1180, nameFa: 'خارکف',      name: 'Kharkov',     owner: 'sov', i: 0.80, m: 0.52, o: 0.10, capital: false },
    { id: 'rostov',     x: 1920, y: 1480, nameFa: 'روستوف',     name: 'Rostov',      owner: 'sov', i: 0.65, m: 0.42, o: 0.28, capital: false },
    { id: 'stalingrad', x: 2380, y: 1320, nameFa: 'استالینگراد', name: 'Stalingrad', owner: 'sov', i: 1.00, m: 0.70, o: 0.24, capital: false },
    { id: 'sevastopol', x: 1480, y: 1688, nameFa: 'سواستوپول',  name: 'Sevastopol',  owner: 'sov', i: 0.45, m: 0.28, o: 0.08, capital: false },
    { id: 'baku',       x: 3080, y: 1660, nameFa: 'باکو',       name: 'Baku',        owner: 'sov', i: 0.40, m: 0.28, o: 2.35, capital: false }
  ];

  const CONNECTIONS = [
    ['berlin', 'konigsberg'], ['berlin', 'warsaw'], ['berlin', 'krakow'],
    ['konigsberg', 'riga'], ['konigsberg', 'warsaw'],
    ['warsaw', 'minsk'], ['warsaw', 'kiev'], ['warsaw', 'krakow'],
    ['krakow', 'kiev'],
    ['riga', 'leningrad'], ['riga', 'minsk'],
    ['minsk', 'smolensk'], ['minsk', 'kiev'], ['minsk', 'leningrad'],
    ['kiev', 'kharkov'], ['kiev', 'sevastopol'],
    ['smolensk', 'moscow'], ['smolensk', 'leningrad'], ['smolensk', 'kharkov'],
    ['leningrad', 'moscow'],
    ['moscow', 'gorky'], ['moscow', 'kharkov'], ['moscow', 'stalingrad'],
    ['kharkov', 'rostov'], ['kharkov', 'stalingrad'],
    ['rostov', 'stalingrad'], ['rostov', 'sevastopol'], ['rostov', 'baku'],
    ['stalingrad', 'baku'], ['stalingrad', 'gorky']
  ];

  const UNIT_TYPES = {
    grenadier: {
      faction: 'ger', cls: 'inf',
      name: 'Grenadier', nameFa: 'گرنادیر', roleFa: 'پیاده',
      cost: { i: 8, m: 42, o: 0 }, build: 7,
      hp: 115, speed: 30, range: 72, atk: 10, armor: 1, cd: 0.65,
      vs: { inf: 1, tank: 0.28, art: 1.05, air: 0.38 },
      capture: 1, radius: 9, pop: 1
    },
    panzer4: {
      faction: 'ger', cls: 'tank',
      name: 'Panzer IV', nameFa: 'پانزر ۴', roleFa: 'تانک متوسط',
      cost: { i: 88, m: 16, o: 22 }, build: 14,
      hp: 240, speed: 42, range: 98, atk: 20, armor: 7, cd: 1.05,
      vs: { inf: 1.35, tank: 1, art: 1.2, air: 0.18 },
      capture: 0.35, radius: 15, pop: 2
    },
    tiger: {
      faction: 'ger', cls: 'tank',
      name: 'Tiger I', nameFa: 'ببر', roleFa: 'تانک سنگین',
      cost: { i: 175, m: 22, o: 52 }, build: 24,
      hp: 430, speed: 28, range: 118, atk: 38, armor: 13, cd: 1.35,
      vs: { inf: 1.15, tank: 1.55, art: 1.25, air: 0.15 },
      capture: 0.25, radius: 18, pop: 3
    },
    wespe: {
      faction: 'ger', cls: 'art',
      name: 'Wespe', nameFa: 'وسپه', roleFa: 'توپخانه',
      cost: { i: 62, m: 12, o: 8 }, build: 13,
      hp: 140, speed: 26, range: 240, atk: 22, armor: 3, cd: 2.4,
      vs: { inf: 1.7, tank: 0.72, art: 1.1, air: 0.05 },
      capture: 0.15, radius: 13, pop: 2, splash: 42
    },
    stuka: {
      faction: 'ger', cls: 'air',
      name: 'Ju 87 Stuka', nameFa: 'اشتوکا', roleFa: 'هوایی',
      cost: { i: 78, m: 8, o: 26 }, build: 16,
      hp: 95, speed: 110, range: 86, atk: 28, armor: 1, cd: 1.6,
      vs: { inf: 1.1, tank: 2.1, art: 1.4, air: 0.4 },
      capture: 0, radius: 14, pop: 2
    },
    strelok: {
      faction: 'sov', cls: 'inf',
      name: 'Strelok', nameFa: 'تفنگدار', roleFa: 'پیاده',
      cost: { i: 6, m: 34, o: 0 }, build: 6,
      hp: 105, speed: 31, range: 70, atk: 9, armor: 1, cd: 0.62,
      vs: { inf: 1, tank: 0.26, art: 1.05, air: 0.36 },
      capture: 1, radius: 9, pop: 1
    },
    t34: {
      faction: 'sov', cls: 'tank',
      name: 'T-34', nameFa: 'تی-۳۴', roleFa: 'تانک متوسط',
      cost: { i: 68, m: 14, o: 16 }, build: 11,
      hp: 215, speed: 50, range: 92, atk: 18, armor: 6, cd: 0.95,
      vs: { inf: 1.3, tank: 1, art: 1.15, air: 0.18 },
      capture: 0.35, radius: 14, pop: 2
    },
    kv1: {
      faction: 'sov', cls: 'tank',
      name: 'KV-1', nameFa: 'کی‌وی-۱', roleFa: 'تانک سنگین',
      cost: { i: 148, m: 20, o: 38 }, build: 22,
      hp: 400, speed: 26, range: 108, atk: 32, armor: 12, cd: 1.3,
      vs: { inf: 1.1, tank: 1.4, art: 1.2, air: 0.15 },
      capture: 0.25, radius: 18, pop: 3
    },
    katyusha: {
      faction: 'sov', cls: 'art',
      name: 'BM-13 Katyusha', nameFa: 'کاتیوشا', roleFa: 'راکت‌انداز',
      cost: { i: 58, m: 12, o: 14 }, build: 13,
      hp: 125, speed: 38, range: 260, atk: 16, armor: 2, cd: 0.12,
      vs: { inf: 1.85, tank: 0.85, art: 1.15, air: 0.05 },
      capture: 0.12, radius: 13, pop: 2, splash: 50, salvo: 8, salvoReload: 7.5
    },
    il2: {
      faction: 'sov', cls: 'air',
      name: 'Il-2', nameFa: 'ایل-۲', roleFa: 'هوایی',
      cost: { i: 70, m: 8, o: 20 }, build: 15,
      hp: 115, speed: 100, range: 80, atk: 24, armor: 2, cd: 1.45,
      vs: { inf: 1.35, tank: 1.7, art: 1.3, air: 0.4 },
      capture: 0, radius: 14, pop: 2
    }
  };

  function roster(fac) {
    return Object.keys(UNIT_TYPES).filter(k => UNIT_TYPES[k].faction === fac);
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

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

  function isWater(x, y) {
    if (x < 8 || y < 8 || x > WORLD.W - 8 || y > WORLD.H - 8) return true;
    // Baltic + Gulf of Finland
    if (y < 228 && x < 1680) return true;
    if (y < 310 && x < 1080) return true;
    if (y < 390 && x < 640) return true;
    // Ladoga
    if ((x - 1600) * (x - 1600) / (130 * 130) + (y - 155) * (y - 155) / (72 * 72) < 1) return true;
    // Crimea is land
    const crimea = x > 1310 && x < 1640 && y > 1575 && y < 1765;
    // Black Sea
    if (!crimea && y > 1768 && x > 820 && x < 2220) return true;
    if (!crimea && y > 1845 && x > 620 && x < 2480) return true;
    if (!crimea && y > 1708 && x > 1640 && x < 2100) return true;
    // Caspian — Baku sits on west shore
    if (x > 3220 && y > 1420) return true;
    if (x > 3140 && y > 1560) return true;
    return false;
  }

  function inMarsh(x, y) {
    return (x - 1180) * (x - 1180) / (300 * 300) + (y - 1020) * (y - 1020) / (170 * 170) < 1;
  }

  function inCaucasus(x, y) {
    return y > 1540 && x > 2100 && x < 3180 && y < 1760 && !isWater(x, y);
  }

  function inForest(x, y) {
    if (isWater(x, y) || inMarsh(x, y)) return false;
    const n = Math.sin(x * 0.017) * Math.cos(y * 0.013) + Math.sin((x + y) * 0.009);
    return n > 0.62 && y > 360 && y < 1500;
  }

  function terrainFactor(x, y, cls) {
    if (cls === 'air') return 1;
    if (isWater(x, y)) return 0.08;
    if (inMarsh(x, y)) return cls === 'tank' || cls === 'art' ? 0.42 : 0.68;
    if (inCaucasus(x, y)) return 0.55;
    if (inForest(x, y)) return 0.72;
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

  // Königsberg Persian spelling
  CITIES.find(c => c.id === 'konigsberg').nameFa = 'کونigsبرگ';

  return {
    WORLD, TICK, POP_CAP, CITY_R,
    FACTIONS, CITIES, CONNECTIONS, UNIT_TYPES,
    roster, dist, clamp, cityById, neighbors, pathCities,
    isWater, inMarsh, inCaucasus, inForest, terrainFactor, nearestCity
  };
}));
