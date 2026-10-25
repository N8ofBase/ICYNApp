// Saves, streaks and leaderboards for I Crit You Not! (needs auth.js loaded first).
// Exposes window.ICYNStats: recordMatch(m), me(), setProfile(p), history(), leaderboard(by).
// Every call resolves to null instead of throwing when the player is offline
// or signed out, so guest play never breaks.
(function () {
  const API = 'https://r9s8gd8duk.execute-api.us-east-1.amazonaws.com';

  async function call(method, path, body, needsAuth) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (needsAuth) {
        const token = window.ICYNAuth && (await window.ICYNAuth.idToken());
        if (!token) return null;
        headers.Authorization = 'Bearer ' + token;
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
  };
})();
