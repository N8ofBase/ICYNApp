param([Parameter(Mandatory)][int]$Step)
# Deploys Crit Climb tournaments (2026-11-10). Run from the repo's backend folder on Skynet:
#   aws sso login --profile prismcortex
#   .\deploy-climb.ps1 -Step 1   (then 2, then 3; each step is safe to re-run)
#
# Step 1  backups of today's icyn-api and icyn-ws code (backup-before-climb\), DynamoDB table icyn-climbs,
#         and an extra inline policy 'icyn-climb' on both Lambda roles (the existing policies are left alone)
# Step 2  icyn-api: new code (climb.mjs) + routes GET /climbs, GET /climbs/{id}, POST /climbs[...]. Harmless to the live page.
# Step 3  icyn-ws: new code (the 'climb' action). Also harmless to the live page; the page change goes live separately.
# Step 4  check: lists the routes and the table
# Rollback: aws lambda update-function-code --function-name icyn-api --zip-file fileb://backup-before-climb\icyn-api.zip (same for icyn-ws)
$ErrorActionPreference = 'Stop'
$P = @('--profile', 'prismcortex', '--region', 'us-east-1')
$ApiId = 'r9s8gd8duk'
$WsId = 'xv92tk4nd2'
$Here = $PSScriptRoot
$Acct = '376998045836'

function RoleOf($fn) { (aws lambda get-function-configuration --function-name $fn --query 'Role' --output text @P).Split('/')[-1] }

if ($Step -eq 1) {
  $bk = Join-Path $Here 'backup-before-climb'
  New-Item -ItemType Directory -Force -Path $bk | Out-Null
  foreach ($fn in 'icyn-api', 'icyn-ws') {
    $f = Join-Path $bk "$fn.zip"
    if (-not (Test-Path $f)) {
      $url = aws lambda get-function --function-name $fn --query 'Code.Location' --output text @P
      Invoke-WebRequest -Uri $url -OutFile $f
    }
  }
  $t = aws dynamodb list-tables --query "TableNames[?@=='icyn-climbs']" --output text @P
  if (-not $t) {
    aws dynamodb create-table --table-name icyn-climbs --attribute-definitions AttributeName=id,AttributeType=S --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST @P | Out-Null
    aws dynamodb wait table-exists --table-name icyn-climbs @P
    aws dynamodb update-continuous-backups --table-name icyn-climbs --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true @P | Out-Null
  }
  $policy = @{ Version = '2012-10-17'; Statement = @(
    @{ Effect = 'Allow'; Action = @('dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Scan'); Resource = "arn:aws:dynamodb:us-east-1:${Acct}:table/icyn-climbs" },
    @{ Effect = 'Allow'; Action = @('dynamodb:UpdateItem'); Resource = "arn:aws:dynamodb:us-east-1:${Acct}:table/icyn-players" }
  ) } | ConvertTo-Json -Depth 5 -Compress
  $pf = New-TemporaryFile; [IO.File]::WriteAllText($pf.FullName, $policy)
  foreach ($fn in 'icyn-api', 'icyn-ws') { aws iam put-role-policy --role-name (RoleOf $fn) --policy-name icyn-climb --policy-document "file://$pf" @P }
  Remove-Item $pf
  Write-Host "Step 1 done: backups in $bk, table icyn-climbs ready, both Lambdas may use it."
}

if ($Step -eq 2) {
  Compress-Archive -Path "$Here\api\index.mjs", "$Here\api\record.mjs", "$Here\api\unlock.mjs", "$Here\api\climb.mjs" -DestinationPath "$Here\api-climb.zip" -Force
  aws lambda update-function-code --function-name icyn-api --zip-file "fileb://$Here\api-climb.zip" @P | Out-Null
  aws lambda wait function-updated --function-name icyn-api @P
  $me = aws apigatewayv2 get-routes --api-id $ApiId --query "Items[?RouteKey=='GET /me'] | [0]" --output json @P | ConvertFrom-Json
  $have = aws apigatewayv2 get-routes --api-id $ApiId --query 'Items[].RouteKey' --output json @P | ConvertFrom-Json
  foreach ($rk in 'GET /climbs', 'GET /climbs/{id}') {
    if ($have -notcontains $rk) { aws apigatewayv2 create-route --api-id $ApiId --route-key $rk --target $me.Target @P | Out-Null }
  }
  foreach ($rk in 'POST /climbs', 'POST /climbs/{id}/join', 'POST /climbs/{id}/leave', 'POST /climbs/{id}/start', 'POST /climbs/{id}/cancel', 'POST /climbs/{id}/decide') {
    if ($have -notcontains $rk) { aws apigatewayv2 create-route --api-id $ApiId --route-key $rk --target $me.Target --authorization-type JWT --authorizer-id $me.AuthorizerId @P | Out-Null }
  }
  Write-Host 'Step 2 done: icyn-api has the Crit Climb routes.'
}

if ($Step -eq 3) {
  Compress-Archive -Path "$Here\ws\ws.mjs", "$Here\ws\engine.mjs", "$Here\ws\boss.mjs", "$Here\ws\record.mjs", "$Here\ws\climb.mjs" -DestinationPath "$Here\ws-climb.zip" -Force
  aws lambda update-function-code --function-name icyn-ws --zip-file "fileb://$Here\ws-climb.zip" @P | Out-Null
  aws lambda wait function-updated --function-name icyn-ws @P
  # The WebSocket API picks a route by action; add 'climb' unless a $default route already catches everything.
  $have = aws apigatewayv2 get-routes --api-id $WsId --query 'Items[].RouteKey' --output json @P | ConvertFrom-Json
  if ($have -notcontains '$default' -and $have -notcontains 'climb') {
    $join = aws apigatewayv2 get-routes --api-id $WsId --query "Items[?RouteKey=='join'] | [0]" --output json @P | ConvertFrom-Json
    aws apigatewayv2 create-route --api-id $WsId --route-key climb --target $join.Target @P | Out-Null
    aws apigatewayv2 create-deployment --api-id $WsId --stage-name prod @P | Out-Null
  }
  Write-Host 'Step 3 done: icyn-ws plays Crit Climb matches.'
}

if ($Step -eq 4) {
  aws apigatewayv2 get-routes --api-id $ApiId --query "Items[?contains(RouteKey,'climbs')].[RouteKey,AuthorizationType]" --output table @P
  aws apigatewayv2 get-routes --api-id $WsId --query 'Items[].RouteKey' @P
  aws dynamodb describe-table --table-name icyn-climbs --query 'Table.[TableName,TableStatus,ItemCount]' @P
}
