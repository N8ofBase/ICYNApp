# Deploys the $5 Full Arena unlock backend. Run from the backend folder on Skynet:
#   cd C:\Users\n8gr8\Documents\ICYN\backend-unlock
#   aws sso login --profile prismcortex
#   .\deploy-unlock.ps1 -Step 1   (then 2, 3, 4 in order; each step is safe to re-run)
#
# Step 1  S3: private bucket icyn-premium-files + the two Print & Play PDFs
# Step 2  icyn-api: S3 read permission, new code, Square keys, new routes
# Step 3  icyn-ws: new code (online play needs the unlock). Run this only when the new index.html goes live.
# Step 4  check: lists the routes and env var names (never prints the keys)
param([Parameter(Mandatory)][int]$Step)
$ErrorActionPreference = 'Stop'
$P = @('--profile', 'prismcortex', '--region', 'us-east-1')
$Bucket = 'icyn-premium-files'
$ApiId = 'r9s8gd8duk'
$Here = $PSScriptRoot

if ($Step -eq 1) {
  aws s3api create-bucket --bucket $Bucket @P 2>$null
  aws s3api put-public-access-block --bucket $Bucket --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true @P
  aws s3 cp "$Here\files\ICYN-Print-and-Play-Rulebook.pdf" "s3://$Bucket/print-and-play/ICYN-Print-and-Play-Rulebook.pdf" --content-type application/pdf @P
  aws s3 cp "$Here\files\ICYN-Hero-and-Starvos-Sheets.pdf" "s3://$Bucket/print-and-play/ICYN-Hero-and-Starvos-Sheets.pdf" --content-type application/pdf @P
  Write-Host 'Step 1 done: bucket is private, PDFs uploaded.'
}

if ($Step -eq 2) {
  aws iam put-role-policy --role-name icyn-api-lambda --policy-name icyn-api --policy-document "file://$Here\iam\policy.json" @P
  Compress-Archive -Path "$Here\api\index.mjs", "$Here\api\record.mjs", "$Here\api\unlock.mjs" -DestinationPath "$Here\api-unlock.zip" -Force
  aws lambda update-function-code --function-name icyn-api --zip-file "fileb://$Here\api-unlock.zip" @P | Out-Null
  aws lambda wait function-updated --function-name icyn-api @P

  # Square keys go straight into the Lambda; they are never saved in a file.
  $envName = Read-Host 'Square environment: sandbox (testing) or production (real money)'
  $tok = Read-Host 'Square access token for that environment'
  $sig = Read-Host 'Square webhook signature key (from the webhook subscription)'
  $cur = aws lambda get-function-configuration --function-name icyn-api --query 'Environment.Variables' --output json @P | ConvertFrom-Json
  $vars = @{}; if ($cur) { $cur.PSObject.Properties | ForEach-Object { $vars[$_.Name] = $_.Value } }
  $vars['SQUARE_ENV'] = $envName.Trim(); $vars['SQUARE_ACCESS_TOKEN'] = $tok.Trim(); $vars['SQUARE_WEBHOOK_SIGNATURE_KEY'] = $sig.Trim()
  $vars['SQUARE_WEBHOOK_URL'] = 'https://r9s8gd8duk.execute-api.us-east-1.amazonaws.com/square/webhook'; $vars['PNP_BUCKET'] = $Bucket
  $envFile = New-TemporaryFile
  @{ Variables = $vars } | ConvertTo-Json -Compress | Set-Content -Path $envFile -Encoding ascii
  aws lambda update-function-configuration --function-name icyn-api --environment "file://$envFile" @P | Out-Null
  Remove-Item $envFile

  # Reuse the integration and JWT authorizer the existing GET /me route uses.
  $me = aws apigatewayv2 get-routes --api-id $ApiId --query "Items[?RouteKey=='GET /me'] | [0]" --output json @P | ConvertFrom-Json
  $have = aws apigatewayv2 get-routes --api-id $ApiId --query 'Items[].RouteKey' --output json @P | ConvertFrom-Json
  foreach ($rk in 'POST /checkout', 'POST /checkout/confirm', 'GET /pnp') {
    if ($have -notcontains $rk) {
      aws apigatewayv2 create-route --api-id $ApiId --route-key $rk --target $me.Target --authorization-type JWT --authorizer-id $me.AuthorizerId @P | Out-Null
    }
  }
  if ($have -notcontains 'POST /square/webhook') {
    aws apigatewayv2 create-route --api-id $ApiId --route-key 'POST /square/webhook' --target $me.Target @P | Out-Null
  }
  Write-Host 'Step 2 done. Square webhook URL: https://r9s8gd8duk.execute-api.us-east-1.amazonaws.com/square/webhook'
}

if ($Step -eq 3) {
  Compress-Archive -Path "$Here\ws\ws.mjs", "$Here\ws\engine.mjs", "$Here\ws\boss.mjs", "$Here\ws\record.mjs" -DestinationPath "$Here\ws-unlock.zip" -Force
  aws lambda update-function-code --function-name icyn-ws --zip-file "fileb://$Here\ws-unlock.zip" @P | Out-Null
  Write-Host 'Step 3 done: online games now need the unlock (developers group always has it).'
}

if ($Step -eq 4) {
  aws apigatewayv2 get-routes --api-id $ApiId --query 'Items[].[RouteKey,AuthorizationType]' --output table @P
  aws lambda get-function-configuration --function-name icyn-api --query 'keys(Environment.Variables)' @P
}
