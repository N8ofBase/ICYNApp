// Player sign-in for I Crit You Not! via Amazon Cognito managed login
// (OAuth 2.0 authorization code + PKCE). Guest play never needs this.
// Exposes window.ICYNAuth: signIn(), signUp(), signOut(), user(), idToken(), onChange(fn).
(function () {
  const CONFIG = {
    domain: 'https://icyn-prismcortex.auth.us-east-1.amazoncognito.com',
    clientId: '32atvvme5lvlrfpaqhcj7v5vai',
    scopes: 'openid email profile',
  };
  const KEY = 'icyn.auth';
  const VERIFIER = 'icyn.pkce';
  const listeners = [];
  const redirectUri = location.origin + '/';

  const b64url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save(t) {
    try { t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY); } catch (e) {}
    listeners.forEach((fn) => { try { fn(user()); } catch (e) {} });
  }
  function claims(jwt) {
    try {
      const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch (e) { return null; }
  }

  async function startFlow(path) {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    sessionStorage.setItem(VERIFIER, JSON.stringify({ verifier, state }));
    const q = new URLSearchParams({
      response_type: 'code', client_id: CONFIG.clientId, redirect_uri: redirectUri,
      scope: CONFIG.scopes, state, code_challenge: challenge, code_challenge_method: 'S256',
    });
    location.assign(`${CONFIG.domain}/${path}?${q}`);
  }

  async function token(body) {
    const res = await fetch(`${CONFIG.domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CONFIG.clientId, ...body }),
    });
    if (!res.ok) throw new Error('Token request failed: ' + res.status);
    const t = await res.json();
    return { ...t, expires_at: Date.now() + t.expires_in * 1000 };
  }

  // Finish the redirect back from managed login, if this page load is one.
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    const code = q.get('code');
    if (!code) return;
    const saved = JSON.parse(sessionStorage.getItem(VERIFIER) || 'null');
    sessionStorage.removeItem(VERIFIER);
    history.replaceState(null, '', location.pathname + location.hash);
    if (!saved || saved.state !== q.get('state')) return;
    save(await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: saved.verifier }));
  }

  async function refreshIfNeeded() {
    const t = load();
    if (!t || Date.now() < t.expires_at - 60000) return;
    if (!t.refresh_token) return save(null);
    try {
      const n = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
      save({ ...n, refresh_token: t.refresh_token });
    } catch (e) { save(null); }
  }

  function user() {
    const t = load();
    const c = t && claims(t.id_token);
    if (!c) return null;
    return { id: c.sub, email: c.email, name: c.nickname || (c.email || '').split('@')[0] };
  }

  window.ICYNAuth = {
    signIn: () => startFlow('oauth2/authorize'),
    signUp: () => startFlow('signup'),
    signOut() {
      save(null);
      location.assign(`${CONFIG.domain}/logout?${new URLSearchParams({ client_id: CONFIG.clientId, logout_uri: redirectUri })}`);
    },
    user,
    async idToken() { await refreshIfNeeded(); const t = load(); return t ? t.id_token : null; },
    onChange(fn) { listeners.push(fn); fn(user()); },
    ready: handleRedirect().then(refreshIfNeeded).catch(() => {}).then(() => save(load())),
  };

  // A small account chip in the top-right corner, unless the game sets
  // window.ICYN_AUTH_NO_CHIP = true and draws its own buttons.
  function mountChip() {
    if (window.ICYN_AUTH_NO_CHIP || document.getElementById('icyn-auth-chip')) return;
    const chip = document.createElement('div');
    chip.id = 'icyn-auth-chip';
    chip.style.cssText = 'position:fixed;top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));z-index:9999;' +
      'display:flex;gap:6px;align-items:center;font:600 12px/1 system-ui,sans-serif;color:#f3ead8;' +
      'background:rgba(20,18,24,.85);border:1px solid rgba(243,234,216,.25);border-radius:999px;padding:6px 8px';
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'all:unset;cursor:pointer;padding:2px 6px;border-radius:999px;background:rgba(243,234,216,.12)';
      b.onclick = fn;
      return b;
    };
    document.body.appendChild(chip);
    window.ICYNAuth.onChange((u) => {
      chip.replaceChildren();
      if (u) {
        const name = document.createElement('span');
        name.textContent = u.name;
        chip.append(name, btn('Sign out', window.ICYNAuth.signOut));
      } else {
        chip.append(btn('Sign in', window.ICYNAuth.signIn), btn('Create account', window.ICYNAuth.signUp));
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountChip);
  else mountChip();
})();
