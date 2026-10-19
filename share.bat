@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM --- Allow: share.bat /selftest  (verify readiness without opening a tunnel) ---
if "%~1"=="/selftest" goto :selftest

echo.
echo ==========================================================
echo   FACILOAD - temporary remote share
echo ==========================================================
echo.

REM --- 0) Tooling sanity -------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo [share] ERROR: 'node' not found on PATH. Open a terminal where 'node -v' works.
    pause
    exit /b 1
)

REM cloudflared is the only extra requirement - a free, account-less tunnel.
where cloudflared >nul 2>&1
if errorlevel 1 (
    echo [share] cloudflared not found. Installing it now via winget ^(one time^)...
    winget install --id Cloudflare.cloudflared --exact --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [share] ERROR: install failed. Install it manually from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
        pause
        exit /b 1
    )
    echo [share] Installed. Re-open this script if the new PATH is not picked up yet.
    pause
    exit /b 1
)

REM --- 1) Database: create + seed on first run ----------------------------------
if not exist "%~dp0apps\api\prisma\dev.db" (
    echo [share] First run: creating the SQLite database ...
    call npm run migrate:deploy --workspace apps/api || goto :fail
    echo [share] Seeding demo data ...
    call npm run seed --workspace apps/api || goto :fail
)

REM --- 2) Back up the dev database so your friend's edits are recoverable -------
if not exist "%~dp0apps\api\prisma\dev.share-backup.db" (
    copy /y "%~dp0apps\api\prisma\dev.db" "%~dp0apps\api\prisma\dev.share-backup.db" >nul
    echo [share] Backed up dev.db to dev.share-backup.db ^(restorable copy^).
)

REM --- 3) Build the SPA with a SAME-ORIGIN API base ----------------------------
REM VITE_API_URL is inlined at build time (apps/web/src/lib/api.ts). The sentinel
REM value "same-origin" makes the browser issue relative /api/... requests, so it
REM hits whichever host served the page - the tunnel URL - instead of trying to
REM reach localhost:4000 on your friend's own machine. It must be a real,
REM non-empty value: `set "VAR="` in cmd CLEARS the variable, which would leave
REM the built-in http://localhost:4000 default in place.
echo [share] Building the web app ^(~20-60s^) ...
set "VITE_API_URL=same-origin"
call npm run build --workspace apps/web || goto :fail

REM --- 4) Start the API, which also serves the built SPA on one port -----------
REM WEB_DIST activates the static/SPA-fallback branch in apps/api/src/app.ts.
REM PORT 4000 and no CORS_ORIGIN matter: everything is same-origin now.
REM
REM The variables are set HERE, in this script, rather than inside the `start`
REM command string. A child process inherits its parent's environment, so this
REM is equivalent - but it avoids threading the values through cmd's nested
REM quoting ("...cmd /k "cd /d ""dir"" && set "VAR=value" && ..."), where a
REM stray quote or the space before `&&` silently corrupts the value. When that
REM happened WEB_DIST arrived as "C:\...\dist " (trailing space), the dist
REM folder was never found, and the tunnel URL 404'd on every page while
REM /api/health still returned 200 - which looks exactly like a broken tunnel.
set "WEB_DIST=%~dp0apps\web\dist"
set "PORT=4000"
set "CORS_ORIGIN="

echo [share] Starting the server on port 4000 ...
start "FACILOAD Share Server" /D "%~dp0" cmd /k npm run dev --workspace apps/api

REM --- 4b) Fail fast: verify the SPA is actually being served -----------------
REM Opening a tunnel to a server that only answers /api would hand out a link
REM that 404s on every page. Poll the root route and abort with a clear message
REM instead of printing a URL that cannot work.
set "READY="
for /l %%i in (1,1,30) do (
    if not defined READY (
        curl -s -o nul -w "%%{http_code}" http://localhost:4000/ 2>nul | findstr /c:"200" >nul && set "READY=1"
        if not defined READY timeout /t 1 /nobreak >nul
    )
)
if not defined READY (
    echo.
    echo [share] ERROR: http://localhost:4000/ is not serving the web app after 30s.
    echo [share] Check the "FACILOAD Share Server" window for the reason - a
    echo [share] "[api] WEB_DIST is set to ..." warning means the build output
    echo [share] is missing, and port 4000 may already be in use.
    echo [share] NOT opening a tunnel, because the link would not work.
    goto :fail
)
echo [share] Server is serving the web app - ready to share.

