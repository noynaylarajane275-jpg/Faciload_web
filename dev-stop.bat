@echo off
setlocal enabledelayedexpansion

echo.
echo [FACILOAD] Stopping dev servers...

REM Kill by window title first (the windows dev.bat opened).
taskkill /fi "WINDOWTITLE eq FACILOAD API*" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq FACILOAD Web*" /t /f >nul 2>&1

REM Port-based fallback: kill whatever is still LISTENING on 3000 / 5173.
set FOUND=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":4000 "') do (
    taskkill /pid %%p /t /f >nul 2>&1
    set FOUND=1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":5173 "') do (
    taskkill /pid %%p /t /f >nul 2>&1
    set FOUND=1
)

if !FOUND!==1 (
    echo [FACILOAD] Killed remaining listeners by port.
)
echo [FACILOAD] Done. Local SQLite database (apps\api\prisma\dev.db) left as-is.
echo.
endlocal
