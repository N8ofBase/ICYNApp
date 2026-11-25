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
//   POST /checkout {gift:true}        buys a gift: a one-use code (CRIT-XXXX-XXXX) for someone else
//   GET  /gifts              (JWT)    -> {gifts:[{code, createdAt, redeemed}]} codes this player bought
//   POST /gift/redeem        (JWT)    {code} -> {unlocked:true}; one use per code
//   POST /gifts/promo        (JWT, developers) {count 1-50, note?, via?} -> {codes} free promo codes for the owner to hand out
//   GET  /book               (JWT)    -> {chapters:{index: html}} the Crit Pass chapters of Project Lightbringer
//
// Refunds and lost chargebacks (2026-11-25): when Square reports a payment fully refunded (refund.* events) or a
// dispute lost (dispute.* events), the Crit Pass bought with it is taken back. For a gift, the code is cancelled,
// and if someone already used it, their pass is taken back too. A partial refund keeps the pass.
// The Square webhook subscription must include refund.created, refund.updated and the dispute events.
// Gift codes live in the icyn-gifts table (key `code`). Box codes and giveaways are the same items
// with via:'box' or via:'giveaway' and no order.
import crypto from 'node:crypto';
import { UpdateCommand, GetCommand, PutCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { db, PLAYERS, defaultName } from './record.mjs';

const SITE = 'https://icyn.prismcortex.net';
const ORIGINS = new Set([SITE, 'http://localhost:8080', 'https://main.d3sn70u0fdzdgl.amplifyapp.com']);
const PRICE_CENTS = 500;
const GIFTS = process.env.GIFTS_TABLE || 'icyn-gifts';
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

// Money that came back to the buyer: a full refund, or a chargeback the seller lost.
const fullyRefunded = (p) => (p?.refunded_money?.amount || 0) >= (p?.amount_money?.amount || 1);

// An order is paid when one of its tenders is a COMPLETED payment that was not refunded. Returns {userId, payment} or null.
async function paidOrder(orderId) {
  const { order } = await square('GET', '/v2/orders/' + encodeURIComponent(orderId));
  const userId = order?.metadata?.userId;
  if (!userId || order?.metadata?.product !== 'full-arena') return null;
  for (const t of order.tenders || []) {
    const { payment } = await square('GET', '/v2/payments/' + encodeURIComponent(t.payment_id || t.id));
    if (payment && payment.status === 'COMPLETED' && !fullyRefunded(payment)) return { userId, payment, gift: order.metadata.kind === 'gift' };
  }
  return null;
}

// ---------- Gift codes ----------
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const fmtCode = (chars) => `CRIT-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
// Same order -> same code, so the webhook and the return page can both mint it safely.
const orderCode = (orderId) => fmtCode(Array.from(crypto.createHash('sha256').update('icyn-gift:' + orderId).digest().subarray(0, 8), (b) => CODE_ABC[b % 31]).join(''));
export const randomCode = () => fmtCode(Array.from(crypto.randomBytes(8), (b) => CODE_ABC[b % 31]).join(''));
export function cleanCode(s) {
  const c = String(s || '').toUpperCase().replace(/^CRIT/, '').replace(/[^A-Z0-9]/g, '');
  return c.length === 8 && [...c].every((x) => CODE_ABC.includes(x)) ? fmtCode(c) : null;
}
async function mintGift(buyer, orderId, payment) {
  const code = orderCode(orderId);
  try {
    await db.send(new PutCommand({
      TableName: GIFTS, ConditionExpression: 'attribute_not_exists(code)',
      Item: { code, buyer, via: 'square', order: orderId, payment: payment.id, env: process.env.SQUARE_ENV === 'sandbox' ? 'sandbox' : 'production', createdAt: new Date().toISOString() },
    }));
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return code; // already minted
    throw e;
  }
  await db.send(new UpdateCommand({
    TableName: PLAYERS, Key: { userId: buyer },
    UpdateExpression: 'SET gifts = list_append(if_not_exists(gifts, :e), :c) REMOVE giftOrder',
    ExpressionAttributeValues: { ':e': [], ':c': [code] },
  }));
  return code;
}

// ---------- Routes ----------
export async function checkout(userId, claims, player, event, body = {}) {
  const gift = body.gift === true;
  if (!gift && hasUnlock(player, claims)) return json(200, { unlocked: true });
  const origin = event.headers?.origin;
  const base = ORIGINS.has(origin) ? origin : SITE;
  const loc = await location();
  const r = await square('POST', '/v2/online-checkout/payment-links', {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: loc,
      reference_id: userId.slice(0, 40),
      metadata: { userId, product: 'full-arena', kind: gift ? 'gift' : 'self' },
      line_items: [{
        name: gift ? 'I Crit You Not! Crit Pass (gift)' : 'I Crit You Not! Crit Pass', quantity: '1',
        note: 'One-time unlock: Online duels, the Starvos Catastrophe, and the Print & Play rulebook and sheets.',
        base_price_money: { amount: PRICE_CENTS, currency: 'USD' },
      }],
    },
    checkout_options: { redirect_url: `${base}/?unlock=${gift ? 'gift' : 'done'}`, ask_for_shipping_address: false },
    pre_populated_data: claims.email ? { buyer_email: claims.email } : undefined,
    payment_note: `ICYN Crit Pass${gift ? ' gift' : ''} for ${userId}`,
  });
  const link = r.payment_link;
  // Remember the order so /checkout/confirm can check it when the player comes back.
  const { sets, names, vals } = seedParts(defaultName(claims));
  sets.push(`${gift ? 'giftOrder' : 'unlockOrder'} = :o`); vals[':o'] = link.order_id;
  await update(userId, sets, names, vals);
  return json(200, { url: link.url });
}

// The browser lands back on ?unlock=done; ask Square about this player's last checkout so the
// unlock shows at once even if the webhook is slow or missing.
export async function confirm(userId, claims, player) {
  let gift = null;
  if (player?.giftOrder) {
    const paid = await paidOrder(player.giftOrder);
    if (paid && paid.userId === userId && paid.gift) gift = await mintGift(userId, player.giftOrder, paid.payment);
  }
  let unlocked = hasUnlock(player, claims);
  if (!unlocked && player?.unlockOrder) {
    const paid = await paidOrder(player.unlockOrder);
    if (paid && paid.userId === userId && !paid.gift) { await grant(userId, player.unlockOrder, paid.payment); unlocked = true; }
  }
  return json(200, { unlocked, ...(gift ? { gift } : {}) });
}

export async function gifts(player) {
  const codes = (player?.gifts || []).slice(-500);
  if (!codes.length) return json(200, { gifts: [] });
  const byCode = new Map();
  for (let i = 0; i < codes.length; i += 100) {
    let keys = codes.slice(i, i + 100).map((code) => ({ code }));
    for (let tries = 0; keys.length && tries < 4; tries++) {
      const r = await db.send(new BatchGetCommand({ RequestItems: { [GIFTS]: { Keys: keys } } }));
      for (const g of r.Responses?.[GIFTS] || []) byCode.set(g.code, g);
      keys = r.UnprocessedKeys?.[GIFTS]?.Keys || [];
    }
  }
  return json(200, { gifts: codes.map((code) => byCode.get(code)).filter(Boolean).reverse()
    .map((g) => ({ code: g.code, createdAt: g.createdAt, redeemed: !!g.redeemedBy, cancelled: !!g.revokedAt, via: g.via || 'square', note: g.note || null })) });
}

// Owner promo codes: free one-use codes for giveaways, events and game boxes (developers group only).
export async function promo(userId, claims, body) {
  if (!isDeveloper(claims)) return json(403, { error: 'owner only' });
  const count = Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > 50) return json(400, { error: 'Make 1 to 50 codes at a time.' });
  const note = String(body.note || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || null;
  const via = ['promo', 'box', 'giveaway'].includes(body.via) ? body.via : 'promo';
  const made = [], at = new Date().toISOString();
  while (made.length < count) {
    const code = randomCode();
    try {
      await db.send(new PutCommand({ TableName: GIFTS, ConditionExpression: 'attribute_not_exists(code)', Item: { code, buyer: userId, via, note, createdAt: at } }));
      made.push(code);
    } catch (e) {
      if (e.name !== 'ConditionalCheckFailedException') throw e; // collision: try another code
    }
  }
  await db.send(new UpdateCommand({
    TableName: PLAYERS, Key: { userId },
    UpdateExpression: 'SET gifts = list_append(if_not_exists(gifts, :e), :c)',
    ExpressionAttributeValues: { ':e': [], ':c': made },
  }));
  return json(200, { codes: made, note, via });
}

export async function redeem(userId, claims, player, body) {
  const code = cleanCode(body.code);
  if (!code) return json(400, { error: 'That doesn’t look like a Crit Pass code (CRIT-XXXX-XXXX).' });
  const g = (await db.send(new GetCommand({ TableName: GIFTS, Key: { code } }))).Item;
  if (!g) return json(404, { error: 'That code isn’t valid. Check the letters and try again.' });
  if (g.redeemedBy === userId) return json(200, { unlocked: true });
  if (g.revokedAt) return json(410, { error: 'That code was cancelled because its payment was refunded.' });
  if (g.redeemedBy) return json(409, { error: 'That code has already been used.' });
  if (hasUnlock(player, claims)) return json(409, { error: 'You already have the Crit Pass, so this code is still unused. Pass it on to a friend!' });
  try {
    await db.send(new UpdateCommand({
      TableName: GIFTS, Key: { code }, ConditionExpression: 'attribute_exists(code) AND attribute_not_exists(redeemedBy) AND attribute_not_exists(revokedAt)',
      UpdateExpression: 'SET redeemedBy = :u, redeemedAt = :t', ExpressionAttributeValues: { ':u': userId, ':t': new Date().toISOString() },
    }));
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return json(409, { error: 'That code has already been used.' });
    throw e;
  }
  const { sets, names, vals } = seedParts(defaultName(claims));
  sets.push('#u = if_not_exists(#u, :u)'); names['#u'] = 'unlock';
  vals[':u'] = { at: new Date().toISOString(), via: g.via === 'square' ? 'gift' : g.via || 'gift', code, from: g.buyer || null };
  await update(userId, sets, names, vals);
  return json(200, { unlocked: true });
}


// x-square-hmacsha256-signature = base64(HMAC-SHA256(signatureKey, notificationUrl + rawBody))
export function verifySquare(raw, header, key, url) {
  if (!key || !header || !url) return false;
  const want = crypto.createHmac('sha256', key).update(url + raw).digest();
  const got = Buffer.from(String(header), 'base64');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// ---------- Refunds and lost chargebacks ----------
// Take a pass back from one player, but only the pass that matches (same payment, or same gift code),
// so a pass they got another way (a second purchase, the early-supporter grant) is never touched.
async function takeBack(userId, field, value, reason) {
  try {
    await db.send(new UpdateCommand({
      TableName: PLAYERS, Key: { userId },
      ConditionExpression: `#u.#f = :v`,
      UpdateExpression: 'SET unlockRevoked = list_append(if_not_exists(unlockRevoked, :e), :r) REMOVE #u',
      ExpressionAttributeNames: { '#u': 'unlock', '#f': field },
      ExpressionAttributeValues: { ':v': value, ':e': [], ':r': [{ field, value, reason, at: new Date().toISOString() }] },
    }));
    return true;
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') return false; // no matching pass: nothing to take back
    throw e;
  }
}

