param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appUrl = 'http://localhost:5173/'
$articleDir = Join-Path $projectRoot 'data\articles'
$runtimeDir = Join-Path $projectRoot 'data\runtime'

function Test-LocalApp {
    try {
        $status = Invoke-RestMethod -Uri ($appUrl + '__local/status') -TimeoutSec 2
        return $status.articleDir -eq $articleDir
    } catch {
        return $false
    }
}

# A single launcher owns startup even when login and a shortcut run together.
$mutex = New-Object System.Threading.Mutex($false, 'Local\MEReportWriter-5173')
$locked = $false
try {
    $locked = $mutex.WaitOne(30000)
    if (-not $locked) { throw 'Another ME Report Writer launcher is still starting.' }
    if (-not (Test-LocalApp)) {
        $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
        $vitePath = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $vitePath)) {
            throw 'Dependencies are missing. Run npm ci in the project folder.'
        }
        New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
        $server = Start-Process -FilePath $nodePath -ArgumentList @(
            ('"' + $vitePath + '"'), '--host', 'localhost', '--port', '5173', '--strictPort'
        ) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
          -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') `
          -RedirectStandardError (Join-Path $runtimeDir 'server-error.log')
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if (Test-LocalApp) { $ready = $true; break }
            if ($server.HasExited) { break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw "Local server did not start. See $runtimeDir\server-error.log" }
    }
    if (-not $NoBrowser) { Start-Process $appUrl }
} catch {
    Write-Error $_
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
