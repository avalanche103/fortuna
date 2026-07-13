@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Импорт данных с fcfortuna.by
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Ошибка: Node.js не найден.
  pause
  exit /b 1
)

if not exist "node_modules\" call npm install

echo Полный импорт (новости ~104 стр., 10-20 мин.)
echo Опции: npm run db:import -- --only=news --news-pages=5
echo        npm run db:import -- --fetch-bodies
echo        npm run db:import -- --gallery-photos
echo.

call npm run db:import %*

pause
