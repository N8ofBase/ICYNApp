# Path of the Light Keeper — Godot prototype of the Farluck Farm seed shed fight.
# Builds the screens in code: the Light Keeper picker, then the world-style battle screen
# (Role-colored frame, bottom action bar with icons and words, action ring behind the Hero, Crit Dice on the field).
extends Control

const Battle = preload("res://scripts/battle.gd")
const Board = preload("res://scripts/board.gd")
const RingButton = preload("res://scripts/ring_button.gd")
const Art = preload("res://scripts/art.gd")
const Rules = preload("res://scripts/rules_data.gd")
const Hex = preload("res://scripts/hexmap.gd")

signal next_pressed

const GOLD2 := Color("#c99a3c")
const BAR_INK := Color("#f3e6c8")
const DIM_INK := Color("#bfa77a")
const SOFT_INK := Color("#cdb98e")
const PAPER := Color("#efe5cc")
const PAPER2 := Color("#e4d6b3")
const INK := Color("#2c2416")
const INK_SOFT := Color("#5d4f37")
const DICE_LOOK := {"A": {"num": Color("#0c0f1f")}, "B": {"num": Color("#16200a")}}

var F_BODY: Font
var F_SC: Font
var F_SCB: Font

var battle
var board
var touch_mode := false

# setup screen
var setup_root: Control
var spec := {"lf": "Lizerus", "role": "Champion", "branch": "Honor", "ab": 0}
var setup_box: VBoxContainer
var preview: TextureRect
var stat_line: RichTextLabel

# battle screen
var battle_root: Control
var frame_panel: Panel
var frame_line: Panel
var corners: Array = []
var stage: Control
var overlay: Control
var plate_round: Label
var plate_order: HFlowContainer
var hint_panel: PanelContainer
var hint_label: Label
var bubble: PanelContainer
var bubble_text: RichTextLabel
var bubble_box: VBoxContainer
var bubble_tail: Polygon2D
var cap_unit = null
var ring_box: Control
var ring_sig := ""
var armed_act := ""
var trays: Control
var tray = null
var bar: PanelContainer
var who_name: Label
var who_sub: Label
var who_tags: HFlowContainer
var life_bar: Control
var stat_row: HBoxContainer
var pips: Control
var acts_box: HFlowContainer
var acts_sig := ""
var who_sec: Control
var compact := false
var icon_grid: GridContainer
var windows := {}
var log_lines: Array = []
var log_text: RichTextLabel
var roster_text: RichTextLabel
var pace_box: HBoxContainer
var banner_node: Control

# tooltip
var tip_layer: CanvasLayer
var tip: PanelContainer
var tip_text: RichTextLabel
var tip_use: Button
var tip_timer := 0.0
var tip_follow := false

func _ready() -> void:
	randomize()
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	F_BODY = load("res://fonts/Alegreya.ttf")
	F_SC = load("res://fonts/AlegreyaSC-Medium.ttf")
	F_SCB = load("res://fonts/AlegreyaSC-Bold.ttf")
	var th := Theme.new()
	th.default_font = F_BODY
	th.default_font_size = 15
	theme = th
	battle = Battle.new()
	battle.view = self
	add_child(battle)
	battle.changed.connect(_on_changed)
	_build_setup()
	_build_battle()
	_build_tip()
	_show_setup()
	if OS.has_feature("web"):
		var q = JavaScriptBridge.eval("location.search", true)
		if typeof(q) == TYPE_STRING and q.contains("auto=1"):
			battle.auto_hero = true
			battle.pace = "fast"
			_start_fight()

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		touch_mode = true
	elif event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION:
		touch_mode = false
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		_close_windows()
	# a tap anywhere else closes an armed ring tip
	if armed_act != "" and touch_mode and event is InputEventMouseButton and event.pressed:
		var inside := tip.visible and tip.get_global_rect().has_point(event.position)
		for b in ring_box.get_children():
			if b.get_global_rect().has_point(event.position):
				inside = true
		if not inside:
			_disarm()

# ============================================================ style helpers
func sbox(bg: Color, border: Color = Color.TRANSPARENT, bw: int = 0, radius: int = 6, pad: float = 6.0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	s.set_corner_radius_all(radius)
	s.content_margin_left = pad; s.content_margin_right = pad
	s.content_margin_top = pad * 0.7; s.content_margin_bottom = pad * 0.7
	s.anti_aliasing = true
	return s

func lbl(text: String, size: int, col: Color, font: Font = null) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	if font: l.add_theme_font_override("font", font)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

func rich(width: float, size: int = 15, col: Color = INK) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	r.custom_minimum_size = Vector2(width, 0)
	r.add_theme_font_size_override("normal_font_size", size)
	r.add_theme_font_size_override("bold_font_size", size)
	r.add_theme_font_override("normal_font", F_BODY)
	r.add_theme_font_override("bold_font", F_SCB)
	r.add_theme_color_override("default_color", col)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r

func style_button(b: Button, bg: Color, fg: Color, border: Color, size: int = 15, font: Font = null) -> void:
	b.add_theme_stylebox_override("normal", sbox(bg, border, 1, 6, 8))
	b.add_theme_stylebox_override("hover", sbox(bg.lightened(0.12), GOLD2, 1, 6, 8))
	b.add_theme_stylebox_override("pressed", sbox(GOLD2, Color("#ffe2a0"), 1, 6, 8))
	b.add_theme_stylebox_override("focus", sbox(Color.TRANSPARENT, GOLD2, 2, 6, 8))
	b.add_theme_stylebox_override("disabled", sbox(Color(bg, 0.5), Color(border, 0.5), 1, 6, 8))
	b.add_theme_color_override("font_color", fg)
	b.add_theme_color_override("font_hover_color", fg)
	b.add_theme_color_override("font_pressed_color", Color("#22170d"))
	b.add_theme_color_override("font_disabled_color", Color(fg, 0.45))
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_font_override("font", font if font else F_SC)

func wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout

# ============================================================ setup screen
func _build_setup() -> void:
	setup_root = Control.new()
	setup_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(setup_root)
	var bg := ColorRect.new()
	bg.color = Color("#141010")
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	setup_root.add_child(bg)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	setup_root.add_child(scroll)
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var card := PanelContainer.new()
	var st := sbox(PAPER, Color("#8a6a3a"), 3, 12, 12)
	st.shadow_color = Color(0, 0, 0, 0.6); st.shadow_size = 18
	card.add_theme_stylebox_override("panel", st)
	center.add_child(card)
	var mb := MarginContainer.new()
	for k in ["left", "right", "top", "bottom"]: mb.add_theme_constant_override("margin_" + k, 4)
	card.add_child(mb)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 22)
	mb.add_child(h)
	setup_box = VBoxContainer.new()
	setup_box.custom_minimum_size = Vector2(500, 0)
	setup_box.add_theme_constant_override("separation", 4)
	h.add_child(setup_box)
	var right := VBoxContainer.new()
	right.custom_minimum_size = Vector2(250, 0)
	right.add_theme_constant_override("separation", 8)
	h.add_child(right)
	var pv := PanelContainer.new()
	pv.add_theme_stylebox_override("panel", sbox(Color("#6f7a3e"), Color("#3c4422"), 2, 10, 6))
	right.add_child(pv)
	preview = TextureRect.new()
	preview.custom_minimum_size = Vector2(230, 230)
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	preview.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	pv.add_child(preview)
	stat_line = rich(250, 14, INK)
	right.add_child(stat_line)
	var go := Button.new()
	go.text = "Open the seed shed"
	style_button(go, INK, PAPER, INK, 18, F_SCB)
	go.custom_minimum_size = Vector2(0, 46)
	go.pressed.connect(func(): _start_fight())
	right.add_child(go)
	_render_setup()

