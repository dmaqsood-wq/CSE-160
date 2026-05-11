param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$Port = 8765
)

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start(20)

function Get-ContentType([string]$Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".js" { return "application/javascript; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    default { return "application/octet-stream" }
  }
}

function Send-Response($Stream, [int]$Status, [string]$Text, [byte[]]$Body, [string]$ContentType) {
  $header = "HTTP/1.1 $Status $Text`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  $client.ReceiveTimeout = 2000

  try {
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()

    if ([string]::IsNullOrWhiteSpace($requestLine)) {
      continue
    }

    while ($true) {
      $line = $reader.ReadLine()
      if ($null -eq $line -or $line.Length -eq 0) {
        break
      }
    }

    $parts = $requestLine -split " "
    $urlPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }
    $urlPath = ($urlPath -split "\?")[0]
    $urlPath = [System.Uri]::UnescapeDataString($urlPath.TrimStart("/"))

    if ([string]::IsNullOrWhiteSpace($urlPath)) {
      $urlPath = "index.html"
    }

    $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $urlPath))

    if (!$fullPath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
      Send-Response $stream 404 "Not Found" $body "text/plain; charset=utf-8"
      continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    Send-Response $stream 200 "OK" $bytes (Get-ContentType $fullPath)
  } catch {
    try {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Server Error")
      Send-Response $stream 500 "Server Error" $body "text/plain; charset=utf-8"
    } catch {
    }
  } finally {
    $client.Close()
  }
}
