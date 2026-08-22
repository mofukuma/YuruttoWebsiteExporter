# 絵を出すnodeを並べる画面。AnimatedSprite2D、Sprite2D、TextureRect、NinePatchRectを置く。
# 動く絵は決まったコマで止め、GodotとBrowserが同じコマを見せるようにする。

extends Control

const BG := Color("0b1220") # 地の色。
const TEXT := Color("e5e7eb") # 見出しの色。
const FRAME := 2 # 見せるコマ。撮る時刻に左右されないよう固定する。

# 絵のnodeを種類ごとに置き、見出しを添える。
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

	_caption("SPRITES", Vector2(24, 16), 24)

	# 動く絵。コマを止めて置く。
	_caption("AnimatedSprite2D", Vector2(24, 64), 14)
	_animated(Vector2(80, 150))

	# 止まった絵。中心合わせと、ずらしの両方を見る。
	_caption("Sprite2D", Vector2(200, 64), 14)
	_sprite(Vector2(256, 150), true)
	_sprite(Vector2(340, 118), false)

	# Controlとして置く絵。伸ばしかたが違う。
	_caption("TextureRect", Vector2(440, 64), 14)
	_texture_rect(Vector2(440, 118), Vector2(120, 64))

	_caption("NinePatchRect", Vector2(600, 64), 14)
	_nine_patch(Vector2(600, 118), Vector2(150, 64))

	# 同じ絵を回して重ねる。位置と向きがDOMへ伝わるかを見る。
	_caption("回転と重なり", Vector2(24, 250), 14)
	for index in range(4):
		_turned(Vector2(90 + index * 90, 340), index * 0.4)

# 見出しを一つ置く。
func _caption(body: String, at: Vector2, points: int) -> void:
	var label := Label.new()
	label.text = body
	label.position = at
	label.add_theme_font_size_override("font_size", points)
	label.add_theme_color_override("font_color", TEXT)
	add_child(label)

# コマ送りの絵を、決まったコマで止めて置く。
func _animated(at: Vector2) -> void:
	var frames := SpriteFrames.new()
	frames.set_animation_speed("default", 0.0)
	for index in range(4):
		frames.add_frame("default", load("res://frame%d.png" % index))
	var sprite := AnimatedSprite2D.new()
	sprite.name = "Animated"
	sprite.sprite_frames = frames
	sprite.animation = "default"
	sprite.frame = FRAME
	sprite.position = at
	add_child(sprite)

# 止まった絵を置く。centeredの有無で置き場所の決まりかたが変わる。
func _sprite(at: Vector2, centered: bool) -> void:
	var sprite := Sprite2D.new()
	sprite.texture = load("res://frame0.png")
	sprite.position = at
	sprite.centered = centered
	add_child(sprite)

# Controlとして絵を置き、指定の大きさへ伸ばす。
func _texture_rect(at: Vector2, size: Vector2) -> void:
	var rect := TextureRect.new()
	rect.texture = load("res://photo.png")
	rect.position = at
	rect.size = size
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_SCALE
	add_child(rect)

# 縁を伸ばさずに広げる絵を置く。
func _nine_patch(at: Vector2, size: Vector2) -> void:
	var patch := NinePatchRect.new()
	patch.texture = load("res://photo.png")
	patch.position = at
	patch.size = size
	patch.patch_margin_left = 6
	patch.patch_margin_right = 6
	patch.patch_margin_top = 6
	patch.patch_margin_bottom = 6
	add_child(patch)

# 回した絵を置く。向きがそのままDOMへ伝わるかを見る。
func _turned(at: Vector2, angle: float) -> void:
	var sprite := Sprite2D.new()
	sprite.texture = load("res://frame1.png")
	sprite.position = at
	sprite.rotation = angle
	add_child(sprite)
