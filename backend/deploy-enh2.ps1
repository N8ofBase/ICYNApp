param([Parameter(Mandatory)][int]$Step)
# Deploys Enhancement table v2, Easy at 75 Life and the Starvos v5 heals (N8 2026-11-25/26). Code only: no new tables, routes or policies.
# Run from the repo's backend folder on Skynet:
#   aws sso login --profile prismcortex
#   .\deploy-enh2.ps1 -Step 1   (then 2, then 3; then the page goes live by pushing index.html to main)
#
# Step 1  backups of today's icyn-api and icyn-ws code (backup-before-enh2\) and a check that the live files this deploy
#         does NOT change match the repo
# Step 2  icyn-api: climb.mjs + engine.mjs (Computer vs Computer Climb duels use the new table)
# Step 3  icyn-ws: engine.mjs (setup.enh2, Soul Strike name), boss.mjs (rules v5), climb.mjs, ws.mjs (Easy 75 Life, new games
#         get enh2 / v5). Games already under way keep the old table because their setup has no enh2 and Starvos stays v4.
# Rollback: aws lambda update-function-code --function-name icyn-api --zip-file fileb://backup-before-enh2\icyn-api.zip (same for icyn-ws)
$ErrorActionPreference = 'Stop'
$P = @('--profile', 'prismcortex', '--region', 'us-east-1')
$Here = $PSScriptRoot
$bk = Join-Path $Here 'backup-before-enh2'

if ($Step -eq 1) {
  New-Item -ItemType Directory -Force -Path $bk | Out-Null
  foreach ($fn in 'icyn-api', 'icyn-ws') {
    $f = Join-Path $bk "$fn.zip"
    if (-not (Test-Path $f)) {
      $url = aws lambda get-function --function-name $fn --query 'Code.Location' --output text @P
      Invoke-WebRequest -Uri $url -OutFile $f
    }
    $sha = aws lambda get-function-configuration --function-name $fn --query 'CodeSha256' --output text @P
    Write-Host "$fn live CodeSha256 $sha"
    $x = Join-Path $bk $fn; Expand-Archive -Path $f -DestinationPath $x -Force
    $same = if ($fn -eq 'icyn-api') { @('api\index.mjs', 'api\record.mjs', 'api\unlock.mjs', 'api\lobby.mjs') } else { @('ws\record.mjs') }
    foreach ($rel in $same) {
      $live = Join-Path $x (Split-Path $rel -Leaf)
      if (-not (Test-Path $live)) { Write-Warning "$fn has no $(Split-Path $rel -Leaf)"; continue }
      if ((Get-FileHash $live).Hash -ne (Get-FileHash (Join-Path $Here $rel)).Hash) { Write-Warning "$fn live $(Split-Path $rel -Leaf) differs from the repo: stop and ask before Step 2/3" }
    }
    Get-ChildItem $x | ForEach-Object { Write-Host "  live file: $($_.Name)" }
  }
  Write-Host "Step 1 done: backups in $bk"
}

if ($Step -eq 2) {
  if (-not (Test-Path (Join-Path $bk 'icyn-api.zip'))) { throw 'Run Step 1 first' }
  Compress-Archive -Path "$Here\api\index.mjs", "$Here\api\record.mjs", "$Here\api\unlock.mjs", "$Here\api\climb.mjs", "$Here\api\lobby.mjs", "$Here\ws\engine.mjs" -DestinationPath "$Here\api-enh2.zip" -Force
  aws lambda update-function-code --function-name icyn-api --zip-file "fileb://$Here\api-enh2.zip" @P | Out-Null
  aws lambda wait function-updated --function-name icyn-api @P
  Write-Host 'Step 2 done: icyn-api updated.'
}

if ($Step -eq 3) {
  if (-not (Test-Path (Join-Path $bk 'icyn-ws.zip'))) { throw 'Run Step 1 first' }
  Compress-Archive -Path "$Here\ws\ws.mjs", "$Here\ws\engine.mjs", "$Here\ws\boss.mjs", "$Here\ws\record.mjs", "$Here\ws\climb.mjs" -DestinationPath "$Here\ws-enh2.zip" -Force
  aws lambda update-function-code --function-name icyn-ws --zip-file "fileb://$Here\ws-enh2.zip" @P | Out-Null
  aws lambda wait function-updated --function-name icyn-ws @P
  Write-Host 'Step 3 done: icyn-ws updated.'
}
