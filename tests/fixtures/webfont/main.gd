# Theme fontと同名同pathのWeb fontを持つLabelを表示する。
# Font選択だけを変え、文字DOM所有境界をBrowserから観測する。

extends Control

# 対応font付きThemeとDOM指定Labelを構築する。
func _ready() -> void:
	var text_theme := Theme.new()
	text_theme.default_font = load("res://fonts/Test.otf")
	text_theme.default_font_size = 42
	theme = text_theme
	var label := Label.new()
	label.name = "ThemeFontLabel"
	label.text = "テーマの日本語 Web Font"
	label.position = Vector2(40, 70)
	label.size = Vector2(560, 80)
	label.set_meta("gdweb_dom_text", true)
	add_child(label)
