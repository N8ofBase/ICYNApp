# Battle rules, turn flow and the computer's choices, ported from farluck-battle.html (hex-3v3 engine, Farluck mode).
# One Light Keeper (level 1, one ability) against three plague gremlins at Cecil's seed shed.
# The view (main.gd) draws everything; this script only calls the few view hooks listed under "view hooks".
extends Node

const Rules = preload("res://scripts/rules_data.gd")
const Hex = preload("res://scripts/hexmap.gd")

signal turn_finished
signal changed

class Unit:
	extends RefCounted
	var id := ""
	var team := "A"
	var role := ""
	var lf := ""
	var branch := ""
	var name := ""
	var alive := true
	var c := 0
	var r := 0
	var life := 0
	var max_life := 0
	var defense := 10
	var st := {}
	var main := "P"
	var w_range := 1
	var weapon := ""
	var role_dmg := 0
	var abil := []
	var cd := []
	var fx := {}
	var actions := 0
	var free_move := false
	var ab_used := false
	var spent := false
	var gremlin := false
	var out := ""
	var last_hit_by = null
	var disp := Vector2.ZERO
	func pos() -> Vector2i:
		return Vector2i(c, r)

const PACE := {"slow": 1.8, "normal": 1.0, "fast": 0.35, "step": 1.0}
const START_A := Vector2i(3, 5)
const START_B := [Vector2i(10, 3), Vector2i(11, 5), Vector2i(10, 7)]
const CAL_COL := "#f2a08a"
const ENH_COL := "#ffd36a"

var view = null # main.gd
var units: Array = []
var order: Array = []
var round_n := 0
var turn := -1
var mode := ""
var over := false
var busy := true
var pace := "normal"
var beams: Array = []
var gen := 0
var hero_spec := {}
var auto_hero := false # testing: the computer plays your Light Keeper too (web: add ?auto=1)

# ------------------------------------------------------------ small helpers
func rng(n: int) -> int:
	return randi_range(1, n)

func roll_dice(list: Array) -> int:
	var s := 0
	for d in list:
		for i in range(d[0]):
			s += rng(d[1])
	return s

func dice_txt(list: Array) -> String:
	var p := []
	for d in list:
		p.append("%dd%d" % [d[0], d[1]])
	return "+".join(p)

func avg_dice(list: Array) -> float:
	var s := 0.0
	for d in list:
		s += d[0] * (d[1] + 1) / 2.0
	return s

func rds(n: int) -> String:
	return "1 round" if n == 1 else "%d rounds" % n

func cur():
	if turn >= 0 and turn < order.size():
		return order[turn]
	return null

func occupied(p: Vector2i, except = null):
	for u in units:
		if u.alive and u != except and u.c == p.x and u.r == p.y:
			return u
	return null

func enemies_of(u) -> Array:
	return units.filter(func(x): return x.alive and x.team != u.team)

func allies_of(u) -> Array:
	return units.filter(func(x): return x.alive and x.team == u.team)

func stat(u, k: String) -> int:
	var v: int = u.st.get(k, 0)
	if k == "C" and u.fx.has("charm"):
		v += u.fx.charm[0]
	return maxi(0, v)

# a buff on the Hero whose turn it is lasts through their next turn too
func timed(t, pair: Array) -> Array:
	return [pair[0], pair[1] + (1 if t == cur() else 0)]

func fxv(u, k: String) -> int:
	var v = u.fx.get(k, null)
	if v == null:
		return 0
	if v is Array:
		return v[0]
	return int(v)

func STATN(k: String) -> String:
	return Rules.STATN.get(k, k)

# ------------------------------------------------------------ building the fight
func abilities_for(role: String, branch: String, tier: int) -> Array:
	return Rules.ABILITIES.filter(func(a): return a.role == role and a.branch == branch and int(a.tier) == tier)

func build_hero(spec: Dictionary):
	var R: Dictionary = Rules.ROLES[spec.role]
	var L: Dictionary = Rules.LIFEFORMS[spec.lf]
	var u := Unit.new()
	u.id = "A0"; u.team = "A"; u.role = spec.role; u.lf = spec.lf; u.branch = spec.branch
	for k in ["P", "E", "S", "C"]:
		u.st[k] = int(R.get(k, 0)) + int(L.get(k, 0))
	u.life = int(R.life); u.max_life = u.life # level 1: role Life, no growth yet
	u.defense = 10 + int(L.get("def", 0)) + int(R.get("def", 0))
	u.main = R.main; u.w_range = int(R.wRange); u.weapon = R.weapon; u.role_dmg = int(R.get("dmg", 0))
	var opts := abilities_for(spec.role, spec.branch, 1)
	u.abil = [opts[clampi(int(spec.get("ab", 0)), 0, opts.size() - 1)]]
	u.cd = [0]
	u.name = "You (%s)" % spec.role
	u.c = START_A.x; u.r = START_A.y
	return u

func build_gremlin(i: int):
	var u := Unit.new()
	u.id = "B%d" % i; u.team = "B"; u.role = "Plague Gremlin"; u.lf = "Plague"; u.branch = "gremlin"; u.gremlin = true
	u.life = 6; u.max_life = 6; u.defense = 9
	u.st = {"P": 0, "E": 0, "S": 1, "C": 0}; u.main = "P"
	u.weapon = "Claws"; u.w_range = 1; u.role_dmg = 0
	u.abil = []; u.cd = []
	u.name = "Plague Gremlin %d" % (i + 1)
	u.c = START_B[i].x; u.r = START_B[i].y
	return u

func start(spec: Dictionary) -> void:
	gen += 1
	hero_spec = spec.duplicate()
	units = [build_hero(spec)]
	for i in range(3):
		units.append(build_gremlin(i))
	for u in units:
		u.disp = Hex.center(u.c, u.r)
	round_n = 0; over = false; mode = ""; beams = []; order = []; turn = -1; busy = true
	view.on_battle_start()
	log_line(null, ["Plague gremlins burst out of the seed shed! Bring each one to 0 Life and it gives up and scurries off."])
	refresh()
	run_battle(gen)

# ------------------------------------------------------------ view hooks
func refresh() -> void:
	changed.emit()

func say(u, lines: Array) -> void:
	view.say(u, lines)

func log_line(u, lines: Array) -> void:
	view.log_line(u, lines)

func beat(ms: float, major: bool) -> void:
	await view.beat(ms, major)

func float_on(u, text: String, cls: String) -> void:
	view.float_on(u, text, cls)

func show_roll(u, tgt, dice: Array, add := false) -> void:
	await view.show_roll(u, tgt, dice, add)

func walk(u, path: Array) -> void:
	for p in path:
		u.c = p.x; u.r = p.y
		refresh()
		await view.wait(0.15 * minf(1.4, PACE[pace]))
	await view.wait(0.12)

func hop(u, p: Vector2i) -> void:
	u.c = p.x; u.r = p.y
	refresh()
	await view.wait(0.25)

