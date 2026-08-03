$ErrorActionPreference = 'Stop'

# ASCII-only script body for Windows PowerShell 5.1 compatibility.
# The JSON payload below is UTF-8 encoded and then Base64 encoded.
$payloadBase64 = 'eyJtZXNzYWdlIjoiUHJpdmV0IC8g0J/RgNC40LLQtdGCIiwicGF0aCI6IkM6XFxcXFByb2dyYW0gRmlsZXNcXFxcQWdlbnQgSSBPIFNhZmV0eVxcXGRlbW8udHh0In0='
$utf8 = [System.Text.UTF8Encoding]::new($false)
$payloadJson = $utf8.GetString([Convert]::FromBase64String($payloadBase64))
$payload = $payloadJson | ConvertFrom-Json

[PSCustomObject]@{
  Message = $payload.message
  Path = $payload.path
  Host = $env:COMPUTERNAME
} | ConvertTo-Json -Compress
