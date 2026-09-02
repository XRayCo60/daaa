# OSTFRONT LAN host — no Node.js. Run: Right-click -> Run with PowerShell
$ErrorActionPreference = 'Stop'
$Port = 41917
$Root = Join-Path $PSScriptRoot 'public'
if (-not (Test-Path $Root)) { $Root = $PSScriptRoot }

$Mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.json' = 'application/json; charset=utf-8'
  '.ico'  = 'image/x-icon'
}

$Room = @{
  Next   = 1
  HostId = $null
  Cmds   = New-Object System.Collections.ArrayList
  Snap   = @{ hellos = @{}; state = $null }
}

function Get-LanIP {
  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
      Select-Object -First 1 -ExpandProperty IPAddress
    if ($ip) { return $ip }
  } catch {}
  try {
    return (Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.IPAddress } | Select-Object -First 1).IPAddress[0]
  } catch { return '127.0.0.1' }
}

function Send-Bytes([System.Net.Sockets.NetworkStream]$s, [byte[]]$head, [byte[]]$body) {
  $s.Write($head, 0, $head.Length)
  if ($body -and $body.Length) { $s.Write($body, 0, $body.Length) }
  $s.Flush()
}

function Reply([System.Net.Sockets.NetworkStream]$s, [int]$code, [string]$ctype, [byte[]]$body) {
  if (-not $body) { $body = [byte[]]@() }
  $reason = switch ($code) { 200 { 'OK' } 404 { 'Not Found' } 400 { 'Bad Request' } default { 'OK' } }
  $h = "HTTP/1.1 $code $reason`r`nContent-Type: $ctype`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-store`r`nAccess-Control-Allow-Origin: *`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($h)
  Send-Bytes $s $hb $body
}

function Reply-Json($s, $obj, $code = 200) {
  $json = $obj | ConvertTo-Json -Compress -Depth 20
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Reply $s $code 'application/json; charset=utf-8' $bytes
}

$utf8 = [System.Text.Encoding]::UTF8
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
try { $listener.Start() } catch {
  Write-Host "Port $Port busy. Close the other program and retry."
  exit 1
}

$ip = Get-LanIP
Write-Host ""
Write-Host "OSTFRONT"
Write-Host "This PC:     http://localhost:$Port"
Write-Host "Other laptop: http://${ip}:$Port"
Write-Host "Keep this window open. Ctrl+C to stop."
Write-Host ""
try { Start-Process "http://localhost:$Port" } catch {}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 8000
    $stream = $client.GetStream()
    $buf = New-Object byte[] 65536
    $ms = New-Object System.IO.MemoryStream
    do {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      $ms.Write($buf, 0, $n)
      $sofar = $utf8.GetString($ms.ToArray())
    } while ($sofar -notmatch "`r`n`r`n" -and $ms.Length -lt 200000)

    $raw = $utf8.GetString($ms.ToArray())
    $split = $raw.IndexOf("`r`n`r`n")
    if ($split -lt 0) { $client.Close(); continue }
    $head = $raw.Substring(0, $split)
    $lines = $head -split "`r`n"
    $req = $lines[0] -split ' '
    if ($req.Length -lt 2) { $client.Close(); continue }
    $method = $req[0]
    $urlPath = [System.Uri]::UnescapeDataString(($req[1] -split '\?')[0])
    $clen = 0
    foreach ($ln in $lines) {
      if ($ln -match '^(?i)Content-Length:\s*(\d+)') { $clen = [int]$Matches[1] }
    }
    $bodyStart = $split + 4
    $bodyBytes = $ms.ToArray()
    $headerByteLen = $utf8.GetByteCount($raw.Substring(0, $bodyStart))
    while (($bodyBytes.Length - $headerByteLen) -lt $clen) {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      $ms.Write($buf, 0, $n)
      $bodyBytes = $ms.ToArray()
    }
    $bodyText = ''
    if ($clen -gt 0 -and $bodyBytes.Length -gt $headerByteLen) {
      $take = [Math]::Min($clen, $bodyBytes.Length - $headerByteLen)
      $bodyText = $utf8.GetString($bodyBytes, $headerByteLen, $take)
    }

    if ($method -eq 'OPTIONS') {
      Reply $stream 200 'text/plain' ([byte[]]@())
      $client.Close(); continue
    }

    if ($urlPath -eq '/api/join' -and $method -eq 'POST') {
      $id = 'p' + $Room.Next
      $Room.Next++
      $isHost = $false
      if (-not $Room.HostId) { $Room.HostId = $id; $isHost = $true }
      Reply-Json $stream @{ id = $id; 'host' = $isHost }
    }
    elseif ($urlPath -eq '/api/cmd' -and $method -eq 'POST') {
      $obj = $null
      try { $obj = $bodyText | ConvertFrom-Json } catch { $obj = $null }
      if ($obj) { [void]$Room.Cmds.Add($obj) }
      Reply-Json $stream @{ ok = $true }
    }
    elseif ($urlPath -eq '/api/cmds') {
      $list = @($Room.Cmds)
      $Room.Cmds.Clear()
      Reply-Json $stream @{ cmds = $list }
    }
    elseif ($urlPath -eq '/api/snap' -and $method -eq 'POST') {
      try { $Room.Snap = $bodyText | ConvertFrom-Json } catch {}
      Reply-Json $stream @{ ok = $true }
    }
    elseif ($urlPath -eq '/api/snap') {
      if ($Room.Snap) { Reply-Json $stream $Room.Snap }
      else { Reply-Json $stream @{ hellos = @{}; state = $null } }
    }
    else {
      if ($urlPath -eq '/') { $urlPath = '/index.html' }
      $rel = $urlPath.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
      if ($rel.Contains('..')) { Reply $stream 400 'text/plain' $utf8.GetBytes('bad'); $client.Close(); continue }
      $file = Join-Path $Root $rel
      if (-not (Test-Path $file -PathType Leaf)) {
        Reply $stream 404 'text/plain; charset=utf-8' $utf8.GetBytes('Not found')
      } else {
        $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
        $ctype = $Mime[$ext]; if (-not $ctype) { $ctype = 'application/octet-stream' }
        $bytes = [IO.File]::ReadAllBytes($file)
        Reply $stream 200 $ctype $bytes
      }
    }
  } catch {
    # ignore per-connection errors
  } finally {
    try { $client.Close() } catch {}
  }
}