func _chip_row(key: String, values: Array, current: String) -> HFlowContainer:
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 5)
	row.add_theme_constant_override("v_separation", 5)
	for v in values:
		var b := Button.new()
		b.text = v
		var on: bool = v == current
		b.add_theme_stylebox_override("normal", sbox(GOLD2 if on else PAPER, Color("#8a6416") if on else INK_SOFT, 1, 13, 9))
		b.add_theme_stylebox_override("hover", sbox(GOLD2 if on else PAPER2, Color("#8a6416"), 1, 13, 9))
		b.add_theme_stylebox_override("pressed", sbox(GOLD2, Color("#8a6416"), 1, 13, 9))
		b.add_theme_stylebox_override("focus", sbox(Color.TRANSPARENT, Color("#b5462a"), 2, 13, 9))
		for k in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
			b.add_theme_color_override(k, INK)
		b.pressed.connect(func(): _pick(key, v))
		row.add_child(b)
	return row

func _pick(key: String, v) -> void:
	if key == "role":
		spec.role = v; spec.branch = Rules.ROLES[v].branches[0]; spec.ab = 0
	elif key == "branch":
		spec.branch = v; spec.ab = 0
	else:
		spec[key] = v
	_render_setup()

func _render_setup() -> void:
	for c in setup_box.get_children(): c.queue_free()
	setup_box.add_child(lbl("Path of the Light Keeper", 24, INK, F_SCB))
	setup_box.add_child(lbl("Farluck Farm · the seed shed", 16, INK_SOFT, F_SC))
	var blurb := rich(500, 14, INK_SOFT)
	blurb.text = "Cecil’s seed shed is full of plague gremlins chewing his last seeds. Choose your Light Keeper, then drive the three of them off. At 0 Life a gremlin gives up and scurries away."
	setup_box.add_child(blurb)
	_head("Lifeform")
	setup_box.add_child(_chip_row("lf", Rules.LIFEFORMS.keys(), spec.lf))
	_head("Role")
	setup_box.add_child(_chip_row("role", Rules.ROLES.keys(), spec.role))
	_head("Focus")
	setup_box.add_child(_chip_row("branch", Rules.ROLES[spec.role].branches, spec.branch))
	_head("Level 1 ability · pick 1 of 2")
	var opts: Array = battle.abilities_for(spec.role, spec.branch, 1)
	for i in range(opts.size()):
		var a: Dictionary = opts[i]
		var b := Button.new()
		var on: bool = spec.ab == i
		b.add_theme_stylebox_override("normal", sbox(GOLD2 if on else PAPER, Color("#8a6416") if on else INK_SOFT, 1, 6, 9))
		b.add_theme_stylebox_override("hover", sbox(GOLD2 if on else PAPER2, Color("#8a6416"), 1, 6, 9))
		b.add_theme_stylebox_override("pressed", sbox(GOLD2, Color("#8a6416"), 1, 6, 9))
		b.add_theme_stylebox_override("focus", sbox(Color.TRANSPARENT, Color("#b5462a"), 2, 6, 9))
		var hb := HBoxContainer.new()
		hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		hb.set_anchors_preset(Control.PRESET_FULL_RECT)
		hb.offset_left = 8; hb.offset_right = -8
		hb.add_theme_constant_override("separation", 8)
		var ic := TextureRect.new()
		ic.texture = Art.tex(Art.ability_icon(a.name), 1.6)
		ic.custom_minimum_size = Vector2(30, 30)
		ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		hb.add_child(ic)
		var tx := rich(440, 13, INK)
		tx.text = "[b]%s[/b]  [color=#5d4f37]%s · rests %s[/color]\n%s" % [a.name, battle.range_txt(a), battle.rds(int(Rules.TIER_CD[int(a.tier)])), a.t]
		tx.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		hb.add_child(tx)
		b.add_child(hb)
		b.custom_minimum_size = Vector2(0, 54)
		var idx := i
		b.pressed.connect(func(): _pick("ab", idx))
		setup_box.add_child(b)
	preview.texture = Art.tex(Art.hero_key(spec.lf, spec.role), 3.0)
	var u = battle.build_hero(spec)
	stat_line.text = "[b]%s %s[/b]\nLife %d · Defense %d · Move %d\nPower %d · Energy %d · Speed %d · Charm %d\n%s 1d6+%s%s, range %d" % [spec.lf, spec.role,
		u.life, u.defense, 3 + u.st.S, u.st.P, u.st.E, u.st.S, u.st.C, u.weapon, Rules.STATN[u.main], "+1" if u.role_dmg else "", u.w_range]

func _head(t: String) -> void:
	setup_box.add_child(lbl(t, 14, INK_SOFT, F_SCB))

func _show_setup() -> void:
	setup_root.visible = true
	battle_root.visible = false
	board.visible = false
	_render_setup()

func _start_fight() -> void:
	setup_root.visible = false
	battle_root.visible = true
	board.visible = true
	_apply_role(spec.role)
	battle.start(spec)

