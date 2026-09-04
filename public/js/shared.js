(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OST = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WORLD = { W: 5200, H: 2800 };
  const TICK = 12;
  const POP_CAP = 65;
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
    { id: 'berlin',     x: 380,  y: 1420, nameFa: 'برلین',       name: 'Berlin',      owner: 'ger', i: 2.40, m: 1.30, o: 0.50, capital: true  },
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
    { id: 'kiev',       x: 2160, y: 1760, nameFa: 'کیف',         name: 'Kiev',        owner: 'sov', i: 1.30, m: 0.85, o: 0.15, capital: false },
    { id: 'odessa',     x: 2040, y: 2200, nameFa: 'اودسا',       name: 'Odessa',      owner: 'sov', i: 0.70, m: 0.45, o: 0.12, capital: false },
    { id: 'sevastopol', x: 2180, y: 2460, nameFa: 'سواستوپول',   name: 'Sevastopol',  owner: 'sov', i: 0.50, m: 0.30, o: 0.08, capital: false },
    { id: 'leningrad',  x: 2180, y: 360,  nameFa: 'لنینگراد',    name: 'Leningrad',   owner: 'sov', i: 1.65, m: 1.10, o: 0.16, capital: false },
    { id: 'smolensk',   x: 2480, y: 1060, nameFa: 'اسمولنسک',    name: 'Smolensk',    owner: 'sov', i: 0.75, m: 0.50, o: 0.06, capital: false },
    { id: 'bryansk',    x: 2580, y: 1340, nameFa: 'بریانسک',     name: 'Bryansk',     owner: 'sov', i: 0.60, m: 0.40, o: 0.05, capital: false },
    { id: 'kharkov',    x: 2720, y: 1720, nameFa: 'خارکف',       name: 'Kharkov',     owner: 'sov', i: 1.10, m: 0.70, o: 0.14, capital: false },
    { id: 'kursk',      x: 2780, y: 1500, nameFa: 'کورسک',       name: 'Kursk',       owner: 'sov', i: 0.60, m: 0.42, o: 0.05, capital: false },
    { id: 'tula',       x: 3000, y: 1180, nameFa: 'تولا',        name: 'Tula',        owner: 'sov', i: 0.85, m: 0.52, o: 0.08, capital: false },
    { id: 'moscow',     x: 3280, y: 980,  nameFa: 'مسکو',        name: 'Moscow',      owner: 'sov', i: 2.60, m: 1.50, o: 0.30, capital: true  },
    { id: 'gorky',      x: 3920, y: 860,  nameFa: 'گورکی',       name: 'Gorky',       owner: 'sov', i: 1.40, m: 0.75, o: 0.15, capital: false },
    { id: 'voronezh',   x: 3280, y: 1600, nameFa: 'ورونژ',       name: 'Voronezh',    owner: 'sov', i: 0.80, m: 0.52, o: 0.10, capital: false },
    { id: 'rostov',     x: 3000, y: 2140, nameFa: 'روستوف',      name: 'Rostov',      owner: 'sov', i: 0.80, m: 0.52, o: 0.35, capital: false },
    { id: 'stalingrad', x: 3720, y: 1880, nameFa: 'استالینگراد', name: 'Stalingrad',  owner: 'sov', i: 1.30, m: 0.85, o: 0.32, capital: false },
    { id: 'maikop',     x: 3280, y: 2360, nameFa: 'مایکوپ',      name: 'Maikop',      owner: 'sov', i: 0.35, m: 0.22, o: 1.65, capital: false },
    { id: 'baku',       x: 4680, y: 2340, nameFa: 'باکو',        name: 'Baku',        owner: 'sov', i: 0.45, m: 0.30, o: 3.60, capital: false }
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

  const RIVERS = [
    [[780, 500], [900, 740], [1080, 1340], [1040, 1720], [1000, 2100]],
    [[1400, 540], [1320, 880], [1480, 980]],
    [[2180, 360], [2100, 800], [2040, 1140], [2160, 1760], [2200, 2140], [2180, 2460]],
    [[1780, 1280], [1880, 1420], [2040, 1520], [2160, 1760]],
    [[3280, 980], [3180, 1400], [3000, 2140], [3100, 2500]],
    [[3920, 400], [3720, 860], [3600, 1400], [3720, 1880], [4000, 2300], [4300, 2550]],
    [[2720, 1720], [2800, 1900], [3000, 2140]]
  ];

  const UNIT_TYPES = {
    // ---------- GERMAN WEHRMACHT ----------
    grenadier: {
      faction: 'ger', cls: 'inf', name: 'Grenadier', nameFa: 'گرنادیر', roleFa: 'پیاده‌نظام',
      cost: { i: 10, m: 48, o: 0 }, build: 9,
      hp: 125, speed: 18, range: 72, atk: 11, armor: 1, cd: 0.65,
      vs: { inf: 1, tank: 0.28, art: 1.05, air: 0.38, at: 0.7, recon: 1.05, aa: 0.85, eng: 1.0 },
      capture: 1, radius: 9, pop: 1, burn: 0
    },
    pzgren: {
      faction: 'ger', cls: 'inf', name: 'Panzergrenadier', nameFa: 'پانزرگرنادیر', roleFa: 'پیاده مکانیزه',
      cost: { i: 22, m: 42, o: 6 }, build: 11,
      hp: 150, speed: 24, range: 75, atk: 13, armor: 2, cd: 0.58,
      vs: { inf: 1.15, tank: 0.55, art: 1.1, air: 0.4, at: 0.75, recon: 1.1, aa: 0.95, eng: 1.1 },
      capture: 1, radius: 10, pop: 1, burn: 0.05
    },
    pioneer: {
      faction: 'ger', cls: 'eng', name: 'Pionier', nameFa: 'پیونیر (مهندس)', roleFa: 'مهندس رزمی',
      cost: { i: 16, m: 36, o: 2 }, build: 10,
      hp: 130, speed: 18, range: 64, atk: 10, armor: 1, cd: 0.7,
      vs: { inf: 1.25, tank: 0.45, art: 0.95, air: 0.3, at: 0.75, recon: 0.9, aa: 0.8, eng: 1.2 },
      capture: 0.85, radius: 9, pop: 1, burn: 0
    },
    sanitaeter: {
      faction: 'ger', cls: 'eng', name: 'Sanitäter', nameFa: 'بهداری میدانی', roleFa: 'پزشک و پشتیبان',
      cost: { i: 20, m: 38, o: 4 }, build: 9,
      hp: 110, speed: 22, range: 55, atk: 4, armor: 1, cd: 0.9,
      vs: { inf: 0.5, tank: 0.1, art: 0.4, air: 0.2, at: 0.3, recon: 0.5, aa: 0.4, eng: 0.6 },
      capture: 0.4, radius: 9, pop: 1, burn: 0.02, aura: 'heal', auraR: 120
    },
    sdkfz: {
      faction: 'ger', cls: 'recon', name: 'Sd.Kfz. 222', nameFa: 'اس‌دی‌کاف‌زد ۲۲۲', roleFa: 'خودروی شناسایی',
      cost: { i: 28, m: 10, o: 8 }, build: 8,
      hp: 95, speed: 34, range: 74, atk: 8, armor: 2, cd: 0.7,
      vs: { inf: 0.75, tank: 0.25, art: 0.65, air: 0.25, at: 0.45, recon: 1.1, aa: 0.75, eng: 0.85 },
      capture: 0.25, radius: 10, pop: 1, burn: 0.07
    },
    pak40: {
      faction: 'ger', cls: 'at', name: 'PaK 40', nameFa: 'توپ ضدتانک پاک ۴۰', roleFa: 'ضدتانک',
      cost: { i: 42, m: 12, o: 4 }, build: 11,
      hp: 95, speed: 14, range: 135, atk: 28, armor: 2, cd: 1.45,
      vs: { inf: 0.35, tank: 2.7, art: 0.7, air: 0.08, at: 1, recon: 0.5, aa: 0.4, eng: 0.55 },
      capture: 0.1, radius: 11, pop: 1, burn: 0.03
    },
    flak88: {
      faction: 'ger', cls: 'aa', name: 'Flak 88', nameFa: 'توپ فلک ۸۸', roleFa: 'ضدهوایی و ضدتانک سنگین',
      cost: { i: 70, m: 14, o: 8 }, build: 14,
      hp: 115, speed: 12, range: 165, atk: 26, armor: 2, cd: 1.25,
      vs: { inf: 0.45, tank: 2.1, art: 0.75, air: 3.6, at: 0.85, recon: 0.75, aa: 0.65, eng: 0.6 },
      capture: 0.08, radius: 12, pop: 2, burn: 0.04
    },
    stug3: {
      faction: 'ger', cls: 'tank', name: 'StuG III', nameFa: 'اشتوگ ۳', roleFa: 'توپ تهاجمی زرهی',
      cost: { i: 76, m: 14, o: 18 }, build: 14,
      hp: 220, speed: 25, range: 105, atk: 22, armor: 8, cd: 1.0,
      vs: { inf: 1.4, tank: 1.2, art: 1.2, air: 0.15, at: 1.1, recon: 1.0, aa: 0.85, eng: 1.1 },
      capture: 0.3, radius: 14, pop: 2, burn: 0.14
    },
    panzer4: {
      faction: 'ger', cls: 'tank', name: 'Panzer IV', nameFa: 'تانک پانزر ۴', roleFa: 'تانک متوسط رزمی',
      cost: { i: 96, m: 18, o: 28 }, build: 16,
      hp: 245, speed: 26, range: 98, atk: 21, armor: 7, cd: 1.05,
      vs: { inf: 1.35, tank: 1.05, art: 1.2, air: 0.18, at: 1.1, recon: 1.05, aa: 0.85, eng: 1.0 },
      capture: 0.35, radius: 15, pop: 2, burn: 0.16
    },
    tiger: {
      faction: 'ger', cls: 'tank', name: 'Tiger I', nameFa: 'تانک سنگین ببر (تایگر)', roleFa: 'تانک سنگین پیشرو',
      cost: { i: 190, m: 24, o: 62 }, build: 28,
      hp: 450, speed: 16, range: 122, atk: 40, armor: 14, cd: 1.35,
      vs: { inf: 1.2, tank: 1.6, art: 1.3, air: 0.15, at: 1.25, recon: 1.1, aa: 0.9, eng: 1.0 },
      capture: 0.25, radius: 18, pop: 3, burn: 0.28
    },
    ferdinand: {
      faction: 'ger', cls: 'tank', name: 'Ferdinand / Elefant', nameFa: 'شکارچی تانک فردیناند', roleFa: 'شکارچی تانک فوق‌سنگین',
      cost: { i: 215, m: 20, o: 68 }, build: 30,
      hp: 480, speed: 12, range: 155, atk: 48, armor: 17, cd: 1.6,
      vs: { inf: 0.7, tank: 3.2, art: 1.2, air: 0.1, at: 1.4, recon: 0.9, aa: 0.8, eng: 0.8 },
      capture: 0.15, radius: 19, pop: 3, burn: 0.32
    },
    wespe: {
      faction: 'ger', cls: 'art', name: 'Wespe', nameFa: 'هویتزر خودکششی وسپه', roleFa: 'توپخانه دوربرد',
      cost: { i: 70, m: 14, o: 10 }, build: 15,
      hp: 140, speed: 15, range: 235, atk: 23, armor: 3, cd: 2.4,
      vs: { inf: 1.75, tank: 0.75, art: 1.15, air: 0.05, at: 0.95, recon: 1.05, aa: 0.85, eng: 1.0 },
      capture: 0.15, radius: 13, pop: 2, splash: 44, burn: 0.06
    },
    nebelwerfer: {
      faction: 'ger', cls: 'art', name: 'Nebelwerfer 41', nameFa: 'راکت‌انداز نبل‌ورفر', roleFa: 'راکت‌انداز سنگین و دودزا',
      cost: { i: 82, m: 16, o: 14 }, build: 17,
      hp: 120, speed: 13, range: 240, atk: 30, armor: 2, cd: 0.28, salvo: 6, salvoReload: 4.8,
      vs: { inf: 2.2, tank: 0.7, art: 1.3, air: 0.05, at: 1.0, recon: 1.1, aa: 0.9, eng: 1.2 },
      capture: 0.1, radius: 12, pop: 2, splash: 50, burn: 0.08, smoke: true
    },
    stuka: {
      faction: 'ger', cls: 'air', name: 'Ju 87 Stuka', nameFa: 'بمب‌افکن شیرجه‌رو اشتوکا', roleFa: 'بمب‌افکن پشتیبانی نزدیک',
      cost: { i: 86, m: 10, o: 32 }, build: 18,
      hp: 95, speed: 72, range: 88, atk: 30, armor: 1, cd: 1.6,
      vs: { inf: 1.15, tank: 2.2, art: 1.45, air: 0.4, at: 1.35, recon: 0.5, aa: 0.4, eng: 0.55 },
      capture: 0, radius: 14, pop: 2, burn: 0.22
    },
    me262: {
      faction: 'ger', cls: 'air', name: 'Me 262 Schwalbe', nameFa: 'جنگنده جت مسرشمیت ۲۶۲', roleFa: 'جنگنده رهگیر برتری هوایی',
      cost: { i: 135, m: 12, o: 52 }, build: 22,
      hp: 110, speed: 96, range: 92, atk: 34, armor: 2, cd: 1.2,
      vs: { inf: 1.2, tank: 1.3, art: 1.1, air: 4.2, at: 0.9, recon: 1.6, aa: 0.8, eng: 0.9 },
      capture: 0, radius: 15, pop: 2, burn: 0.35
    },

    // ---------- SOVIET RED ARMY ----------
    strelok: {
      faction: 'sov', cls: 'inf', name: 'Strelok', nameFa: 'تفنگدار ارتش سرخ', roleFa: 'پیاده‌نظام خط‌مقدم',
      cost: { i: 8, m: 38, o: 0 }, build: 8,
      hp: 112, speed: 19, range: 70, atk: 9, armor: 1, cd: 0.62,
      vs: { inf: 1, tank: 0.26, art: 1.05, air: 0.36, at: 0.7, recon: 1.05, aa: 0.85, eng: 1.0 },
      capture: 1, radius: 9, pop: 1, burn: 0
    },
    gvardia: {
      faction: 'sov', cls: 'inf', name: 'Gvardiya', nameFa: 'گارد سرخ شوروی', roleFa: 'پیاده‌نظام نخبه گارد',
      cost: { i: 18, m: 44, o: 2 }, build: 10,
      hp: 155, speed: 20, range: 74, atk: 13, armor: 2, cd: 0.56,
      vs: { inf: 1.25, tank: 0.45, art: 1.2, air: 0.4, at: 0.75, recon: 1.15, aa: 0.95, eng: 1.15 },
      capture: 1.1, radius: 10, pop: 1, burn: 0
    },
    saper: {
      faction: 'sov', cls: 'eng', name: 'Sapyor', nameFa: 'ساپر (مهندس رزمی)', roleFa: 'مهندس و سنگرشکن',
      cost: { i: 12, m: 32, o: 1 }, build: 9,
      hp: 125, speed: 18, range: 62, atk: 9, armor: 1, cd: 0.68,
      vs: { inf: 1.1, tank: 0.4, art: 0.9, air: 0.28, at: 0.65, recon: 0.85, aa: 0.75, eng: 1.2 },
      capture: 0.85, radius: 9, pop: 1, burn: 0
    },
    komissar: {
      faction: 'sov', cls: 'eng', name: 'Politruk / Komissar', nameFa: 'کمیسر سیاسی حزب', roleFa: 'فرمانده روحیه‌بخش میدانی',
      cost: { i: 16, m: 42, o: 2 }, build: 9,
      hp: 120, speed: 22, range: 58, atk: 6, armor: 1, cd: 0.75,
      vs: { inf: 0.8, tank: 0.15, art: 0.6, air: 0.25, at: 0.4, recon: 0.8, aa: 0.5, eng: 0.8 },
      capture: 0.6, radius: 9, pop: 1, burn: 0.02, aura: 'rally', auraR: 130
    },
    razvedka: {
      faction: 'sov', cls: 'recon', name: 'Razvedka', nameFa: 'رازودکا (گشت شناسایی)', roleFa: 'شناسایی و نفوذ',
      cost: { i: 22, m: 12, o: 5 }, build: 7,
      hp: 88, speed: 33, range: 72, atk: 7, armor: 1, cd: 0.68,
      vs: { inf: 0.7, tank: 0.22, art: 0.6, air: 0.2, at: 0.4, recon: 1.1, aa: 0.7, eng: 0.8 },
      capture: 0.22, radius: 10, pop: 1, burn: 0.05
    },
    zis3: {
      faction: 'sov', cls: 'at', name: 'ZiS-3', nameFa: 'توپ زیس-۳', roleFa: 'ضدتانک و پشتیبانی سبک',
      cost: { i: 36, m: 10, o: 3 }, build: 10,
      hp: 88, speed: 15, range: 128, atk: 23, armor: 2, cd: 1.35,
      vs: { inf: 0.45, tank: 2.4, art: 0.75, air: 0.08, at: 1, recon: 0.55, aa: 0.45, eng: 0.6 },
      capture: 0.1, radius: 11, pop: 1, burn: 0.03
    },
    bs3: {
      faction: 'sov', cls: 'at', name: 'BS-3 100mm', nameFa: 'توپ سنگین بی‌اس-۳', roleFa: 'شکارچی سنگین تانک',
      cost: { i: 58, m: 14, o: 6 }, build: 13,
      hp: 105, speed: 12, range: 160, atk: 38, armor: 2, cd: 1.6,
      vs: { inf: 0.35, tank: 3.4, art: 0.8, air: 0.05, at: 1.2, recon: 0.5, aa: 0.4, eng: 0.5 },
      capture: 0.08, radius: 12, pop: 2, burn: 0.04
    },
    aa85: {
      faction: 'sov', cls: 'aa', name: '85 mm AA 52-K', nameFa: 'ضدهوایی ۸۵ میلی‌متری', roleFa: 'ضدهوایی و ضدزره سنگین',
      cost: { i: 58, m: 12, o: 6 }, build: 13,
      hp: 105, speed: 13, range: 155, atk: 22, armor: 2, cd: 1.2,
      vs: { inf: 0.45, tank: 1.65, art: 0.7, air: 3.3, at: 0.8, recon: 0.7, aa: 0.6, eng: 0.55 },
      capture: 0.08, radius: 12, pop: 2, burn: 0.03
    },
    t34: {
      faction: 'sov', cls: 'tank', name: 'T-34/76', nameFa: 'تانک تی-۳۴', roleFa: 'تانک متوسط چابک',
      cost: { i: 74, m: 16, o: 20 }, build: 13,
      hp: 220, speed: 30, range: 92, atk: 19, armor: 6, cd: 0.95,
      vs: { inf: 1.35, tank: 1.05, art: 1.15, air: 0.18, at: 1.05, recon: 1.05, aa: 0.85, eng: 1.0 },
      capture: 0.35, radius: 14, pop: 2, burn: 0.14
    },
    su85: {
      faction: 'sov', cls: 'tank', name: 'SU-85', nameFa: 'شکارچی تانک اس‌یو-۸۵', roleFa: 'شکارچی زرهی سریع',
      cost: { i: 84, m: 15, o: 20 }, build: 14,
      hp: 210, speed: 28, range: 130, atk: 32, armor: 6, cd: 1.15,
      vs: { inf: 0.85, tank: 2.8, art: 1.1, air: 0.12, at: 1.25, recon: 0.9, aa: 0.75, eng: 0.85 },
      capture: 0.25, radius: 14, pop: 2, burn: 0.16
    },
    kv1: {
      faction: 'sov', cls: 'tank', name: 'KV-1', nameFa: 'تانک سنگین کی‌وی-۱', roleFa: 'تانک زره‌پوش سنگین',
      cost: { i: 160, m: 22, o: 46 }, build: 24,
      hp: 420, speed: 15, range: 110, atk: 33, armor: 12, cd: 1.3,
      vs: { inf: 1.15, tank: 1.45, art: 1.25, air: 0.15, at: 1.2, recon: 1.05, aa: 0.85, eng: 1.0 },
      capture: 0.25, radius: 18, pop: 3, burn: 0.24
    },
    is2: {
      faction: 'sov', cls: 'tank', name: 'IS-2 Stalin', nameFa: 'تانک فوق‌سنگین آی‌اس-۲', roleFa: 'تانک شکننده خطوط ۱۲۲ میلی‌متری',
      cost: { i: 200, m: 22, o: 60 }, build: 29,
      hp: 490, speed: 17, range: 128, atk: 46, armor: 15, cd: 1.55,
      vs: { inf: 1.5, tank: 1.7, art: 1.4, air: 0.12, at: 1.3, recon: 1.1, aa: 0.9, eng: 1.2 },
      capture: 0.25, radius: 19, pop: 3, splash: 22, burn: 0.28
    },
    katyusha: {
      faction: 'sov', cls: 'art', name: 'BM-13 Katyusha', nameFa: 'راکت‌انداز کاتیوشا (ارگ استالین)', roleFa: 'راکت‌انداز آتش رگباری',
      cost: { i: 66, m: 14, o: 16 }, build: 15,
      hp: 125, speed: 22, range: 245, atk: 26, armor: 1, cd: 0.26, salvo: 8, salvoReload: 4.5,
      vs: { inf: 2.4, tank: 0.75, art: 1.4, air: 0.05, at: 1.05, recon: 1.15, aa: 0.95, eng: 1.25 },
      capture: 0.1, radius: 13, pop: 2, splash: 46, burn: 0.08
    },
    il2: {
      faction: 'sov', cls: 'air', name: 'Il-2 Shturmovik', nameFa: 'ایل-۲ اشتورموویک (تانک پرنده)', roleFa: 'هواپیمای تهاجم زمینی زره‌پوش',
      cost: { i: 80, m: 10, o: 26 }, build: 17,
      hp: 120, speed: 68, range: 84, atk: 26, armor: 3, cd: 1.45,
      vs: { inf: 1.4, tank: 1.8, art: 1.35, air: 0.45, at: 1.25, recon: 1.1, aa: 0.65, eng: 1.25 },
      capture: 0, radius: 14, pop: 2, burn: 0.18
    },
    yak9: {
      faction: 'sov', cls: 'air', name: 'Yak-9', nameFa: 'جنگنده یاکولف یاک-۹', roleFa: 'جنگنده رهگیر تیزپرواز',
      cost: { i: 85, m: 10, o: 28 }, build: 16,
      hp: 95, speed: 88, range: 88, atk: 28, armor: 1, cd: 1.1,
      vs: { inf: 0.9, tank: 0.8, art: 0.8, air: 3.9, at: 0.6, recon: 1.5, aa: 0.7, eng: 0.8 },
      capture: 0, radius: 14, pop: 2, burn: 0.26
    }
  };

  const DOCTRINES = {
    ger: [
      { id: 'recon_flight', nameFa: 'شناسایی هوایی', name: 'Recon Sortie', cost: { i: 20, o: 15 }, cd: 25, duration: 20, r: 480, descFa: 'پرواز تجسسی برای کشف مواضع و حذف مه جنگ در منطقه هدف' },
      { id: 'artillery_strike', nameFa: 'آتشبار هویتزر سنگین', name: 'Artillery Barrage', cost: { i: 60, o: 25 }, cd: 40, splash: 140, dmg: 160, descFa: 'بمباران متمرکز توپخانه خارج نقشه برای درهم کوبیدن خطوط دشمن' },
      { id: 'smoke_screen', nameFa: 'پرده دود استتار', name: 'Smoke Screen', cost: { i: 25, o: 10 }, cd: 30, duration: 18, r: 160, descFa: 'پرتاب گلوله‌های دودزا برای کاهش ۷۰٪ دقت و آسیب دشمن در منطقه' },
      { id: 'blitzkrieg', nameFa: 'حمله برق‌آسا (بلیتس‌کریگ)', name: 'Blitzkrieg Drive', cost: { i: 50, o: 40 }, cd: 60, duration: 25, descFa: 'افزایش ۳۵٪ سرعت تانک‌ها و ۲۵٪ سرعت آتش در سراسر جبهه به مدت ۲۵ ثانیه' }
    ],
    sov: [
      { id: 'recon_flight', nameFa: 'شناسایی هوایی', name: 'Air Scout', cost: { i: 20, o: 15 }, cd: 25, duration: 20, r: 480, descFa: 'دیده‌بانی هوایی برای کشف آرایش نظامی دشمن در عمق جبهه' },
      { id: 'katyusha_strike', nameFa: 'آتش راکت کاتیوشا', name: 'Katyusha Salvo', cost: { i: 65, o: 20 }, cd: 40, splash: 160, dmg: 180, descFa: 'شلیک سنگین راکت‌های کاتیوشا با قدرت تخریب بالا و زمین‌گیر کردن منطقه' },
      { id: 'smoke_screen', nameFa: 'پرده دود دفاعی', name: 'Smoke Barrage', cost: { i: 25, o: 10 }, cd: 30, duration: 18, r: 160, descFa: 'ایجاد مه مصنوعی دود غلیظ جهت پوشش پیشروی زره‌پوش‌ها و پیاده‌نظام' },
      { id: 'order_227', nameFa: 'فرمان ۲۲۷: نه یک قدم عقب!', name: 'Order 227', cost: { i: 35, m: 40 }, cd: 60, duration: 25, descFa: 'افزایش ۴۰٪ مقاومت پیاده‌نظام، روحیه شکست‌ناپذیر و بازیابی سریع سلامتی' }
    ]
  };

  const VETERANCY = [
    { xp: 0,   rank: 0, nameFa: 'سرباز وظیفه', stars: '' },
    { xp: 100, rank: 1, nameFa: 'کهنه‌سرباز', stars: '★', hpBonus: 1.15, spdBonus: 1.10, atkBonus: 1.05 },
    { xp: 260, rank: 2, nameFa: 'نخبه',       stars: '★★', hpBonus: 1.25, spdBonus: 1.15, atkBonus: 1.18 },
    { xp: 520, rank: 3, nameFa: 'قهرمان جبهه', stars: '★★★', hpBonus: 1.40, spdBonus: 1.20, atkBonus: 1.30, aura: true }
  ];

  const VP = {
    berlin: 8, moscow: 8, leningrad: 3, stalingrad: 3, baku: 3,
    kiev: 2, warsaw: 2
  };
  const CEASEFIRE = 75;
  const VP_WIN = 24;
  const UPGRADES = {
    factory: { i: 80, t: 18, max: 2, nameFa: 'کارخانه' },
    barracks: { i: 45, t: 12, max: 2, nameFa: 'سربازخانه' },
    depot: { i: 60, t: 15, max: 1, nameFa: 'انبار سوخت' }
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
    if (day < 32) return 'mud';
    if (day < 54) return 'winter';
    return 'spring';
  }
  function seasonFa(s) {
    return s === 'summer' ? 'تابستان · خشک و سریع' :
           s === 'mud' ? 'پاییز · راسپوتیتسا (گل و لای سنگین)' :
           s === 'winter' ? 'زمستان سخت · رودخانه‌های یخ‌زده' :
           'بهار · آب شدن یخ‌ها';
  }

  const FRONTS = {
    north:  { nameFa: 'شمال', ids: ['konigsberg', 'kaunas', 'riga', 'pskov', 'leningrad'] },
    center: { nameFa: 'مرکز', ids: ['warsaw', 'brest', 'minsk', 'smolensk', 'tula', 'moscow'] },
    south:  { nameFa: 'جنوب', ids: ['krakow', 'lvov', 'kiev', 'kharkov', 'rostov', 'stalingrad', 'baku'] }
  };

  function visR(cls) {
    if (cls === 'air') return 440;
    if (cls === 'recon') return 420;
    if (cls === 'aa') return 310;
    if (cls === 'at') return 290;
    if (cls === 'tank') return 270;
    if (cls === 'art') return 210;
    if (cls === 'eng') return 230;
    return 240;
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

  function onRiver(x, y) {
    for (let r = 0; r < RIVERS.length; r++) {
      const line = RIVERS[r];
      for (let i = 1; i < line.length; i++) {
        if (distToSeg(x, y, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]) < 24) return true;
      }
    }
    return false;
  }
  function atBridge(x, y) {
    const c = nearestCity(x, y);
    return Math.hypot(c.x - x, c.y - y) < CITY_R + 38;
  }

  function onRail(x, y) {
    for (let i = 0; i < CONNECTIONS.length; i++) {
      const A = cityById(CONNECTIONS[i][0]);
      const B = cityById(CONNECTIONS[i][1]);
      if (distToSeg(x, y, A.x, A.y, B.x, B.y) < 32) return true;
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
  function terrainFactor(x, y, cls, sea) {
    if (cls === 'air') return 1;
    if (isWater(x, y)) return 0.08;
    if (onRiver(x, y) && !atBridge(x, y)) {
      if (sea === 'winter') return 0.85; // Frozen rivers allow cross
      if (cls === 'eng') return 0.45;
      return 0.12;
    }
    if (sea === 'mud' && (cls === 'tank' || cls === 'art' || cls === 'at')) return 0.58;
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
    FACTIONS, CITIES, CONNECTIONS, UNIT_TYPES, DOCTRINES, VETERANCY,
    roster, visR, dist, clamp, cityById, neighbors, pathCities,
    isWater, inMarsh, inCaucasus, inForest, terrainFactor, nearestCity,
    onRail, distToSeg, season, seasonFa, FRONTS, RIVERS, onRiver, atBridge
  };
}));
