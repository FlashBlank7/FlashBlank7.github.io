param()
$ErrorActionPreference = 'Stop'
$studioRoot = Split-Path -Parent $PSScriptRoot
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$studioNode = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
$wranglerCli = Join-Path $studioRoot 'node_modules\wrangler\bin\wrangler.js'
if (-not (Test-Path -LiteralPath $wranglerCli)) { throw 'Install the repository dependencies with pnpm install --frozen-lockfile first.' }
$env:PATH = (Split-Path -Parent $studioNode) + ';' + $env:PATH
$env:WRANGLER_SEND_METRICS = 'false'
Write-Host 'Sign in to your own Cloudflare account in the browser. Do not enable a paid plan.'
& $studioNode $wranglerCli login --use-keyring --scopes account:read user:read workers:write workers_scripts:write d1:write
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare sign-in did not complete. No deployment was attempted.' }
Write-Host 'Cloudflare login completed. Return to Codex so deployment can continue.'