# ============================================================ battle screen
func _build_battle() -> void:
	battle_root = Control.new()
	battle_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(battle_root)
	var bg := ColorRect.new()
	bg.color = Color("#141010")
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	battle_root.add_child(bg)
	var vb := VBoxContainer.new()
	vb.set_anchors_preset(Control.PRESET_FULL_RECT)
	vb.add_theme_constant_override("separation", 0)
	battle_root.add_child(vb)

	# full-screen frame in the Role's color
	frame_panel = Panel.new()
	frame_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	frame_panel.clip_contents = false
	vb.add_child(frame_panel)
	stage = Control.new()
	stage.set_anchors_preset(Control.PRESET_FULL_RECT)
	stage.offset_left = 10; stage.offset_top = 10; stage.offset_right = -10; stage.offset_bottom = -10
	stage.clip_contents = true
	stage.mouse_filter = Control.MOUSE_FILTER_STOP
	frame_panel.add_child(stage)
	stage.gui_input.connect(func(ev): board.handle(ev))
	var grad := Gradient.new()
	grad.offsets = PackedFloat32Array([0.0, 0.7, 1.0])
	grad.colors = PackedColorArray([Color("#6f7a3e"), Color("#3c4422"), Color("#22270f")])
	var gt := GradientTexture2D.new()
	gt.gradient = grad; gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.45); gt.fill_to = Vector2(1.05, 1.0)
	var bgr := TextureRect.new()
	bgr.texture = gt
	bgr.set_anchors_preset(Control.PRESET_FULL_RECT)
	bgr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bgr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(bgr)
	board = Board.new()
	board.battle = battle
	board.ui = self
	board.font = F_SCB
	stage.add_child(board)
	stage.resized.connect(_fit_board)
	overlay = Control.new()
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(overlay)
	frame_line = Panel.new()
	frame_line.set_anchors_preset(Control.PRESET_FULL_RECT)
	frame_line.offset_left = 4; frame_line.offset_top = 4; frame_line.offset_right = -4; frame_line.offset_bottom = -4
	frame_line.add_theme_stylebox_override("panel", sbox(Color.TRANSPARENT, Color(GOLD2, 0.85), 2, 2, 0))
	frame_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame_panel.add_child(frame_line)
	for i in range(4):
		var cr := TextureRect.new()
		cr.custom_minimum_size = Vector2(40, 40)
		cr.size = Vector2(40, 40)
		cr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		cr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		cr.pivot_offset = Vector2(20, 20)
		frame_panel.add_child(cr)
		corners.append(cr)
	frame_panel.resized.connect(_place_corners)

	# plate: title, round, turn order
	var plate := PanelContainer.new()
	plate.add_theme_stylebox_override("panel", sbox(Color(0.06, 0.04, 0.02, 0.78), GOLD2, 1, 8, 10))
	plate.position = Vector2(12, 10)
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(plate)
	var pv := VBoxContainer.new()
	pv.add_theme_constant_override("separation", 2)
	pv.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(pv)
	pv.add_child(lbl("Battle at the seed shed", 16, BAR_INK, F_SCB))
	plate_round = lbl("", 13, SOFT_INK, F_SC)
	pv.add_child(plate_round)
	plate_order = HFlowContainer.new()
	plate_order.add_theme_constant_override("h_separation", 4)
	plate_order.custom_minimum_size = Vector2(360, 0)
	plate_order.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pv.add_child(plate_order)

	# hint strip
	hint_panel = PanelContainer.new()
	hint_panel.add_theme_stylebox_override("panel", sbox(Color(0.06, 0.04, 0.02, 0.78), GOLD2, 1, 8, 10))
	hint_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(hint_panel)
	hint_label = lbl("", 14, BAR_INK)
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint_panel.add_child(hint_label)

	# dice trays, then the action text bubble, then the ring on top
	trays = Control.new()
	trays.set_anchors_preset(Control.PRESET_FULL_RECT)
	trays.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(trays)
	bubble_tail = Polygon2D.new()
	bubble_tail.polygon = PackedVector2Array([Vector2(-8, 0), Vector2(8, 0), Vector2(0, 9)])
	bubble_tail.color = Color(0.08, 0.055, 0.035, 0.92)
	overlay.add_child(bubble_tail)
	bubble = PanelContainer.new()
	bubble.add_theme_stylebox_override("panel", sbox(Color(0.08, 0.055, 0.035, 0.92), GOLD2, 1, 10, 11))
	bubble.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(bubble)
	bubble_box = VBoxContainer.new()
	bubble_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bubble.add_child(bubble_box)
	bubble_text = rich(340, 14, Color("#f6ead0"))
	bubble_text.add_theme_color_override("default_color", Color("#f6ead0"))
	bubble_box.add_child(bubble_text)
	bubble.visible = false
	bubble_tail.visible = false
	ring_box = Control.new()
	ring_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(ring_box)

	# bottom action bar
	bar = PanelContainer.new()
	bar.custom_minimum_size = Vector2(0, 104)
	vb.add_child(bar)
	var bscroll := ScrollContainer.new()
	bscroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	bar.add_child(bscroll)
	var bc := CenterContainer.new()
	bc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	bscroll.add_child(bc)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 0)
	bc.add_child(row)
	# who
	var who := _section(row, "LIGHT KEEPER", 140)
	who_sec = who.get_parent()
	who_name = lbl("", 15, BAR_INK, F_SCB)
	who.add_child(who_name)
	who_sub = lbl("", 12, SOFT_INK)
	who.add_child(who_sub)
	who_tags = HFlowContainer.new()
	who_tags.add_theme_constant_override("h_separation", 3)
	who_tags.custom_minimum_size = Vector2(140, 0)
	who.add_child(who_tags)
	# stats
	var sts := _section(row, "STATS", 0)
	life_bar = Control.new()
	life_bar.custom_minimum_size = Vector2(170, 17)
	life_bar.draw.connect(_draw_life)
	sts.add_child(life_bar)
	stat_row = HBoxContainer.new()
	stat_row.add_theme_constant_override("separation", 4)
	sts.add_child(stat_row)
	# actions
	var ac := _section(row, "ACTIONS", 0)
	var head: HBoxContainer = ac.get_child(0)
	pips = Control.new()
	pips.custom_minimum_size = Vector2(52, 12)
	pips.draw.connect(_draw_pips)
	pips.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(pips)
	acts_box = HFlowContainer.new()
	acts_box.add_theme_constant_override("h_separation", 5)
	acts_box.add_theme_constant_override("v_separation", 5)
	acts_box.custom_minimum_size = Vector2(370, 0)
	ac.add_child(acts_box)
	# battle icons
	var bi := _section(row, "BATTLE", 0, true)
	var grid := GridContainer.new()
	icon_grid = grid
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	bi.add_child(grid)
	for k in [["roster", "Heroes and foes"], ["log", "Chronicle"], ["key", "Map key"], ["pace", "Computer speed"], ["help", "How to play"]]:
		var b := Button.new()
		b.custom_minimum_size = Vector2(38, 38)
		b.icon = Art.tex("bar/" + k[0], 1.6)
		b.expand_icon = true
		b.tooltip_text = k[1]
		b.add_theme_stylebox_override("normal", sbox(Color("#120d0a"), Color("#6b5537"), 2, 8, 5))
		b.add_theme_stylebox_override("hover", sbox(Color("#120d0a"), GOLD2, 2, 8, 5))
		b.add_theme_stylebox_override("pressed", sbox(Color("#120d0a"), GOLD2, 2, 8, 5))
		b.add_theme_stylebox_override("focus", sbox(Color.TRANSPARENT, GOLD2, 2, 8, 5))
		var key: String = k[0]
		b.pressed.connect(func(): _toggle_window(key))
		grid.add_child(b)
	_build_windows()
	battle_root.visible = false

