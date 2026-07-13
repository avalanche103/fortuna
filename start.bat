@echo off
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

echo.
echo Сайт:    http://localhost:3000
echo Админка: http://localhost:3000/admin
echo.
echo Для остановки нажмите Ctrl+C
echo.

start "" http://localhost:3000
call npm run dev

pause