# ------------------------------------------------------------ dice, Calamities, Enhancements
func d20(u, lines: Array) -> int:
	var r := rng(20)
	if r == 1 and fxv(u, "lucky") > 0:
		u.fx.lucky -= 1
		lines.append("Lucky Star: %s rerolls the 1." % u.name)
		r = rng(20)
	if u.fx.get("curse", false):
		u.fx.erase("curse")
		if r >= 2 and r <= 9:
			lines.append("Die Curse turns the %d into a 1." % r)
			r = 1
	if u.fx.get("bless", false):
		u.fx.erase("bless")
		if r >= 11 and r <= 19:
			lines.append("Die Blessing turns the %d into a 20." % r)
			r = 20
	return r

func calamity(u) -> String:
	var n := rng(12)
	var nm := ""
	var what := ""
	match n:
		1: nm = "Die Curse"; what = "the next D20 counts any 2 to 9 as a 1"; u.fx.curse = true
		2: nm = "Butterfingers"; what = "-3 on the next attack roll"; u.fx.fumble = 1
		3: nm = "Twisted Ankle"; what = "Move -2 for the rest of the fight"; u.fx.ankle = 2
		4: nm = "Shaken"; what = "-2 Charm for the rest of the fight"; u.st.C -= 2
		5: nm = "Winded"; what = "loses an action on the next turn"; u.fx.winded = 1
		6: nm = "Off Balance"; what = "falls down: the next attack on them is +2"; u.fx.exposed = 1
		7:
			nm = "Tangled Gear"; what = "abilities rest 2 more rounds"
			for i in range(u.cd.size()):
				u.cd[i] += 2
		8: nm = "Wild Swing"; what = "embarrassing, but nothing else"
		9: nm = "Rattled"; what = "-1 to hit for 2 rounds"; u.fx.hit = timed(u, [-1, 2])
		10: nm = "Dropped Guard"; what = "-1 Defense for 2 rounds"; u.fx.def = timed(u, [-1, 2])
		11: nm = "Slow Start"; what = "-3 Speed next round"; u.fx.slow = [3, 1]
		12:
			nm = "Stumble"; what = "the rest of this turn is lost"
			if cur() == u:
				u.actions = 0
	return "[color=%s]Calamity %d, %s: %s %s.[/color]" % [CAL_COL, n, nm, u.name, what]

func enhancement(u) -> String:
	var n := rng(12)
	var nm := ""
	var what := ""
	match n:
		1: nm = "Second Wind"; what = "heals 1d6+E"; heal_unit(u, rng(6) + stat(u, "E"))
		2: nm = "Fleet Foot"; what = "Move +2 for the fight"; u.fx.fleet = 2
		3: nm = "Keen Edge"; what = "+1 damage die for the fight"; u.fx.keen = 1
		4: nm = "Steady Heart"; what = "+2 Charm for the fight"; u.st.C += 2
		5: nm = "Stone Skin"; what = "Defense +1 for the fight"; u.defense += 1
		6:
			nm = "Clear Mind"; what = "abilities are ready"
			for i in range(u.cd.size()):
				u.cd[i] = 0
		7: nm = "Rally"; what = "+1 to hit for the fight"; u.fx.rally = 1
		8: nm = "Far Sight"; what = "ranges +2 for the fight"; u.fx.far = 2
		9: nm = "Lucky Star"; what = "one free reroll of a 1"; u.fx.lucky = fxv(u, "lucky") + 1
		10: nm = "Light Step"; what = "rough ground costs 1"; u.fx.light = true
		11:
			nm = "Second Breath"; what = "+1 action this turn"
			if cur() == u:
				u.actions += 1
		12: nm = "Die Blessing"; what = "the next D20 counts 11 to 19 as a 20"; u.fx.bless = true
	return "[color=%s]Enhancement %d, %s: %s %s.[/color]" % [ENH_COL, n, nm, u.name, what]

# ------------------------------------------------------------ combat core
func flanked(t, att) -> bool:
	var adj := units.filter(func(x): return x.alive and x.team == att.team and Hex.dist(x.pos(), t.pos()) == 1)
	if adj.size() < 2:
		return false
	var N := Hex.neighbors(t.pos())
	var idx := []
	for f in adj:
		idx.append(N.find(f.pos()))
	for i in idx:
		if i >= 0 and idx.has((i + 3) % 6):
			return true
	return false

func _madd(m: Dictionary, n: int, label: String) -> void:
	if n != 0:
		m.sum += n
		m.parts.append("%s%d %s" % ["+" if n > 0 else "", n, label])

func _dadd(m: Dictionary, n: int, label: String) -> void:
	if n != 0:
		m.def += n
		m.dp.append("%s%d %s" % ["+" if n > 0 else "", n, label])

func mods(att, tgt, stat_key, o: Dictionary = {}) -> Dictionary:
	var m := {"sum": 0, "parts": [], "def": tgt.defense, "dp": []}
	if stat_key:
		_madd(m, stat(att, stat_key), STATN(stat_key))
	_madd(m, int(o.get("hitMod", 0)), o.get("hitLabel", "ability"))
	if Hex.tget(att.c, att.r, "high") and not Hex.tget(tgt.c, tgt.r, "high"):
		_madd(m, 1, "high ground")
	if att.fx.has("hitUp"): _madd(m, att.fx.hitUp[0], "rallied")
	if att.fx.has("hit"): _madd(m, att.fx.hit[0], "shaken")
	if att.fx.get("rally", 0): _madd(m, 1, "Rally")
	if att.fx.get("fumble", 0): _madd(m, -3, "Butterfingers")
	if flanked(tgt, att): _madd(m, 2, "flanking")
	if tgt.fx.has("mark") and tgt.team != att.team: _madd(m, 2, "Marked")
	if o.get("allyBonus", 0):
		for a in allies_of(att):
			if a != att and Hex.dist(a.pos(), tgt.pos()) == 1:
				_madd(m, int(o.allyBonus), "ally close")
				break
	if tgt.fx.has("defUp"): _dadd(m, tgt.fx.defUp[0], "guarded")
	if tgt.fx.has("def"): _dadd(m, tgt.fx.def[0], "weakened")
	if not o.get("noCover", false) and Hex.dist(att.pos(), tgt.pos()) > 1 and Hex.sight(att.pos(), tgt.pos()).cover:
		_dadd(m, 2, "cover")
	if tgt.fx.get("exposed", 0): _dadd(m, -2, "knocked down")
	return m

func hit_p(att, tgt, sp: Dictionary = {}) -> float:
	var m := mods(att, tgt, sp.get("statKey"), sp)
	var need: int = m.def - m.sum # must beat Defense: roll > need
	var crit_min := int(sp.get("critMin", 20))
	return clampf(20 - need, maxf(1, 21 - crit_min), 19) / 20.0

func heal_unit(t, n: int) -> int:
	var before: int = t.life
	t.life = mini(t.max_life, t.life + n)
	return t.life - before