func _section(row: HBoxContainer, title: String, minw: float, last := false) -> VBoxContainer:
	var p := PanelContainer.new()
	var s := StyleBoxFlat.new()
	s.bg_color = Color.TRANSPARENT
	s.border_color = Color.BLACK
	s.border_width_right = 0 if last else 2
	s.content_margin_left = 12; s.content_margin_right = 12; s.content_margin_top = 8; s.content_margin_bottom = 8
	p.add_theme_stylebox_override("panel", s)
	row.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 5)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.custom_minimum_size = Vector2(minw, 0)
	p.add_child(v)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	h.add_child(lbl(title, 11, DIM_INK, F_SC))
	v.add_child(h)
	return v

func _apply_role(role: String) -> void:
	var col := Color(Rules.ROLE_FRAME.get(role, "#a8821f"))
	var s := StyleBoxFlat.new()
	s.bg_color = Color("#141010")
	s.border_color = col
	s.set_border_width_all(10)
	frame_panel.add_theme_stylebox_override("panel", s)
	var b := StyleBoxFlat.new()
	b.bg_color = Color("#1f1915")
	b.border_color = col
	b.border_width_top = 3
	b.shadow_color = Color(GOLD2, 0.4)
	bar.add_theme_stylebox_override("panel", b)
	for c in corners:
		c.texture = Art.tex("corner/" + role, 2.0)
	_place_corners()

func _place_corners() -> void:
	if corners.is_empty():
		return
	var w := frame_panel.size.x
	var h := frame_panel.size.y
	var o := -14.0
	corners[0].position = Vector2(o, o); corners[0].scale = Vector2(1, 1)
	corners[1].position = Vector2(w - 40 - o, o); corners[1].scale = Vector2(-1, 1)
	corners[2].position = Vector2(o, h - 40 - o); corners[2].scale = Vector2(1, -1)
	corners[3].position = Vector2(w - 40 - o, h - 40 - o); corners[3].scale = Vector2(-1, -1)

func _fit_board() -> void:
	var W := stage.size
	var s := minf(W.x / Hex.VIEW.x, W.y / Hex.VIEW.y)
	board.scale = Vector2(s, s)
	board.position = (W - Hex.VIEW * s) / 2.0
	board.queue_redraw()

func k_scale() -> float:
	return board.scale.x

func unit_screen(u) -> Vector2:
	# position inside the stage / overlay (same space)
	return board.position + board.unit_point(u) * board.scale.x

# ============================================================ refresh: HUD, ring, roster
func _on_changed() -> void:
	board.queue_redraw()
	_hud()

func _hud() -> void:
	var actor = battle.cur()
	var hero = null
	for x in battle.units:
		if x.team == "A": hero = x
	if hero == null:
		return
	# order chips
	for c in plate_order.get_children(): c.queue_free()
	for i in range(battle.order.size()):
		var x = battle.order[i]
		if not x.alive: continue
		var chip := PanelContainer.new()
		var now: bool = x == actor
		var done: bool = i < battle.turn
		chip.add_theme_stylebox_override("panel", sbox(GOLD2 if now else Color("#2a221a"), Color("#ffe2a0") if now else (GOLD2 if x.team == "A" else Color("#b5462a")), 1, 10, 6))
		chip.modulate.a = 0.5 if done else 1.0
		chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		chip.add_child(lbl("You" if x.team == "A" else x.name.replace("Plague ", ""), 12, Color("#22170d") if now else BAR_INK))
		plate_order.add_child(chip)
	plate_round.text = "The fight is over." if battle.over else "Round %d" % battle.round_n
	# who + stats
	who_name.text = hero.name
	who_sub.text = "%s · %s%s" % [hero.lf, hero.branch, " · your turn" if actor == hero else ""]
	for c in who_tags.get_children(): c.queue_free()
	for t in battle.fx_tags(hero):
		var tg := PanelContainer.new()
		tg.add_theme_stylebox_override("panel", sbox(Color("#2a221a"), Color("#b5462a") if t[0] == "bad" else Color("#6fa8c8"), 1, 8, 4))
		tg.add_child(lbl(t[1], 11, Color("#f2a08a") if t[0] == "bad" else Color("#a8d4f0")))
		who_tags.add_child(tg)
	life_bar.set_meta("u", hero)
	life_bar.queue_redraw()
	for c in stat_row.get_children(): c.queue_free()
	var defv: int = hero.defense + battle.fxv(hero, "defUp") + battle.fxv(hero, "def")
	var cells := [["Def", defv, false]]
	for k in ["P", "E", "S", "C"]:
		cells.append([Rules.STATN[k].substr(0, 3), battle.stat(hero, k), k == hero.main])
	cells.append(["Move", battle.move_range(hero), false])
	for cdat in cells:
		var cp := PanelContainer.new()
		cp.add_theme_stylebox_override("panel", sbox(Color("#2a221a"), GOLD2 if cdat[2] else Color("#6b5537"), 2 if cdat[2] else 1, 5, 3))
		var cv := VBoxContainer.new()
		cv.add_theme_constant_override("separation", -3)
		cv.custom_minimum_size = Vector2(26, 0)
		var a := lbl(str(cdat[1]), 15, BAR_INK, F_SCB)
		a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var b := lbl(cdat[0], 9, DIM_INK)
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cv.add_child(a); cv.add_child(b)
		cp.add_child(cv)
		stat_row.add_child(cp)
	pips.set_meta("u", hero)
	pips.queue_redraw()
	# actions: rebuild only when something changed, so hover stays steady
	var list: Array = battle.action_list(hero)
	# phone landscape: a short bar so the map keeps the screen; actions become icons (the ring has the words)
	var vs := get_viewport_rect().size
	compact = vs.x / vs.y > 1.9
	who_sec.visible = not compact
	icon_grid.columns = 5 if compact else 3
	bar.custom_minimum_size.y = 76 if compact else 104
	acts_box.custom_minimum_size.x = 250 if compact else 370
	var sig: String = battle.mode + "|" + str(compact) + "|"
	for it in list: sig += "%s/%s/%s/%s;" % [it.act, it.label, it.sub, it.on]
	if sig != acts_sig:
		acts_sig = sig
		for c in acts_box.get_children(): c.queue_free()
		for it in list:
			acts_box.add_child(_act_button(it))
	_ring(hero if battle.my_turn() else null, list)
	# hint
	if battle.mode == "":
		_set_hint("One free Move plus two actions. Pick one beside your Hero or in the bar." if battle.my_turn() else ("" if battle.over or actor == hero else "The gremlins are moving…"))
	elif battle.mode == "move":
		_set_hint("Tap a lit hex to move there.")
	elif battle.mode == "attack":
		_set_hint("Tap a circled foe. Hover one first to see your odds.")
	elif battle.mode.begins_with("ab"):
		var a: Dictionary = hero.abil[int(battle.mode.substr(2))]
		_set_hint("%s: %s %s" % [a.name, a.t, "Tap a lit hex." if a.kind == "fly" else "Tap a circled target."])
	_roster()

