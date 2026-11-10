// Online duels for I Crit You Not! (needs auth.js; the server referees every roll).
// window.ICYNOnline: connect(), create(hero, life, easy, pub), cancel(), join(code, hero), resume(gameId),
// act(kind, choice), nudge(), forfeit(), onState(fn), onError(fn), close(), climb(climbId, hero).
// Starvos co-op: createBoss(hero, pub), joinBoss(code), claim(hero), release(hero), start(), leave(), forfeit(all).
// Hero ids: brawler, champion, maverick, soulseer, whisper.
(function () {
  const WS = 'wss://xv92tk4nd2.execute-api.us-east-1.amazonaws.com/prod';
  const GAME_KEY = 'icyn.online.game';
  let sock = null, opening = null, game = null, events = [];
  const stateFns = [], errorFns = [];

  async function connect() {
    if (sock && sock.readyState === 1) return sock;
    if (opening) return opening;
    const token = window.ICYNAuth && (await window.ICYNAuth.idToken());
    if (!token) throw new Error('Sign in to play online');
    opening = new Promise((resolve, reject) => {
      const s = new WebSocket(WS + '?token=' + encodeURIComponent(token));
      s.onopen = () => { sock = s; opening = null; resolve(s); };
      s.onerror = () => { opening = null; reject(new Error('Could not reach the arena')); };
      s.onclose = () => { sock = null; if (game && game.status !== 'done') setTimeout(() => resume(game.gameId).catch(() => {}), 2000); };
      s.onmessage = (m) => {
        let msg; try { msg = JSON.parse(m.data); } catch (e) { return; }
        if (msg.type === 'error') return errorFns.forEach((fn) => fn(msg.error, msg));
        if (msg.type === 'cancelled') { game = null; remember(); return; }
        if (msg.type === 'created') { game = { gameId: msg.gameId, code: msg.code, status: 'waiting', mode: msg.mode, climb: msg.climb || null }; remember(); }
        if (msg.type === 'state') {
          events = msg.since === 0 ? msg.events : events.slice(0, msg.since).concat(msg.events);
          game = { ...msg, events };
          remember();
        }
        stateFns.forEach((fn) => fn(game, msg));
      };
    });
    return opening;
  }
  function remember() {
    try { game && game.status !== 'done' ? localStorage.setItem(GAME_KEY, game.gameId) : localStorage.removeItem(GAME_KEY); } catch (e) {}
  }
  async function send(msg) { (await connect()).send(JSON.stringify(msg)); }
  function resume(gameId) { return send({ action: 'resume', gameId, since: 0 }); }

  window.ICYNOnline = {
    connect,
    // pub = true lists the game on the public Open games list until someone joins
    create: (hero, life, easy, pub) => send({ action: 'create', hero, life, ...(easy ? { easy: true } : {}), ...(pub ? { public: true } : {}) }),
    // the host takes down a duel nobody joined
    cancel: () => send({ action: 'cancel', gameId: game && game.gameId }),
    join: (code, hero) => send({ action: 'join', code: String(code).trim().toUpperCase(), hero }),
    // Crit Climb: enter your current bracket match (creates it, or joins the duel your rival is waiting in)
    climb: (climbId, hero) => send({ action: 'climb', climbId, hero }),
    resume,
    // A duel left open in this browser, to offer "Rejoin your duel".
    savedGame() { try { return localStorage.getItem(GAME_KEY); } catch (e) { return null; } },
    act: (kind, choice, target) => send({ action: 'act', gameId: game && game.gameId, kind, choice, ...(target == null ? {} : { target }) }),
    nudge: () => send({ action: 'nudge', gameId: game && game.gameId }),
    forfeit: (all) => send({ action: 'forfeit', gameId: game && game.gameId, all: !!all }),
    createBoss: (hero, pub) => send({ action: 'create', mode: 'boss', hero, ...(pub ? { public: true } : {}) }),
    joinBoss: (code) => send({ action: 'join', mode: 'boss', code: String(code).trim().toUpperCase() }),
    claim: (hero) => send({ action: 'claim', gameId: game && game.gameId, hero }),
    release: (hero) => send({ action: 'release', gameId: game && game.gameId, hero }),
    start: () => send({ action: 'start', gameId: game && game.gameId }),
    leave: () => send({ action: 'leave', gameId: game && game.gameId }),
    state: () => game,
    onState(fn) { stateFns.push(fn); },
    onError(fn) { errorFns.push(fn); },
    // close(true) keeps the game for "Rejoin" (leaving a Starvos battle mid-fight)
    close(keep) { game = null; if (!keep) remember(); if (sock) sock.close(); },
  };
})();