func hurt(t, n: int, src) -> Array:
	var notes := []
	if src != null and src.team != t.team:
		t.last_hit_by = src
	t.life = maxi(0, t.life - n)
	float_on(t, "-%d" % n, "dmg")
	if t.life == 0:
		t.alive = false
		t.out = "ko"
		notes.append("%s %s" % [t.name, "gives up and scurries off" if t.gremlin else "is knocked out"])
	if src != null and src.alive and t.fx.get("thorns", 0):
		var d := roll_dice([[int(t.fx.get("thornsN", 1)), 6]])
		notes.append("thorns sting %s for %d" % [src.name, d])
		notes.append_array(hurt(src, d, null))
	return notes

# One attack (or roll-only effect when sp.dice is null). Returns { hit, lines }.
func strike(att, tgt, sp: Dictionary) -> Dictionary:
	var res := {"hit": false, "lines": []}
	var crit_min := int(sp.get("critMin", 20))
	var sure: bool = sp.get("sure", false)
	for i in range(int(sp.get("hits", 1))):
		if not tgt.alive or not att.alive:
			break
		var m := mods(att, tgt, sp.get("statKey"), sp)
		var r := d20(att, res.lines)
		att.fx.erase("fumble")
		var cls := ""
		if r == 1 and not sure: cls = "fumble"
		elif r != 1 and r >= crit_min: cls = "crit"
		await show_roll(att, tgt, [{"s": 20, "v": r, "cls": cls, "lbl": "to hit"}])
		var total: int = r + m.sum
		var crit := r != 1 and r >= crit_min
		var hit: bool = sure or (r != 1 and (crit or total > m.def))
		beams = [{"a": att.pos(), "b": tgt.pos(), "team": att.team}]
		var line := "%s → %s: rolled [b]%d[/b]%s = %d vs Defense %d%s" % [sp.get("label", "Attack"), tgt.name, r,
			(" " + " ".join(m.parts)) if m.parts.size() else "", total, m.def, (" (" + ", ".join(m.dp) + ")") if m.dp.size() else ""]
		if tgt.fx.get("exposed", 0):
			tgt.fx.erase("exposed")
		if r == 1 and not sure:
			res.lines.append(line + " · [b]natural 1, miss[/b]")
			float_on(tgt, "miss", "miss")
			res.lines.append(calamity(att))
			continue
		if not hit:
			res.lines.append(line + " · [b]miss[/b]")
			float_on(tgt, "miss", "miss")
			continue
		res.hit = true
		if sp.get("dice") == null:
			res.lines.append(line + " · [b]%s[/b]" % ("CRIT" if crit else "it works"))
			if crit: res.lines.append(enhancement(att))
			continue
		var dice := []
		for d in sp.dice:
			dice.append([int(d[0]), int(d[1])])
		if att.fx.get("keen", 0): dice[0][0] += 1
		if sp.get("extraDie", 0): dice[0][0] += int(sp.extraDie)
		if crit:
			for d in dice:
				d[0] *= 2
		var add := 0
		if sp.get("dmgStat"): add += stat(att, sp.dmgStat)
		add += int(sp.get("bonus", 0)) + fxv(att, "dmgUp") - fxv(att, "weak")
		var dl := roll_list(dice)
		if dl.size(): dl[0]["lbl"] = "damage"
		await show_roll(att, tgt, dl, true)
		var dmg := add
		for d in dl:
			dmg += d.v
		dmg = maxi(1, dmg)
		var gnote := ""
		if tgt.fx.get("guard", 0) and dmg > 1:
			dmg -= 1
			tgt.fx.erase("guard")
			gnote = " (Defend took 1 off)"
		var notes := hurt(tgt, dmg, att)
		res.lines.append(line + " · [b]%s%d damage[/b]%s%s" % ["CRIT! " if crit else "Hit, ", dmg, gnote, (" · " + " · ".join(notes)) if notes.size() else ""])
		if crit: res.lines.append(enhancement(att))
		await view.wait(0.12)
	return res

func roll_list(list: Array) -> Array:
	var out := []
	for d in list:
		for i in range(d[0]):
			out.append({"s": d[1], "v": rng(d[1])})
	return out

func weapon_spec(u) -> Dictionary:
	return {"label": u.weapon, "dice": [[1, 6]], "statKey": u.main, "dmgStat": u.main, "bonus": u.role_dmg}

# ------------------------------------------------------------ effects
func apply_on(src, t, on) -> Array:
	var n := []
	if on == null or not t.alive:
		return n
	var fx: Dictionary = t.fx
	if on.has("weak"): fx.weak = timed(t, on.weak); n.append("deals %d less for %s" % [on.weak[0], rds(on.weak[1])])
	if on.has("hit"): fx.hit = timed(t, on.hit); n.append("%d to hit for %s" % [on.hit[0], rds(on.hit[1])])
	if on.has("def"): fx.def = timed(t, on.def); n.append("%d Defense for %s" % [on.def[0], rds(on.def[1])])
	if on.has("dot"): fx.dot = timed(t, on.dot); n.append("loses %d Life a turn for %d turns" % [on.dot[0], on.dot[1]])
	if on.has("root"): fx.root = maxi(int(fx.get("root", 0)), int(on.root)); n.append("can’t move for %s" % rds(int(on.root)))
	if on.has("stun"): fx.stun = maxi(int(fx.get("stun", 0)), int(on.stun)); n.append("loses the next turn")
	if on.has("last"): fx.last = true; n.append("acts last next round")
	if on.has("exposed"): fx.exposed = 1; n.append("knocked down (next attack on it +2)")
	if on.has("slow"): fx.slow = [on.slow[0], on.slow[1]]; n.append("Speed -%d" % on.slow[0])
	if on.has("move"): fx.move = timed(t, on.move); n.append("Move %d" % on.move[0])
	if on.has("charm"): fx.charm = timed(t, on.charm); n.append("%d Charm" % on.charm[0])
	if on.has("mark"): fx.mark = timed(t, [2, on.mark]); n.append("Marked for %s (allies +2 to hit it)" % rds(int(on.mark)))
	if on.has("knock"): n.append(shove(src, t, int(on.knock), 1))
	if on.has("pull"): n.append(shove(src, t, int(on.pull), -1))
	return n.filter(func(s): return s != "")

func shove(src, t, steps: int, dir: int) -> String:
	var moved := 0
	for s in range(steps):
		var d0 := Hex.dist(src.pos(), t.pos())
		var N := Hex.neighbors(t.pos()).filter(func(p): return Hex.dist(src.pos(), p) == d0 + dir and not Hex.tget(p.x, p.y, "block") and occupied(p) == null and p != src.pos())
		if N.is_empty():
			break
		t.c = N[0].x; t.r = N[0].y
		moved += 1
	if moved:
		return "%s %d hex%s" % ["pushed back" if dir > 0 else "pulled in", moved, "es" if moved > 1 else ""]
	return "can’t be pushed (something solid is behind)" if dir > 0 else "can’t be pulled"

func cleanse(t) -> String:
	var bad := false
	for k in ["dot", "held", "root", "weak", "charm", "barbs", "slow", "exposed"]:
		if t.fx.has(k): t.fx.erase(k); bad = true
	for k in ["hit", "def", "move"]:
		if t.fx.has(k) and t.fx[k][0] < 0: t.fx.erase(k); bad = true
	return "their penalties" if bad else ""

