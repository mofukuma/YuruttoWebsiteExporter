# BBCodeの記法を並べる画面。RichTextLabelがDOMへどこまで出るかを絵で比べる。
# 動く効果は決まったframeで止め、撮る時刻に左右されないようにする。

extends Control

const BG := Color("0b1220") # 地の色。
const TEXT := Color("e5e7eb") # 見出しの色。
# 見た目の変わりかたで分けたBBCode。左右二列へ並べる。
const SAMPLES := [
	["plain", "ふつうの文字 plain"],
	["b", "[b]太字 bold[/b]"],
	["i", "[i]斜体 italic[/i]"],
	["u", "[u]下線 under[/u]"],
	["s", "[s]取消 strike[/s]"],
	["code", "[code]code(); text[/code]"],
	["color", "[color=#ff5f9e]色つき color[/color]"],
	["bgcolor", "[bgcolor=#204060]背景 bgcolor[/bgcolor]"],
	["fgcolor", "[fgcolor=#ffd166]前景 fgcolor[/fgcolor]"],
	["outline", "[outline_size=4][outline_color=#000000]縁取り outline[/outline_color][/outline_size]"],
	["font_size", "[font_size=22]大きい font_size[/font_size]"],
	["center", "[center]中央 center[/center]"],
	["right", "[right]右 right[/right]"],
	["fill", "[fill]両端 fill そろえ[/fill]"],
	["indent", "[indent]字下げ indent[/indent]"],
	["url", "[url=https://example.com]リンク url[/url]"],
	["wave", "[wave amp=40 freq=4]ゆれ wave[/wave]"],
	["tornado", "[tornado radius=8 freq=3]渦 tornado[/tornado]"],
	["shake", "[shake rate=18 level=12]ふるえ shake[/shake]"],
	["fade", "[fade start=2 length=8]薄れ fade[/fade]"],
	["rainbow", "[rainbow freq=1 sat=0.9 val=1]虹 rainbow[/rainbow]"],
	["pulse", "[pulse freq=1.5 color=#ffffff40]明滅 pulse[/pulse]"],
	["ul", "[ul]一つ目\n二つ目[/ul]"],
	["hint", "[hint=説明]補足 hint[/hint]"],
	["char", "[char=65]と[lb]角[rb]"],
]

# 記法ごとのRichTextLabelを二列へ並べ、比べる相手のLabelも置く。
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

	var head := Label.new()
	head.text = "BBCODE"
	head.position = Vector2(16, 10)
	head.add_theme_font_size_override("font_size", 20)
	head.add_theme_color_override("font_color", TEXT)
	add_child(head)

	for index in range(SAMPLES.size()):
		var pair: Array = SAMPLES[index]
		var column := index / 13
		var row := index % 13
		var rich := RichTextLabel.new()
		rich.name = "rich_%s" % pair[0]
		rich.bbcode_enabled = true
		rich.fit_content = true
		rich.scroll_active = false
		rich.visible_characters_behavior = TextServer.VC_CHARS_BEFORE_SHAPING
		rich.position = Vector2(16 + column * 396, 44 + row * 42)
		rich.size = Vector2(380, 38)
		rich.text = pair[1]
		add_child(rich)
