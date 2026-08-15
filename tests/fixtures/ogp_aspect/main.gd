# 正方形画面の中央へ単色円を描く。
# OGP変換後の円外接矩形から縦横比維持を判断する素材。

extends Node2D

const BG := Color("050913") # 切り抜き後も残る背景色。
const TARGET := Color("ff4fa3") # 外接矩形を抽出する対象色。

# 背景と正円をCanvasへ描画する。
func _draw() -> void:
	draw_rect(Rect2(0, 0, 600, 600), BG)
	draw_circle(Vector2(300, 300), 90.0, TARGET)