func buff(c, t, s) -> Array:
	if s == null or not t.alive:
		return []
	var p := []
	if s.has("heal") or s.has("healFlat"):
		var n: int = s.healFlat if s.has("healFlat") else roll_dice([[s.heal[0], s.heal[1]]]) + (stat(c, s.heal[2]) if s.heal.size() > 2 else 0)
		var got := heal_unit(t, n)
		p.append("heals %d" % got)
		if got: float_on(t, "+%d" % got, "heal")
	if s.has("cleanse"):
		var had := cleanse(t)
		if had: p.append("shakes off " + had)
	if s.has("defUp"):
		if not t.fx.has("defUp") or t.fx.defUp[0] <= s.defUp[0]:
			t.fx.defUp = timed(t, s.defUp)
		p.append("+%d Defense for %s" % [s.defUp[0], rds(s.defUp[1])])
	if s.has("hitUp"): t.fx.hitUp = timed(t, s.hitUp); p.append("+%d to hit for %s" % [s.hitUp[0], rds(s.hitUp[1])])
	if s.has("dmgUp"): t.fx.dmgUp = timed(t, s.dmgUp); p.append("+%d damage for %s" % [s.dmgUp[0], rds(s.dmgUp[1])])
	if s.has("moveUp"): t.fx.moveUp = timed(t, s.moveUp); p.append("+%d Move for %s" % [s.moveUp[0], rds(s.moveUp[1])])
	if s.has("moveNow"): t.fx.moveNow = int(s.moveNow); p.append("+%d Move this turn" % s.moveNow)
	if s.has("thorns"):
		t.fx.thorns = int(s.thorns) + (1 if t == cur() else 0)
		t.fx.thornsN = int(s.get("thornsN", 1))
		p.append("wrapped in thorns (%dd6) for %s" % [t.fx.thornsN, rds(int(s.thorns))])
	if p.is_empty():
		return []
	return ["%s: %s." % [t.name, ", ".join(p)]]

func most_hurt(u, R: int):
	var l := allies_of(u).filter(func(x): return Hex.dist(x.pos(), u.pos()) <= R and x.life < x.max_life)
	l.sort_custom(func(a, b): return float(a.life) / a.max_life < float(b.life) / b.max_life)
	return l[0] if l.size() else null

# ------------------------------------------------------------ reach and targets
func move_range(u) -> int:
	if u.fx.get("root", 0):
		return 0
	return maxi(1, 3 + stat(u, "S") + fxv(u, "fleet") - fxv(u, "ankle") + fxv(u, "moveUp") + fxv(u, "move") + fxv(u, "moveNow"))

# Dijkstra over hexes: { best: {Vector2i: cost}, prev: {Vector2i: Vector2i} }
func reachable(u, budget: int) -> Dictionary:
	var best := {u.pos(): 0}
	var prev := {}
	var q := [[0, u.pos()]]
	while q.size():
		q.sort_custom(func(a, b): return a[0] < b[0])
		var top = q.pop_front()
		var d: int = top[0]
		var p: Vector2i = top[1]
		for n in Hex.neighbors(p):
			var t := Hex.ter(n.x, n.y)
			if t.get("block", false) or occupied(n, u) != null:
				continue
			var nd: int = d + (1 if u.fx.get("light", false) else int(t.cost))
			if nd > budget:
				continue
			if nd < int(best.get(n, 99)):
				best[n] = nd
				prev[n] = p
				q.append([nd, n])
	best.erase(u.pos())
	return {"best": best, "prev": prev}

func path_to(R: Dictionary, u, p: Vector2i) -> Array:
	var path := []
	var k = p
	while k != null and k != u.pos():
		path.push_front(k)
		k = R.prev.get(k, null)
	return path

func in_reach(u, f, R: int) -> bool:
	var d := Hex.dist(u.pos(), f.pos())
	return d <= R and (d == 1 or Hex.sight(u.pos(), f.pos()).ok)

func weapon_range(u) -> int:
	return u.w_range + (fxv(u, "far") if u.w_range > 1 else 0)

func weapon_targets(u) -> Array:
	return enemies_of(u).filter(func(f): return in_reach(u, f, weapon_range(u)))

func landing(u, f, n: int):
	if Hex.dist(u.pos(), f.pos()) == 1:
		return u.pos()
	var best = null
	var bd := 99
	for p in Hex.neighbors(f.pos()):
		if Hex.tget(p.x, p.y, "block") or occupied(p, u) != null:
			continue
		var d := Hex.dist(u.pos(), p)
		if d <= n and d < bd:
			best = p; bd = d
	return best

func fly_hexes(u, n: int) -> Array:
	var out := []
	for r in range(Hex.ROWS):
		for c in range(Hex.COLS):
			var p := Vector2i(c, r)
			var d := Hex.dist(u.pos(), p)
			if d >= 1 and d <= n and not Hex.tget(c, r, "block") and occupied(p) == null:
				out.append(p)
	return out

func burst_foes(u, radius: int, mx: int = 0) -> Array:
	var f := enemies_of(u).filter(func(e): return in_reach(u, e, radius))
	f.sort_custom(func(a, b): return a.life < b.life)
	return f.slice(0, mx) if mx > 0 else f

func ab_targets(u, a: Dictionary) -> Array:
	match a.kind:
		"self", "aura": return [u]
		"burst": return [u] if burst_foes(u, int(a.radius), int(a.get("max", 0))).size() else []
		"attacks": return weapon_targets(u)
		"ally": return allies_of(u).filter(func(x): return Hex.dist(u.pos(), x.pos()) <= int(a.range))
		"fly": return fly_hexes(u, int(a.fly))
	var n := int(a.get("leap", a.get("blink", 0)))
	if n > 0:
		return enemies_of(u).filter(func(f): return landing(u, f, n) != null)
	var R: int = int(a.range) + (fxv(u, "far") if int(a.range) > 1 else 0)
	return enemies_of(u).filter(func(f): return in_reach(u, f, R))

func range_txt(a: Dictionary) -> String:
	match a.kind:
		"self": return "on yourself"
		"aura": return "you and allies next to you" if int(a.radius) == 1 else "you and allies within %d" % a.radius
		"fly": return "fly %d" % a.fly
		"attacks": return "weapon attacks"
		"ally": return "range %d" % a.range
	if a.has("leap"): return "jump %d" % a.leap
	if a.has("blink"): return "step %d" % a.blink
	if a.has("range"): return "range %d" % a.range
	return "ready"

# ------------------------------------------------------------ doing things (shared by you and the computer)
func terrain_note(p: Vector2i) -> String:
	if Hex.tget(p.x, p.y, "cover"): return " (into the trees: cover +2)"
	if Hex.tget(p.x, p.y, "high"): return " (onto the hill: +1 to hit from above)"
	return ""

