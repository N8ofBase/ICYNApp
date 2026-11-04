// The $5 Full Arena unlock: Online duels, Starvos Catastrophe and the Print & Play files.
// Free forever: Vs Computer and Pass & Play duels.
//
// Payment runs through Stripe Checkout (no Stripe SDK; plain HTTPS + HMAC).
// The unlock is stored on the player's icyn-players item as `unlock` and tied to
// their Cognito account (sub), so it follows them to every device.
//
// Lambda environment:
//   STRIPE_SECRET_KEY      sk_live_... (or sk_test_... while testing)
//   STRIPE_WEBHOOK_SECRET  whsec_... from the Stripe webhook endpoint
//   STRIPE_PRICE_ID        optional price_...; without it the session uses an inline $5.00 USD price
//   PNP_BUCKET             private S3 bucket holding the Print & Play PDFs (default icyn-premium-files)
//
// Routes (added to the icyn-api HTTP API):
//   POST /checkout           (JWT)    -> {url} to Stripe Checkout, or {unlocked:true} if already owned
//   POST /checkout/confirm   (JWT)    {sessionId} -> {unlocked}; grants at once if Stripe says paid (webhook backup)
//   POST /stripe/webhook     (public) Stripe events, signature checked
//   GET  /pnp                (JWT)    -> {files:[{name, url}]} short-lived download links, unlocked players only
import crypto from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { db, PLAYERS, defaultName } from './record.mjs';

const STRIPE = 'https://api.stripe.com/v1';
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

// ---------- Stripe REST ----------
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(method, path, body) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const res = await fetch(STRIPE + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body ? form(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data?.error?.message || 'error'}`);
  return data;
}

// Make sure a full player record exists (same seeds as PUT /me) so stats code never sees a half item.
const SEED_COUNTERS = ['wins', 'losses', 'draws', 'played', 'kos', 'currentStreak', 'bestWinStreak', 'worstLossStreak', 'version'];
function seedParts(name) {
  const sets = ['#n = if_not_exists(#n, :dn)', 'heroCounts = if_not_exists(heroCounts, :empty)', 'prefs = if_not_exists(prefs, :empty)'];
  for (const k of SEED_COUNTERS) sets.push(`${k} = if_not_exists(${k}, :zero)`);
  return { sets, names: { '#n': 'name' }, vals: { ':dn': name, ':zero': 0, ':empty': {} } };
}

async function grant(userId, session) {
  const { sets, names, vals } = seedParts('Adventurer');
  sets.push('#u = if_not_exists(#u, :u)');
  names['#u'] = 'unlock';
  vals[':u'] = {
    at: new Date().toISOString(), via: 'stripe', session: session.id,
    amount: session.amount_total ?? null, currency: session.currency || null,
    paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
  };
  await db.send(new UpdateCommand({
    TableName: PLAYERS, Key: { userId }, UpdateExpression: 'SET ' + sets.join(', '),
    ExpressionAttributeNames: names, ExpressionAttributeValues: vals,
  }));
}

const paid = (s) => s && s.status === 'complete' && (s.payment_status === 'paid' || s.payment_status === 'no_payment_required');

// ---------- Routes ----------
export async function checkout(userId, claims, player, event) {
  if (hasUnlock(player, claims)) return json(200, { unlocked: true });
  const origin = event.headers?.origin;
  const base = ORIGINS.has(origin) ? origin : SITE;
  const { sets, names, vals } = seedParts(defaultName(claims));
  await db.send(new UpdateCommand({
    TableName: PLAYERS, Key: { userId }, UpdateExpression: 'SET ' + sets.join(', '),
    ExpressionAttributeNames: names, ExpressionAttributeValues: vals,
  }));
  const line = process.env.STRIPE_PRICE_ID
    ? { price: process.env.STRIPE_PRICE_ID, quantity: 1 }
    : {
      quantity: 1,
      price_data: {
        currency: 'usd', unit_amount: PRICE_CENTS,
        product_data: {
          name: 'I Crit You Not! Full Arena',
          description: 'One-time unlock: Online duels, the Starvos Catastrophe, and the Print & Play rulebook and sheets.',
        },
      },
    };
  const s = await stripe('POST', '/checkout/sessions', {
    mode: 'payment',
    line_items: { 0: line },
    client_reference_id: userId,
    metadata: { userId, product: 'full-arena' },
    payment_intent_data: { metadata: { userId, product: 'full-arena' } },
    customer_email: claims.email || undefined,
    allow_promotion_codes: 'true',
    success_url: `${base}/?unlock=done&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?unlock=cancel`,
  });
  return json(200, { url: s.url });
}

// The browser lands back with ?session_id=...; ask Stripe directly so the unlock shows at once
// even if the webhook is slow or missing.
export async function confirm(userId, claims, player, body) {
  if (hasUnlock(player, claims)) return json(200, { unlocked: true });
  const id = String(body.sessionId || '');
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) return json(400, { error: 'sessionId required' });
  const s = await stripe('GET', '/checkout/sessions/' + encodeURIComponent(id));
  if (s.client_reference_id !== userId) return json(403, { error: 'that checkout belongs to another account' });
  if (!paid(s)) return json(200, { unlocked: false, status: s.status, payment: s.payment_status });
  await grant(userId, s);
  return json(200, { unlocked: true });
}

// Stripe-Signature: t=<unix>,v1=<hex hmac of "t.rawBody">
export function verifyStripe(raw, header, secret, now = Date.now()) {
  if (!secret || !header) return false;
  const parts = String(header).split(',').map((p) => p.split('='));
  const t = Number((parts.find(([k]) => k === 't') || [])[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  });
}

export async function webhook(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  const sig = event.headers?.['stripe-signature'];
  if (!verifyStripe(raw, sig, process.env.STRIPE_WEBHOOK_SECRET)) return json(400, { error: 'bad signature' });
  const evt = JSON.parse(raw);
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(evt.type)) {
    const s = evt.data.object;
    const userId = s.client_reference_id || s.metadata?.userId;
    if (userId && paid(s)) await grant(userId, s);
    else console.log('checkout not granted', s.id, s.payment_status);
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
