# ICYN backend (AWS, us-east-1, profile `prismcortex`)

HTTP API `icyn-api` (r9s8gd8duk): https://r9s8gd8duk.execute-api.us-east-1.amazonaws.com
Cognito pool icyn-players (`us-east-1_slqC7oLPd`), JWT authorizer `cognito-icyn` (x7hxgf).

| Lambda | Source | Role | Routes |
|---|---|---|---|
| icyn-api | `index.mjs`, `record.mjs` | icyn-api-lambda (`iam/policy.json`) | GET /leaderboard (public); GET/PUT /me, GET/POST /matches (JWT) |
| icyn-ws | `ws/` | `iam/ws-policy.json` | online duel WebSocket API (`wsapi.id`) |
| icyn-feedback | `feedback/index.mjs` | icyn-feedback-lambda (`iam/feedback-policy.json`) | POST /feedback (public); GET /feedback, PATCH /feedback/{id} (JWT + `developers` group) |

## Feedback

- Table `icyn-feedback` (on-demand): key `id`; GSI `byDate` (`kind`, `createdAt`).
- `POST /feedback` body: `{kind: 'bug'|'idea'|'other', message (1-2000), contact? (email ≤200), context?: {mode, screen, round, heroes, version, ua, url, w, h}, hp?}`.
  A non-empty `hp` (honeypot) returns 200 and stores nothing. An optional `Authorization: Bearer <ID token>` is verified in the Lambda and adds `userId` and `name`.
  Stores `{id, createdAt, kind, message, contact, context, userId?, name?, status: 'new'}`, emails n8gr8@prismcortex.net via SES (Reply-To = contact), returns `{ok:true, id}`.
  Throttled on the `$default` stage: 2 req/s, burst 5.
- `GET /feedback?status=new|all&limit=50` — newest first (queries each kind on `byDate` and merges).
- `PATCH /feedback/{id}` body `{status: 'new'|'seen'|'done'}`.
- Developer routes return 403 unless the ID token's `cognito:groups` includes `developers`.

## Deploying the feedback Lambda

```powershell
cd backend/feedback
Compress-Archive -Path index.mjs -DestinationPath ../feedback.zip -Force
aws lambda update-function-code --function-name icyn-feedback --zip-file fileb://../feedback.zip --profile prismcortex --region us-east-1
```