func perform(u, a: Dictionary, tgt) -> Array:
	var i: int = u.abil.find(a)
	if i >= 0:
		u.cd[i] = int(Rules.TIER_CD[int(a.tier)]) + 1
	u.ab_used = true
	var L := []
	match a.kind:
		"burst":
			L.append("[b]%s[/b]" % a.name)
			for f in burst_foes(u, int(a.radius), int(a.get("max", 0))):
				var res: Dictionary = await strike(u, f, {"label": a.name, "dice": [a.dmg], "statKey": a.stat, "dmgStat": a.stat})
				L.append_array(res.lines)
				if res.hit and f.alive and a.has("on"):
					var n := apply_on(u, f, a.on)
					if n.size(): L.append("%s: %s." % [f.name, ", ".join(n)])
		"self", "aura":
			var grp: Array = [u] if a.kind == "self" else allies_of(u).filter(func(x): return Hex.dist(x.pos(), u.pos()) <= int(a.radius))
			L.append("[b]%s[/b]" % a.name)
			for t in grp:
				L.append_array(buff(u, t, a.self))
		"ally":
			beams = [] if tgt == u else [{"a": u.pos(), "b": tgt.pos(), "team": u.team, "heal": true}]
			L.append("[b]%s[/b] → %s" % [a.name, "self" if tgt == u else tgt.name])
			L.append_array(buff(u, tgt, a.self))
		"fly":
			await hop(u, tgt)
			L.append("[b]%s[/b]: %s flies%s." % [a.name, u.name, terrain_note(tgt) if terrain_note(tgt) else " to a new spot"])
			if a.has("self"): L.append_array(buff(u, u, a.self))
			if a.has("shot"):
				var T := weapon_targets(u)
				T.sort_custom(func(x, y): return x.life < y.life)
				if T.size():
					var res: Dictionary = await strike(u, T[0], {"label": "Free shot", "dice": [[a.shot[0], a.shot[1]]], "statKey": a.shot[2], "dmgStat": a.shot[2]})
					L.append_array(res.lines)
				else:
					L.append("No foe in range for the free shot.")
		"attacks":
			L.append("[b]%s[/b]" % a.name)
			for k in range(int(a.n)):
				if not tgt.alive or not u.alive:
					break
				var sp := weapon_spec(u)
				sp.label = "%s %d" % [u.weapon, k + 1]; sp.hitMod = a.get("hitMod", 0); sp.hitLabel = a.name; sp.extraDie = a.get("extraDie", 0)
				var res: Dictionary = await strike(u, tgt, sp)
				L.append_array(res.lines)
		_:
			var jump := int(a.get("leap", a.get("blink", 0)))
			if jump > 0:
				var spot = landing(u, tgt, jump)
				if spot != null and spot != u.pos():
					await hop(u, spot)
					L.append("%s %s next to %s." % [u.name, "leaps" if a.has("leap") else "steps through the shadows", tgt.name])
			var sp := {"label": a.name, "dice": [a.dmg] if a.has("dmg") else null, "statKey": a.stat, "dmgStat": a.stat, "hits": a.get("hits", 1),
				"hitMod": a.get("hitMod", 0), "hitLabel": a.name, "critMin": a.get("critMin", 20), "noCover": a.get("noCover", false), "allyBonus": a.get("allyBonus", 0)}
			var res: Dictionary = await strike(u, tgt, sp)
			L.append_array(res.lines)
			if res.hit and tgt.alive and a.has("on"):
				var n := apply_on(u, tgt, a.on)
				if n.size(): L.append("%s: %s." % [tgt.name, ", ".join(n)])
			if res.hit and a.has("mendAlly"):
				var m = most_hurt(u, 4)
				if m != null: L.append_array(buff(u, m, {"heal": a.mendAlly}))
			if a.has("self"):
				var s: Dictionary = a.self.duplicate()
				if not res.hit: s.erase("heal")
				L.append_array(buff(u, u, s))
	return L

func start_of_turn(u) -> Array:
	var L := []
	if u.fx.has("dot"):
		var n := hurt(u, u.fx.dot[0], null)
		L.append("Poison: loses %d Life%s." % [u.fx.dot[0], (" · " + " · ".join(n)) if n.size() else ""])
	return L

func end_turn_tick(u) -> void:
	for k in ["hit", "weak", "def", "dot", "defUp", "hitUp", "dmgUp", "moveUp", "move", "charm", "mark"]:
		if u.fx.has(k):
			u.fx[k] = [u.fx[k][0], u.fx[k][1] - 1]
			if u.fx[k][1] <= 0: u.fx.erase(k)
	for k in ["thorns", "root"]:
		if u.fx.has(k):
			u.fx[k] = int(u.fx[k]) - 1
			if u.fx[k] <= 0: u.fx.erase(k)
	u.fx.erase("exposed"); u.fx.erase("moveNow")
	for i in range(u.cd.size()):
		u.cd[i] = maxi(0, u.cd[i] - 1)

# ------------------------------------------------------------ rounds and turns
func run_battle(g: int) -> void:
	await view.wait(0.4)
	while g == gen:
		if check_end():
			return
		round_n += 1
		var ord := []
		for u in units:
			if u.alive:
				ord.append({"u": u, "s": rng(20) + stat(u, "S") - (u.fx.slow[0] if u.fx.has("slow") else 0) - (40 if u.fx.get("last", false) else 0) + randf()})
		ord.sort_custom(func(a, b): return a.s > b.s)
		order = ord.map(func(x): return x.u)
		for u in order:
			u.fx.erase("last")
			if u.fx.has("slow"):
				u.fx.slow = [u.fx.slow[0], u.fx.slow[1] - 1]
				if u.fx.slow[1] <= 0: u.fx.erase("slow")
		log_line(null, ["Round %d: %s." % [round_n, ", ".join(order.map(func(x): return x.name))]])
		turn = -1
		while g == gen:
			if check_end():
				return
			turn += 1
			if turn >= order.size():
				break
			var u = order[turn]
			if not u.alive:
				continue
			view.clear_trays()
			mode = ""; beams = []; busy = true
			var pre := start_of_turn(u)
			refresh()
			var skip := ""
			if not u.alive: skip = " "
			elif u.fx.get("stun", 0): u.fx.stun -= 1; skip = "Can’t act this turn."
			if skip != "":
				if skip.strip_edges() != "": pre.append(skip)
				say(u, pre); log_line(u, pre); end_turn_tick(u); refresh()
				await beat(1100, true)
				continue
			u.actions = 2; u.free_move = true; u.ab_used = false; u.fx.erase("guard")
			if u.fx.get("winded", 0):
				u.actions = 1; u.fx.erase("winded"); pre.append("Winded: only 1 action this turn.")
			if u.team == "A" and not auto_hero:
				if pre.size():
					log_line(u, pre); say(u, pre)
				else:
					say(null, [])
				busy = false
				refresh()
				await turn_finished
				if g != gen: return
			else:
				if pre.size(): log_line(u, pre)
				say(u, pre + ["Thinking…"]); refresh()
				await beat(700, false)
				await ai_turn(u)
				if g != gen: return
				end_turn_tick(u); refresh()
				await beat(250, false)

