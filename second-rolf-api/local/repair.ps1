[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$RuntimeRoot,
    [string]$ConfigPath = $env:SECOND_ROLF_CONFIG,
    [string]$InstallationPath = (Join-Path $env:LOCALAPPDATA 'LocalModelLab\Bonsai-2-27B\installation.json'),
    [switch]$DeployWorker
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$apiRoot=Split-Path -Parent $PSScriptRoot
$repoRoot=Split-Path -Parent $apiRoot
$RuntimeRoot=[IO.Path]::GetFullPath($RuntimeRoot)
$privateRoot=Join-Path $RuntimeRoot '.private'
$paused=Join-Path $RuntimeRoot '.paused'
$wrapper=Join-Path $RuntimeRoot 'Supervise-Second-Rolf.ps1'
$startScript=Join-Path $RuntimeRoot 'Start-Second-Rolf.ps1'
$node=(Get-Command node.exe -ErrorAction Stop).Source
$npm=(Get-Command npm.cmd -ErrorAction Stop).Source
$utf8=New-Object Text.UTF8Encoding($false)
$currentShell=Join-Path $PSHOME 'pwsh.exe'
if (-not (Test-Path -LiteralPath $currentShell)) { $currentShell=Join-Path $PSHOME 'powershell.exe' }
if (-not (Test-Path -LiteralPath $currentShell)) { throw 'Cannot locate the current PowerShell host; no execution policy override is permitted.' }
if (-not (Test-Path -LiteralPath $wrapper) -or -not (Test-Path -LiteralPath $startScript)) { throw 'RuntimeRoot must be the existing Second Rolf runtime folder with its Start and Supervise scripts.' }
if (-not $ConfigPath) { $ConfigPath=Join-Path $privateRoot 'config.json' }
$ConfigPath=(Resolve-Path -LiteralPath $ConfigPath).Path
$config=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($config.workerUrl.TrimEnd('/') -ne 'https://second-rolf-api.rolfsselas.workers.dev' -or $config.key.Length -lt 40) { throw 'Invalid existing connector configuration. Never paste its secret into chat or source.' }
$runtimeConfig=Join-Path $privateRoot 'config.json'
if ($ConfigPath -ne $runtimeConfig) { throw 'Use the existing .private\config.json inside RuntimeRoot; no credentials are copied or replaced by this repair.' }
if (-not (Test-Path -LiteralPath $InstallationPath)) { throw 'Install the pinned PrismML Bonsai package first.' }
$InstallationPath=(Resolve-Path -LiteralPath $InstallationPath).Path
if ([int]((& $node --version).TrimStart('v').Split('.')[0]) -lt 22) { throw 'Node.js 22 or later is required.' }
function Wait-SupervisorExit {
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        try { $existing=[Threading.Mutex]::OpenExisting('Local\SecondRolfPC'); $existing.Dispose() }
        catch [Threading.WaitHandleCannotBeOpenedException] { return }
        Start-Sleep -Seconds 1
    }
    throw 'The existing supervisor did not stop; no unrelated processes were terminated.'
}
function Start-VerifiedSupervisor {
    if (Test-Path -LiteralPath $paused) { Remove-Item -LiteralPath $paused -Force }
    # Use the caller's existing PowerShell policy. The old Start script requests
    # ExecutionPolicy Bypass and must not be used during this upgrade or rollback.
    $arguments='-NoProfile -File "'+$wrapper+'"'
    Start-Process -FilePath $currentShell -ArgumentList $arguments -WindowStyle Hidden
}
Push-Location $apiRoot
try {
    & $npm ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; existing runtime was not stopped.' }
    & $npm run check
    if ($LASTEXITCODE -ne 0) { throw 'Source validation failed; existing runtime was not stopped.' }
    $stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $snapshot=Join-Path $RuntimeRoot ('releases\bonsai-'+$stamp)
    $snapshotApi=Join-Path $snapshot 'second-rolf-api'
    $snapshotLocal=Join-Path $snapshotApi 'local'
    $snapshotSite=Join-Path $snapshot 'site\second-rolf'
    $snapshotNoarkApi=Join-Path $snapshot 'noark-api'
    $snapshotNoark=Join-Path $snapshot 'noark-assistent'
    $null=New-Item -ItemType Directory -Path $snapshotLocal,$snapshotSite,$snapshotNoarkApi,$snapshotNoark,(Join-Path $snapshotApi 'node_modules') -Force
    # Explicit allowlist: no owner notes, secrets, logs, test data, or checkout-wide copy.
    foreach ($name in @('protocol.mjs','package.json','package-lock.json')) { Copy-Item -LiteralPath (Join-Path $apiRoot $name) -Destination $snapshotApi }
    foreach ($name in @('connector.mjs','doctor.mjs','supervise.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $snapshotLocal }
    foreach ($name in @('knowledge.js','interview.js','status.js')) { Copy-Item -LiteralPath (Join-Path $repoRoot ('site\second-rolf\'+$name)) -Destination $snapshotSite }
    Copy-Item -LiteralPath (Join-Path $repoRoot 'noark-api\bonsai-protocol.mjs') -Destination $snapshotNoarkApi
    foreach ($name in @('rag-shared.mjs','engine.mjs','data.mjs','data-sources.mjs','data-reference.mjs','data-records-1.mjs','data-records-2.mjs','data-records-3.mjs','data-records-4.mjs','guidance-data.mjs','preservation-plan-data.mjs','archival-maintenance-data.mjs')) {
        Copy-Item -LiteralPath (Join-Path $repoRoot ('noark-assistent\'+$name)) -Destination $snapshotNoark
    }
    Copy-Item -LiteralPath (Join-Path $apiRoot 'node_modules\ws') -Destination (Join-Path $snapshotApi 'node_modules\ws') -Recurse
    [IO.File]::WriteAllText((Join-Path $snapshot 'package.json'),'{"private":true,"type":"module"}',$utf8)
    $backup=Join-Path $privateRoot ('supervisor-before-bonsai-'+$stamp+'.ps1')
    Copy-Item -LiteralPath $wrapper -Destination $backup
    $wasPaused=Test-Path -LiteralPath $paused
    $pauseContent=$null
    if ($wasPaused) { $pauseContent=[IO.File]::ReadAllBytes($paused) }
    $wrapperReplaced=$false
    try {
        Set-Content -LiteralPath $paused -Value 'Paused for verified Bonsai runtime upgrade.'
        Wait-SupervisorExit
        $supervise=Join-Path $snapshotLocal 'supervise.ps1'
        $wrapperText="& '"+$supervise.Replace("'","''")+"' -RuntimeRoot '"+$RuntimeRoot.Replace("'","''")+"' -InstallationPath '"+$InstallationPath.Replace("'","''")+"'`r`n"
        $wrapperTemporary=$wrapper+'.tmp'
        [IO.File]::WriteAllText($wrapperTemporary,$wrapperText,$utf8)
        $wrapperReplaced=$true
        Move-Item -LiteralPath $wrapperTemporary -Destination $wrapper -Force
        Start-VerifiedSupervisor
        $env:SECOND_ROLF_MODEL_STATUS=Join-Path $privateRoot 'bonsai-status.json'
        $verified=$false
        for ($attempt=0; $attempt -lt 60; $attempt++) {
            Start-Sleep -Seconds 3
            try {
                $state=Get-Content -LiteralPath $env:SECOND_ROLF_MODEL_STATUS -Raw | ConvertFrom-Json
                if ($state.gpuLayers -eq 65 -and $state.totalLayers -eq 65) {
                    & $node (Join-Path $snapshotLocal 'doctor.mjs') --local-only
                    if ($LASTEXITCODE -eq 0) { $verified=$true; break }
                }
            } catch {}
        }
        if (-not $verified) { throw 'Installed Bonsai runtime did not pass local readiness.' }
    } catch {
        $upgradeFailure=$_
        if ($wrapperReplaced) {
            Set-Content -LiteralPath $paused -Value 'Bonsai upgrade failed; restoring previous supervisor.'
            try { Wait-SupervisorExit }
            catch { throw 'Bonsai upgrade failed and its supervisor did not stop. The saved wrapper was not overwritten; keep the runtime paused and restore the backup after the process exits.' }
            Copy-Item -LiteralPath $backup -Destination $wrapper -Force
        }
        if ($wasPaused) { [IO.File]::WriteAllBytes($paused,$pauseContent) }
        else {
            if (Test-Path -LiteralPath $paused) { Remove-Item -LiteralPath $paused -Force }
            # The startup mutex makes this safe even if the original process is still alive.
            Start-VerifiedSupervisor
        }
        throw $upgradeFailure
    }
    Write-Host 'Verified Bonsai runtime installed. Existing Ollama files and private connector config are unchanged.'
    if ($DeployWorker) {
        & $npm run deploy
        if ($LASTEXITCODE -ne 0) { throw 'Local Bonsai works, but Worker deployment failed. Existing secrets were not changed.' }
    }
    & $node (Join-Path $snapshotLocal 'doctor.mjs') --public-only
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Local Bonsai works. Publish the matching Worker and Pages revision before public chat can be ready.' }
} finally { Pop-Location }
