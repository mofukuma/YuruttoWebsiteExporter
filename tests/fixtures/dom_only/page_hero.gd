# ふつうのホームページの先頭にある画面。見出し、本文、写真、ボタンを置く。
# 文字と箱と画像で組み、DOM onlyがどこまで素直に再現できるかを見る。

extends Control

const BG := Color("0f172a") # 地の色。
const CARD := Color("1e293b") # 内側の面の色。
const ACCENT := Color("38bdf8") # 目立たせる色。
const TEXT := Color("e2e8f0") # 本文の色。
const MUTED := Color("94a3b8") # 補足の色。

# 見出しから下へ、順に置いていく。
func _ready() -> void:
	# Browserと同じ字形で比べるため、Web fontを持つThemeを画面全体へ適用する。
	var font := load("res://fonts/Match.ttf") as FontFile
	if font != null:
		# 輪郭のまま描かせ、Browserの字形計算へ寄せる。
		font.hinting = TextServer.HINTING_NONE
		font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
		var text_theme := Theme.new()
		text_theme.default_font = font
		theme = text_theme

	var back := ColorRect.new()
	back.color = BG
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)

	_band(Vector2(0, 0), Vector2(800, 64), CARD)
	_label("HERO PAGE", Vector2(24, 18), 26, TEXT)
	_label("Home", Vector2(600, 24), 16, MUTED)
	_label("About", Vector2(670, 24), 16, MUTED)
	_label("Contact", Vector2(730, 24), 16, MUTED)

	_photo(Vector2(24, 96), Vector2(360, 200))
	_label("写真とことばを並べる", Vector2(408, 104), 24, TEXT)
	_label("Godotで作った画面を、そのままWebページとして配る。", Vector2(408, 148), 15, MUTED)
	_label("文字は選べるし、検索にも見つけてもらえる。", Vector2(408, 174), 15, MUTED)

	_band(Vector2(408, 214), Vector2(150, 42), ACCENT)
	_label("はじめる", Vector2(444, 224), 17, BG)

	_band(Vector2(24, 320), Vector2(752, 2), Color(MUTED, 0.4))
	_label("小さな見出し", Vector2(24, 340), 19, TEXT)
	_label("区切り線の下に、続きの説明を置いた形。", Vector2(24, 372), 15, MUTED)

# 面を一つ置く。角丸のない素直な矩形。
func _band(at: Vector2, size: Vector2, tint: Color) -> void:
	var rect := ColorRect.new()
	rect.color = tint
	rect.position = at
	rect.size = size
	add_child(rect)

# 文字を一つ置く。
func _label(body: String, at: Vector2, points: int, tint: Color) -> void:
	var label := Label.new()
	label.text = body
	label.position = at
	label.add_theme_font_size_override("font_size", points)
	label.add_theme_color_override("font_color", tint)
	add_child(label)

# 写真を一つ置く。取り込んだtextureをそのまま伸ばす。
func _photo(at: Vector2, size: Vector2) -> void:
	var frame := TextureRect.new()
	frame.texture = load("res://photo.png")
	frame.position = at
	frame.size = size
	frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	frame.stretch_mode = TextureRect.STRETCH_SCALE
	add_child(frame)