func check_end() -> bool:
	if over:
		return true
	var a := units.filter(func(u): return u.team == "A" and u.alive).size()
	var b := units.filter(func(u): return u.team == "B" and u.alive).size()
	if a and b:
		return false
	over = true; busy = true
	refresh()
	view.banner(a > 0, round_n)
	return true

# ------------------------------------------------------------ your turn
func my_turn() -> bool:
	var u = cur()
	return not over and not busy and u != null and u.team == "A" and u.alive and (u.actions > 0 or can_free_move(u))

func can_free_move(u) -> bool:
	return u.free_move and move_range(u) > 0

func set_mode(m: String) -> void:
	mode = "" if mode == m else m
	refresh()

func finish(u, lines: Array, cost = 1) -> void:
	say(u, lines); log_line(u, lines); refresh()
	u.actions = 0 if typeof(cost) == TYPE_STRING else u.actions - cost
	await beat(350, false)
	beams = []
	if check_end():
		turn_finished.emit()
		return
	if not u.alive or (u.actions <= 0 and not can_free_move(u)):
		end_turn_tick(u); mode = ""; refresh()
		await beat(500, false)
		turn_finished.emit()
		return
	busy = false
	refresh()

func click_hex(p: Vector2i) -> void:
	var t = occupied(p)
	if not my_turn() or mode == "":
		if t != null: view.show_unit_tip(t)
		return
	var u = cur()
	var m := mode
	if m == "move":
		var R := reachable(u, move_range(u))
		if not R.best.has(p): return
		var free: bool = u.free_move
		busy = true; mode = ""
		var path := path_to(R, u, p)
		await walk(u, path)
		if free: u.free_move = false
		await finish(u, ["%s: %d hex%s%s." % ["Free move" if free else "Moves again", path.size(), "es" if path.size() > 1 else "", terrain_note(p)]], 0 if free else 1)
		return
	if m == "attack":
		if t == null or not weapon_targets(u).has(t): return
		busy = true; mode = ""
		var res: Dictionary = await strike(u, t, weapon_spec(u))
		await finish(u, res.lines)
		return
	if m.begins_with("ab"):
		var a: Dictionary = u.abil[int(m.substr(2))]
		var v := ab_targets(u, a)
		if a.kind == "fly":
			if not v.has(p): return
			busy = true; mode = ""
			await finish(u, await perform(u, a, p))
			return
		if t == null or not v.has(t): return
		busy = true; mode = ""
		await finish(u, await perform(u, a, t))

func press_act(act: String) -> void:
	var u = cur()
	if not my_turn(): return
	if act == "move" or act == "attack":
		set_mode(act)
		return
	if act == "defend":
		busy = true; mode = ""
		u.fx.guard = 1
		await finish(u, ["[b]Defend[/b]: the next hit on %s does 1 less damage." % u.name])
		return
	if act == "end":
		busy = true; mode = ""
		say(u, ["Ends the turn."])
		end_turn_tick(u); refresh()
		await beat(300, false)
		turn_finished.emit()
		return
	if act.begins_with("ab"):
		var a: Dictionary = u.abil[int(act.substr(2))]
		if a.kind in ["self", "aura", "burst"]:
			busy = true; mode = ""
			await finish(u, await perform(u, a, u))
			return
		# an ally ability with only yourself in reach (you fight alone here) just goes on you
		if a.kind == "ally" and ab_targets(u, a).size() == 1:
			busy = true; mode = ""
			await finish(u, await perform(u, a, u))
			return
		set_mode(act)

# What the player can do right now, for the action bar and the ring.
func action_list(u) -> Array:
	var my := my_turn()
	var act: bool = u.actions > 0
	var L := []
	var mr := move_range(u)
	var fm: bool = u.free_move or cur() != u
	L.append({"act": "move", "label": "Move" if fm else "Move again", "sub": "can’t move" if u.fx.get("root", 0) else "%d hexes%s" % [mr, "" if fm else " · 1 action"],
		"on": my and mr > 0 and (u.free_move or act), "icon": "icon/move",
		"tip": "[b]%s[/b]\nWalk up to your Move in hexes, all at once. Trees, hills and the creek cost 2. %s" % ["Free move" if u.free_move else "Move again",
			"Your free Move can come before or after your actions, but it isn’t split up." if u.free_move else "Moving again costs an action."]})
	L.append({"act": "attack", "label": "Attack", "sub": "%s, range %d" % [u.weapon, weapon_range(u)], "on": my and act and weapon_targets(u).size() > 0,
		"icon": "icon/attack/" + u.weapon,
		"tip": "[b]Attack[/b]\n%s: 1d6+%s%s at range %d. Beat the foe’s Defense with D20 + %s." % [u.weapon, STATN(u.main), "+1" if u.role_dmg else "", weapon_range(u), STATN(u.main)]})
	for i in range(u.abil.size()):
		var a: Dictionary = u.abil[i]
		var ok: bool = my and act and not u.ab_used and u.cd[i] == 0 and ab_targets(u, a).size() > 0
		var sub := "resting %d" % u.cd[i] if u.cd[i] else ("one ability a round" if u.ab_used else range_txt(a))
		L.append({"act": "ab%d" % i, "label": a.name, "sub": sub, "on": ok, "icon": "icon/ab/" + a.name, "cd": u.cd[i],
			"tip": "[b]%s[/b]  [color=#a08a60]%s · level %d · %s[/color]\n%s\n[color=#a08a60]Rests %s after use%s.[/color]" % [a.name, a.branch, int(a.tier), range_txt(a), a.t,
				rds(int(Rules.TIER_CD[int(a.tier)])), (" · resting now (%d)" % u.cd[i]) if u.cd[i] else ""]})
	L.append({"act": "defend", "label": "Defend", "sub": "next hit -1", "on": my and act and not u.fx.get("guard", 0), "icon": "icon/defend",
		"tip": "[b]Defend[/b]\nThe next hit on you does 1 less damage (until your next turn)."})
	L.append({"act": "end", "label": "End turn", "sub": "%d action%s%s left" % [u.actions, "" if u.actions == 1 else "s", " + Move" if u.free_move else ""], "on": my, "icon": "icon/end",
		"tip": "[b]End turn[/b]\nSkip any actions (and the free Move) you have left."})
	return L

# Hexes or units the current mode can pick.
func mode_targets() -> Dictionary:
	var u = cur()
	if not my_turn() or mode == "":
		return {"units": [], "hexes": {}}
	if mode == "move":
		return {"units": [], "hexes": reachable(u, move_range(u)).best}
	if mode == "attack":
		return {"units": weapon_targets(u), "hexes": {}}
	if mode.begins_with("ab"):
		var a: Dictionary = u.abil[int(mode.substr(2))]
		var v := ab_targets(u, a)
		if a.kind == "fly":
			var h := {}
			for p in v: h[p] = 1
			return {"units": [], "hexes": h}
		return {"units": v, "hexes": {}}
	return {"units": [], "hexes": {}}

