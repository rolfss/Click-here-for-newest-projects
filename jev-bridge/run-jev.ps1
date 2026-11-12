$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$keyFile = Join-Path $root '.private\typesafe-key.dpapi'
if (-not (Test-Path -LiteralPath $keyFile)) { throw 'Run install-windows.ps1 first; TypeSafe key is not configured.' }
$secure = Get-Content -LiteralPath $keyFile -Raw | ConvertTo-SecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:TYPESAFE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  & node (Join-Path $root 'server.mjs')
  exit $LASTEXITCODE
} finally {
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  Remove-Item Env:TYPESAFE_API_KEY -ErrorAction SilentlyContinue
}
