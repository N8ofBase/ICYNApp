param([Parameter(Mandatory)][int]$Step)
# Crit Pass gaps (N8 2026-11-25): refunds and lost chargebacks take the pass back (and cancel refunded gift codes),
# and the Crit Pass chapters of Project Lightbringer are handed out by the server (GET /book) instead of sitting in lightbringer.json.
# Run from the repo's backend folder on Skynet:
#   aws sso login --profile prismcortex
#   .\deploy-gaps.ps1 -Step 1   (then 2; then the Square step below; then the page goes live)
#
# Step 1  backups of today's icyn-api code (backup-before-gaps\) and a check that the files this deploy does not change match live
# Step 2  book text to s3://icyn-premium-files/book/, read permission for icyn-api, new icyn-api code (unlock.mjs, index.mjs), route GET /book
# Square  (by hand) Square Developer Dashboard > your app > Webhooks > Production subscription: add the events
#         refund.created, refund.updated, dispute.created and dispute.state.changed (keep payment.created and payment.updated)
# Then    push the new index.html, stats.js and lightbringer.json to main (lightbringer.json now holds only teasers of the Crit Pass chapters,
#         so GET /book must be live first).
# Rollback: aws lambda update-function-code --function-name icyn-api --zip-file fileb://backup-before-gaps\icyn-api.zip
$ErrorActionPreference = 'Stop'
$P = @('--profile', 'prismcortex', '--region', 'us-east-1')
$Here = $PSScriptRoot
$ApiId = 'r9s8gd8duk'
$bk = Join-Path $Here 'backup-before-gaps'

if ($Step -eq 1) {
  New-Item -ItemType Directory -Force -Path $bk | Out-Null
  $f = Join-Path $bk 'icyn-api.zip'
  if (-not (Test-Path $f)) {
    $url = aws lambda get-function --function-name icyn-api --query 'Code.Location' --output text @P
    Invoke-WebRequest -Uri $url -OutFile $f
  }
  $sha = aws lambda get-function-configuration --function-name icyn-api --query 'CodeSha256' --output text @P
  Write-Host "icyn-api live CodeSha256 $sha"
  $x = Join-Path $bk 'icyn-api'; Expand-Archive -Path $f -DestinationPath $x -Force
  foreach ($rel in 'api\record.mjs', 'api\climb.mjs', 'api\lobby.mjs', 'ws\engine.mjs') {
    $live = Join-Path $x (Split-Path $rel -Leaf)
    if (-not (Test-Path $live)) { Write-Warning "icyn-api has no $(Split-Path $rel -Leaf)"; continue }
    if ((Get-FileHash $live).Hash -ne (Get-FileHash (Join-Path $Here $rel)).Hash) { Write-Warning "live $(Split-Path $rel -Leaf) differs from the repo: stop and ask before Step 2" }
  }
  Write-Host "Step 1 done: backup in $bk"
}

if ($Step -eq 2) {
  if (-not (Test-Path (Join-Path $bk 'icyn-api.zip'))) { throw 'Run Step 1 first' }
  aws s3 cp "$Here\book\lightbringer-paid.json" 's3://icyn-premium-files/book/lightbringer-paid.json' --content-type 'application/json; charset=utf-8' @P
  aws iam put-role-policy --role-name icyn-api-lambda --policy-name icyn-api-book --policy-document "file://$Here\iam\book-policy.json" @P
  Compress-Archive -Path "$Here\api\index.mjs", "$Here\api\record.mjs", "$Here\api\unlock.mjs", "$Here\api\climb.mjs", "$Here\api\lobby.mjs", "$Here\ws\engine.mjs" -DestinationPath "$Here\api-gaps.zip" -Force
  aws lambda update-function-code --function-name icyn-api --zip-file "fileb://$Here\api-gaps.zip" @P | Out-Null
  aws lambda wait function-updated --function-name icyn-api @P
  $me = aws apigatewayv2 get-routes --api-id $ApiId --query "Items[?RouteKey=='GET /me'] | [0]" --output json @P | ConvertFrom-Json
  $have = aws apigatewayv2 get-routes --api-id $ApiId --query 'Items[].RouteKey' --output json @P | ConvertFrom-Json
  if ($have -notcontains 'GET /book') {
    aws apigatewayv2 create-route --api-id $ApiId --route-key 'GET /book' --target $me.Target --authorization-type JWT --authorizer-id $me.AuthorizerId @P | Out-Null
  }
  Write-Host 'Step 2 done: book uploaded, icyn-api updated, GET /book route ready. Now add the refund and dispute events to the Square webhook.'
}
