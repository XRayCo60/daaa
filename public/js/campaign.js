/* OSTFRONT — six historical operations. Host picks one in the lobby. */
(function (root) {
  'use strict';
  var O = root.OST;
  if (!O) return;

  function S(id, o) {
    o.id = id;
    return o;
  }

  O.SCENARIOS = {
    barbarossa: S('barbarossa', {
      nameFa: 'بارباروسا',
      name: 'Barbarossa',
      whenFa: '۲۲ ژوئن ۱۹۴۱',
      kickerFa: 'ضربهٔ اول',
      day: 1,
      cease: 75,
      res: { ger: { i: 90, m: 120, o: 150 }, sov: { i: 80, m: 160, o: 90 } },
      briefFa: [
        'اروپا سقوط کرده. دو قدرت مانده‌اند.',
        'ورماخت از ویستول به سمت مینسک و کیف فشار می‌آورد.',
        'تانک‌ها در برلین‌اند. راه‌آهن زنده را بگیر، بعد آتش.',
        'ارتش سرخ عمق دارد: مسکو، گورکی، نفت باکو.',
        'اگر خط آهن پارتیزان ببندد، جبهه گرسنه می‌ماند.'
      ],
      gerGoalFa: 'مسکو یا ۲۴ امتیاز. محور مرکز را نشکن.',
      sovGoalFa: 'برلین را دور نگه دار. ورشو را تهدید کن. باکو را از دست نده.',
      noteFa: 'کلاسیک بازی. آتش‌بس بلند. ذخیره را سوار قطار کن.',
      spawn: [
        ['grenadier', 'ger', 'warsaw', 2],
        ['grenadier', 'ger', 'konigsberg', 1],
        ['grenadier', 'ger', 'krakow', 1],
        ['grenadier', 'ger', 'berlin', 2],
        ['panzer4', 'ger', 'berlin', 1],
        ['pak40', 'ger', 'warsaw', 1],
        ['sdkfz', 'ger', 'warsaw', 1],
        ['strelok', 'sov', 'brest', 1],
        ['strelok', 'sov', 'lvov', 1],
        ['strelok', 'sov', 'kaunas', 1],
        ['strelok', 'sov', 'riga', 1],
        ['strelok', 'sov', 'minsk', 2],
        ['strelok', 'sov', 'kiev', 1],
        ['strelok', 'sov', 'smolensk', 1],
        ['strelok', 'sov', 'moscow', 2],
        ['strelok', 'sov', 'gorky', 1],
        ['zis3', 'sov', 'kiev', 1],
        ['razvedka', 'sov', 'minsk', 1]
      ]
    }),

    typhoon: S('typhoon', {
      nameFa: 'توفان',
      name: 'Taifun',
      whenFa: 'اکتبر ۱۹۴۱',
      kickerFa: 'دروازهٔ مسکو',
      day: 16,
      cease: 35,
      res: { ger: { i: 70, m: 90, o: 70 }, sov: { i: 110, m: 140, o: 80 } },
      briefFa: [
        'مینسک و اسمولنسک افتاده‌اند. گل شروع شده.',
        'ورماخت زیر دیوار مسکو است. نفت کم است.',
        'جاده‌ها می‌میرند. فقط راه‌آهن هنوز نفس دارد.',
        'سیبری هنوز نرسیده. اگر تولا بیفتد، مسکو لرزان است.',
        'ارتش سرخ باید زمان بخرد تا گل ورماخت را بخورد.'
      ],
      gerGoalFa: 'تولا و مسکو. سوخت را هدر نده.',
      sovGoalFa: 'اسمولنسک را پس بگیر یا مسکو را ۳۰ ثانیه نگه دار.',
      noteFa: 'فصل گل از روز اول. تانک بدون ریل فلج است.',
      owners: {
        berlin: 'ger', konigsberg: 'ger', warsaw: 'ger', krakow: 'ger', lublin: 'ger',
        kaunas: 'ger', riga: 'ger', vilna: 'ger', brest: 'ger', lvov: 'ger',
        minsk: 'ger', gomel: 'ger', pskov: 'ger', kiev: 'ger', odessa: 'ger',
        smolensk: 'ger', bryansk: 'ger',
        sevastopol: 'sov', leningrad: 'sov', kharkov: 'sov', kursk: 'sov',
        tula: 'sov', moscow: 'sov', gorky: 'sov', voronezh: 'sov',
        rostov: 'sov', stalingrad: 'sov', maikop: 'sov', baku: 'sov'
      },
      spawn: [
        ['grenadier', 'ger', 'smolensk', 3],
        ['grenadier', 'ger', 'bryansk', 2],
        ['panzer4', 'ger', 'smolensk', 2],
        ['pak40', 'ger', 'smolensk', 1],
        ['wespe', 'ger', 'minsk', 1],
        ['grenadier', 'ger', 'kiev', 1],
        ['strelok', 'sov', 'tula', 3],
        ['strelok', 'sov', 'moscow', 3],
        ['t34', 'sov', 'moscow', 1],
        ['zis3', 'sov', 'tula', 2],
        ['strelok', 'sov', 'leningrad', 1],
        ['strelok', 'sov', 'kharkov', 1]
      ]
    }),

    blau: S('blau', {
      nameFa: 'آبی',
      name: 'Fall Blau',
      whenFa: 'ژوئن ۱۹۴۲',
      kickerFa: 'نفت جنوب',
      day: 4,
      cease: 40,
      res: { ger: { i: 85, m: 100, o: 55 }, sov: { i: 120, m: 150, o: 130 } },
      briefFa: [
        'هیتلر چشم به باکو دوخته. مسکو این‌بار هدف دوم است.',
        'خارکف آلمانی است. روستوف درِ قفقاز است.',
        'اگر مایکوپ و باکو بیفتند، ورماخت دوباره نفس می‌کشد.',
        'ارتش سرخ باید استالینگراد را سپر کند.',
        'خط آهن روستوف–استالینگراد را پاره کن، جنوب می‌میرد.'
      ],
      gerGoalFa: 'باکو یا استالینگراد. نفت را برگردان.',
      sovGoalFa: 'روستوف را نگه دار. باکو را از دست نده.',
      noteFa: 'محور جنوب همه‌چیز است. شمال تقریباً خواب است.',
      owners: {
        berlin: 'ger', konigsberg: 'ger', warsaw: 'ger', krakow: 'ger', lublin: 'ger',
        kaunas: 'ger', riga: 'ger', vilna: 'ger', brest: 'ger', lvov: 'ger',
        minsk: 'ger', gomel: 'ger', pskov: 'ger', kiev: 'ger', odessa: 'ger',
        smolensk: 'ger', bryansk: 'ger', kharkov: 'ger', kursk: 'ger', sevastopol: 'ger',
        leningrad: 'sov', tula: 'sov', moscow: 'sov', gorky: 'sov',
        voronezh: 'sov', rostov: 'sov', stalingrad: 'sov', maikop: 'sov', baku: 'sov'
      },
      spawn: [
        ['grenadier', 'ger', 'kharkov', 3],
        ['panzer4', 'ger', 'kharkov', 2],
        ['pak40', 'ger', 'kursk', 1],
        ['stuka', 'ger', 'kiev', 1],
        ['grenadier', 'ger', 'sevastopol', 1],
        ['strelok', 'sov', 'rostov', 3],
        ['strelok', 'sov', 'stalingrad', 2],
        ['t34', 'sov', 'stalingrad', 1],
        ['zis3', 'sov', 'rostov', 1],
        ['strelok', 'sov', 'moscow', 2],
        ['strelok', 'sov', 'voronezh', 2]
      ]
    }),

    uranus: S('uranus', {
      nameFa: 'اورانوس',
      name: 'Uranus',
      whenFa: 'نوامبر ۱۹۴۲',
      kickerFa: 'انبر استالینگراد',
      day: 28,
      cease: 25,
      res: { ger: { i: 60, m: 70, o: 35 }, sov: { i: 140, m: 180, o: 100 } },
      briefFa: [
        'زمستان است. ورماخت داخل استالینگراد گیر کرده.',
        'نفت آلمان ته کشیده. خط جنوب دراز و نازک است.',
        'ارتش سرخ از گورکی و مسکو انبر می‌چیند.',
        'اگر روستوف بیفتد، گروه جنوب در قفقاز دفن می‌شود.',
        'یخ رودخانه را باز می‌کند. از پل‌ها غافل نشو.'
      ],
      gerGoalFa: 'استالینگراد را نگه دار. روستوف را از دست نده.',
      sovGoalFa: 'انبر: روستوف یا استالینگراد را قطع کن.',
      noteFa: 'زمستان از ثانیهٔ اول. آلمان گرسنه است.',
      owners: {
        berlin: 'ger', konigsberg: 'ger', warsaw: 'ger', krakow: 'ger', lublin: 'ger',
        kaunas: 'ger', riga: 'ger', vilna: 'ger', brest: 'ger', lvov: 'ger',
        minsk: 'ger', gomel: 'ger', pskov: 'ger', kiev: 'ger', odessa: 'ger',
        smolensk: 'ger', bryansk: 'ger', kharkov: 'ger', kursk: 'ger',
        rostov: 'ger', voronezh: 'ger', stalingrad: 'ger', sevastopol: 'ger',
        leningrad: 'sov', tula: 'sov', moscow: 'sov', gorky: 'sov',
        maikop: 'sov', baku: 'sov'
      },
      spawn: [
        ['grenadier', 'ger', 'stalingrad', 2],
        ['panzer4', 'ger', 'stalingrad', 1],
        ['grenadier', 'ger', 'rostov', 2],
        ['pak40', 'ger', 'voronezh', 1],
        ['strelok', 'sov', 'gorky', 3],
        ['t34', 'sov', 'gorky', 2],
        ['strelok', 'sov', 'moscow', 2],
        ['katyusha', 'sov', 'moscow', 1],
        ['strelok', 'sov', 'baku', 1],
        ['zis3', 'sov', 'gorky', 1]
      ]
    }),

    citadel: S('citadel', {
      nameFa: 'ارگ',
      name: 'Zitadelle',
      whenFa: 'ژوئیه ۱۹۴۳',
      kickerFa: 'برآمدگی کورسک',
      day: 2,
      cease: 45,
      res: { ger: { i: 100, m: 90, o: 90 }, sov: { i: 130, m: 170, o: 110 } },
      briefFa: [
        'آخرین حملهٔ بزرگ آلمان. کورسک مثل مشت بیرون زده.',
        'ببر و تی-۳۴ روی یک قوس به‌هم می‌رسند.',
        'شوروی سنگر کنده. ضدتانک همه‌جا است.',
        'اگر کورسک بماند، ابتکار دست مسکو می‌افتد.',
        'هواپیما را برای تانک نگه دار، نه برای شهر خالی.'
      ],
      gerGoalFa: 'کورسک را بگیر و نگه دار.',
      sovGoalFa: 'کورسک را ۳۰ ثانیه زنده نگه دار، بعد ضدحمله به خارکف.',
      noteFa: 'نبرد زرهی. ضدتانک پادشاه است.',
      owners: {
        berlin: 'ger', konigsberg: 'ger', warsaw: 'ger', krakow: 'ger', lublin: 'ger',
        kaunas: 'ger', riga: 'ger', vilna: 'ger', brest: 'ger', lvov: 'ger',
        minsk: 'ger', gomel: 'ger', pskov: 'ger', odessa: 'ger',
        smolensk: 'ger', bryansk: 'ger', kharkov: 'ger',
        kiev: 'sov', kursk: 'sov', tula: 'sov', moscow: 'sov', gorky: 'sov',
        voronezh: 'sov', rostov: 'sov', stalingrad: 'sov', maikop: 'sov',
        baku: 'sov', leningrad: 'sov', sevastopol: 'sov'
      },
      spawn: [
        ['grenadier', 'ger', 'bryansk', 2],
        ['panzer4', 'ger', 'bryansk', 1],
        ['tiger', 'ger', 'kharkov', 1],
        ['pak40', 'ger', 'kharkov', 2],
        ['stuka', 'ger', 'smolensk', 1],
        ['strelok', 'sov', 'kursk', 4],
        ['t34', 'sov', 'kursk', 2],
        ['zis3', 'sov', 'kursk', 2],
        ['il2', 'sov', 'moscow', 1],
        ['strelok', 'sov', 'voronezh', 1]
      ]
    }),

    bagration: S('bagration', {
      nameFa: 'باگراتیون',
      name: 'Bagration',
      whenFa: 'ژوئن ۱۹۴۴',
      kickerFa: 'فروپاشی مرکز',
      day: 8,
      cease: 30,
      res: { ger: { i: 50, m: 60, o: 28 }, sov: { i: 160, m: 200, o: 140 } },
      briefFa: [
        'گروه ارتش مرکز نازک شده. مینسک هنوز آلمانی است.',
        'شوروی صنعت و نفت دارد. آلمان نفت ندارد.',
        'اگر مینسک بیفتد، ورشو لرزان می‌شود.',
        'ورماخت باید عقب‌نشینی کند، نه قهرمانی.',
        'پارتیزان پشت خط آلمان بیداد می‌کند. نگهبان بگذار.'
      ],
      gerGoalFa: 'مینسک و ورشو را نگه دار. برلین را نفروش.',
      sovGoalFa: 'مینسک، بعد ورشو. برلین اگر رسید، تمام.',
      noteFa: 'حملهٔ شوروی. آلمان دفاع می‌کند.',
      owners: {
        berlin: 'ger', konigsberg: 'ger', warsaw: 'ger', krakow: 'ger', lublin: 'ger',
        brest: 'ger', minsk: 'ger',
        kaunas: 'sov', riga: 'sov', vilna: 'sov', lvov: 'sov', gomel: 'sov',
        pskov: 'sov', kiev: 'sov', odessa: 'sov', sevastopol: 'sov',
        leningrad: 'sov', smolensk: 'sov', bryansk: 'sov', kharkov: 'sov',
        kursk: 'sov', tula: 'sov', moscow: 'sov', gorky: 'sov',
        voronezh: 'sov', rostov: 'sov', stalingrad: 'sov', maikop: 'sov', baku: 'sov'
      },
      spawn: [
        ['grenadier', 'ger', 'minsk', 3],
        ['grenadier', 'ger', 'warsaw', 2],
        ['pak40', 'ger', 'minsk', 2],
        ['panzer4', 'ger', 'warsaw', 1],
        ['strelok', 'sov', 'smolensk', 3],
        ['t34', 'sov', 'smolensk', 2],
        ['katyusha', 'sov', 'gomel', 1],
        ['il2', 'sov', 'kiev', 1],
        ['gvardia', 'sov', 'smolensk', 2],
        ['strelok', 'sov', 'vilna', 2],
        ['zis3', 'sov', 'smolensk', 1]
      ]
    })
  };

  O.SCENARIO_ORDER = ['barbarossa', 'typhoon', 'blau', 'uranus', 'citadel', 'bagration'];

  O.scenarioList = function () {
    return O.SCENARIO_ORDER.map(function (id) { return O.SCENARIOS[id]; });
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