func _act_button(it: Dictionary) -> Button:
	var b := Button.new()
	var pressed: bool = battle.mode == it.act
	var bg := GOLD2 if pressed else Color("#3a2e24")
	b.add_theme_stylebox_override("normal", sbox(bg, Color("#ffe2a0") if pressed else Color("#6b5537"), 1, 6, 6))
	b.add_theme_stylebox_override("hover", sbox(bg.lightened(0.1), GOLD2, 1, 6, 6))
	b.add_theme_stylebox_override("pressed", sbox(GOLD2, Color("#ffe2a0"), 1, 6, 6))
	b.add_theme_stylebox_override("disabled", sbox(Color(bg, 0.4), Color("#6b5537", 0.4), 1, 6, 6))
	b.add_theme_stylebox_override("focus", sbox(Color.TRANSPARENT, GOLD2, 2, 6, 6))
	b.disabled = not it.on
	b.custom_minimum_size = Vector2(0, 40)
	b.tooltip_text = it.label if compact else ""
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 6)
	hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hb.position = Vector2(6, 4)
	var ic := RingButton.new()
	ic.setup(it.act, Art.tex(it.icon if Art.has(it.icon) else "icon/attack/Blade", 1.6), true, pressed, 0, 28)
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hb.add_child(ic)
	var tv := VBoxContainer.new()
	tv.add_theme_constant_override("separation", -2)
	tv.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fg := Color("#22170d") if pressed else BAR_INK
	tv.add_child(lbl(it.label, 14, fg, F_SC))
	tv.add_child(lbl(it.sub, 11, Color("#3a2a14") if pressed else SOFT_INK))
	hb.add_child(tv)
	tv.visible = not compact
	b.add_child(hb)
	b.modulate.a = 1.0 if it.on else 0.5
	hb.resized.connect(func(): b.custom_minimum_size = Vector2(hb.size.x + 14, 40))
	var act: String = it.act
	b.pressed.connect(func(): _do_act(act))
	b.mouse_entered.connect(func(): _show_tip(it.tip, get_global_mouse_position(), 0.0))
	b.mouse_exited.connect(func(): _hide_tip())
	return b

func _do_act(act: String) -> void:
	_disarm()
	_hide_tip()
	battle.press_act(act)

func _set_hint(t: String) -> void:
	hint_label.text = t
	hint_panel.visible = t != ""

func _draw_life() -> void:
	var u = life_bar.get_meta("u", null)
	if u == null: return
	var r := Rect2(Vector2.ZERO, life_bar.size)
	life_bar.draw_style_box(sbox(Color("#2a1612"), Color.BLACK, 1, 8, 0), r)
	var w: float = r.size.x * u.life / u.max_life
	if w > 2:
		var fill := sbox(Color("#b8392e"), Color.TRANSPARENT, 0, 8, 0)
		life_bar.draw_style_box(fill, Rect2(0, 0, w, r.size.y))
		life_bar.draw_rect(Rect2(4, 2, maxf(0, w - 8), 3), Color(1, 1, 1, 0.18))
	var t := "Life %d / %d" % [u.life, u.max_life]
	var tw := F_BODY.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
	life_bar.draw_string_outline(F_BODY, Vector2((r.size.x - tw) / 2, 12.5), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, 3, Color(0, 0, 0, 0.8))
	life_bar.draw_string(F_BODY, Vector2((r.size.x - tw) / 2, 12.5), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color.WHITE)

func _draw_pips() -> void:
	var u = pips.get_meta("u", null)
	if u == null: return
	var x := 6.0
	var draw_pip := func(on: bool, px: float):
		pips.draw_circle(Vector2(px, 6), 5, GOLD2 if on else Color.TRANSPARENT, true, -1.0, true)
		pips.draw_arc(Vector2(px, 6), 5, 0, TAU, 20, Color("#ffe2a0") if on else DIM_INK, 2, true)
	draw_pip.call(u.free_move and battle.cur() == u, x)
	for i in range(2):
		draw_pip.call(i < u.actions and battle.cur() == u, x + 20 + i * 14)

func _roster() -> void:
	var s := "[b]Your Light Keeper[/b]\n"
	for x in battle.units:
		if x.team != "A": continue
		s += "%s  %d/%d\n" % [x.name, x.life, x.max_life]
	s += "\n[b]Foes[/b]\n"
	for x in battle.units:
		if x.team != "B": continue
		var tags: Array = battle.fx_tags(x)
		s += "%s  %s%s\n" % [x.name, ("%d/%d" % [x.life, x.max_life]) if x.alive else "scurried off", ("  [color=#8a2e16]" + ", ".join(tags.map(func(q): return q[1])) + "[/color]") if x.alive and tags.size() else ""]
	roster_text.text = s

# ============================================================ action ring behind the Hero
func _ring(u, list: Array) -> void:
	if u == null:
		for c in ring_box.get_children(): c.queue_free()
		ring_sig = ""
		armed_act = ""
		return
	var sig: String = battle.mode + "|" + str(battle.round_n) + "|" + str(battle.turn) + "|"
	for it in list: sig += "%s/%s/%s;" % [it.act, it.on, it.sub]
	if sig == ring_sig:
		return
	ring_sig = sig
	for c in ring_box.get_children(): c.queue_free()
	var rb := 40.0
	var i := 0
	for it in list:
		var b := RingButton.new()
		b.setup(it.act, Art.tex(it.icon if Art.has(it.icon) else "icon/attack/Blade", 2.0), it.on, battle.mode == it.act, int(it.get("cd", 0)), rb)
		b.set_meta("it", it)
		b.chosen.connect(_ring_chosen)
		b.hovered.connect(_ring_hover)
		ring_box.add_child(b)
		b.pop_in(i * 0.03)
		i += 1
	_place_ring()

