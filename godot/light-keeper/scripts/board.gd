# Draws the hex field, trees, rocks, fence, units, target rings, beams and damage numbers (map units = the HTML viewBox).
extends Node2D

const Hex = preload("res://scripts/hexmap.gd")
const Art = preload("res://scripts/art.gd")

const OL := Color("#1d140c")
var battle = null
var ui = null
var font: Font
var floats: Array = [] # { u, text, cls, t }
var hover_hex = null
var hover_unit = null
var _time := 0.0

var terrain_vp: SubViewport
var terrain_node: Node2D
const BAKE := 2.0

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	# The hex ground never changes, so it is drawn once into a texture (fast on weak GPUs and phones).
	terrain_vp = SubViewport.new()
	terrain_vp.size = Vector2i(Hex.VIEW * BAKE)
	terrain_vp.transparent_bg = true
	terrain_vp.disable_3d = true
	terrain_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	add_child(terrain_vp)
	terrain_node = Node2D.new()
	terrain_node.scale = Vector2(BAKE, BAKE)
	terrain_node.draw.connect(_draw_terrain)
	terrain_vp.add_child(terrain_node)

func _process(delta: float) -> void:
	_time += delta
	var moving := false
	if battle:
		for u in battle.units:
			var target: Vector2 = Hex.center(u.c, u.r)
			if u.disp.distance_to(target) > 0.01:
				u.disp = u.disp.move_toward(target, delta * 420.0)
				moving = true
	for f in floats:
		f.t += delta
	var n := floats.size()
	floats = floats.filter(func(f): return f.t < f.life)
	if moving or n > 0 or n != floats.size() or (battle and battle.mode != ""):
		queue_redraw()

func add_float(u, text: String, cls: String, life: float) -> void:
	floats.append({"u": u, "text": text, "cls": cls, "t": 0.0, "life": life})
	queue_redraw()

func unit_point(u) -> Vector2:
	# feet of the unit, lifted on hills (map units)
	return u.disp - Vector2(0, Hex.lift(u.c, u.r))

# ------------------------------------------------------------ input
# Mouse and touch arrive from the stage Control (positions in stage space), see main.gd.
func handle(event: InputEvent) -> void:
	if battle == null or not visible:
		return
	if event is InputEventMouseMotion:
		var p := _local(event.position)
		var u = unit_at(p)
		var h = hex_at(p)
		if u != hover_unit:
			hover_unit = u
			ui.on_unit_hover(u)
		if h != hover_hex:
			hover_hex = h
			ui.on_hex_hover(h)
			queue_redraw()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var p := _local(event.position)
		var u = unit_at(p)
		var h = hex_at(p)
		if u != null:
			h = u.pos()
		if h != null:
			ui.on_board_click(h, u)

func _local(stage_pos: Vector2) -> Vector2:
	return (stage_pos - position) / scale.x

func unit_at(p: Vector2):
	var best = null
	for u in battle.units:
		if not u.alive:
			continue
		var q := unit_point(u)
		var r := Rect2(q.x - 14, q.y - 30, 28, 34) if u.gremlin else Rect2(q.x - 16, q.y - 50, 32, 56)
		if r.has_point(p) and (best == null or q.y > unit_point(best).y):
			best = u
	return best

func hex_at(p: Vector2):
	var best = null
	var bd := 1e9
	for r in range(Hex.ROWS):
		for c in range(Hex.COLS):
			var q := Hex.center(c, r) - Vector2(0, Hex.lift(c, r))
			var d := Vector2(p.x - q.x, (p.y - q.y) / 0.62).length()
			if d < bd:
				bd = d; best = Vector2i(c, r)
	return best if bd <= Hex.HS else null

# ------------------------------------------------------------ drawing helpers
func hex_pts(ctr: Vector2, s: float = Hex.HS) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in range(6):
		var a := PI / 3.0 * i
		pts.append(ctr + Vector2(s * cos(a), s * sin(a) * 0.62))
	return pts

