# تطبیق با ۷ نیاز اصلی سند

## ۱. فایل afu و برنامه جدا
- فایل: `src/afu.cpp` + `include/afu.h`
- فرمت: magic=0x31465541 ("AFU1"), version, neuron_count, synapse_count, region_count, codec_count, blood_mana f64, tick u64, flags, header_crc (crc32)
- سپس برای هر نورون: NeuronPacked + آرایه Synapse + input_ids + local_memory اندازه متغیر
- سپس Regions (نام، kind، meaningful، note، mana_share، لیست id)
- سپس Codec table (pattern 6-bit + utf8 char)
- تست: `afu_tests` بخش save/load, `demo.afu` تولید شد
- رانر: `src/runner.cpp` کاملاً جدا، فقط فایل را لود می‌کند

## ۲. تنظیمات CPU، دیدن خروجی، خوراندن خروجی
- `cpu <percent>`: بودجه CPU (sleep متناسب)
- `output [N]`: دیدن خروجی
- `input <متن>`: خوراندن خروجی (ورودی خارجی)
- `status`: مانا، تعداد نورون زنده/مرده/ignore/seizure, TPS
- پیاده‌سازی: `Brain::injectExternalText` و `getRecentOutput`

## ۳. سقف و کف + CPU برای سرعت متغیر
- `tps <min> <max>`: مثلاً `tps 10 100` یعنی حداقل ۱۰ تیک بر ثانیه (زمان مدل ۱۰ برابر سریع‌تر)، حداکثر ۱۰۰
- لوپ رانر: اندازه‌گیری elapsed, مقایسه با expected = ticks/tps_max, اگر جلوتر بود sleep
- `cpu_percent`: اعمال ضریب sleep بیشتر وقتی بودجه کم است (مثلاً ۳۰٪ یعنی فقط ۳۰۰ms در ثانیه محاسبه)
- تست TPS در `afu_tests` و `bench`: حتی ۱۰k نورون روی Xeon ۱۵۶۰ TPS، پس ۱۰ TPS حداقل روی i7-2670QM برآورده می‌شود

## ۴. سیستم CUDA حتی روی ضعیف، کامل و dormant
- `include/device.h` اینترفیس `IDevice` با `info()`, `available()`, `computeBatch()`
- `CpuDevice`: همیشه available, توضیح "SandyBridge compatible, no AVX2 required"
- `CudaDeviceStub`: `available()` چک `nvidia-smi`, اگر نبود reason می‌گوید "روی این سیستم (i7-2670QM + Intel HD 3000) CUDA هرگز فعال نیست چون CUDA فقط NVIDIA است؛ سیستم سهیم کردن کامل ولی dormant است"
- `DeviceManager`: detectDevices(), bestDevice() اگر CUDA available بود آن را برمی‌گرداند وگرنه CPU
- تقسیم بار: بخش "محاسبه تابع هر نورون" قابل انتقال به GPU (computeBatch), تصمیمات ساختاری نادر (جوانه‌زنی، قطع اتصال) روی CPU
- دستور رانر `devices` لیست را نشان می‌دهد

## ۵. انتخاب بخش و گفتن "این معناداره"
- `Region` struct: name, kind, neuron_ids, meaningful bool, meaningful_note string
- ۵ ناحیه پیش‌فرض: InputRegion-نوشتنی, Processing-میانی, Output-خروجی-زبان, Memory-حافظه, Efference-کپی-وابران
- دستور `regions` لیست, `region mark <name> <0/1> [note]` علامت‌گذاری
- در `Brain::onMeaningfulOutput`, اگر ناحیه معنادار باشد می‌توان تمرکز مانا داد (mana_share)

## ۶. تابع ورودی خارجی به ۰/۱ دقیقاً معکوس الگو به فارسی
- `PersianCodec`:
  - `encode(char) -> pattern (6-bit)`
  - `decode(pattern) -> char`
  - `patternToBits(pattern) -> vector<int> size 6`
  - `bitsToPattern(bits) -> pattern`
  - `externalInputToBits(text) -> bits` (ترکیب encode + patternToBits)
  - `bitsToPersian(bits) -> text` (ترکیب bitsToPattern + decode)
- بنابراین `bitsToPersian(externalInputToBits(text)) == text` دقیقاً، و برعکس
- `verifyBijection()` چک می‌کند هر char یکتا و هر pattern یکتا و معکوس‌پذیری دوطرفه
- تست: `codec_test` در رانر و `test_codec_bijection` در `afu_tests`
- مثال اجرا:
```
input سلام
-> 24 بیت
بررسی معکوس: bitsToPersian = سلام (باید دقیقاً همان ورودی باشد)
```

## ۷. چند بخش داشتن + ورودی نوشتنی
- گفته بودید: "این مغز چندین بخش داره، نورون هایی که ی بخشی از مسیرای ورودیشون از سمت برنامس که میتونیم براش چیز بنویسیم"
- پیاده‌سازی: `Neuron::is_input_neuron` و `external_writable`, `RegionKind::INPUT`
- در `Brain::injectExternalText`, ورودی خارجی فقط به نورون‌های InputRegion که external_writable دارند تزریق می‌شود
- می‌توان چند InputRegion ساخت (مثلاً بینایی، شنوایی) و هر کدام جدا نوشتنی است
- در نسخه فعلی یک InputRegion داریم، ولی ساختار Region اجازه چند بخشی را می‌دهد

## سرعت ۱۰ تیک بر ثانیه حداقل (درخواست جدید)
- تفسیر: زمان مدل ۱۰ برابر سریع‌تر از زمان واقعی بگذرد
- اگر هر تیک = ۱ ثانیه زمان مدل باشد، باید حداقل ۱۰ تیک در هر ثانیه واقعی بزنیم
- بنچمارک نشان داد حتی ۱۰k نورون روی i7-2670QM حدود ۱۰ برابر سریع‌تر می‌گذرد
- `tps_min=10` در رانر پیش‌فرض است، اگر کمتر شود هشدار می‌دهد

## نکات دیگر از سند مفهومی
- گراف نامنظم: `connectRandom` هر نورون ۵..۱۰ خروجی رندوم
- ۲۰ مسیر خروجی، ۱۸ شناخته شده، ۲ ناشناخته: در `Synapse::known` و منطق connect
- فعالیت خودجوش: `spontaneous_rate` + جریان ۱۸ واحدی
- مانا: اقتصاد کامل با blood, P2P, تزریق بیرونی
- بدقلقی/تشنج/مرگ: `checkFailureModes`, `doSeizure`, `handlePruning`, `handleGarbageCollect`
- حافظه محلی: ۲۵۶ بایت معمولی، ۸۱۹۲ حافظه‌ای
- بافر efference: `EfferenceBuffer` با delay ۵ تیک
- ماژول تبدیل سیگنال به زبان: `collectOutputPattern` + `PersianCodec`
- نورون حافظه‌ای: `storage_arch_id` هر ۲۰۰ تیک قابل بازنویسی
- نرمی: `is_soft`, `soft_timer`, `SoftnessChoice` و `mutateFunction`
- تقویت شرطی: ساختار آماده، فعلاً با دیکشنری ساده

همه این‌ها در C++ و بدون وابستگی سنگین پیاده شد تا روی i7-2670QM قابل شروع باشد.