// reason 'refund': only when the whole payment came back. reason 'chargeback': the dispute was lost.
export async function revokePayment(paymentId, reason) {
  const { payment } = await square('GET', '/v2/payments/' + encodeURIComponent(paymentId));
  if (!payment?.order_id) return null;
  if (reason === 'refund' && !fullyRefunded(payment)) return null; // partial refund: keep the pass
  const { order } = await square('GET', '/v2/orders/' + encodeURIComponent(payment.order_id));
  const userId = order?.metadata?.userId;
  if (!userId || order?.metadata?.product !== 'full-arena') return null;
  if (order.metadata.kind !== 'gift') return { self: await takeBack(userId, 'payment', payment.id, reason) };
  // Gift: cancel the code (made now if it was never minted, so it can't be minted later), then undo any redeem.
  const code = orderCode(payment.order_id), at = new Date().toISOString();
  const r = await db.send(new UpdateCommand({
    TableName: GIFTS, Key: { code },
    UpdateExpression: 'SET revokedAt = if_not_exists(revokedAt, :t), revokeReason = :why, buyer = if_not_exists(buyer, :b), #o = if_not_exists(#o, :o), via = if_not_exists(via, :sq), createdAt = if_not_exists(createdAt, :t)',
    ExpressionAttributeNames: { '#o': 'order' },
    ExpressionAttributeValues: { ':t': at, ':why': reason, ':b': userId, ':o': payment.order_id, ':sq': 'square' },
    ReturnValues: 'ALL_NEW',
  }));
  const used = r.Attributes?.redeemedBy;
  return { gift: code, redeemer: used ? await takeBack(used, 'code', code, reason) : false };
}

