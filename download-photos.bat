@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Скачивание всех фото с fcfortuna.by
echo Это займёт 30-90 минут в зависимости от сети.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Ошибка: Node.js не найден.
  pause
  exit /b 1
)

if not exist "node_modules\" call npm install

call npm run db:download-photos

pause
