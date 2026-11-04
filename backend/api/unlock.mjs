// The $5 Crit Pass unlock: Online duels, Starvos Catastrophe and the Print & Play files.
// Free forever: Vs Computer and Pass & Play duels.
//
// Payment runs through Square (the owner's existing account) with an online payment link.
// Plain HTTPS + HMAC, no Square SDK. The unlock is stored on the player's icyn-players item as
// `unlock` and tied to their Cognito account (sub), so it follows them to every device.
//
// Lambda environment:
//   SQUARE_ACCESS_TOKEN           access token from the Square Developer Dashboard (sandbox or production)
//   SQUARE_ENV                    'sandbox' while testing, 'production' to take real money (default production)
//   SQUARE_LOCATION_ID            optional; without it the first active location is used
//   SQUARE_WEBHOOK_SIGNATURE_KEY  signature key of the webhook subscription
//   SQUARE_WEBHOOK_URL            the exact notification URL of that subscription (part of the signature)
//   PNP_BUCKET                    private S3 bucket holding the Print & Play PDFs (default icyn-premium-files)
//
// Routes (added to the icyn-api HTTP API):
//   POST /checkout           (JWT)    -> {url} to Square checkout, or {unlocked:true} if already owned
//   POST /checkout/confirm   (JWT)    -> {unlocked}; checks the player's last checkout with Square (webhook backup)
//   POST /square/webhook     (public) Square payment events, signature checked
//   GET  /pnp                (JWT)    -> {files:[{name, url}]} short-lived download links, unlocked players only
import crypto from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db, PLAYERS, defaultName } from './record.mjs';

const SITE = 'https://icyn.prismcortex.net';
const ORIGINS = new Set([SITE, 'http://localhost:8080', 'https://main.d3sn70u0fdzdgl.amplifyapp.com']);
const PRICE_CENTS = 500;
const BUCKET = process.env.PNP_BUCKET || 'icyn-premium-files';
const REGION = process.env.AWS_REGION || 'us-east-1';
export const PNP_FILES = [
  { key: 'print-and-play/ICYN-Print-and-Play-Rulebook.pdf', name: 'Print & Play Rulebook' },
  { key: 'print-and-play/ICYN-Hero-and-Starvos-Sheets.pdf', name: 'Hero and Starvos Sheets' },
];

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export function isDeveloper(claims) {
  const g = claims?.['cognito:groups'];
  const list = Array.isArray(g) ? g : String(g || '').replace(/^\[|\]$/g, '').split(/[\s,]+/);
  return list.includes('developers');
}
export const hasUnlock = (player, claims) => !!(player && player.unlock) || isDeveloper(claims);