func _place_ring() -> void:
	var u = battle.cur()
	if u == null or ring_box.get_child_count() == 0:
		return
	var p := unit_screen(u)
	var k := k_scale() / 1.0
	var n := ring_box.get_child_count()
	var rb := 40.0
	var step := rb + 7.0
	var max_span := deg_to_rad(230.0)
	var R := maxf(44.0 * k + rb * 0.5, step * (n - 1) / max_span)
	var cy := p.y - 22.0 * k
	var B := stage.size
	var face := 1.0
	if p.x - R < rb: face = -1.0
	var da := step / R
	var mid := -face * deg_to_rad(60.0)
	for i in range(n):
		var b = ring_box.get_child(i)
		var t := mid + face * (i - (n - 1) / 2.0) * da
		var bx := clampf(p.x + R * sin(t), rb / 2 + 4, B.x - rb / 2 - 4)
		var by := clampf(cy - R * cos(t), rb / 2 + 4, B.y - rb / 2 - 4)
		b.position = Vector2(bx, by) - b.size / 2

func _ring_chosen(act: String) -> void:
	var it := {}
	for b in ring_box.get_children():
		if b.act == act: it = b.get_meta("it")
	if it.is_empty(): return
	if touch_mode and armed_act != act:
		# first tap explains, second tap (or Use) acts
		armed_act = act
		for b in ring_box.get_children(): b.set_armed(b.act == act)
		var btn = null
		for b in ring_box.get_children():
			if b.act == act: btn = b
		_show_tip(_ring_tip(it), btn.get_global_rect().position + Vector2(0, btn.size.y + 4), 0.0, it.on, act)
		return
	if it.on:
		_do_act(act)

func _ring_tip(it: Dictionary) -> String:
	return it.tip + "\n[color=#7a6440]%s[/color]" % (it.sub if it.on else "Not right now: " + it.sub)

func _ring_hover(btn, on: bool) -> void:
	if touch_mode:
		return
	if on:
		_show_tip(_ring_tip(btn.get_meta("it")), btn.get_global_rect().position + Vector2(btn.size.x + 6, 0), 0.0)
	else:
		_hide_tip()

func _disarm() -> void:
	if armed_act == "": return
	armed_act = ""
	for b in ring_box.get_children(): b.set_armed(false)
	_hide_tip()

# ============================================================ per-frame placement (bubble follows the unit, ring follows the Hero)
func _process(delta: float) -> void:
	if tip.visible and tip_timer > 0:
		tip_timer -= delta
		if tip_timer <= 0: _hide_tip()
	if tip.visible and tip_follow:
		_place_tip(get_global_mouse_position())
	if not battle_root.visible:
		return
	_place_ring()
	hint_label.custom_minimum_size.x = minf(F_BODY.get_string_size(hint_label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x + 4, stage.size.x * 0.85)
	hint_panel.size = hint_panel.get_combined_minimum_size()
	hint_panel.position = Vector2((stage.size.x - hint_panel.size.x) / 2, stage.size.y - hint_panel.size.y - 10)
	if bubble.visible:
		var x := stage.size.x / 2
		var y := 90.0
		if cap_unit != null:
			var p := unit_screen(cap_unit)
			x = p.x
			y = p.y - (34.0 if cap_unit.gremlin else 58.0) * k_scale()
		bubble.size = bubble.get_combined_minimum_size()
		var w := bubble.size.x
		var h := bubble.size.y
		var cx := clampf(x, w / 2 + 8, stage.size.x - w / 2 - 8)
		var cy := maxf(h + 8, y)
		bubble.position = Vector2(cx - w / 2, cy - h - 8)
		bubble_tail.position = Vector2(clampf(x, cx - w / 2 + 14, cx + w / 2 - 14), cy - 9)
		bubble_tail.visible = cap_unit != null
	else:
		bubble_tail.visible = false

# ============================================================ view hooks called by battle.gd
func on_battle_start() -> void:
	log_lines.clear()
	log_text.text = ""
	if banner_node: banner_node.queue_free(); banner_node = null
	clear_trays()
	say(null, [])
	board.floats.clear()
	acts_sig = ""; ring_sig = ""
	_fit_board()

func say(u, lines: Array) -> void:
	cap_unit = u
	for c in bubble_box.get_children():
		if c != bubble_text: c.queue_free()
	if lines.is_empty():
		bubble.visible = false
		return
	var head := ("[b][color=#ffe2a0]%s[/color][/b]\n" % u.name) if u != null else ""
	bubble_text.text = head + "\n".join(lines)
	bubble.visible = true
	var bw := clampf(stage.size.x * 0.8, 200, 380)
	bubble_text.custom_minimum_size.x = bw
	var st: StyleBoxFlat = bubble.get_theme_stylebox("panel")
	st.border_color = GOLD2 if (u == null or u.team == "A") else Color("#b5462a")

func log_line(u, lines: Array) -> void:
	var t := ("[b]%s:[/b] " % u.name if u != null else "") + " ".join(lines)
	if u == null: t = "[i][color=#5d4f37]" + t + "[/color][/i]"
	t = t.replace("#f2a08a", "#8a2e16").replace("#ffd36a", "#7a560f")
	log_lines.push_front(t)
	log_text.text = "\n".join(log_lines)

func beat(ms: float, major: bool) -> void:
	if battle.pace == "step" and major:
		var b := Button.new()
		b.text = "Next ▸"
		style_button(b, INK, PAPER, GOLD2, 14)
		b.size_flags_horizontal = Control.SIZE_SHRINK_END
		b.pressed.connect(func(): next_pressed.emit())
		bubble_box.add_child(b)
		bubble.visible = true
		await next_pressed
		if is_instance_valid(b): b.queue_free()
		return
	await wait(ms / 1000.0 * battle.PACE[battle.pace])

func float_on(u, text: String, cls: String) -> void:
	board.add_float(u, text, cls, 1.5 * battle.PACE[battle.pace] + 0.2)

func clear_trays() -> void:
	for c in trays.get_children(): c.queue_free()
	tray = null

func show_unit_tip(u) -> void:
	var p := unit_screen(u) + stage.global_position
	_show_tip(battle.unit_tip(u), p - Vector2(0, 40 * k_scale()), 4.0)

func on_unit_hover(u) -> void:
	if touch_mode: return
	if u == null:
		if tip_follow: _hide_tip()
		return
	_show_tip(battle.unit_tip(u), get_global_mouse_position(), 0.0)
	tip_follow = true

func on_hex_hover(h) -> void:
	if h == null or battle.mode == "": return
	var t: String = battle.hint_for_hover(h)
	if t != "": _set_hint(t)

func on_board_click(h: Vector2i, u) -> void:
	_disarm()
	battle.click_hex(h)

func banner(won: bool, rounds: int) -> void:
	clear_trays()
	for c in ring_box.get_children(): c.queue_free()
	ring_sig = ""
	banner_node = Control.new()
	banner_node.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(banner_node)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.5)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	banner_node.add_child(dim)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	banner_node.add_child(cc)
	var p := PanelContainer.new()
	var st := sbox(Color("#efe0bd"), Color("#8a6a3a"), 3, 12, 20)
	st.shadow_color = Color(0, 0, 0, 0.7); st.shadow_size = 20
	p.add_theme_stylebox_override("panel", st)
	cc.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	v.custom_minimum_size = Vector2(340, 0)
	p.add_child(v)
	var t := lbl("The gremlins scatter!" if won else "Knocked out", 26, INK, F_SCB)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var tx := rich(340, 15, INK)
	tx.text = "[center]%s %d rounds.[/center]" % ["Their fear melts away, and they scurry off into the fields, squeaking." if won else "The Castle Comet pulls you home. Your Pack stays behind by the shed.", rounds]
	v.add_child(tx)
	var again := Button.new()
	again.text = "Fight again" if won else "Try the shed again"
	style_button(again, INK, PAPER, INK, 16, F_SCB)
	again.pressed.connect(func(): battle.start(spec))
	v.add_child(again)
	var change := Button.new()
	change.text = "Choose another Light Keeper"
	style_button(change, PAPER, INK, INK_SOFT, 15)
	change.pressed.connect(func(): battle.gen += 1; _show_setup())
	v.add_child(change)
	_set_hint("")

