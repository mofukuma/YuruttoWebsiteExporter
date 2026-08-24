# AnimatedSprite2Dのatlas切り抜き、配置、反転を一画面で比べる。
# 同じsheetから四領域を選び、親枠と子画像の2層DOMがGodotと一致するか判断する。

extends Node2D

const FRAME := Vector2i(64, 48) # 一つのframe寸法。
const SHEET := Vector2i(128, 96) # 2列2行のatlas寸法。
const COLORS := [Color("ef4444"), Color("22c55e"), Color("3b82f6"), Color("f59e0b")] # frameの識別色。

# 比較画面と四つのframeを一度に用意する。
func _ready() -> void:
	var background := ColorRect.new()
	background.name = "Background"
	background.size = Vector2(800, 600)
	background.color = Color("111827")
	background.z_index = -1
	add_child(background)

	var image := Image.create(SHEET.x, SHEET.y, false, Image.FORMAT_RGBA8)
	for index in COLORS.size():
		var origin := Vector2i(index % 2, index / 2) * FRAME
		image.fill_rect(Rect2i(origin, FRAME), COLORS[index])
		image.fill_rect(Rect2i(origin + Vector2i(8, 8), Vector2i(20, 12)), Color.WHITE)
		image.fill_rect(Rect2i(origin + Vector2i(36, 24), Vector2i(20, 16)), Color("111827"))
	var atlas := ImageTexture.create_from_image(image)
	var frames := SpriteFrames.new()
	frames.clear_all()
	frames.add_animation(&"sheet")
	for index in COLORS.size():
		var texture := AtlasTexture.new()
		texture.atlas = atlas
		texture.region = Rect2(Vector2i(index % 2, index / 2) * FRAME, FRAME)
		frames.add_frame(&"sheet", texture)

	for index in COLORS.size():
		var sprite := AnimatedSprite2D.new()
		sprite.name = "Frame%d" % index
		sprite.sprite_frames = frames
		sprite.animation = &"sheet"
		sprite.frame = index
		sprite.position = Vector2(160 + index % 2 * 260, 170 + index / 2 * 220)
		sprite.scale = Vector2(2, 2)
		sprite.centered = index != 1
		sprite.offset = Vector2(6, -4)
		sprite.flip_h = index == 2
		sprite.flip_v = index == 3
		add_child(sprite)

	var moving := AnimatedSprite2D.new()
	moving.name = "MovingFrame"
	moving.sprite_frames = frames
	moving.animation = &"sheet"
	moving.position = Vector2(900, 100)
	add_child(moving)
	frames.set_animation_speed(&"sheet", 8)
	moving.play()
