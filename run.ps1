$ErrorActionPreference = 'Stop'

function Get-AdbTargets {
    $adbPortOk = $true
    $adbPortProcess = $null
    $netstat = netstat -ano | Select-String "TCP.*0.0.0.0:5037"
    if ($netstat) {
        $parts = $netstat -split '\s+' | Where-Object { $_ -ne "" }
        $pidNum = $parts[-1]
        try {
            $proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
            if ($proc.ProcessName -notmatch "adb") {
                $adbPortOk = $false
                $adbPortProcess = $proc.ProcessName + " (PID: $pidNum)"
            }
        } catch {}
    }

    $adbPath = Join-Path $PSScriptRoot "bin\adb.exe"
    if (-not (Test-Path $adbPath)) {
        # Fallback to global adb if bin\adb.exe is missing
        $adbPath = "adb"
    }
    
    $existingForwards = @()
    if ($adbPortOk) {
        $forwardsOut = & $adbPath forward --list 2>&1
        foreach ($line in $forwardsOut) {
            if ($line -match "^(\S+)\s+tcp:(\d+)\s+localabstract:(\S+)") {
                $existingForwards += @{
                    id = $matches[1]
                    localPort = [int]$matches[2]
                    socket = $matches[3]
                }
            }
        }
    }

    $devices = @()
    if ($adbPortOk) {
        $adbOutput = & $adbPath devices 2>&1
        $deviceLines = $adbOutput | Where-Object { $_ -match "\b(device|offline|unauthorized)\b" }
        foreach ($line in $deviceLines) {
            $parts = $line -split '\s+'
            $id = $parts[0]
            $status = $parts[1]
            $model = ""
            if ($status -eq "device") {
                $model = (& $adbPath -s $id shell getprop ro.product.model 2>&1) -join ""
                $model = $model.Trim()
            }
            
            $processes = @()
            if ($status -eq "device") {
                $socketsOutput = & $adbPath -s $id shell "cat /proc/net/unix" 2>&1
                $sockets = $socketsOutput | Select-String -Pattern "@(\w*devtools_remote\w*)" | ForEach-Object { $_.Matches.Groups[1].Value }
                $sockets = $sockets | Select-Object -Unique
                
                foreach ($socket in $sockets) {
                    $existing = $existingForwards | Where-Object { $_.id -eq $id -and $_.socket -eq $socket }
                    if ($existing) {
                        $localPort = $existing.localPort
                        $forwardSuccess = $true
                    } else {
                        $localPort = 9220
                        $forwardSuccess = $false
                        while (-not $forwardSuccess -and $localPort -lt 9300) {
                            $isUsed = $existingForwards | Where-Object { $_.localPort -eq $localPort }
                            if (-not $isUsed) {
                                $forwardOut = & $adbPath -s $id forward tcp:$localPort localabstract:$socket 2>&1
                                if ($LASTEXITCODE -eq 0 -or $forwardOut -notmatch "error") {
                                    $forwardSuccess = $true
                                    $existingForwards += @{
                                        id = $id
                                        localPort = $localPort
                                        socket = $socket
                                    }
                                    break
                                }
                            }
                            $localPort++
                        }
                    }
                    
                    if ($forwardSuccess) {
                        $targetsObj = @()
                        try {
                            $req = Invoke-RestMethod -Uri "http://127.0.0.1:$localPort/json/list" -TimeoutSec 2 -ErrorAction Stop
                            if ($req) { $targetsObj = @($req) }
                        } catch {}
                        
                        $processes += @{
                            processName = $socket
                            localPort = $localPort
                            targets = $targetsObj
                        }
                    }
                }
            }
            
            $devices += @{
                id = $id
                status = $status
                model = $model
                processes = @($processes)
            }
        }
    }

    $response = @{
        status = "success"
        diagnostics = @{
            adbPortOk = $adbPortOk
            adbPortProcess = $adbPortProcess
        }
        devices = @($devices)
    }
    return $response | ConvertTo-Json -Depth 10 -Compress
}

$port = 8999
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Server started at http://localhost:$port"

$nodeProc = Start-Process node -ArgumentList "proxy.js" -NoNewWindow -PassThru
Write-Host "Started Node.js WebSocket proxy on port 8998"

Write-Host "Opening browser..."
Start-Process "http://localhost:$port/"

$publicDir = Join-Path $PSScriptRoot "public"
$devtoolsDir = Join-Path $PSScriptRoot "devtools"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.RawUrl.Split('?')[0]
        
        if ($urlPath -eq "/api/targets") {
            $jsonResponse = Get-AdbTargets
            $response.ContentType = "application/json; charset=utf-8"
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.Close()
        }
        else {
            if ($urlPath.StartsWith("/devtools/")) {
                $relPath = $urlPath.Substring(10)
                if ([string]::IsNullOrEmpty($relPath) -or $relPath -eq "/") { $relPath = "inspector.html" }
                $filePath = Join-Path $devtoolsDir $relPath
            } else {
                $relPath = $urlPath.TrimStart('/')
                if ([string]::IsNullOrEmpty($relPath) -or $relPath -eq "/") { $relPath = "index.html" }
                $filePath = Join-Path $publicDir $relPath
            }
            
            # Normalize path
            $filePath = $filePath -replace "/", "\"
            
            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mime = switch ($ext) {
                    ".html" { "text/html; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".js"   { "application/javascript; charset=utf-8" }
                    ".json" { "application/json; charset=utf-8" }
                    ".svg"  { "image/svg+xml" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".jpeg" { "image/jpeg" }
                    ".gif"  { "image/gif" }
                    ".wasm" { "application/wasm" }
                    default { "application/octet-stream" }
                }
                $response.ContentType = $mime
                
                try {
                    $bytes = [System.IO.File]::ReadAllBytes($filePath)
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } catch {
                    $response.StatusCode = 500
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes("500 Internal Server Error")
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } else {
                $response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
            $response.Close()
        }
    }
} finally {
    Write-Host "Server stopping..."
    if ($nodeProc) { Stop-Process -Id $nodeProc.Id -Force -ErrorAction SilentlyContinue }
    $listener.Stop()
}
