# 同一フォントの複数サイズを固定行へ並べ、描画器ごとの画素寸法を測る画面。
# 背景と文字以外を置かず、位置・横幅・縦幅・濃度の差を行ごとに分離する。

extends Control

const SIZES := [10, 12, 14, 16, 18, 20, 24, 32, 48] # 小文字から見出しまでの代表寸法。
const ROW_HEIGHT := 64 # 最大文字を切らず、各行を独立比較する高さ。
const SAMPLE := "AgjpQWMW 012345 日本語" # 上下端、字幅、和文を同時に測る文字列。

# 白地へ黒文字を置き、非背景画素の範囲を一意に測れるようにする。
func _ready() -> void:
	var background := ColorRect.new()
	background.color = Color.WHITE
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var font := load("res://fonts/Match.ttf") as FontFile
	for index in SIZES.size():
		var label := Label.new()
		label.name = "Font%02d" % SIZES[index]
		label.text = SAMPLE
		label.position = Vector2(20, index * ROW_HEIGHT)
		label.add_theme_font_size_override("font_size", SIZES[index])
		label.add_theme_color_override("font_color", Color.BLACK)
		if font != null:
			label.add_theme_font_override("font", font)
		add_child(label)
