@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo   FACILOAD - starting dev environment
echo ============================================
echo.

REM --- 0) Sanity: node/npm on PATH (double-click can run with a bare PATH) ---
where node >nul 2>&1
if errorlevel 1 (
    echo [FACILOAD] ERROR: 'node' not found on PATH.
    echo [FACILOAD] Open dev.bat from a terminal where `node -v` works,
    echo [FACILOAD] or reinstall Node 20+ with "Add to PATH" checked.
    echo.
    pause
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo [FACILOAD] ERROR: 'npm' not found on PATH.
    echo [FACILOAD] Repair your Node install, then re-run dev.bat.
    echo.
    pause
    exit /b 1
)
node -v
call npm -v >nul 2>&1
if errorlevel 1 (
    echo [FACILOAD] ERROR: npm failed to start. Try `npm -v` manually.
    echo.
    pause
    exit /b 1
)

REM --- 1) Sanity: workspace deps must be installed (run `npm install` once after cloning/pulling) ---
REM This is an npm workspaces monorepo, so dependencies are HOISTED to the repo-root
REM node_modules\ and there are NO per-workspace node_modules folders. Check the root.
if not exist "%~dp0node_modules\" (
    echo [FACILOAD] ERROR: root node_modules missing.
    echo [FACILOAD] Run this once from the repo root, then re-run dev.bat:
    echo [FACILOAD]     npm install
    echo.
    pause
    exit /b 1
)
if not exist "%~dp0node_modules\express\" (
    echo [FACILOAD] ERROR: API deps missing - express not found. Run npm install.
    echo.
    pause
    exit /b 1
)
if not exist "%~dp0node_modules\@prisma\client\" (
    echo [FACILOAD] ERROR: Prisma client missing - run `npm install`.
    echo.
    pause
    exit /b 1
)
if not exist "%~dp0node_modules\framer-motion\" (
    echo [FACILOAD] WARNING: framer-motion not found - web deps may be out of date.
    echo [FACILOAD] Run this once from the repo root, then re-run dev.bat:
    echo [FACILOAD]     npm install
    echo.
    pause
    exit /b 1
)

REM --- 2) Database: SQLite file (apps\api\prisma\dev.db) — no Docker needed. ---
REM Create + seed the database on first run; afterwards the file just exists.
if not exist "%~dp0apps\api\prisma\dev.db" (
    echo [FACILOAD] First run: creating the SQLite database from migrations ...
    call npm run migrate:deploy --workspace apps/api
    if errorlevel 1 (
        echo [FACILOAD] ERROR: database migration failed. See output above.
        echo.
        pause
        exit /b 1
    )
    echo [FACILOAD] Seeding dev data ...
    call npm run seed --workspace apps/api
    if errorlevel 1 (
        echo [FACILOAD] ERROR: database seed failed. See output above.
        echo.
        pause
        exit /b 1
    )
    echo [FACILOAD] SQLite database ready at apps\api\prisma\dev.db.
)

REM --- 3) API dev server in its own window (skip if port 4000 already listening) ---
REM Two-stage check: only LISTENING lines, then a literal ":4000 " match.
REM findstr /c: stops the pattern being space-split into ":4000" OR anything,
REM and the trailing space avoids false matches like :14000 or :40000.
netstat -ano | findstr "LISTENING" | findstr /c:":4000 " >nul
if errorlevel 1 (
    echo [FACILOAD] Starting API on http://localhost:4000 ...
    start "FACILOAD API" cmd /k "cd /d ""%~dp0"" && npm run dev --workspace apps/api"
) else (
    echo [FACILOAD] Port 4000 already in use - API looks already running. Skipping.
)

REM --- 4) Web dev server in its own window (skip if port 5173 already listening) ---
netstat -ano | findstr "LISTENING" | findstr /c:":5173 " >nul
if errorlevel 1 (
    echo [FACILOAD] Starting web on http://localhost:5173 ...
    start "FACILOAD Web" cmd /k "cd /d ""%~dp0"" && npm run dev --workspace apps/web"
) else (
    echo [FACILOAD] Port 5173 already in use - web looks already running. Skipping.
)

echo.
echo [FACILOAD] Web app:            http://localhost:5173
echo [FACILOAD] API health check:   http://localhost:4000/api/health
echo [FACILOAD] Chair login:        chair.dev@faciload.local / dev-password-change-me
echo [FACILOAD] Admin login:        admin.dev@faciload.local / dev-password-change-me
echo.
echo [FACILOAD] Close the two server windows (or run dev-stop.bat) to stop.
echo.
pause
endlocal