export async function webhook(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  const sig = event.headers?.['x-square-hmacsha256-signature'];
  if (!verifySquare(raw, sig, process.env.SQUARE_WEBHOOK_SIGNATURE_KEY, process.env.SQUARE_WEBHOOK_URL)) return json(403, { error: 'bad signature' });
  const evt = JSON.parse(raw);
  const refund = evt?.data?.object?.refund;
  if (['refund.created', 'refund.updated'].includes(evt.type) && refund?.status === 'COMPLETED' && refund.payment_id) {
    console.log('refund', refund.payment_id, JSON.stringify(await revokePayment(refund.payment_id, 'refund')));
    return json(200, { received: true });
  }
  const dispute = evt?.data?.object?.dispute;
  const disputed = dispute?.disputed_payment?.payment_id || dispute?.payment_id;
  if (String(evt.type || '').startsWith('dispute.') && dispute?.state === 'LOST' && disputed) {
    console.log('chargeback', disputed, JSON.stringify(await revokePayment(disputed, 'chargeback')));
    return json(200, { received: true });
  }
  const payment = evt?.data?.object?.payment;
  if (['payment.created', 'payment.updated'].includes(evt.type) && payment?.status === 'COMPLETED' && payment.order_id) {
    const paid = await paidOrder(payment.order_id);
    if (paid && paid.gift) await mintGift(paid.userId, payment.order_id, paid.payment);
    else if (paid) await grant(paid.userId, payment.order_id, paid.payment);
  }
  return json(200, { received: true });
}

