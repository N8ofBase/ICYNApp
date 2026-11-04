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

## $5 Full Arena unlock (2026-11-04)

Free: Vs Computer and Pass & Play. The unlock (one time, $5, tied to the Cognito account) opens Online duels,
the Starvos Catastrophe and the Print & Play PDFs. Developers group members always have it.

- `api/unlock.mjs` (in icyn-api): `POST /checkout` (JWT) makes a Stripe Checkout session; `POST /checkout/confirm` (JWT)
  asks Stripe about a returning session and grants at once; `POST /stripe/webhook` (public, signature checked) grants on
  `checkout.session.completed`; `GET /pnp` (JWT, unlocked only) returns 15-minute S3 links. `GET /me` and `PUT /me` add `unlocked`.
- Stored on the `icyn-players` item as `unlock: {at, via, session, amount, currency, paymentIntent}`.
  To refund: refund in Stripe, then remove `unlock` from that player's item.
  To gift an unlock (box codes, testers): set `unlock: {at, via: 'gift'}` on their item, or use a 100% off Stripe promotion code.
- `ws/ws.mjs`: `create` and joining a new game need the unlock. Env `FREE_JOIN=true` lets anyone join a game an unlocked player hosts.
- Lambda env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_PRICE_ID`, `PNP_BUCKET` (default icyn-premium-files).
- Stripe webhook endpoint: `https://r9s8gd8duk.execute-api.us-east-1.amazonaws.com/stripe/webhook`, events
  `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- Deploy: `deploy-unlock.ps1 -Step 1..4`. Rollback: previous zips `function-starvos.zip` (icyn-api) and `ws-v3.zip` (icyn-ws).
