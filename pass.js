// Crit Pass for I Crit You Not! (needs auth.js loaded first).
// One-time purchase: host online duels and Starvos battles, plus the print-and-play PDFs.
// Exposes window.ICYNPass: enabled(), status(force), buy(), download(file), price.
// Leave API empty to hide the Crit Pass everywhere (online play stays open).
(function () {
  const API = ''; // Lambda Function URL for online/pass.mjs, e.g. 'https://abc123.lambda-url.us-east-1.on.aws'
  const PRICE = '$5';
  let cached = null;

  async function call(method, path) {
    const token = window.ICYNAuth && window.ICYNAuth.user && window.ICYNAuth.user() && (await window.ICYNAuth.idToken());
    if (!token) throw new Error('Sign in first');
    const res = await fetch(API.replace(/\/$/, '') + path, { method, headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Could not reach the arena'); e.code = data.code; throw e; }
    return data;
  }

  window.ICYNPass = {
    price: PRICE,
    enabled: () => !!API,
    // {pass, since} or null when signed out / offline / not set up
    async status(force) {
      if (!API) return null;
      if (cached && !force) return cached;
      try { cached = await call('GET', '/pass'); } catch (e) { cached = null; }
      return cached;
    },
    async buy() {
      const r = await call('POST', '/pass/checkout');
      if (r.already) { cached = { pass: true }; return r; }
      location.assign(r.url);
      return r;
    },
    // file: 'rulebook' | 'sheets'
    async download(file) {
      const r = await call('GET', '/pass/download?file=' + encodeURIComponent(file));
      location.assign(r.url);
    },
    clear() { cached = null; },
  };
  if (window.ICYNAuth && window.ICYNAuth.onChange) window.ICYNAuth.onChange(() => { cached = null; });
})();
