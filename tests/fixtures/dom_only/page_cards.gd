# 画像つきの札を並べる画面。よくある一覧のページを模す。
# 角丸と縁と画像の組み合わせが、DOMの箱でどこまで揃うかを見る。

extends Control

const BG := Color("111827") # 地の色。
const CARD := Color("1f2937") # 札の面の色。
const EDGE := Color("374151") # 札の縁の色。
const TEXT := Color("f9fafb") # 見出しの色。
const MUTED := Color("9ca3af") # 説明の色。
const COLUMNS := 3 # 横に並べる札の数。

# 札を格子に並べる。位置は計算で決め、入れ子にはしない。
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

	var title := Label.new()
	title.text = "CARDS"
	title.position = Vector2(24, 20)
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", TEXT)
	add_child(title)

	for index in range(6):
		var column := index % COLUMNS
		var row := index / COLUMNS
		var at := Vector2(24 + column * 254, 70 + row * 250)
		_card(at, index)

# 札を一枚作る。縁のある面、画像、見出し、説明の順に重ねる。
func _card(at: Vector2, index: int) -> void:
	var panel := Panel.new()
	panel.position = at
	panel.size = Vector2(230, 226)
	var style := StyleBoxFlat.new()
	style.bg_color = CARD
	style.border_color = EDGE
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)

	var photo := TextureRect.new()
	photo.texture = load("res://photo.png")
	photo.position = at + Vector2(12, 12)
	photo.size = Vector2(206, 116)
	photo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	photo.stretch_mode = TextureRect.STRETCH_SCALE
	add_child(photo)

	var head := Label.new()
	head.text = "作品 %d" % (index + 1)
	head.position = at + Vector2(12, 140)
	head.add_theme_font_size_override("font_size", 18)
	head.add_theme_color_override("font_color", TEXT)
	add_child(head)

	var body := Label.new()
	body.text = "説明の文章がここへ入る。"
	body.position = at + Vector2(12, 172)
	body.add_theme_font_size_override("font_size", 14)
	body.add_theme_color_override("font_color", MUTED)
	add_child(body)
