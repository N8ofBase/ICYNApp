// Online duels for I Crit You Not! (needs auth.js; the server referees every roll).
// window.ICYNOnline: connect(), create(hero, life), join(code, hero), resume(gameId),
// act(kind, choice), nudge(), forfeit(), onState(fn), onError(fn), close().
// Hero ids: brawler, champion, maverick, soulseer, whisper.
(function () {
  const WS = '__ICYN_WS_URL__'; // e.g. wss://abc123.execute-api.us-east-1.amazonaws.com/prod
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
      s.onclose = () => { sock = null; if (game && game.status === 'active') setTimeout(() => resume(game.gameId).catch(() => {}), 2000); };
      s.onmessage = (m) => {
        let msg; try { msg = JSON.parse(m.data); } catch (e) { return; }
        if (msg.type === 'error') return errorFns.forEach((fn) => fn(msg.error, msg));
        if (msg.type === 'created') { game = { gameId: msg.gameId, code: msg.code, status: 'waiting' }; remember(); }
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
    create: (hero, life) => send({ action: 'create', hero, life }),
    join: (code, hero) => send({ action: 'join', code: String(code).trim().toUpperCase(), hero }),
    resume,
    // A duel left open in this browser, to offer "Rejoin your duel".
    savedGame() { try { return localStorage.getItem(GAME_KEY); } catch (e) { return null; } },
    act: (kind, choice) => send({ action: 'act', gameId: game && game.gameId, kind, choice }),
    nudge: () => send({ action: 'nudge', gameId: game && game.gameId }),
    forfeit: () => send({ action: 'forfeit', gameId: game && game.gameId }),
    state: () => game,
    onState(fn) { stateFns.push(fn); },
    onError(fn) { errorFns.push(fn); },
    close() { game = null; remember(); if (sock) sock.close(); },
  };
})();
