# 文字を輪の形へ並べて、ぐるぐる回す画面。
# 回した文字がHTMLのままきちんとついてくるかを、絵で確かめるためのもの。

extends Control

const BG := Color(0.118647, 0.118647, 0.142176) # 背景色。狙いは(30,30,36)。
const FONT_PATH := "res://fonts/LINESeedJP-Regular.ttf" # 書体。Web側も同じものを使う。
const CENTER := Vector2(320, 240) # 輪の中心。
const FROZEN := 1.25 # 絵を比べるとき、この時間の姿で止める。負にすると普通に回る。
const RINGS := [ # 半径、文字、寸法、色、回る速さ(度/秒)。逆回りは負で書く。
	[150.0, "YURUTTO WEBSITE EXPORTER RINGS ", 21, Color(0.95002, 0.85198, 0.35002), 36.0],
	[100.0, "ぐるぐるまわる日本語のもじ", 21, Color(0.45198, 0.85198, 0.95002), -48.0],
	[56.0, "CENTER 0123", 21, Color(0.95002, 0.55002, 0.65198), 72.0],
]

var rings: Array[Array] = [] # 輪ごとの、並べた文字Labelの一覧。
var spin: Array[float] = [] # 輪ごとの、いま回っている角度。
var elapsed := 0.0 # 始まってからの時間。絵を比べるときはここを外から決める。

# 半径ごとに文字を一つずつ置き、輪の形へ並べる。
func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var back := ColorRect.new()
	back.color = BG
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)
	var font := load(FONT_PATH) as Font
	for ring in RINGS:
		var letters: Array[Label] = []
		var text: String = ring[1]
		for index in text.length():
			var letter := Label.new()
			letter.text = text[index]
			letter.add_theme_font_size_override("font_size", ring[2])
			letter.add_theme_color_override("font_color", ring[3])
			if font != null:
				letter.add_theme_font_override("font", font)
			# 文字の真ん中を軸にして回すため、中心を基準点にする。
			letter.size = Vector2(ring[2], ring[2] * 1.4)
			letter.pivot_offset = letter.size * 0.5
			letter.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			letter.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			add_child(letter)
			letters.append(letter)
		rings.append(letters)
		spin.append(0.0)
	_layout()

# いまの角度で、輪の上の文字それぞれの位置と傾きを決める。
func _layout() -> void:
	for index in rings.size():
		var letters: Array = rings[index]
		var radius: float = RINGS[index][0]
		var count := letters.size()
		for at in count:
			var letter: Label = letters[at]
			# 輪を等分した角へ置く。上を始まりにしたいので4分の1回転ずらす。
			var angle := TAU * at / count + deg_to_rad(spin[index]) - TAU * 0.25
			var point := CENTER + Vector2(cos(angle), sin(angle)) * radius
			letter.position = point - letter.pivot_offset
			# 文字の頭が外を向くように、進む向きへ傾ける。
			letter.rotation = angle + TAU * 0.25

# 毎frame角度を進めて、輪を回し続ける。
# 絵を比べる場合は決まった時間で止め、GodotとWebで同じ姿にする。
func _process(delta: float) -> void:
	if FROZEN >= 0.0:
		set_time(FROZEN)
		return
	set_time(elapsed + delta)

# 始まってからの時間を決めて、そのときの姿にする。
# GodotとWebで同じ時間の姿を作れるようにして、絵を比べられるようにする。
func set_time(seconds: float) -> void:
	elapsed = seconds
	for index in rings.size():
		spin[index] = RINGS[index][4] * elapsed
	_layout()