func ellipse_pts(ctr: Vector2, rx: float, ry: float, n: int = 28) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in range(n):
		var a := TAU * i / n
		pts.append(ctr + Vector2(cos(a) * rx, sin(a) * ry))
	return pts

func fill_ellipse(ctr: Vector2, rx: float, ry: float, col: Color) -> void:
	draw_colored_polygon(ellipse_pts(ctr, rx, ry), col)

func ring(ctr: Vector2, rx: float, ry: float, col: Color, w: float, dash: float = 0.0, gap: float = 0.0) -> void:
	var pts := ellipse_pts(ctr, rx, ry, 48)
	pts.append(pts[0])
	if dash <= 0.0:
		draw_polyline(pts, col, w, true)
		return
	# dashed: walk along the outline
	var acc := 0.0
	var on := true
	for i in range(pts.size() - 1):
		var a := pts[i]
		var b := pts[i + 1]
		var seg := a.distance_to(b)
		var t := 0.0
		while t < seg:
			var step := minf((dash if on else gap) - acc, seg - t)
			if on:
				draw_line(a.lerp(b, t / seg), a.lerp(b, (t + step) / seg), col, w, true)
			t += step
			acc += step
			if acc >= (dash if on else gap) - 0.001:
				acc = 0.0
				on = not on

func dashed_line(a: Vector2, b: Vector2, col: Color, w: float, dash: float, gap: float) -> void:
	var L := a.distance_to(b)
	var t := 0.0
	while t < L:
		var e := minf(t + dash, L)
		draw_line(a.lerp(b, t / L), a.lerp(b, e / L), col, w, true)
		t = e + gap

func outline_poly(pts: PackedVector2Array, col: Color, w: float) -> void:
	var p := pts.duplicate()
	p.append(pts[0])
	draw_polyline(p, col, w, true)

func circ(ctr: Vector2, r: float, fill: Color, stroke: Color = Color.TRANSPARENT, w: float = 1.2) -> void:
	draw_circle(ctr, r, fill, true, -1.0, true)
	if stroke.a > 0:
		draw_arc(ctr, r, 0, TAU, 36, stroke, w, true)

func poly(pts: Array, fill: Color, stroke: Color = Color.TRANSPARENT, w: float = 1.2) -> void:
	var p := PackedVector2Array(pts)
	draw_colored_polygon(p, fill)
	if stroke.a > 0:
		outline_poly(p, stroke, w)

# ------------------------------------------------------------ the scene
func _draw_terrain() -> void:
	var tn := terrain_node
	for r in range(Hex.ROWS):
		for c in range(Hex.COLS):
			var ctr := Hex.center(c, r)
			var t := Hex.ter(c, r)
			var lf := Hex.lift(c, r)
			var top := ctr - Vector2(0, lf)
			if t.get("high", false):
				tn.draw_colored_polygon(hex_pts(ctr + Vector2(0, 2)), Color("#a48a55"))
			tn.draw_colored_polygon(hex_pts(top), Color(t.fill))
			var op := hex_pts(top); op.append(op[0]); tn.draw_polyline(op, Color("#2a2a10", 0.4), 1.0, true)
			tn.draw_colored_polygon(hex_pts(top - Vector2(0, 2), Hex.HS - 6), Color(1, 1, 1, 0.07))
			var chr := Hex.ch(c, r)
			if chr == "." or chr == "H":
				var q := (c * 7 + r * 13) % 5
				for k in range(2):
					var tx: float = top.x - 12 + ((q + k * 3) % 5) * 6
					var ty: float = top.y - 2 + ((q + k) % 3) * 4
					var gc := Color("#5f6a2a", 0.7)
					tn.draw_line(Vector2(tx, ty), Vector2(tx - 2, ty - 5), gc, 1.3, true)
					tn.draw_line(Vector2(tx, ty), Vector2(tx, ty - 6), gc, 1.3, true)
					tn.draw_line(Vector2(tx, ty), Vector2(tx + 3, ty - 5), gc, 1.3, true)
			if chr == "C":
				var pts := PackedVector2Array()
				for i in range(13):
					var s := i / 12.0
					pts.append(Vector2(ctr.x - 18 + 36 * s, ctr.y - 2 - sin(s * TAU) * 2.5))
				tn.draw_polyline(pts, Color("#7d6747", 0.7), 2.0, true)

