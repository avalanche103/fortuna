@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo FC Fortuna — запуск сайта
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Ошибка: Node.js не найден. Установите с https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Установка зависимостей...
  call npm install
  if errorlevel 1 (
    echo Ошибка при npm install
    pause
    exit /b 1
  )
)

if not exist "data\fortuna.db" (
  echo Инициализация базы данных...
  call npm run db:seed
)

rem Локальный запуск: не тянуть продовые SOCKET / HTTPS
set "NODE_ENV=development"
set "PORT=3000"
set "INSTANCE_HOST=127.0.0.1"
set "SOCKET="
set "FORCE_HTTPS=0"

echo.
echo Сайт:    http://127.0.0.1:3000
echo Админка: http://127.0.0.1:3000/admin
echo.
echo Для остановки нажмите Ctrl+C
echo.

netstat -ano | findstr /C:":3000 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo Порт 3000 уже занят — открываю браузер.
  start "" "http://127.0.0.1:3000"
  pause
  exit /b 0
)

rem Браузер только после /healthz, иначе страница открывается в пустую
start "fortuna-open-browser" /min cmd /c "for /l %%i in (1,1,45) do @(curl.exe -sf http://127.0.0.1:3000/healthz >nul 2>&1 && start http://127.0.0.1:3000 && exit & timeout /t 1 /nobreak >nul)"

call npm start

echo.
echo Сервер остановлен.
pause
