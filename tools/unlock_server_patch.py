# Layers the Crit Pass server changes onto any copy of the icyn-api and icyn-ws sources,
# so it can follow other threads' server updates (e.g. No Calamities / Easy mode).
# Usage: python3 tools/unlock_server_patch.py <api/index.mjs> <ws/ws.mjs>
#   (copy backend/api/unlock.mjs next to api/index.mjs as well)
import re, sys

def sub(s, pat, rep, path, flags=0):
    n = len(re.findall(pat, s, flags))
    assert n == 1, f'{path}: expected 1 match of {pat!r}, found {n}'
    return re.sub(pat, rep, s, count=1, flags=flags)

def api(path):
    s = open(path, encoding='utf-8').read()
    if "from './unlock.mjs'" in s:  # an older Crit Pass build: take it out, then add the current one
        keep = [l for l in s.split('\n') if not ("from './unlock.mjs'" in l or re.search(r"route === '(POST /square/webhook|GET /pnp|GET /gifts|POST /checkout|POST /checkout/confirm|POST /gift/redeem|POST /gifts/promo)'", l))]
        s = re.sub(r", unlocked: hasUnlock\([^)]*\)(, passVia: p\.unlock\?\.via \|\| null)?(, owner: isDeveloper\(claims\))?", '', '\n'.join(keep))
    s = sub(s, r"(import \{[^}]*\} from './record\.mjs';\n)", r"\1import { hasUnlock, isDeveloper, checkout, confirm, webhook, pnp, gifts, redeem, promo } from './unlock.mjs';\n", path)
    # GET /me and PUT /me also say whether the player holds the Crit Pass
    s = sub(s, r"(async function getMe\(userId, claims\) \{\n  const p = await loadPlayer\(userId, claims\);\n  return json\(200, \{ stats: stats\(p\), prefs: p\.prefs \|\| \{\})( \}\);)",
            r"\1, unlocked: hasUnlock(p, claims), passVia: p.unlock?.via || null, owner: isDeveloper(claims)\2", path)
    s = sub(s, r"(return json\(200, \{ stats: stats\(r\.Attributes\), prefs: r\.Attributes\.prefs \|\| \{\})( \}\);)",
            r"\1, unlocked: hasUnlock(r.Attributes, claims)\2", path)
    s = sub(s, r"(    if \(route === 'GET /leaderboard'\) return await leaderboard\(event\);\n)",
            r"\1    if (route === 'POST /square/webhook') return await webhook(event);\n", path)
    s = sub(s, r"(    if \(route === 'GET /matches'\) return await getMatches\(userId[^\n]*\n)",
            r"\1    if (route === 'GET /pnp') return pnp(claims, await loadPlayer(userId, claims));\n"
            r"    if (route === 'GET /gifts') return await gifts(await loadPlayer(userId, claims));\n", path)
    s = sub(s, r"(    if \(route === 'POST /matches'\) return await postMatch\([^\n]*\n)",
            r"\1    if (route === 'POST /checkout') return await checkout(userId, claims, await loadPlayer(userId, claims), event, body);\n"
            r"    if (route === 'POST /checkout/confirm') return await confirm(userId, claims, await loadPlayer(userId, claims));\n"
            r"    if (route === 'POST /gift/redeem') return await redeem(userId, claims, await loadPlayer(userId, claims), body);\n"
            r"    if (route === 'POST /gifts/promo') return await promo(userId, claims, body);\n", path)
    open(path, 'w', encoding='utf-8').write(s); print(path, 'patched')

WS_HELPERS = """// Online play is part of the $5 Crit Pass unlock (stored as `unlock` on the icyn-players item;
// the developers group always has it). FREE_JOIN=true lets anyone join a game an unlocked player hosts.
const PLAYERS = process.env.PLAYERS_TABLE || 'icyn-players';
const FREE_JOIN = process.env.FREE_JOIN === 'true';
const NEED_UNLOCK = 'Online play needs the Crit Pass. Get it on the setup screen.';
const isDev = (c) => { const g = c?.['cognito:groups']; return (Array.isArray(g) ? g : String(g || '').split(/[\\s,\\[\\]]+/)).includes('developers'); };
async function unlocked(conn) {
  if (conn.dev) return true;
  const p = (await db.send(new GetCommand({ TableName: PLAYERS, Key: { userId: conn.userId }, ProjectionExpression: '#u', ExpressionAttributeNames: { '#u': 'unlock' } }))).Item;
  return !!(p && p.unlock);
}
"""

def ws(path):
    s = open(path, encoding='utf-8').read()
    if 'NEED_UNLOCK' in s:
        print(path, 'already has the Crit Pass'); return
    s = sub(s, r"(const BOSS_SEATS = \d+;\n)", lambda m: m.group(1) + WS_HELPERS, path)
    s = sub(s, r"(Item: \{ connectionId, userId: claims\.sub, name: nameOf\(claims\),)", r"\1 dev: isDev(claims),", path)
    s = sub(s, r"(\n  if \(msg\.action === 'create' && msg\.mode === 'boss'\) \{\n)",
            r"\n  if (msg.action === 'create' && !(await unlocked(conn))) return fail(NEED_UNLOCK);\1", path)
    s = sub(s, r"(\n    const boss = isBoss\(game\);\n)",
            r"\1    if (msg.action === 'join' && you === -1 && !FREE_JOIN && !(await unlocked(conn))) return fail(NEED_UNLOCK);\n", path)
    open(path, 'w', encoding='utf-8').write(s); print(path, 'patched')

api(sys.argv[1]); ws(sys.argv[2])
