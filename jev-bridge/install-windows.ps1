$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$nodeVersion = (& node --version 2>$null)
if (-not $nodeVersion) { throw 'Node.js 20+ is required.' }
$major = [int](($nodeVersion -replace '^v','').Split('.')[0])
if ($major -lt 20) { throw "Node.js 20+ is required; found $nodeVersion." }

Write-Host 'Installing pinned Jev bridge dependencies...'
& npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
& npm test
if ($LASTEXITCODE -ne 0) { throw 'offline tests failed.' }
& npm run check
if ($LASTEXITCODE -ne 0) { throw 'syntax checks failed.' }

$private = Join-Path $root '.private'
New-Item -ItemType Directory -Force -Path $private | Out-Null
$keyFile = Join-Path $private 'typesafe-key.dpapi'
$secure = Read-Host 'Paste your TypeSafe API key (stored with Windows DPAPI; it will not be shown)' -AsSecureString
$secure | ConvertFrom-SecureString | Set-Content -LiteralPath $keyFile -Encoding ASCII

$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:TYPESAFE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  & node .\doctor.mjs --live
  if ($LASTEXITCODE -ne 0) { throw 'Live Jev verification failed.' }
} finally {
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  Remove-Item Env:TYPESAFE_API_KEY -ErrorAction SilentlyContinue
}

$codex = Get-Command codex -ErrorAction SilentlyContinue
if ($codex) {
  Write-Host 'Installing the official TypeSafe skill for Codex...'
  & npx --yes skills add typesafe-ai/skills --skill typesafe-ai -g --agent codex
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Skill installer did not complete. Run: npx skills add typesafe-ai/skills --skill typesafe-ai -g --agent codex' }

  $configDir = Join-Path $HOME '.codex'
  $config = Join-Path $configDir 'config.toml'
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  if (Test-Path $config) { Copy-Item $config "$config.jev-backup-$(Get-Date -Format yyyyMMdd-HHmmss)" }
  else { New-Item -ItemType File -Path $config | Out-Null }
  $raw = Get-Content $config -Raw
  if ($raw -notmatch '(?m)^\[mcp_servers\.jev\]\s*$') {
    $runner = (Join-Path $root 'run-jev.ps1').Replace('\','\\')
    $block = @(
      '',
      '[mcp_servers.jev]',
      'command = "powershell.exe"',
      ('args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "' + $runner + '"]'),
      'default_tools_approval_mode = "auto"',
      ''
    ) -join [Environment]::NewLine
    Add-Content -LiteralPath $config -Value $block
    Write-Host 'Added the Jev MCP server to Codex config. Restart Codex to load it.'
  } else {
    Write-Host 'Codex already has an mcp_servers.jev entry; it was left unchanged.'
  }
} else {
  Write-Warning 'Codex CLI was not found, so Codex configuration was skipped.'
}

Write-Host ''
Write-Host 'JEV LOCAL SETUP COMPLETE'
Write-Host 'MCP runner:' (Join-Path $root 'run-jev.ps1')
Write-Host 'Loopback API runner:' (Join-Path $root 'run-http.ps1')
Write-Host 'Loopback API when running: http://127.0.0.1:8789'
Write-Host 'Next: connect run-jev.ps1 to ChatGPT with Developer mode + Secure MCP Tunnel.'
