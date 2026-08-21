# GodotとWebで同じ絵が出るかを測るための画面。
# 動かないものを置き、色と位置と文字を決め打ちで並べる。

extends Control

# 色は8bitの境目のすぐ上へ置く。
# GodotのPNG保存は切り捨て、Browserは四捨五入をするので、
# 境目をまたぐ値にすると両者が1ずれて、絵の全面に差が出てしまう。
const BG := Color(0.118647, 0.118647, 0.142176) # 背景色。狙いは(30,30,36)。
const BLOCKS := [ # 位置と色を決め打ちした四角。文字以外の描画がずれないかを見る。
	[Rect2(40, 40, 160, 90), Color(0.85198, 0.25198, 0.25198)],
	[Rect2(240, 40, 160, 90), Color(0.25198, 0.65198, 0.35002)],
	[Rect2(440, 40, 160, 90), Color(0.25198, 0.45198, 0.85198)],
	[Rect2(40, 300, 560, 40), Color(0.55002, 0.55002, 0.601)],
]
const LABELS := [ # 位置と大きさと中身を決め打ちした文字。DOM化しても位置が動かないことを見る。
	[Vector2(40, 150), "PIXEL PARITY", 28],
	[Vector2(40, 186), "SECOND LINE 0123456789", 22],
	[Vector2(40, 216), "日本語のテキストも並べる", 22],
	[Vector2(40, 246), "small text gjpqy AVWA", 15],
	[Vector2(40, 268), "MIXED 混在 Text 123", 18],
	[Vector2(320, 150), "RIGHT COLUMN", 20],
	[Vector2(320, 180), "another line", 16],
]
const TEXT_COLOR := Color(0.95002, 0.95002, 0.95002) # 文字色。狙いは(242,242,242)。
const FONT_PATH := "res://fonts/LINESeedJP-Regular.ttf" # 書体。隣に同じ書体のwoff2を置き、Web側も同じ字形にする。

# 背景と四角と文字を初回に組み立てる。
func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var back := ColorRect.new()
	back.color = BG
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)
	for block in BLOCKS:
		var rect := ColorRect.new()
		rect.position = block[0].position
		rect.size = block[0].size
		rect.color = block[1]
		add_child(rect)
	for item in LABELS:
		var label := Label.new()
		label.position = item[0]
		label.text = item[1]
		label.add_theme_font_size_override("font_size", item[2])
		var font := load(FONT_PATH) as Font
		if font != null:
			label.add_theme_font_override("font", font)
		label.add_theme_color_override("font_color", TEXT_COLOR)
		add_child(label)