func hint_for_hover(p: Vector2i) -> String:
	var u = cur()
	if not my_turn() or mode == "":
		return ""
	var t = occupied(p)
	if mode == "move":
		var R = reachable(u, move_range(u)).best.get(p, null)
		return ("Move here for %d of your %d movement.%s" % [R, move_range(u), terrain_note(p)]) if R != null else "You can’t reach that hex this action."
	if t == null:
		return ""
	var sp = null
	var label := ""
	if mode == "attack":
		sp = weapon_spec(u); label = u.weapon
	elif mode.begins_with("ab"):
		var a: Dictionary = u.abil[int(mode.substr(2))]
		if a.kind == "fly": return ""
		if t.team == u.team: return "%s on %s (%d/%d Life)." % [a.name, t.name, t.life, t.max_life]
		if a.kind == "attacks":
			sp = weapon_spec(u); sp.hitMod = a.get("hitMod", 0)
		else:
			sp = {"statKey": a.get("stat"), "critMin": a.get("critMin", 20), "noCover": a.get("noCover", false), "allyBonus": a.get("allyBonus", 0)}
		label = a.name
	if sp == null or t.team == u.team:
		return ""
	var d := Hex.dist(u.pos(), t.pos())
	var M := mods(u, t, sp.get("statKey"), sp)
	if not mode_targets().units.has(t):
		return "%s: %s." % [t.name, "no line of sight" if d > 1 and not Hex.sight(u.pos(), t.pos()).ok else "out of reach (%d hexes)" % d]
	return "%s on %s: %d%% to hit (Defense %d%s). %d/%d Life." % [label, t.name, roundi(hit_p(u, t, sp) * 100), M.def, (": " + ", ".join(M.dp)) if M.dp.size() else "", t.life, t.max_life]

# ------------------------------------------------------------ the computer
func rider_val(on, t) -> float:
	if on == null: return 0.0
	var v := 0.0
	if on.has("stun"): v += (1 if t.fx.get("stun", 0) else 7) * on.stun
	if on.has("root"): v += 0.2 if t.fx.get("root", 0) else 1.2 * on.root * (0.5 if t.w_range > 1 else 1.0)
	if on.has("weak"): v += on.weak[0] * on.weak[1] * 0.7
	if on.has("hit"): v += -on.hit[0] * on.hit[1] * 1.1
	if on.has("def"): v += -on.def[0] * on.def[1] * 0.9
	if on.has("dot"): v += 0.5 if t.fx.has("dot") else on.dot[0] * on.dot[1]
	if on.has("last"): v += 1
	if on.has("exposed"): v += 1.5
	if on.has("slow"): v += 0.6 * on.slow[1]
	if on.has("move"): v += 0.5 * on.move[1]
	if on.has("knock"): v += 0.8
	if on.has("pull"): v += 0.5
	if on.has("charm"): v += 0.8
	return v

func ev_strike(u, t, sp: Dictionary) -> Dictionary:
	var p := 1.0 if sp.get("sure", false) else hit_p(u, t, sp)
	if sp.get("dice") == null:
		return {"v": 0.0, "p": p}
	var avg := avg_dice(sp.dice) + (stat(u, sp.dmgStat) if sp.get("dmgStat") else 0) + int(sp.get("bonus", 0)) + fxv(u, "dmgUp") - fxv(u, "weak")
	var hits := int(sp.get("hits", 1))
	var v := p * maxf(1, avg) * hits
	if avg * hits >= t.life: v += 8 * p
	v += (1.0 - float(t.life) / t.max_life) * 3 * p
	return {"v": v, "p": p}

func buff_val(u, t, s) -> float:
	if s == null: return 0.0
	var v := 0.0
	var near := func(r): return enemies_of(u).any(func(e): return Hex.dist(e.pos(), t.pos()) <= r)
	if s.has("heal") or s.has("healFlat"):
		var avg: float = s.healFlat if s.has("healFlat") else s.heal[0] * (s.heal[1] + 1) / 2.0 + (stat(u, s.heal[2]) if s.heal.size() > 2 else 0)
		var miss: int = t.max_life - t.life
		v += minf(miss, avg) * 1.1 if miss >= avg * 0.6 else 0.0
	if s.has("cleanse"):
		for k in ["dot", "held", "root", "weak", "charm", "barbs"]:
			if t.fx.has(k): v += 2.5
	if s.has("defUp") and near.call(5): v += s.defUp[0] * s.defUp[1] * 0.8 * (0.25 if t.fx.has("defUp") else 1.0)
	if s.has("hitUp") and near.call(5): v += s.hitUp[0] * s.hitUp[1] * (0.2 if t.fx.has("hitUp") else 1.0)
	if s.has("dmgUp") and near.call(3): v += s.dmgUp[0] * s.dmgUp[1] * 1.2
	if s.has("moveUp"): v += 0.3 if near.call(6) else 1.2
	if s.has("thorns") and near.call(3): v += 3.5 * (0.2 if t.fx.has("thorns") else 1.0)
	return v

func ev_ability(u, a: Dictionary, t) -> float:
	match a.kind:
		"self": return buff_val(u, u, a.self)
		"aura":
			var s := 0.0
			for x in allies_of(u).filter(func(x): return Hex.dist(x.pos(), u.pos()) <= int(a.radius)): s += buff_val(u, x, a.self)
			return s
		"ally": return buff_val(u, t, a.self)
		"burst":
			var s := 0.0
			for f in burst_foes(u, int(a.radius), int(a.get("max", 0))): s += ev_strike(u, f, {"dice": [a.dmg], "statKey": a.stat, "dmgStat": a.stat}).v
			return s
		"attacks":
			var sp := weapon_spec(u); sp.dice = [[1 + int(a.get("extraDie", 0)), 6]]; sp.hitMod = a.get("hitMod", 0); sp.hits = a.n
			return ev_strike(u, t, sp).v
	var E := ev_strike(u, t, {"dice": [a.dmg] if a.has("dmg") else null, "statKey": a.stat, "dmgStat": a.stat, "hits": a.get("hits", 1), "hitMod": a.get("hitMod", 0),
		"critMin": a.get("critMin", 20), "noCover": a.get("noCover", false), "allyBonus": a.get("allyBonus", 0)})
	var v: float = E.v + E.p * rider_val(a.get("on"), t)
	if a.has("self"): v += buff_val(u, u, a.self) * (E.p if a.self.has("heal") else 1.0)
	return v

# best value this unit could get from where it stands, plus how safe the spot is
func spot_val(u) -> float:
	var best := 0.0
	for t in weapon_targets(u): best = maxf(best, ev_strike(u, t, weapon_spec(u)).v)
	for i in range(u.abil.size()):
		var a: Dictionary = u.abil[i]
		if u.cd[i] > 1 or a.kind in ["fly", "self", "aura", "ally"]: continue
		for t in ab_targets(u, a):
			if t.team != u.team: best = maxf(best, ev_ability(u, a, t) * (0.5 if u.cd[i] else 1.0))
	var E := enemies_of(u)
	if E.is_empty(): return best
	var near := 99
	var adj := 0
	for e in E:
		var d := Hex.dist(e.pos(), u.pos())
		near = mini(near, d)
		if d == 1: adj += 1
	var v := best + (1.2 if Hex.tget(u.c, u.r, "cover") else 0.0) + (0.8 if Hex.tget(u.c, u.r, "high") else 0.0) - near * 0.35
	if u.w_range > 1: v -= adj * 3
	if u.life < u.max_life / 3.0: v -= adj * 1.5
	return v

