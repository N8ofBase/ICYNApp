// Saves, streaks and leaderboards for I Crit You Not! (needs auth.js loaded first).
// Exposes window.ICYNStats: recordMatch(m), me(), setProfile(p), history(), leaderboard(by),
// feedback(f), feedbackList(status), feedbackSet(id, status), checkout(gift), confirmCheckout(), pnpFiles(), gifts(), redeemGift(code),
// climbs(), climb(code), climbCreate(c), climbJoin(code), climbLeave(code), climbStart(code).
// Every call resolves to null instead of throwing when the player is offline
// or signed out, so guest play never breaks.
(function () {
  const API = 'https://r9s8gd8duk.execute-api.us-east-1.amazonaws.com';

  async function call(method, path, body, needsAuth) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (needsAuth) {
        const token = window.ICYNAuth && window.ICYNAuth.user && window.ICYNAuth.user() && (await window.ICYNAuth.idToken());
        if (token) headers.Authorization = 'Bearer ' + token;
        else if (needsAuth !== 'optional') return null;
      }
      const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // Like call(), but hands back the server's {error} message so the player sees why.
  async function callErr(method, path, body) {
    try {
      const token = window.ICYNAuth && window.ICYNAuth.user && window.ICYNAuth.user() && (await window.ICYNAuth.idToken());
      if (!token) return { error: 'Sign in first' };
      const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
      return await res.json().catch(() => ({ error: 'Please try again' }));
    } catch (e) { return { error: 'Could not reach the arena. Please try again.' }; }
  }

  window.ICYNStats = {
    // m = { result: 'win'|'loss'|'draw', mode: 'cpu'|'pnp', hero, opponentHero, rounds, ko, startingLife }
    // Only 'cpu' duels count toward stats, streaks and the leaderboard.
    recordMatch: (m) => call('POST', '/matches', m, true),
    me: () => call('GET', '/me', null, true),
    setProfile: (p) => call('PUT', '/me', p, true),
    history: () => call('GET', '/matches', null, true),
    leaderboard: (by) => call('GET', '/leaderboard?by=' + (by === 'streak' ? 'streak' : 'wins'), null, false),
    // Beta feedback: anyone can send (signed-in players are named); only the developers group can list or update it.
    // f = { kind: 'bug'|'idea'|'other', message, contact?, context?, hp? }
    feedback: (f) => call('POST', '/feedback', f, 'optional'),
    // The server answers with a plain list; the game reads {items}.
    feedbackList: (status) => call('GET', '/feedback?status=' + (status === 'all' ? 'all' : 'new') + '&limit=50', null, true)
      .then((r) => (Array.isArray(r) ? { items: r } : r)),
    feedbackSet: (id, status) => call('PATCH', '/feedback/' + encodeURIComponent(id), { status }, true),
    // $5 Crit Pass unlock (Online, Starvos, Print & Play). me() also returns {unlocked}.
    checkout: (gift) => call('POST', '/checkout', { gift: !!gift }, true), // -> {url} for Square checkout, or {unlocked:true}; gift=true buys a code for someone else
    gifts: () => call('GET', '/gifts', null, true),                  // -> {gifts:[{code, createdAt, redeemed}]}
    redeemGift: (code) => callErr('POST', '/gift/redeem', { code }),  // -> {unlocked:true} or {error}
    promoCodes: (count, note) => callErr('POST', '/gifts/promo', { count, note }), // owner only -> {codes, note} or {error}
    confirmCheckout: () => call('POST', '/checkout/confirm', {}, true), // -> {unlocked}; checks the player's last Square order
    pnpFiles: () => call('GET', '/pnp', null, true),                 // -> {files:[{name, url}]}
    // Crit Climb lobbies: anyone can look; hosting and joining need the Crit Pass; the host begins.
    climbs: () => call('GET', '/climbs', null, false),               // -> public open lobbies [{code, name, size, public, status, entrants, rounds, ...}]
    climb: (code) => call('GET', '/climbs/' + encodeURIComponent(code), null, false),
    climbCreate: (c) => callErr('POST', '/climbs', c),               // c = {size: 4|8|16, public, name?}
    climbJoin: (code) => callErr('POST', '/climbs/' + encodeURIComponent(code) + '/join', {}),
    climbLeave: (code) => callErr('POST', '/climbs/' + encodeURIComponent(code) + '/leave', {}),
    climbStart: (code) => callErr('POST', '/climbs/' + encodeURIComponent(code) + '/start', {}),
  };
})();
