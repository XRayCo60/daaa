@echo off
echo === AFU مغز مصنوعي - لانچر ويندوز ===
echo چک کردن پايتون...
python --version >nul 2>&1
if %errorlevel% neq 0 (
  echo پايتون پيدا نشد! از python.org نصب کن و تیک Add to PATH بزن
  pause
  exit /b
)
echo پايتون پيدا شد
echo نصب وابستگي‌ها (اگر لازم)...
python -m pip install psutil --quiet
echo اجراي سرور گرافيکي...
echo بعدش مرورگر روي http://localhost:8080 باز ميشه
python gui_server.py 8080
pause
