// Crit Pass Lambda for I Crit You Not! (Lambda Function URL, payload v2).
// One-time payment through Stripe Checkout. The pass unlocks hosting online
// games (checked in ws.mjs) and the print-and-play downloads below.
//
//   GET  /pass                     -> {pass, since}                     (signed in)
//   POST /pass/checkout            -> {url}  Stripe Checkout page        (signed in)
//   GET  /pass/download?file=KEY   -> {url}  5-minute S3 link           (signed in + pass)
//   POST /pass/webhook             <- Stripe event checkout.session.completed
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID, PASSES_TABLE (icyn-passes),
//      FILES_BUCKET (private S3 bucket holding the PDFs), SITE_URL (https://icyn.prismcortex.net),
//      USER_POOL_ID, CLIENT_ID. No npm packages: Stripe is called over HTTPS and the S3 link
//      is signed here (SigV4) with the function's own role credentials.
import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const PASSES = process.env.PASSES_TABLE || 'icyn-passes';
const BUCKET = process.env.FILES_BUCKET || '';
const SITE = process.env.SITE_URL || 'https://icyn.prismcortex.net';
const POOL = process.env.USER_POOL_ID || 'us-east-1_slqC7oLPd';
const CLIENT = process.env.CLIENT_ID || '32atvvme5lvlrfpaqhcj7v5vai';
const REGION = process.env.AWS_REGION || 'us-east-1';
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${POOL}`;

// Files a pass holder can download: key in the bucket -> name the browser saves.
export const FILES = {
  rulebook: { key: 'print-and-play/ICYN-Print-and-Play-Rulebook.pdf', name: 'ICYN-Print-and-Play-Rulebook.pdf' },
  sheets: { key: 'print-and-play/ICYN-Hero-and-Starvos-Sheets.pdf', name: 'ICYN-Hero-and-Starvos-Sheets.pdf' },
};

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// ---------- Cognito ID token check (same as ws.mjs) ----------
let jwks = null;
async function verifyIdToken(token) {
  const [h, p, s] = String(token || '').split('.');
  if (!s) return null;
  const head = JSON.parse(Buffer.from(h, 'base64url').toString());
  if (!jwks) jwks = (await (await fetch(`${ISSUER}/.well-known/jwks.json`)).json()).keys;
  const jwk = jwks.find((k) => k.kid === head.kid);
  if (!jwk) return null;
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (c.iss !== ISSUER || c.aud !== CLIENT || c.token_use !== 'id' || c.exp * 1000 < Date.now()) return null;
  return c;
}
const bearer = (event) => (event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i, '');

async function getPass(userId) {
  return (await db.send(new GetCommand({ TableName: PASSES, Key: { userId } }))).Item || null;
}

// ---------- Stripe ----------
function form(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join('&');
}
async function stripe(path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`);
  return data;
}
// Stripe-Signature: t=TIMESTAMP,v1=HMAC_SHA256(secret, `${t}.${rawBody}`)
export function verifyStripe(raw, header, secret, now = Date.now()) {
  const parts = Object.fromEntries(String(header || '').split(',').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k, v]));
  const sigs = String(header || '').split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3));
  if (!parts.t || !sigs.length) return false;
  if (Math.abs(now / 1000 - Number(parts.t)) > 300) return false;
  const want = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  return sigs.some((sig) => sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)));
}

// ---------- S3 presigned GET (SigV4, query string) ----------
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function presign({ bucket, key, region, filename, expires = 300, creds, now = new Date(), extra = {} }) {
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const amz = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amz.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${creds.accessKeyId}/${scope}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
    'response-content-disposition': `attachment; filename="${filename}"`,
    ...extra,
  };
  if (creds.sessionToken) q['X-Amz-Security-Token'] = creds.sessionToken;
  const qs = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const path = '/' + key.split('/').map(enc).join('/');
  const canonical = ['GET', path, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canonical)].join('\n');
  const kSign = hmac(hmac(hmac(hmac('AWS4' + creds.secretAccessKey, day), region), 's3'), 'aws4_request');
  const sig = crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
  return `https://${host}${path}?${qs}&X-Amz-Signature=${sig}`;
}

export async function handler(event) {
  const method = event.requestContext?.http?.method || 'GET';
  const path = (event.rawPath || '/').replace(/\/+$/, '') || '/';
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';

  if (method === 'POST' && path.endsWith('/webhook')) {
    if (!verifyStripe(raw, event.headers?.['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) return json(400, { error: 'Bad signature' });
    const evt = JSON.parse(raw);
    if (evt.type === 'checkout.session.completed') {
      const s = evt.data.object;
      const userId = s.client_reference_id || s.metadata?.userId;
      if (userId && s.payment_status === 'paid') {
        await db.send(new PutCommand({
          TableName: PASSES,
          Item: { userId, active: true, since: new Date((s.created || Date.now() / 1000) * 1000).toISOString(), email: s.customer_details?.email || s.customer_email || null, session: s.id, amount: s.amount_total, currency: s.currency },
        }));
      }
    }
    return json(200, { received: true });
  }

  const claims = await verifyIdToken(bearer(event)).catch(() => null);
  if (!claims) return json(401, { error: 'Sign in first' });

  if (method === 'GET' && path.endsWith('/pass')) {
    const p = await getPass(claims.sub);
    return json(200, { pass: !!(p && p.active !== false), since: p?.since || null });
  }

  if (method === 'POST' && path.endsWith('/checkout')) {
    const p = await getPass(claims.sub);
    if (p && p.active !== false) return json(200, { already: true });
    const s = await stripe('checkout/sessions', {
      mode: 'payment',
      line_items: { 0: { price: process.env.STRIPE_PRICE_ID, quantity: 1 } },
      client_reference_id: claims.sub,
      customer_email: claims.email,
      metadata: { userId: claims.sub },
      allow_promotion_codes: 'true',
      success_url: `${SITE}/?pass=thanks`,
      cancel_url: `${SITE}/?pass=cancel`,
    });
    return json(200, { url: s.url });
  }

  if (method === 'GET' && path.endsWith('/download')) {
    const f = FILES[event.queryStringParameters?.file];
    if (!f) return json(404, { error: 'No such file' });
    const p = await getPass(claims.sub);
    if (!p || p.active === false) return json(403, { error: 'The print and play files come with the Crit Pass', code: 'pass' });
    const url = presign({
      bucket: BUCKET, key: f.key, region: REGION, filename: f.name,
      creds: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, sessionToken: process.env.AWS_SESSION_TOKEN },
    });
    return json(200, { url });
  }

  return json(404, { error: 'Not found' });
}
