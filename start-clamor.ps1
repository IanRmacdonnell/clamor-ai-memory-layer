$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$port = if ($args.Count -gt 0) { $args[0] } else { "5173" }

Write-Host "Starting Clamor on http://localhost:$port"
node server.js $port
