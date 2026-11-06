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

## $5 Crit Pass unlock (2026-11-04)

Free: Vs Computer and Pass & Play. The unlock (one time, $5, tied to the Cognito account) opens Online duels,
the Starvos Catastrophe and the Print & Play PDFs. Developers group members always have it. Payments: the owner's Square account.

- `api/unlock.mjs` (in icyn-api): `POST /checkout` (JWT) makes a Square payment link (order metadata carries userId; the order id
  is saved on the player as `unlockOrder`); `POST /checkout/confirm` (JWT) checks that order with Square and grants at once;
  `POST /square/webhook` (public, HMAC checked) grants on a COMPLETED `payment.created`/`payment.updated`;
  `GET /pnp` (JWT, unlocked only) returns 15-minute S3 links. `GET /me` and `PUT /me` add `unlocked`.
- Stored on the `icyn-players` item as `unlock: {at, via, env, order, payment, amount, currency}` (`env: 'sandbox'` = test unlock).
  To refund: refund in Square, then remove `unlock` from that player's item.
  To gift an unlock directly (testers, early supporters): set `unlock: {at, via: 'gift'}` (or `via: 'early'`) on their item.
- Gift codes (table `icyn-gifts`, key `code` = CRIT-XXXX-XXXX): `POST /checkout {gift:true}` buys one (order metadata kind 'gift',
  saved as player `giftOrder`; minted by the webhook or `/checkout/confirm`, same order always gives the same code; the buyer's
  codes are listed in player `gifts`). `GET /gifts` lists them, `POST /gift/redeem {code}` unlocks once (refused if the
  player already has the Crit Pass, so the code stays usable). Box codes / giveaways: put `{code, via: 'box', createdAt}` items in the table.
- `ws/ws.mjs`: `create` and joining a new game need the unlock. Env `FREE_JOIN=true` lets anyone join a game an unlocked player hosts.
- Lambda env: `SQUARE_ACCESS_TOKEN`, `SQUARE_ENV` (sandbox|production), optional `SQUARE_LOCATION_ID`,
  `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL`, `PNP_BUCKET` (default icyn-premium-files).
- Square webhook subscription: URL `https://r9s8gd8duk.execute-api.us-east-1.amazonaws.com/square/webhook`, events `payment.created`, `payment.updated`.
- Deploy: `deploy-unlock.ps1 -Step 1..4`. Rollback: previous zips `function-starvos.zip` (icyn-api) and `ws-v3.zip` (icyn-ws).