// ---------- Project Lightbringer: the Crit Pass chapters ----------
// lightbringer.json on the site carries only a short teaser of these chapters; the full text sits in the
// private bucket (book/lightbringer-paid.json, made by tools/lightbringer/split_paid.py) and is handed
// only to players who have the pass. Kept warm in memory for 10 minutes.
let bookCache = null;
export async function book(claims, player) {
  if (!hasUnlock(player, claims)) return json(403, { error: 'unlock required' });
  if (!bookCache || Date.now() - bookCache.at > 600000) {
    const res = await fetch(presign({ bucket: BUCKET, key: 'book/lightbringer-paid.json', region: REGION, expires: 60, creds: lambdaCreds() }));
    if (!res.ok) throw new Error('book fetch ' + res.status);
    bookCache = { at: Date.now(), data: await res.json() };
  }
  return json(200, bookCache.data);
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

const lambdaCreds = () => ({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
});

export function pnp(claims, player) {
  if (!hasUnlock(player, claims)) return json(403, { error: 'unlock required' });
  const creds = lambdaCreds();
  const files = PNP_FILES.map((f) => ({
    name: f.name,
    url: presign({
      bucket: BUCKET, key: f.key, region: REGION, creds,
      query: { 'response-content-disposition': `attachment; filename="${f.key.split('/').pop()}"` },
    }),
  }));
  return json(200, { files });
}
