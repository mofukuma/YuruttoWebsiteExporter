# DOM onlyの再現度を測るための基準画面。
# 背景、枠、角丸、影、文字という写し取りの難所を、重なりも含めて一枚へ並べる設計。

extends Control

const BACK := Color("1e293b") # 画面全体の下地。
const PANEL := Color("f8fafc") # 板の面色。
const LINE := Color("94a3b8") # 板の枠色。
const TEXT := Color("0f172a") # 本文の色。
const ACCENT := Color("2563eb") # Buttonの面色。

# 比較対象を固定位置へ並べる。layoutはGodotが確定し、DOMはその値へ従う。
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
	back.color = BACK
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)

	_panel("Card", Rect2(40, 40, 320, 200), 12.0, 2.0)
	_panel("Flat", Rect2(400, 40, 320, 200), 0.0, 0.0)
	_label("Heading", "DOM ONLY", Vector2(64, 64), 32, TEXT)
	_label("Body", "かさなりと余白を見る", Vector2(64, 120), 18, TEXT)
	_button("Action", "PRESS", Rect2(64, 170, 160, 44))
	_image("Photo", "res://photo.png", Vector2(560, 300))
	_panel("Overlap", Rect2(240, 180, 200, 140), 20.0, 4.0)
	_label("OnTop", "OVERLAP", Vector2(264, 236), 20, TEXT)

# 角丸と枠を持つ板を置く。StyleBoxFlatはCSSへ素直に写る形を選ぶ。
func _panel(node_name: String, rect: Rect2, radius: float, border: float) -> void:
	var box := StyleBoxFlat.new()
	box.bg_color = PANEL
	box.set_corner_radius_all(int(radius))
	box.set_border_width_all(int(border))
	box.border_color = LINE
	var panel := Panel.new()
	panel.name = node_name
	panel.position = rect.position
	panel.size = rect.size
	panel.add_theme_stylebox_override("panel", box)
	add_child(panel)

# 文字を置く。字形の差がそのまま誤差になるため、太さと大きさだけを指定する。
func _label(node_name: String, value: String, at: Vector2, size: int, color: Color) -> void:
	var label := Label.new()
	label.name = node_name
	label.text = value
	label.position = at
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	add_child(label)

# 画像を原寸で置く。写し取りの対象がtextureそのものになる。
func _image(node_name: String, source: String, at: Vector2) -> void:
	var rect := TextureRect.new()
	rect.name = node_name
	rect.texture = load(source)
	rect.position = at
	rect.size = rect.texture.get_size()
	add_child(rect)

# 面色と文字を持つButtonを置く。
func _button(node_name: String, value: String, rect: Rect2) -> void:
	var box := StyleBoxFlat.new()
	box.bg_color = ACCENT
	box.set_corner_radius_all(8)
	var button := Button.new()
	button.name = node_name
	button.text = value
	button.position = rect.position
	button.size = rect.size
	button.add_theme_stylebox_override("normal", box)
	button.add_theme_color_override("font_color", Color.WHITE)
	add_child(button)
