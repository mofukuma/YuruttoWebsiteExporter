# BBCodeの各記法をRichTextLabelで並べる検査画面。
# DOM onlyとCanvasのある段で、同じ画面がどう出るかを見比べるために使う。
# 記法ごとにnodeを分け、名前で結果を突き合わせられるようにする。

extends Control

# 見た目の変わりかたで分けたBBCodeの一覧。名前はDOM側の照合に使う。
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
	["font_size", "[font_size=28]大きい font_size[/font_size]"],
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

# 記法ごとのRichTextLabelと、比べる相手のLabelを置く。
func _ready() -> void:
	var back := ColorRect.new()
	back.color = Color("101820")
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)

	# ふつうのLabelは文字DOMになる。RichTextLabelとの違いを示す目印にする。
	var plain := Label.new()
	plain.name = "PlainLabel"
	plain.text = "PLAIN LABEL"
	plain.position = Vector2(600, 6)
	add_child(plain)

	var y := 6.0
	for pair in SAMPLES:
		var rich := RichTextLabel.new()
		rich.name = "rich_%s" % pair[0]
		rich.bbcode_enabled = true
		rich.fit_content = true
		rich.scroll_active = false
		rich.position = Vector2(12, y)
		rich.size = Vector2(560, 26)
		rich.text = pair[1]
		add_child(rich)
		y += 27.0
