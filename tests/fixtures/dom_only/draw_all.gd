# DOMへ渡すCanvasItem描画命令を一画面で検査する。
# Godotが確定した点、矩形、文字と画像領域を同じfixtureから比較する設計。

extends Control

const INK := Color("0f172a") # 線と文字の基準色。
const BLUE := Color("2563eb") # 面の基準色。
const GREEN := Color("16a34a") # 多角形の基準色。

class TransientDraw extends Control:
	# 解放済み描画がDOMへ残らないことを検査する印を描く。
	func _draw() -> void:
		draw_rect(Rect2(740, 550, 40, 30), Color.MAGENTA)

# 初回の描画命令を発行する。
func _ready() -> void:
	var transient := TransientDraw.new()
	add_child(transient)
	_drop_transient(transient)
	var polygon := Polygon2D.new()
	polygon.polygon = PackedVector2Array([Vector2(650, 550), Vector2(720, 555), Vector2(690, 585)])
	polygon.color = GREEN
	add_child(polygon)
	queue_redraw()

# DOM同期を一度通した後に印を解放し、要素の回収を検査する。
func _drop_transient(node: Control) -> void:
	for _index in range(4):
		await get_tree().process_frame
	node.queue_free()

# 公開描画命令を種類ごとに離して置き、欠落と位置ずれを見つけやすくする。
func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color8(76, 76, 76), true)
	draw_line(Vector2(40, 50), Vector2(180, 70), INK, 4)
	draw_dashed_line(Vector2(40, 90), Vector2(180, 110), BLUE, 3, 12)
	draw_polyline(PackedVector2Array([Vector2(40, 150), Vector2(110, 125), Vector2(180, 155)]), GREEN, 5)
	draw_multiline(PackedVector2Array([Vector2(40, 190), Vector2(90, 220), Vector2(115, 190), Vector2(180, 220)]), INK, 3)
	draw_rect(Rect2(220, 40, 120, 70), BLUE, true)
	draw_rect(Rect2(380, 40, 120, 70), GREEN, false, 5)
	draw_circle(Vector2(280, 180), 48, GREEN)
	draw_ellipse(Vector2(440, 180), 64, 38, BLUE)
	draw_colored_polygon(PackedVector2Array([Vector2(540, 80), Vector2(700, 50), Vector2(670, 210), Vector2(560, 190)]), BLUE)
	draw_set_transform(Vector2(570, 260), 0.12, Vector2.ONE)
	draw_rect(Rect2(0, 0, 120, 70), GREEN, true)
	draw_set_transform(Vector2.ZERO)
	draw_string(ThemeDB.fallback_font, Vector2(40, 300), "DRAW DOM", HORIZONTAL_ALIGNMENT_LEFT, 220, 28, INK)
	draw_texture_rect_region(load("res://white.svg"), Rect2(40, 340, 180, 120), Rect2(0, 0, 16, 16))
	draw_arc(Vector2(300, 410), 48, 0.2, 4.8, 28, BLUE, 4)
	draw_ellipse_arc(Vector2(430, 410), 62, 34, -2.8, 1.2, 28, GREEN, 4)
	draw_multiline_string(ThemeDB.fallback_font, Vector2(540, 390), "MULTI\nLINE", HORIZONTAL_ALIGNMENT_LEFT, 180, 20, 2, INK)
	draw_string_outline(ThemeDB.fallback_font, Vector2(280, 500), "OUTLINE", HORIZONTAL_ALIGNMENT_LEFT, 180, 24, 2, GREEN)
	draw_string(ThemeDB.fallback_font, Vector2(280, 500), "OUTLINE", HORIZONTAL_ALIGNMENT_LEFT, 180, 24, INK)
	draw_char_outline(ThemeDB.fallback_font, Vector2(520, 500), "A", 36, 2, BLUE)
	draw_char(ThemeDB.fallback_font, Vector2(520, 500), "A", 36, INK)
