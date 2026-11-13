# Turns the classic vector art (SVG strings kept in art_data.gd) into textures at runtime, with a cache.
extends RefCounted

const ArtData = preload("res://scripts/art_data.gd")

static var _cache := {}

static func has(key: String) -> bool:
	return ArtData.SVG.has(key)

# scale = raster pixels per SVG unit. Mipmaps keep the art smooth when drawn smaller.
static func tex(key: String, scale: float = 2.0) -> Texture2D:
	var ck := "%s@%s" % [key, scale]
	if _cache.has(ck):
		return _cache[ck]
	if not ArtData.SVG.has(key):
		push_warning("missing art: " + key)
		return null
	var img := Image.new()
	var err := img.load_svg_from_string(ArtData.SVG[key], scale)
	if err != OK:
		push_warning("svg failed: " + key)
		return null
	img.generate_mipmaps()
	var t := ImageTexture.create_from_image(img)
	_cache[ck] = t
	return t

static func hero_key(lf: String, role: String) -> String:
	return "hero/%s/%s" % [lf, role]

static func ability_icon(name: String) -> String:
	return "icon/ab/" + name

static func attack_icon(weapon: String) -> String:
	var k := "icon/attack/" + weapon
	return k if ArtData.SVG.has(k) else "icon/attack/Blade"
