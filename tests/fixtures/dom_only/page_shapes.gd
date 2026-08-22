# 形を出すnodeを並べる画面。Polygon2DとLine2D、TouchScreenButtonを置く。
# 頂点の並びがそのままDOMの切り抜きへ渡るかを見る。

extends Control

const BG := Color("0b1220") # 地の色。
const TEXT := Color("e5e7eb") # 見出しの色。

# 形のnodeを種類ごとに置き、見出しを添える。
func _ready() -> void:
	# Browserと同じ字形で比べるため、Web fontを持つThemeを画面全体へ適用する。
	var font := load("res://fonts/Match.ttf") as FontFile
	if font != null:
		font.hinting = TextServer.HINTING_NONE
		font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
		var text_theme := Theme.new()
		text_theme.default_font = font
		theme = text_theme

	var back := ColorRect.new()
	back.color = BG
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)

	_caption("SHAPES", Vector2(20, 12), 22)

	# 三角形、五角形、星。頂点の数を変えて切り抜きを見る。
	_caption("Polygon2D", Vector2(20, 56), 14)
	_polygon(Vector2(90, 150), _regular(3, 54.0), Color("f472b6"))
	_polygon(Vector2(240, 150), _regular(5, 54.0), Color("60a5fa"))
	_polygon(Vector2(390, 150), _star(5, 56.0, 24.0), Color("fbbf24"))

	# へこみのある形。切り抜きが素直に効くかを見る。
	_polygon(Vector2(540, 150), PackedVector2Array([
		Vector2(-60, -40), Vector2(60, -40), Vector2(60, 10),
		Vector2(10, 10), Vector2(10, 40), Vector2(-60, 40),
	]), Color("4ade80"))

	# 折れ線。太さと角の付きかたを見る。
	_caption("Line2D", Vector2(20, 240), 14)
	_line(PackedVector2Array([
		Vector2(40, 320), Vector2(140, 280), Vector2(240, 350), Vector2(340, 290), Vector2(440, 340),
	]), 10.0, Color("38bdf8"))
	_line(PackedVector2Array([
		Vector2(500, 290), Vector2(600, 290), Vector2(600, 350), Vector2(700, 350),
	]), 16.0, Color("f87171"))

# 見出しを一つ置く。
func _caption(body: String, at: Vector2, points: int) -> void:
	var label := Label.new()
	label.text = body
	label.position = at
	label.add_theme_font_size_override("font_size", points)
	label.add_theme_color_override("font_color", TEXT)
	add_child(label)

# 多角形を一つ置く。頂点はnodeの位置からの相対で持つ。
func _polygon(at: Vector2, points: PackedVector2Array, tint: Color) -> void:
	var poly := Polygon2D.new()
	poly.polygon = points
	poly.color = tint
	poly.position = at
	add_child(poly)

# 折れ線を一つ置く。
func _line(points: PackedVector2Array, width: float, tint: Color) -> void:
	var line := Line2D.new()
	line.points = points
	line.width = width
	line.default_color = tint
	add_child(line)

# 正多角形の頂点を作る。上を起点にして時計回りへ並べる。
func _regular(sides: int, radius: float) -> PackedVector2Array:
	var points := PackedVector2Array()
	for index in range(sides):
		var angle := -PI / 2.0 + TAU * index / sides
		points.append(Vector2(cos(angle), sin(angle)) * radius)
	return points

# 星形の頂点を作る。外と内の半径を交互に使う。
func _star(points_count: int, outer: float, inner: float) -> PackedVector2Array:
	var points := PackedVector2Array()
	for index in range(points_count * 2):
		var angle := -PI / 2.0 + PI * index / points_count
		var radius: float = outer if index % 2 == 0 else inner
		points.append(Vector2(cos(angle), sin(angle)) * radius)
	return points
