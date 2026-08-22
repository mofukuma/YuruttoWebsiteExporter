# 長い文章の中でBBCodeの飾りが成り立つかを見る画面。
# 記法を切れ切れに並べるのではなく、読める文章の中へ混ぜる。
# waveやfadeは文字ごとに位置や濃さが変わるため、文章の流れの中でこそ崩れが見える。

extends Control

const BG := Color("0b1220") # 地の色。
const TEXT := Color("e5e7eb") # 見出しの色。
# 宮沢賢治の文体を借りた文章へ、飾りの記法を混ぜる。
# 一つの段の中で複数の飾りが隣り合う形にして、境目の扱いも見る。
const BODY := """[b]イーハトーヴォ[/b]のすきとおった風、夏でも底に[i]つめたさ[/i]をもつ青いそら、
うつくしい森で飾られた[color=#ff5f9e]モリーオ市[/color]、郊外のぎらぎらひかる草の波。

[wave amp=30 freq=3]またそのなかでいっしょになったたくさんのひとたち[/wave]、
[fade start=4 length=14]ファゼーロとロザーロ、羊飼のミーロや[/fade]、
[shake rate=16 level=8]顔の赤いこどもたち[/shake]、
[rainbow freq=0.8 sat=0.8 val=1]地主のテーモ[/rainbow]、山猫博士のボーガント・デストゥパーゴなど、
[tornado radius=6 freq=2]いまこの暗い巨きな石の建物のなかで[/tornado]、
[pulse freq=1.2 color=#ffffff40]わたくしはそれを書いています[/pulse]。

[u]あるいは[/u][s]ひとりで[/s][code]forest()[/code]の奥へ、
[bgcolor=#204060]あるいは[/bgcolor][fgcolor=#ffd166]みんなと[/fgcolor]、
[font_size=22]ずうっと遠く[/font_size]まで[outline_size=3][outline_color=#000000]歩いて[/outline_color][/outline_size]ゆく。

[center]中央へ寄せた一行[/center]
[right]右へ寄せた一行[/right]
[indent]字下げした一行[/indent]
[url=https://example.com]リンクになった一行[/url]"""

# 長い文章を一つ置き、比べる相手のLabelも添える。
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
	head.text = "RICH TEXT"
	head.position = Vector2(16, 10)
	head.add_theme_font_size_override("font_size", 20)
	head.add_theme_color_override("font_color", TEXT)
	add_child(head)

	var rich := RichTextLabel.new()
	rich.name = "Body"
	rich.bbcode_enabled = true
	rich.scroll_active = false
	rich.position = Vector2(16, 44)
	rich.size = Vector2(768, 540)
	rich.custom_minimum_size = Vector2(768, 540)
	rich.add_theme_color_override("default_color", TEXT)
	rich.text = BODY
	add_child(rich)
