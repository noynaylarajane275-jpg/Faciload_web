# extract-tunnel-link.ps1
#
# Parses a cloudflared quick-tunnel log (produced by share.bat) for the first
# public https://<random>.trycloudflare.com URL and writes it to -Out, one URL
# per file, no trailing newline. Used so every share.bat tap leaves a
# retrievable link (share-link.txt) even after the tunnel window is closed.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\extract-tunnel-link.ps1 `
#       -Log share-tunnel.log -Out share-link.txt
#
# Exit codes: 0 = link extracted, 1 = no link found.

param(
    [Parameter(Mandatory = $true)][string]$Log,
    [Parameter(Mandatory = $true)][string]$Out
)

$ErrorActionPreference = 'SilentlyContinue'

try {
    $line = Get-Content -Path $Log |
        Select-String -Pattern 'https://[^\s"\'`]+trycloudflare\.com' |
        Select-Object -First 1

    if ($line -and $line.Line) {
        $match = [regex]::Match($line.Line, 'https://[^\s"\'`]+trycloudflare\.com')
        if ($match.Success) {
            $match.Value | Out-File -FilePath $Out -Encoding utf8 -NoNewline
            exit 0
        }
    }
} catch {
    # swallow - fall through to exit 1
}

exit 1