# ============================================================ Crit Dice on the field
func show_roll(u, tgt, dice: Array, add: bool) -> void:
	var t: float = 0.8 * battle.PACE[battle.pace]
	var k := k_scale()
	var dz: float = clampf(30.0 * k, 26.0, 52.0) * (0.75 if u.gremlin else 1.0)
	if not add or tray == null or not is_instance_valid(tray):
		clear_trays()
		var p := unit_screen(u)
		var dir := 1.0
		if tgt != null and tgt != u:
			dir = signf(tgt.disp.x - u.disp.x)
			if dir == 0: dir = 1.0
		tray = Control.new()
		tray.mouse_filter = Control.MOUSE_FILTER_IGNORE
		tray.set_meta("anchor", Vector2(p.x + dir * 46.0 * maxf(0.7, k), p.y + 4))
		tray.set_meta("dir", dir)
		tray.set_meta("n", 0)
		trays.add_child(tray)
	for c in ring_box.get_children(): c.queue_free() # keep the roll in view
	ring_sig = ""
	var look: Dictionary = DICE_LOOK[u.team]
	for d in dice:
		var n: int = tray.get_meta("n")
		var die := _make_die(u.team, int(d.s), int(d.v), d.get("cls", ""), d.get("lbl", ""), dz, look)
		die.position = Vector2(n * (dz + 14), 0)
		tray.add_child(die)
		tray.set_meta("n", n + 1)
		_tumble(die, t, -tray.get_meta("dir") * 50.0)
	var count: int = tray.get_meta("n")
	var anchor: Vector2 = tray.get_meta("anchor")
	tray.position = anchor - Vector2((count * (dz + 14) - 14) / 2.0, dz / 2.0)
	# fade about 3 seconds after the last die lands
	var my_tray = tray
	var fade_id: int = my_tray.get_meta("fade", 0) + 1
	my_tray.set_meta("fade", fade_id)
	_fade_later(my_tray, fade_id, 3.0 + t)
	if t > 0:
		await wait(t + 0.12)

func _fade_later(tr, fade_id: int, delay: float) -> void:
	await wait(delay)
	if not is_instance_valid(tr) or tr.get_meta("fade", 0) != fade_id:
		return
	var tw := create_tween()
	tw.tween_property(tr, "modulate:a", 0.0, 0.6)
	await tw.finished
	if is_instance_valid(tr):
		if tray == tr: tray = null
		tr.queue_free()

func _make_die(team: String, s: int, v: int, cls: String, label: String, dz: float, look: Dictionary) -> Control:
	var die := Control.new()
	die.size = Vector2(dz, dz)
	die.pivot_offset = die.size / 2
	die.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if cls != "":
		var g := Gradient.new()
		g.colors = PackedColorArray([Color(1, 0.86, 0.47, 0.85) if cls == "crit" else Color(0.86, 0.12, 0.16, 0.7), Color(1, 0.86, 0.47, 0) if cls == "crit" else Color(0.86, 0.12, 0.16, 0)])
		var gt := GradientTexture2D.new()
		gt.gradient = g; gt.fill = GradientTexture2D.FILL_RADIAL; gt.fill_from = Vector2(0.5, 0.5); gt.fill_to = Vector2(1, 0.5)
		gt.width = 64; gt.height = 64
		var glow := TextureRect.new()
		glow.texture = gt
		glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		glow.size = Vector2(dz, dz) * 1.6
		glow.position = -Vector2(dz, dz) * 0.3
		glow.pivot_offset = glow.size / 2
		glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
		die.add_child(glow)
		var tw := glow.create_tween()
		glow.scale = Vector2.ONE * 0.4
		tw.tween_property(glow, "scale", Vector2.ONE * 1.5, 1.0).set_delay(0.6)
		tw.parallel().tween_property(glow, "modulate:a", 0.0, 1.0).set_delay(0.6)
	var shadow := TextureRect.new()
	var key := "die/%s/6/%d" % [team, v] if s == 6 else "die/%s/%d" % [team, s]
	shadow.texture = Art.tex(key, 1.2)
	shadow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shadow.size = Vector2(dz, dz)
	shadow.position = Vector2(0, 5)
	shadow.modulate = Color(0, 0, 0, 0.45)
	shadow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	die.add_child(shadow)
	var body := TextureRect.new()
	body.texture = shadow.texture
	body.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	body.size = Vector2(dz, dz)
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if cls == "fumble": body.modulate = Color(0.62, 0.55, 0.55)
	die.add_child(body)
	if s != 6:
		var num := lbl(str(v), int(dz * (0.4 if s == 20 and v > 9 else 0.44)), look.num, F_SCB)
		num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		num.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		num.size = Vector2(dz, dz)
		num.position = Vector2(0, dz * (0.12 if s == 4 else 0.03))
		die.add_child(num)
	if label != "":
		var l := lbl(label, 10, Color.WHITE, F_SC)
		l.add_theme_color_override("font_outline_color", Color.BLACK)
		l.add_theme_constant_override("outline_size", 4)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.size = Vector2(dz + 14, 14)
		l.position = Vector2(-7, dz + 1)
		die.add_child(l)
	return die

