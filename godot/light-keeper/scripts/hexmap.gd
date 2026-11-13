# The seed shed field: the same 15x10 hex map, terrain and line-of-sight rules as hex-3v3.html / farluck-battle.html.
extends RefCounted

# . grass  T trees  H hill  C dry creek  R rocks  F fence
const MAP := [
	"TT..R.....R..TT",
	"T....T...T....T",
	"...F...H...F...",
	"...F..HHH..F...",
	".T....CHC....T.",
	"......C.C......",
	"..R...C.C...R..",
	".T..T..C..T..T.",
	"....TT...TT....",
	"R.....R.R.....R",
]
const COLS := 15
const ROWS := 10
const TER := {
	".": {"cost": 1, "fill": "#a9a85c"},
	"T": {"cost": 2, "cover": true, "fill": "#919d55"},
	"H": {"cost": 2, "high": true, "fill": "#c9ae74"},
	"C": {"cost": 2, "fill": "#9c8562"},
	"R": {"cost": 1, "block": true, "sight": true, "fill": "#a0a060"},
	"F": {"cost": 1, "block": true, "lowCover": true, "fill": "#a9a85c"},
}
const HS := 30.0
const HW := HS * 1.5
const HH := 1.7320508 * HS * 0.62
const OX := 40.0
const OY := 46.0
const VIEW := Vector2(768, 395)

static func ch(c: int, r: int) -> String:
	if r < 0 or r >= ROWS or c < 0 or c >= COLS:
		return "."
	return MAP[r][c]

static func ter(c: int, r: int) -> Dictionary:
	return TER[ch(c, r)]

static func tget(c: int, r: int, k: String) -> bool:
	return ter(c, r).get(k, false)

static func center(c: int, r: int) -> Vector2:
	return Vector2(OX + c * HW, OY + r * HH + (HH / 2.0 if (c & 1) else 0.0))

static func lift(c: int, r: int) -> float:
	return 7.0 if tget(c, r, "high") else 0.0

static func to_cube(p: Vector2i) -> Vector3i:
	var x := p.x
	var z := p.y - (p.x - (p.x & 1)) / 2
	return Vector3i(x, -x - z, z)

static func from_cube(x: int, _y: int, z: int) -> Vector2i:
	return Vector2i(x, z + (x - (x & 1)) / 2)

static func dist(a: Vector2i, b: Vector2i) -> int:
	var A := to_cube(a)
	var B := to_cube(b)
	return maxi(absi(A.x - B.x), maxi(absi(A.y - B.y), absi(A.z - B.z)))

const DIRS := [
	[Vector2i(1, 0), Vector2i(1, -1), Vector2i(0, -1), Vector2i(-1, -1), Vector2i(-1, 0), Vector2i(0, 1)],
	[Vector2i(1, 1), Vector2i(1, 0), Vector2i(0, -1), Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1)],
]

static func neighbors(p: Vector2i) -> Array:
	var out := []
	for d in DIRS[p.x & 1]:
		var q: Vector2i = p + d
		if q.x >= 0 and q.y >= 0 and q.x < COLS and q.y < ROWS:
			out.append(q)
	return out

static func cube_round(x: float, y: float, z: float) -> Vector3i:
	var rx := roundf(x)
	var ry := roundf(y)
	var rz := roundf(z)
	var dx := absf(rx - x)
	var dy := absf(ry - y)
	var dz := absf(rz - z)
	if dx > dy and dx > dz:
		rx = -ry - rz
	elif dy > dz:
		ry = -rx - rz
	else:
		rz = -rx - ry
	return Vector3i(int(rx), int(ry), int(rz))

static func line(a: Vector2i, b: Vector2i) -> Array:
	var n := dist(a, b)
	var A := to_cube(a)
	var B := to_cube(b)
	var out := []
	for i in range(n + 1):
		var t := float(i) / n if n > 0 else 0.0
		var cr := cube_round(A.x + (B.x - A.x) * t + 1e-6, A.y + (B.y - A.y) * t + 1e-6, A.z + (B.z - A.z) * t - 2e-6)
		out.append(from_cube(cr.x, cr.y, cr.z))
	return out

# { ok, cover }: rocks block sight; trees or a fence next to the target give cover at range.
static func sight(a: Vector2i, b: Vector2i) -> Dictionary:
	var L := line(a, b)
	var cover := false
	for i in range(1, L.size() - 1):
		var p: Vector2i = L[i]
		var t := ter(p.x, p.y)
		if t.get("sight", false):
			return {"ok": false, "cover": false}
		if (t.get("lowCover", false) or t.get("cover", false)) and dist(p, b) == 1:
			cover = true
	if tget(b.x, b.y, "cover"):
		cover = true
	return {"ok": true, "cover": cover and dist(a, b) > 1}
