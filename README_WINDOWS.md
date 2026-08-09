# اجرای AFU روی ویندوز - راهنمای PowerShell

تو روی `E:\New folder` با PowerShell زدی `./afu_gui 8080` و خطا گرفتی چون:

1. `afu_gui` که تو ریپو بود فایل لینوکس ELF بود، نه EXE ویندوز — PowerShell نمی‌تونه اجراش کنه.
2. `jq` روی ویندوز نصب نبود.
3. اون `curl http://... | jq` مال لینوکس بود.

## راه حل سریع (بدون کامپایل C++)

من یه نسخه پایتونی ساختم که رو ویندوز مستقیم کار می‌کنه و همون مغز رو داره:

### پیش‌نیاز
- Python 3.10 یا بالاتر نصب کن از python.org (تیک Add to PATH رو بزن)

### اجرا
```powershell
cd "E:\New folder"
python gui_server.py
```
یا اگه پایتونت `python3` نام داره:
```powershell
python3 gui_server.py
```

خودش مرورگر رو روی `http://localhost:8080` باز میکنه — همون محیط گرافیکی که میخواستی.

اگه مرورگر باز نشد دستی بزن:
```
http://localhost:8080
```

همه چیز توش هست:
- فرکانس CPU، درصد درگیر، بودجه CPU، سرعت مدل (x)
- تیک، خون، TPS min/max/current
- حافظه: هر معمولی 96KB، حافظه‌ای 96KB شخصی + 512KB ذخیره، نسبت حرفه‌ای
- خروجی مغز (تصمیم، نه اجبار — گاهی خالیه یعنی سکوت)
- ورودی فارسی → تبدیل به 0/1 (تست معکوس دقیق)
- ناحیه‌ها و تیک معنادار
- بافر Efference Copy با تاخیر 5
- اتفاقات داخلی: arch_change هر 200 تیک، full_rewrite هر 1000 تیک، forget، مرگ، اسپایک معنادار

### اگه میخوای نسخه C++ رو روی ویندوز بیلد کنی (اختیاری)

**روش 1: WSL (پیشنهادی)**
```powershell
wsl --install
wsl
cd /mnt/e/New\ folder
sudo apt update && sudo apt install build-essential -y
make afu_gui
./afu_gui 8080
# بعد تو ویندوز مرورگر http://localhost:8080
```

**روش 2: MinGW**
- از https://www.mingw-w64.org/downloads/ MSYS2 نصب کن
- تو MSYS2:
```bash
pacman -S mingw-w64-x86_64-gcc make
cd /c/e/New\ folder
make afu_gui
./afu_gui.exe 8080
```

### مدل کجاست؟
- وقتی `Save .afu` میزنی (از GUI یا CLI)، فایل `model.afu` همونجاست میسازه.
- برای لود کردن مدل قبلی فعلا تو نسخه پایتونی ذخیره ساده است — نسخه C++ فایل 49MB میساخت چون هر نورون 96KB حافظه داره.

### دستورات قبلی PowerShell که خطا داد اصلاح شده

به جای:
```powershell
./afu_gui 8080
curl http://localhost:8080/api/status | jq
```

بزن:
```powershell
python gui_server.py 8080
# تو مرورگر: http://localhost:8080/api/status
# یا با PowerShell بدون jq:
Invoke-RestMethod http://localhost:8080/api/status | ConvertTo-Json -Depth 4
```

### گرافیکی توی برنامه خودش بیاد بالا؟
نسخه پایتونی همین کارو میکنه — یه پنجره مرورگر باز میشه که داشبورد گرافیکیه. اگه میخوای پنجره دسکتاپ واقعی (tkinter) داشته باشی بگو تا اونم بسازم، ولی همین وب‌GUI از نظر آمار کامل‌تره و رو همه سیستم‌ها کار میکنه.