func at(u, p: Vector2i, fn: Callable):
	var o: Vector2i = u.pos()
	u.c = p.x; u.r = p.y
	var v = fn.call()
	u.c = o.x; u.r = o.y
	return v

func best_move(u):
	var R := reachable(u, move_range(u))
	var best = null
	for p in R.best.keys():
		var v: float = at(u, p, func(): return spot_val(u))
		if best == null or v > best.v:
			best = {"v": v, "p": p, "R": R}
	return best

func options_here(u) -> Array:
	var o := []
	for t in weapon_targets(u): o.append({"type": "attack", "tgt": t, "score": ev_strike(u, t, weapon_spec(u)).v})
	for i in range(u.abil.size()):
		var a: Dictionary = u.abil[i]
		if u.cd[i] or u.ab_used: continue
		if a.kind == "fly": continue
		for t in ab_targets(u, a): o.append({"type": "ab", "a": a, "tgt": t, "score": ev_ability(u, a, t)})
	o.sort_custom(func(x, y): return x.score > y.score)
	return o

func describe_move(u, p: Vector2i, n: int) -> String:
	var E := enemies_of(u)
	E.sort_custom(func(a, b): return Hex.dist(a.pos(), p) < Hex.dist(b.pos(), p))
	return "Moves %d hex%s%s%s." % [n, "es" if n > 1 else "", (" toward " + E[0].name) if E.size() else "", terrain_note(p)]

func ai_turn(u) -> void:
	var g := gen
	for step in range(8):
		if not u.alive or over or g != gen: return
		var can_act: bool = u.actions > 0
		var opts := options_here(u) if can_act else []
		var best = opts[0] if opts.size() else null
		var mv = best_move(u) if (not u.fx.get("root", 0) and (u.free_move or can_act)) else null
		var here := spot_val(u)
		var L := []
		var cost := 0
		var do_move := false
		if mv != null and u.free_move and mv.v > here + 1: do_move = true
		elif can_act and best != null and best.score > 0.6:
			cost = 1
			if best.type == "attack":
				var res: Dictionary = await strike(u, best.tgt, weapon_spec(u))
				L = res.lines
			else:
				L = await perform(u, best.a, best.tgt)
		elif mv != null and u.free_move and mv.v > here - 0.5: do_move = true
		elif can_act and not u.free_move and mv != null and mv.v > here + 1.5: do_move = true
		elif can_act and not u.fx.get("guard", 0):
			u.fx.guard = 1
			L = ["[b]Defend[/b]: the next hit on %s does 1 less damage." % u.name]
			cost = 1
		else:
			break
		if do_move:
			var path := path_to(mv.R, u, mv.p)
			L = [("Free move: " if u.free_move else "Moves again: ") + describe_move(u, mv.p, path.size())]
			say(u, L)
			await walk(u, path)
			if u.free_move: u.free_move = false
			else: cost = 1
		if g != gen: return
		say(u, L); log_line(u, L); refresh()
		await beat(1500, true)
		beams = []; refresh()
		u.actions -= cost
		if check_end(): return
		if u.actions <= 0 and not can_free_move(u): break

# ------------------------------------------------------------ status tags (shared by the bar, tips and roster)
func fx_tags(u) -> Array:
	var t := []
	var f: Dictionary = u.fx
	if f.get("stun", 0): t.append(["bad", "can’t act %d" % f.stun])
	if f.get("root", 0): t.append(["bad", "can’t move %d" % f.root])
	if f.has("dot"): t.append(["bad", "poison %d/turn" % f.dot[0]])
	if f.has("weak"): t.append(["bad", "deals %d less" % f.weak[0]])
	if f.has("hit"): t.append(["bad", "%d to hit" % f.hit[0]])
	if f.has("def"): t.append(["bad", "%d Defense" % f.def[0]])
	if f.get("exposed", 0): t.append(["bad", "knocked down"])
	if f.has("charm"): t.append(["bad", "%d Charm" % f.charm[0]])
	if f.has("slow"): t.append(["bad", "Speed -%d" % f.slow[0]])
	if f.has("move") and f.move[0] < 0: t.append(["bad", "Move %d" % f.move[0]])
	if f.get("curse", false): t.append(["bad", "Die Curse"])
	if f.get("fumble", 0): t.append(["bad", "Butterfingers"])
	if f.get("ankle", 0): t.append(["bad", "Twisted Ankle"])
	if f.has("mark"): t.append(["bad", "Marked"])
	if f.get("guard", 0): t.append(["good", "Defending"])
	if f.has("defUp"): t.append(["good", "+%d Defense" % f.defUp[0]])
	if f.has("hitUp"): t.append(["good", "+%d to hit" % f.hitUp[0]])
	if f.has("dmgUp"): t.append(["good", "+%d damage" % f.dmgUp[0]])
	if f.has("moveUp"): t.append(["good", "+%d Move" % f.moveUp[0]])
	if f.get("thorns", 0): t.append(["good", "thorns"])
	if f.get("keen", 0): t.append(["good", "Keen Edge"])
	if f.get("bless", false): t.append(["good", "Die Blessing"])
	if f.get("fleet", 0): t.append(["good", "Fleet Foot"])
	if f.get("far", 0): t.append(["good", "Far Sight"])
	return t

func unit_tip(u) -> String:
	var s := "[b]%s[/b]  [color=#a08a60]%s%s[/color]\n" % [u.name, "Plague · computer" if u.gremlin else "%s · %s" % [u.lf, u.branch], ""]
	s += "Life %d/%d · Defense %d · Move %d\n" % [u.life, u.max_life, u.defense, move_range(u)]
	var st := []
	for k in ["P", "E", "S", "C"]: st.append("%s %d" % [STATN(k), stat(u, k)])
	s += " · ".join(st) + "\n"
	s += "[color=#a08a60]%s: 1d6+%s%s, range %d[/color]" % [u.weapon, STATN(u.main), "+1" if u.role_dmg else "", u.w_range]
	for i in range(u.abil.size()):
		var a: Dictionary = u.abil[i]
		s += "\n[b]%s[/b] [color=#a08a60]%s · %s[/color]\n%s" % [a.name, ("resting %d" % u.cd[i]) if u.cd[i] else "ready", range_txt(a), a.t]
	var tags := fx_tags(u)
	if tags.size():
		s += "\n" + ", ".join(tags.map(func(x): return "[color=%s]%s[/color]" % ["#e0705a" if x[0] == "bad" else "#5aa0d0", x[1]]))
	return s