func _draw() -> void:
	draw_rect(Rect2(-400, -300, 1568, 995), Color("#55602e"))
	fill_ellipse(Vector2(384, 200), 470, 260, Color("#7d8740", 0.55))
	if battle == null:
		return
	var MT: Dictionary = battle.mode_targets()
	draw_texture_rect(terrain_vp.get_texture(), Rect2(Vector2.ZERO, Hex.VIEW), false)
	for h in MT.hexes.keys():
		var top := Hex.center(h.x, h.y) - Vector2(0, Hex.lift(h.x, h.y))
		var hp := hex_pts(top, Hex.HS - 3)
		draw_colored_polygon(hp, Color(1, 1, 1, 0.33 + (0.12 if hover_hex == h else 0.0)))
		var hp2 := hp.duplicate(); hp2.append(hp[0])
		for i in range(6):
			dashed_line(hp2[i], hp2[i + 1], Color("#2c2416"), 1.5, 3, 3)
	# props and units, back to front
	var items := []
	for r in range(Hex.ROWS):
		for c in range(Hex.COLS):
			var chr := Hex.ch(c, r)
			if chr == "T" or chr == "R" or chr == "F":
				items.append({"y": Hex.center(c, r).y, "c": c, "r": r, "prop": chr})
	for u in battle.units:
		if u.alive:
			items.append({"y": u.disp.y + 0.1, "unit": u})
	items.sort_custom(func(a, b): return a.y < b.y)
	for it in items:
		if it.has("unit"):
			draw_unit(it.unit, MT.units.has(it.unit))
		else:
			draw_prop(it.prop, Hex.center(it.c, it.r) - Vector2(0, Hex.lift(it.c, it.r)))
	for b in battle.beams:
		var a: Vector2 = Hex.center(b.a.x, b.a.y) - Vector2(0, 18 + Hex.lift(b.a.x, b.a.y))
		var e: Vector2 = Hex.center(b.b.x, b.b.y) - Vector2(0, 18 + Hex.lift(b.b.x, b.b.y))
		var col := Color("#3f6f8f") if b.get("heal", false) else (Color("#c9922c") if b.team == "A" else Color("#b5462a"))
		col.a = 0.9
		dashed_line(a, e, col, 3, 7, 4)
		draw_circle(e, 5, col, true, -1.0, true)
	var idx := {}
	for f in floats:
		var u = f.u
		var n: int = idx.get(u, 0)
		idx[u] = n + 1
		var p := unit_point(u) + Vector2(0, -70 - n * 15 - f.t * 12)
		var col := Color("#2b5f82") if f.cls == "heal" else (Color("#2c2416") if f.cls == "miss" else Color("#a8321a"))
		col.a = clampf(1.6 - f.t / f.life * 1.6, 0, 1)
		var w := font.get_string_size(f.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
		var outline := Color("#efe5cc", col.a)
		draw_string_outline(font, p - Vector2(w / 2, 0), f.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, 5, outline)
		draw_string(font, p - Vector2(w / 2, 0), f.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, col)

func draw_prop(kind: String, p: Vector2) -> void:
	var x := p.x
	var y := p.y
	if kind == "T":
		fill_ellipse(Vector2(x + 4, y + 6), 20, 7, Color(0, 0, 0, 0.2))
		poly([Vector2(x - 4, y + 2), Vector2(x - 2, y - 16), Vector2(x + 2, y - 16), Vector2(x + 4, y + 2)], Color("#5b4026"), OL, 1.2)
		circ(Vector2(x, y - 26), 17, Color("#3a5a2a"), OL, 1.4)
		circ(Vector2(x - 9, y - 20), 10, Color("#3a5a2a"), OL, 1.2)
		circ(Vector2(x + 9, y - 21), 11, Color("#3a5a2a"), OL, 1.2)
		circ(Vector2(x - 2, y - 29), 13, Color("#4f7a3a"))
		circ(Vector2(x - 6, y - 34), 6, Color("#6f9a4a", 0.8))
	elif kind == "R":
		fill_ellipse(Vector2(x + 3, y + 7), 22, 6, Color(0, 0, 0, 0.2))
		poly([Vector2(x - 20, y + 6), Vector2(x - 14, y - 14), Vector2(x + 2, y - 20), Vector2(x + 18, y - 8), Vector2(x + 20, y + 6)], Color("#7c7468"), OL, 1.4)
		poly([Vector2(x - 14, y - 14), Vector2(x + 2, y - 20), Vector2(x + 18, y - 8), Vector2(x, y - 6)], Color("#958c7e"))
	elif kind == "F":
		draw_rect(Rect2(x - 19, y - 13, 38, 4), Color("#9a7444"))
		draw_rect(Rect2(x - 19, y - 13, 38, 4), OL, false, 1.0)
		draw_rect(Rect2(x - 19, y - 5, 38, 4), Color("#9a7444"))
		draw_rect(Rect2(x - 19, y - 5, 38, 4), OL, false, 1.0)
		for dx in [-14, 0, 14]:
			draw_rect(Rect2(x + dx - 2.5, y - 18, 5, 22), Color("#7a5630"))
			draw_rect(Rect2(x + dx - 2.5, y - 18, 5, 22), OL, false, 1.0)

func draw_unit(u, targetable: bool) -> void:
	var p := unit_point(u)
	var x := p.x
	var y := p.y
	var team_col := Color("#c9922c") if u.team == "A" else Color("#b5462a")
	fill_ellipse(Vector2(x, y + 4), 17, 7, Color(0, 0, 0, 0.2))
	ring(Vector2(x, y + 4), 19, 8, team_col, 3)
	if u == battle.cur() and not battle.over:
		ring(Vector2(x, y + 4), 25, 11, Color("#2c2416"), 2, 4, 3)
	if targetable:
		var col := Color("#3f6f8f") if u.team == battle.cur().team else Color("#b5462a")
		var grow := 1.0 + 0.04 * sin(_time * 5.0)
		ring(Vector2(x, y - 14), 23 * grow, 24 * grow, col, 3, 5, 3)
	if u.fx.get("root", 0):
		ring(Vector2(x, y + 2), 15, 5, Color("#4f6b3a"), 3, 2, 2)
	var key: String = "gremlin" if u.gremlin else Art.hero_key(u.lf, u.role)
	var tex := Art.tex(key, 2.0)
	var flip := 1.0 if u.team == "A" else -1.0
	if tex:
		draw_set_transform(Vector2(x, y + 4), 0, Vector2(flip, 1))
		if u.gremlin:
			var k := 0.78
			draw_texture_rect(tex, Rect2(-30 * k, -40 * k, 60 * k, 46 * k), false)
		else:
			var k := 0.42
			draw_texture_rect(tex, Rect2(-60 * k, -130 * k, 120 * k, 140 * k), false)
		draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
	if u.fx.get("stun", 0):
		draw_string(font, Vector2(x + 14, y - 34), "zz", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("#2c2416"))
	var w := 32.0
	var top := y - (40.0 if u.gremlin else 58.0)
	draw_rect(Rect2(x - w / 2, top, w, 5), Color("#2c2416", 0.6))
	draw_rect(Rect2(x - w / 2, top, w * u.life / u.max_life, 5), team_col)
