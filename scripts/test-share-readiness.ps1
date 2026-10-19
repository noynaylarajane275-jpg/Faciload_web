# scripts/test-share-readiness.ps1
#
# Automates the question: "Will share.bat issue a public link on this machine?"
#
# It verifies every precondition that share.bat gates the Cloudflare tunnel on:
#   - node, cloudflared, curl on PATH
#   - npm dependencies installed
#   - database or migrations present (share.bat creates/seeds on first run)
#   - (with -Full) builds the web app with VITE_API_URL=same-origin, starts the
#     API exactly as share.bat does (WEB_DIST + PORT 4000 + no CORS_ORIGIN),
#     polls http://localhost:4000/ for up to 30s, and exits 0 only when the SPA
#     shell answers 200 — i.e. exactly when share.bat would open the tunnel.
#
# Usage:
#   # quick checks only (no build, no server):
#   .\scripts\test-share-readiness.ps1
#
#   # full rehearsal of share.bat steps 1-4b (build + serve + readiness poll):
#   .\scripts\test-share-readiness.ps1 -Full
#
# Exit codes: 0 = READY (a link will be issued), 1 = NOT READY.

[CmdletBinding()]
param(
    [switch]$Full
)

$ErrorActionPreference = 'Continue'
$root = Resolve-Path "$PSScriptRoot\.."
$fails = 0

function Check([string]$Name, [scriptblock]$Test) {
    Write-Host ("[selftest] checking: " + $Name) -NoNewline
    $ok = $false
    try {
        $result = & $Test
        $ok = if ($result -is [bool]) { $result } else { $result -ne $false -and $result -ne 0 }
    } catch {
        $ok = $false
    }
    if ($ok) {
        Write-Host " ok" -ForegroundColor Green
    } else {
        Write-Host " FAIL" -ForegroundColor Red
        $script:fails++
    }
}

# --- static preconditions (run even without -Full) ---------------------------
Check "node on PATH" { (Get-Command node -ErrorAction SilentlyContinue) -ne $null }
Check "cloudflared on PATH" { (Get-Command cloudflared -ErrorAction SilentlyContinue) -ne $null }
Check "curl on PATH" { (Get-Command curl.exe -ErrorAction SilentlyContinue) -ne $null }
Check "npm dependencies installed" { Test-Path "$root\node_modules\.package-lock.json" }
Check "database or migrations present" {
    (Test-Path "$root\apps\api\prisma\dev.db") -or (Test-Path "$root\apps\api\prisma\migrations")
}

# --- full rehearsal of share.bat steps 1-4b ----------------------------------
if ($Full) {
    Write-Host ""
    Write-Host "[selftest] Full rehearsal: build + serve + readiness poll ..."

    Check "web app builds with VITE_API_URL=same-origin" {
        $env:VITE_API_URL = 'same-origin'
        $proc = Start-Process -FilePath npm -ArgumentList "run","build","--workspace","apps/web" `
            -WorkingDirectory $root -NoNewWindow -Wait -PassThru
        $proc.ExitCode -eq 0
    }

    $dist = "$root\apps\web\dist"
    $distReady = Test-Path "$dist\index.html"
    if (-not $distReady) {
        Write-Host "[selftest]   NOTE: apps/web/dist missing after build (pre-existing TS errors in this checkout?)" -ForegroundColor Yellow
    }

    if ($distReady) {
        # Start the API exactly as share.bat does, in the background.
        $env:WEB_DIST = $dist
        $env:PORT = '4000'
        $env:CORS_ORIGIN = ''
        $logFile = "$root\scripts\share-readiness-server.log"
        $errFile = "$root\scripts\share-readiness-server.err"
        $server = Start-Process -FilePath "$root\node_modules\.bin\tsx.cmd" `
            -ArgumentList "src/server.ts" -WorkingDirectory "$root\apps\api" `
            -NoNewWindow -RedirectStandardOutput $logFile -RedirectStandardError $errFile -PassThru

        $ready = $false
        for ($i = 1; $i -le 30; $i++) {
            $code = (curl.exe -s -o "$null" -w "%{http_code}" "http://localhost:4000/" 2>$null)
            if ($code -eq '200') { $ready = $true; break }
            Start-Sleep -Milliseconds 1000
        }

        # Always stop the rehearsal server.
        try { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue } catch {}
        try { Get-Process | Where-Object { $_.Path -like "*tsx*" -or $_.ProcessName -eq "node" } | Stop-Process -Force -ErrorAction SilentlyContinue } catch {}

        Check "http://localhost:4000/ serves the SPA shell (share.bat readiness gate)" { $ready }
    } else {
        Write-Host "[selftest]   SKIP: serve + poll (no dist to serve)" -ForegroundColor Yellow
        $script:fails++
    }
}

Write-Host ""
if ($fails -eq 0) {
    Write-Host "[selftest] ALL CHECKS PASSED - share.bat is ready to issue a link." -ForegroundColor Green
    exit 0
} else {
    Write-Host "[selftest] $fails CHECK(S) FAILED - a link is NOT guaranteed yet." -ForegroundColor Red
    exit 1
}