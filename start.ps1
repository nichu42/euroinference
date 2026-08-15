[CmdletBinding()]
param(
    [switch]$SkipUpdate,
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "       EuroInference Local Runner       " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Verify Node.js is installed
try {
    $nodeVersion = & node -v
    Write-Host "Using Node.js: $nodeVersion" -ForegroundColor Gray
} catch {
    Write-Error "Node.js was not found in your PATH. Please install Node.js (v18+) to run this project."
    exit 1
}

# 2. Update model data cache unless skipped
if (-not $SkipUpdate) {
    Write-Host "`n[1/3] Fetching live exchange rates & provider data..." -ForegroundColor Yellow
    & node scripts/update_data.js
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Data update encountered issues, but continuing with existing data.js..."
    } else {
        Write-Host "Data update completed successfully." -ForegroundColor Green
    }
} else {
    Write-Host "`n[1/3] Skipping data update (-SkipUpdate specified)." -ForegroundColor Gray
}

# 3. Prepare server & URL
$url = "http://localhost:$Port/"
Write-Host "`n[2/3] Opening default browser at $url..." -ForegroundColor Yellow
Start-Process $url

Write-Host "`n[3/3] Starting local HTTP server on port $Port..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server.`n" -ForegroundColor DarkGray

$env:PORT = $Port
& node scripts/serve.js