REM --- 5) Open the tunnel and print/save the shareable URL ---------------------
set "SHARE_LOG=%~dp0share-tunnel.log"
set "SHARE_LINK=%~dp0share-link.txt"
set "SHARE_LINK_TS=%~dp0share-link-%date:~-4,4%%date:~-10,2%%date:~-7,2%-%time:~0,2%%time:~3,2%%time:~6,2%.txt"
set "SHARE_LINK_TS=%SHARE_LINK_TS: =%"
echo.
echo [share] Starting the Cloudflare tunnel - the URL below is public.
echo [share] Anyone with the link can log in with the dev accounts, so keep
echo [share] this window open only while you need it.
echo [share] The full tunnel log is saved to: %SHARE_LOG%
echo.

REM Stream cloudflared output to the console (live URL) AND to the log file, so
REM the link survives after this window is closed. PowerShell Tee-Object does
REM exactly that - one line, no extra dependencies.
powershell -NoProfile -Command "cloudflared tunnel --url http://localhost:4000 2>&1 | Tee-Object -FilePath '%SHARE_LOG%'"

REM --- 5b) Extract the public link from the tunnel log and save it -------------
if exist "%SHARE_LOG%" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\extract-tunnel-link.ps1" -Log "%SHARE_LOG%" -Out "%SHARE_LINK%" >nul 2>&1
)
if exist "%SHARE_LINK%" (
    for /f "delims=" %%a in ("%SHARE_LINK%") do set "SHARE_URL=%%a"
    copy /y "%SHARE_LINK%" "%SHARE_LINK_TS%" >nul
    echo.
    echo ==========================================================
    echo   SHARE LINK: %SHARE_URL%
    echo   ^(saved to %SHARE_LINK% and timestamped copy %SHARE_LINK_TS%^)
    echo ==========================================================
) else (
    echo.
    echo [share] WARNING: could not parse the public URL from %SHARE_LOG%.
    echo [share] Open %SHARE_LOG% and copy the https://*.trycloudflare.com URL by hand.
)

echo.
echo [share] Tunnel closed. Close the "FACILOAD Share Server" window to stop.
pause
exit /b 0

REM ================================================================================
REM :selftest - verify every precondition for issuing a link, without opening a
REM tunnel. Exit 0 = READY (share.bat will issue a link), exit 1 = NOT READY.
REM ================================================================================
:selftest
echo.
echo ==========================================================
echo   FACILOAD - share readiness self-test
echo ==========================================================
set "FAILS=0"

echo [selftest] checking: node on PATH
where node >nul 2>&1
if errorlevel 1 (echo [selftest]   FAIL: node on PATH & set /a FAILS+=1) else echo [selftest]   ok: node on PATH

echo [selftest] checking: cloudflared on PATH
where cloudflared >nul 2>&1
if errorlevel 1 (echo [selftest]   FAIL: cloudflared on PATH & set /a FAILS+=1) else echo [selftest]   ok: cloudflared on PATH

echo [selftest] checking: curl on PATH
where curl >nul 2>&1
if errorlevel 1 (echo [selftest]   FAIL: curl on PATH & set /a FAILS+=1) else echo [selftest]   ok: curl on PATH

echo [selftest] checking: npm dependencies installed
if exist node_modules\.package-lock.json (echo [selftest]   ok: npm dependencies installed) else (echo [selftest]   FAIL: npm dependencies installed & set /a FAILS+=1)

echo [selftest] checking: database or migrations present
if exist apps\api\prisma\dev.db (echo [selftest]   ok: database or migrations present) else (if exist apps\api\prisma\migrations\ (echo [selftest]   ok: database or migrations present) else (echo [selftest]   FAIL: database or migrations present & set /a FAILS+=1))

echo.
if %FAILS% equ 0 goto :selftest_ready
echo [selftest] %FAILS% checks failed - a link is NOT guaranteed yet.
echo [selftest] Fix the items above, then re-run this self-test.
exit /b 1
:selftest_ready
echo [selftest] ALL CHECKS PASSED - share.bat is ready to issue a link.
echo [selftest] Run share.bat normally; it will build, serve, poll, and open
echo [selftest] the tunnel only once http://localhost:4000/ answers 200.
exit /b 0

:fail
echo.
echo [share] ERROR: a build step failed - see the output above.
pause
exit /b 1
