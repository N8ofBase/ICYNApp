// Saves, streaks and leaderboards for I Crit You Not! (needs auth.js loaded first).
// Exposes window.ICYNStats: recordMatch(m), me(), setProfile(p), history(), leaderboard(by),
// feedback(f), feedbackList(status), feedbackSet(id, status), checkout(), confirmCheckout(), pnpFiles().
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
    feedbackList: (status) => call('GET', '/feedback?status=' + (status === 'all' ? 'all' : 'new') + '&limit=50', null, true),
    feedbackSet: (id, status) => call('PATCH', '/feedback/' + encodeURIComponent(id), { status }, true),
    // $5 Crit Pass unlock (Online, Starvos, Print & Play). me() also returns {unlocked}.
    checkout: () => call('POST', '/checkout', {}, true),             // -> {url} for Square checkout, or {unlocked:true}
    confirmCheckout: () => call('POST', '/checkout/confirm', {}, true), // -> {unlocked}; checks the player's last Square order
    pnpFiles: () => call('GET', '/pnp', null, true),                 // -> {files:[{name, url}]}
  };
})();