func _tumble(die: Control, t: float, fx: float) -> void:
	if t <= 0:
		return
	var home := die.position
	die.position = home + Vector2(fx, -40)
	die.rotation = deg_to_rad(-560)
	die.scale = Vector2.ONE * 0.5
	die.modulate.a = 0.0
	var tw := die.create_tween()
	tw.tween_property(die, "modulate:a", 1.0, t * 0.15)
	tw.parallel().tween_property(die, "position", home + Vector2(0, 4), t * 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(die, "rotation", deg_to_rad(-30), t * 0.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(die, "scale", Vector2.ONE * 1.08, t * 0.6)
	tw.tween_property(die, "position", home, t * 0.2)
	tw.parallel().tween_property(die, "rotation", deg_to_rad(8), t * 0.2)
	tw.parallel().tween_property(die, "scale", Vector2.ONE * 0.97, t * 0.2)
	tw.tween_property(die, "rotation", 0.0, t * 0.2)
	tw.parallel().tween_property(die, "scale", Vector2.ONE, t * 0.2)

# ============================================================ parchment windows
func _build_windows() -> void:
	roster_text = rich(460, 15, INK)
	_window("roster", "Heroes and foes", roster_text)
	log_text = rich(460, 14, INK)
	_window("log", "Chronicle", log_text)
	var key := rich(460, 15, INK)
	key.text = "[color=#a8b05a]■[/color] Grass\n[color=#4f6b3a]■[/color] Trees: cover +2, 2 to enter\n[color=#c9ae74]■[/color] Hill: +1 to hit from above, 2 to climb\n[color=#9c8562]■[/color] Dry creek: 2 to enter\n[color=#7c7468]■[/color] Rocks: block moving and sight\n[color=#8a6a3c]■[/color] Fence: blocks moving, cover +2 behind it\n\n[color=#5d4f37]Hover (or tap) any Hero or foe to see their stats and what is affecting them.[/color]"
	_window("key", "Map key", key)
	var pv := VBoxContainer.new()
	pace_box = HBoxContainer.new()
	pace_box.add_theme_constant_override("separation", 6)
	pv.add_child(pace_box)
	var pn := rich(460, 14, INK_SOFT)
	pn.text = "Step by step waits for you to press Next after each thing a gremlin does."
	pv.add_child(pn)
	_window("pace", "Computer speed", pv)
	_render_pace()
	var help := rich(460, 15, INK)
	help.text = "Each turn you get [b]one free Move plus two actions[/b]. You may Attack twice, but only one ability a round.\n\nPick an action in the ring behind your Hero or in the bar, then tap a lit hex or a circled target. Hover a button or a gremlin for a reminder (on a phone, tap once to read it and again to use it).\n\nYour [b]Crit Dice[/b] roll on the field: a D20 to hit (beat the target’s Defense), then the damage dice. A natural 20 is a crit and doubles the damage dice. A natural 1 misses and brings a Calamity.\n\nTrees give cover, hills give +1 to hit from above, rocks block sight. The Chronicle keeps every roll."
	_window("help", "How to play", help)

func _window(key: String, title: String, content: Control) -> void:
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	cc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cc.visible = false
	battle_root.add_child(cc)
	var p := PanelContainer.new()
	var st := sbox(Color("#efe0bd"), Color("#8a6a3a"), 3, 12, 16)
	st.shadow_color = Color(0, 0, 0, 0.7); st.shadow_size = 20
	p.add_theme_stylebox_override("panel", st)
	cc.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	var h := HBoxContainer.new()
	var tl := lbl(title, 18, Color("#2b1d10"), F_SCB)
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(tl)
	var close := Button.new()
	close.text = "Close"
	style_button(close, Color("#3a2e24"), BAR_INK, Color("#6b5537"), 13)
	close.pressed.connect(func(): _close_windows())
	h.add_child(close)
	v.add_child(h)
	var sc := ScrollContainer.new()
	sc.custom_minimum_size = Vector2(480, 0)
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(sc)
	sc.add_child(content)
	windows[key] = {"root": cc, "scroll": sc, "content": content}

func _toggle_window(key: String) -> void:
	var was: bool = windows[key].root.visible
	_close_windows()
	if not was:
		var w: Dictionary = windows[key]
		w.root.visible = true
		await get_tree().process_frame
		w.scroll.custom_minimum_size.y = minf(w.content.get_combined_minimum_size().y + 4, get_viewport_rect().size.y * 0.6)

func _close_windows() -> void:
	for k in windows: windows[k].root.visible = false

func _render_pace() -> void:
	for c in pace_box.get_children(): c.queue_free()
	for pr in [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"], ["step", "Step by step"]]:
		var b := Button.new()
		b.text = pr[1]
		var on: bool = battle.pace == pr[0]
		style_button(b, GOLD2 if on else PAPER, INK, Color("#8a6416") if on else INK_SOFT, 14)
		var k: String = pr[0]
		b.pressed.connect(func():
			battle.pace = k
			_render_pace()
			if k != "step": next_pressed.emit())
		pace_box.add_child(b)

# ============================================================ tooltip
func _build_tip() -> void:
	tip_layer = CanvasLayer.new()
	tip_layer.layer = 10
	add_child(tip_layer)
	tip = PanelContainer.new()
	var st := sbox(PAPER, INK, 2, 6, 10)
	st.shadow_color = Color(0.17, 0.14, 0.09, 0.3); st.shadow_size = 10
	tip.add_theme_stylebox_override("panel", st)
	tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tip.theme = theme
	tip_layer.add_child(tip)
	var v := VBoxContainer.new()
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tip.add_child(v)
	tip_text = rich(290, 14, INK)
	v.add_child(tip_text)
	tip_use = Button.new()
	tip_use.text = "Use"
	style_button(tip_use, GOLD2, Color("#22170d"), Color("#8a6416"), 14)
	tip_use.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	v.add_child(tip_use)
	tip_use.pressed.connect(func():
		var a := armed_act
		_disarm()
		if a != "": _do_act(a))
	tip.visible = false

func _show_tip(bb: String, at: Vector2, secs: float, use := false, act := "") -> void:
	tip_text.text = bb
	tip_use.visible = use
	tip.mouse_filter = Control.MOUSE_FILTER_STOP if use else Control.MOUSE_FILTER_IGNORE
	tip.visible = true
	tip.size = Vector2.ZERO
	tip_timer = secs
	tip_follow = false
	_place_tip(at)

func _place_tip(at: Vector2) -> void:
	var vs := get_viewport_rect().size
	tip.size = tip.get_combined_minimum_size()
	var w := tip.size.x
	var h := tip.size.y
	var x := clampf(at.x + 14, 8, vs.x - w - 8)
	var y := at.y + 18 if at.y + 18 + h <= vs.y - 8 else maxf(8, at.y - h - 12)
	tip.position = Vector2(x, y)

func _hide_tip() -> void:
	tip.visible = false
	tip_follow = false