// ---------- Square REST ----------
const SQ_VERSION = process.env.SQUARE_VERSION || '2024-10-17';
const sqBase = () => (process.env.SQUARE_ENV === 'sandbox' ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com');
async function square(method, path, body) {
  const key = process.env.SQUARE_ACCESS_TOKEN;
  if (!key) throw new Error('SQUARE_ACCESS_TOKEN is not set');
  const res = await fetch(sqBase() + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Square-Version': SQ_VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Square ${res.status}: ${data?.errors?.[0]?.detail || 'error'}`);
  return data;
}
let locationId = process.env.SQUARE_LOCATION_ID || null;
async function location() {
  if (locationId) return locationId;
  const r = await square('GET', '/v2/locations');
  const loc = (r.locations || []).find((l) => l.status === 'ACTIVE' && (l.capabilities || []).includes('CREDIT_CARD_PROCESSING'))
    || (r.locations || []).find((l) => l.status === 'ACTIVE');
  if (!loc) throw new Error('No active Square location');
  return (locationId = loc.id);
}

// Make sure a full player record exists (same seeds as PUT /me) so stats code never sees a half item.
const SEED_COUNTERS = ['wins', 'losses', 'draws', 'played', 'kos', 'currentStreak', 'bestWinStreak', 'worstLossStreak', 'version'];
function seedParts(name) {
  const sets = ['#n = if_not_exists(#n, :dn)', 'heroCounts = if_not_exists(heroCounts, :empty)', 'prefs = if_not_exists(prefs, :empty)'];
  for (const k of SEED_COUNTERS) sets.push(`${k} = if_not_exists(${k}, :zero)`);
  return { sets, names: { '#n': 'name' }, vals: { ':dn': name, ':zero': 0, ':empty': {} } };
}
async function update(userId, sets, names, vals) {
  await db.send(new UpdateCommand({
    TableName: PLAYERS, Key: { userId }, UpdateExpression: 'SET ' + sets.join(', '),
    ExpressionAttributeNames: names, ExpressionAttributeValues: vals,
  }));
}

async function grant(userId, orderId, payment) {
  const { sets, names, vals } = seedParts('Adventurer');
  sets.push('#u = if_not_exists(#u, :u)');
  names['#u'] = 'unlock';
  vals[':u'] = {
    at: new Date().toISOString(), via: 'square', env: process.env.SQUARE_ENV === 'sandbox' ? 'sandbox' : 'production',
    order: orderId, payment: payment.id, amount: payment.amount_money?.amount ?? null, currency: payment.amount_money?.currency || null,
  };
  await update(userId, sets, names, vals);
}

// An order is paid when one of its tenders is a COMPLETED payment. Returns {userId, payment} or null.
async function paidOrder(orderId) {
  const { order } = await square('GET', '/v2/orders/' + encodeURIComponent(orderId));
  const userId = order?.metadata?.userId;
  if (!userId || order?.metadata?.product !== 'full-arena') return null;
  for (const t of order.tenders || []) {
    const { payment } = await square('GET', '/v2/payments/' + encodeURIComponent(t.payment_id || t.id));
    if (payment && payment.status === 'COMPLETED') return { userId, payment };
  }
  return null;
}

// ---------- Routes ----------
export async function checkout(userId, claims, player, event) {
  if (hasUnlock(player, claims)) return json(200, { unlocked: true });
  const origin = event.headers?.origin;
  const base = ORIGINS.has(origin) ? origin : SITE;
  const loc = await location();
  const r = await square('POST', '/v2/online-checkout/payment-links', {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: loc,
      reference_id: userId.slice(0, 40),
      metadata: { userId, product: 'full-arena' },
      line_items: [{
        name: 'I Crit You Not! Crit Pass', quantity: '1',
        note: 'One-time unlock: Online duels, the Starvos Catastrophe, and the Print & Play rulebook and sheets.',
        base_price_money: { amount: PRICE_CENTS, currency: 'USD' },
      }],
    },
    checkout_options: { redirect_url: `${base}/?unlock=done`, ask_for_shipping_address: false },
    pre_populated_data: claims.email ? { buyer_email: claims.email } : undefined,
    payment_note: `ICYN Crit Pass for ${userId}`,
  });
  const link = r.payment_link;
  // Remember the order so /checkout/confirm can check it when the player comes back.
  const { sets, names, vals } = seedParts(defaultName(claims));
  sets.push('unlockOrder = :o'); vals[':o'] = link.order_id;
  await update(userId, sets, names, vals);
  return json(200, { url: link.url });
}

// The browser lands back on ?unlock=done; ask Square about this player's last checkout so the
// unlock shows at once even if the webhook is slow or missing.
export async function confirm(userId, claims, player) {
  if (hasUnlock(player, claims)) return json(200, { unlocked: true });
  if (!player?.unlockOrder) return json(200, { unlocked: false });
  const paid = await paidOrder(player.unlockOrder);
  if (!paid || paid.userId !== userId) return json(200, { unlocked: false });
  await grant(userId, player.unlockOrder, paid.payment);
  return json(200, { unlocked: true });
}

// x-square-hmacsha256-signature = base64(HMAC-SHA256(signatureKey, notificationUrl + rawBody))
export function verifySquare(raw, header, key, url) {
  if (!key || !header || !url) return false;
  const want = crypto.createHmac('sha256', key).update(url + raw).digest();
  const got = Buffer.from(String(header), 'base64');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export async function webhook(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  const sig = event.headers?.['x-square-hmacsha256-signature'];
  if (!verifySquare(raw, sig, process.env.SQUARE_WEBHOOK_SIGNATURE_KEY, process.env.SQUARE_WEBHOOK_URL)) return json(403, { error: 'bad signature' });
  const evt = JSON.parse(raw);
  const payment = evt?.data?.object?.payment;
  if (['payment.created', 'payment.updated'].includes(evt.type) && payment?.status === 'COMPLETED' && payment.order_id) {
    const paid = await paidOrder(payment.order_id);
    if (paid) await grant(paid.userId, payment.order_id, paid.payment);
  }
  return json(200, { received: true });
}

// ---------- Print & Play downloads (S3 presigned GET, SigV4 by hand: no extra packages) ----------
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function presign({ bucket, key, region, expires = 900, query = {}, creds, now = new Date(), host = `${bucket}.s3.${region}.amazonaws.com` }) {
  const amz = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amz.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const q = {
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${creds.accessKeyId}/${scope}`,
    'X-Amz-Date': amz, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host',
    ...(creds.sessionToken ? { 'X-Amz-Security-Token': creds.sessionToken } : {}),
  };
  const qs = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const path = '/' + key.split('/').map(enc).join('/');
  const canon = ['GET', path, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n');
  let k = hmac('AWS4' + creds.secretAccessKey, day);
  for (const part of [region, 's3', 'aws4_request']) k = hmac(k, part);
  return `https://${host}${path}?${qs}&X-Amz-Signature=${hmac(k, toSign).toString('hex')}`;
}

export function pnp(claims, player) {
  if (!hasUnlock(player, claims)) return json(403, { error: 'unlock required' });
  const creds = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };
  const files = PNP_FILES.map((f) => ({
    name: f.name,
    url: presign({
      bucket: BUCKET, key: f.key, region: REGION, creds,
      query: { 'response-content-disposition': `attachment; filename="${f.key.split('/').pop()}"` },
    }),
  }));
  return json(200, { files });
}
