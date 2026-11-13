# One round icon in the action ring behind the active Light Keeper (and the same look for the bar's icons).
extends Control

signal chosen(act: String)
signal hovered(btn, on: bool)

var act := ""
var on := true
var pressed := false
var armed := false
var cd := 0
var icon: Texture2D
var _hover := false
var _tw: Tween

func setup(p_act: String, p_icon: Texture2D, p_on: bool, p_pressed: bool, p_cd: int, size_px: float) -> void:
	act = p_act; icon = p_icon; on = p_on; pressed = p_pressed; cd = p_cd
	custom_minimum_size = Vector2(size_px, size_px)
	size = Vector2(size_px, size_px)
	pivot_offset = size / 2
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if on else Control.CURSOR_ARROW
	focus_mode = Control.FOCUS_ALL
	queue_redraw()

func _ready() -> void:
	mouse_entered.connect(func(): _set_hover(true))
	mouse_exited.connect(func(): _set_hover(false))
	focus_entered.connect(func(): _set_hover(true))
	focus_exited.connect(func(): _set_hover(false))

func _set_hover(v: bool) -> void:
	if _hover == v:
		return
	_hover = v
	_grow(v or armed)
	hovered.emit(self, v)
	queue_redraw()

func set_armed(v: bool) -> void:
	armed = v
	_grow(v or _hover)
	queue_redraw()

func _grow(big: bool) -> void:
	if _tw: _tw.kill()
	_tw = create_tween()
	_tw.tween_property(self, "scale", Vector2.ONE * (1.22 if big else 1.0), 0.15)

func pop_in(delay: float) -> void:
	scale = Vector2.ONE * 0.4
	modulate.a = 0.0
	var tw := create_tween().set_parallel(true)
	tw.tween_property(self, "scale", Vector2.ONE, 0.25).set_delay(delay).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "modulate:a", 1.0, 0.2).set_delay(delay)

func _gui_input(event: InputEvent) -> void:
	if (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT) or (event is InputEventKey and event.pressed and event.keycode in [KEY_ENTER, KEY_SPACE]):
		accept_event()
		chosen.emit(act)

func _draw() -> void:
	var r := size.x / 2
	var c := size / 2
	if _hover or armed:
		draw_circle(c, r + 6, Color("#ffd36a", 0.28), true, -1.0, true)
		draw_arc(c, r + 2, 0, TAU, 40, Color("#ffe2a0", 0.55), 3, true)
	draw_circle(c + Vector2(0, 2), r, Color(0, 0, 0, 0.45), true, -1.0, true) # drop shadow
	var base := Color("#c99a3c") if pressed else Color("#1c140e")
	var hi := Color("#ffe2a0") if pressed else Color("#4a3b2c")
	draw_circle(c, r - 1, base, true, -1.0, true)
	draw_circle(c - Vector2(0, r * 0.18), r * 0.62, Color(hi, 0.85), true, -1.0, true)
	draw_circle(c - Vector2(0, r * 0.3), r * 0.35, Color(hi, 0.5), true, -1.0, true)
	draw_arc(c, r - 1, 0, TAU, 40, Color("#fff3cf") if pressed else Color("#c99a3c"), 2, true)
	if icon:
		var s := size.x * 0.72
		var col := Color.WHITE if on else Color(0.55, 0.55, 0.55, 0.6)
		draw_texture_rect(icon, Rect2(c - Vector2(s, s) / 2, Vector2(s, s)), false, col)
	if not on:
		draw_circle(c, r - 1, Color(0.1, 0.08, 0.06, 0.35), true, -1.0, true)
	if cd > 0:
		var b := Vector2(size.x - 4, size.y - 4)
		draw_circle(b, 8, Color("#2a1612"), true, -1.0, true)
		draw_arc(b, 8, 0, TAU, 20, Color("#c99a3c"), 1, true)
		var f := get_theme_default_font()
		draw_string(f, b + Vector2(-4, 4), str(cd), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("#ffe2a0"))
