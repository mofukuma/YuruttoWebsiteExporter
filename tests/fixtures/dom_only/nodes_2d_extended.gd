# resourceを展開して描く2D Nodeをカードへ分け、平坦DOMのinstance表現を検査する。
# 同じ寸法の枠内へ題名、実物、確認点を揃え、画像の所属と崩れを画面から判断できるようにする。

extends Node2D

# 四隅、枠、中央線が異なる非対称画像を作る。
func framed_texture(size: Vector2i, center: Color, edge: Color) -> ImageTexture:
	var image := Image.create(size.x, size.y, false, Image.FORMAT_RGBA8)
	image.fill(center)
	image.fill_rect(Rect2i(0, 0, size.x, 3), edge)
	image.fill_rect(Rect2i(0, size.y - 3, size.x, 3), edge.darkened(0.35))
	image.fill_rect(Rect2i(0, 0, 3, size.y), edge.lightened(0.25))
	image.fill_rect(Rect2i(size.x - 3, 0, 3, size.y), edge.darkened(0.6))
	image.fill_rect(Rect2i(0, 0, 8, 8), Color("ef4444"))
	image.fill_rect(Rect2i(size.x - 8, 0, 8, 8), Color("22c55e"))
	image.fill_rect(Rect2i(0, size.y - 8, 8, 8), Color("3b82f6"))
	image.fill_rect(Rect2i(size.x - 8, size.y - 8, 8, 8), Color("facc15"))
	image.fill_rect(Rect2i(int(size.x / 2.0) - 2, 8, 4, size.y - 16), Color("f8fafc"))
	return ImageTexture.create_from_image(image)

# 三種類のcell領域を一枚に持つTileSet atlasを作る。
func tile_texture() -> ImageTexture:
	var image := Image.create(96, 32, false, Image.FORMAT_RGBA8)
	var colors := [Color("06b6d4"), Color("f472b6"), Color("f59e0b")]
	for index in 3:
		var x := index * 32
		image.fill_rect(Rect2i(x, 0, 32, 32), Color("111827"))
		image.fill_rect(Rect2i(x + 3, 3, 26, 26), colors[index])
		image.fill_rect(Rect2i(x + 6, 6, 5, 17), Color("f8fafc"))
		image.fill_rect(Rect2i(x + 11, 18, 12, 5), Color("f8fafc"))
		image.fill_rect(Rect2i(x + 22, 6, 5, 5), Color("0f172a"))
	return ImageTexture.create_from_image(image)

# 進捗の切り抜き位置を判定できる横縞画像を作る。
func progress_texture() -> ImageTexture:
	var image := Image.create(150, 28, false, Image.FORMAT_RGBA8)
	for x in 150:
		var color := Color("facc15") if int(x / 10.0) % 2 == 0 else Color("fb7185")
		image.fill_rect(Rect2i(x, 0, 1, 28), color)
	image.fill_rect(Rect2i(0, 0, 150, 3), Color("f8fafc"))
	image.fill_rect(Rect2i(0, 25, 150, 3), Color("0f172a"))
	return ImageTexture.create_from_image(image)

# 2D三角形Meshを作る。
func triangle(color: Color) -> ArrayMesh:
	var mesh := ArrayMesh.new()
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(-55, 45, 0), Vector3(0, -55, 0), Vector3(55, 45, 0)])
	arrays[Mesh.ARRAY_COLOR] = PackedColorArray([color, color, color])
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh

# TileMapLayerと旧TileMapが共有する一枚TileSetを作る。
func tile_set() -> TileSet:
	var value := TileSet.new()
	value.tile_size = Vector2i(32, 32)
	var atlas := TileSetAtlasSource.new()
	atlas.texture = tile_texture()
	atlas.texture_region_size = Vector2i(32, 32)
	for x in 3:
		atlas.create_tile(Vector2i(x, 0))
	value.add_source(atlas, 0)
	return value

# Nodeごとの領域と確認点を同じ形で示す。
func card(title: String, note: String, at: Vector2) -> void:
	var border := ColorRect.new()
	border.position = at
	border.size = Vector2(188, 280)
	border.color = Color("475569")
	add_child(border)

	var body := ColorRect.new()
	body.position = at + Vector2(2, 2)
	body.size = Vector2(184, 276)
	body.color = Color("172033")
	add_child(body)

	var title_label := Label.new()
	title_label.text = title
	title_label.position = at + Vector2(12, 10)
	var title_size := 12 if title.length() > 19 else 14
	title_label.add_theme_font_size_override("font_size", title_size)
	title_label.add_theme_color_override("font_color", Color("f8fafc"))
	add_child(title_label)

	var note_label := Label.new()
	note_label.text = note
	note_label.position = at + Vector2(12, 250)
	note_label.add_theme_font_size_override("font_size", 12)
	note_label.add_theme_color_override("font_color", Color("94a3b8"))
	add_child(note_label)

# 対象Nodeを離して置く。
func _ready() -> void:
	var back := ColorRect.new()
	back.color = Color("0f172a")
	back.size = Vector2(800, 600)
	add_child(back)

	var cards := [
		["MESH INSTANCE 2D", "1 TRIANGLE", Vector2(8, 8)],
		["MULTIMESH 2D", "3 INSTANCES", Vector2(204, 8)],
		["TOUCH SCREEN BUTTON", "110 x 80 IMAGE", Vector2(400, 8)],
		["NINE PATCH RECT", "8 PX MARGINS", Vector2(596, 8)],
		["TILEMAP LAYER", "RGB / BGR TILES", Vector2(8, 292)],
		["TILEMAP", "RGB / BGR TILES", Vector2(204, 292)],
		["TEXTURE BUTTON", "150 x 70 IMAGE", Vector2(400, 292)],
		["TEXTURE PROGRESS BAR", "64% IMAGE CROP", Vector2(596, 292)],
	]
	for item in cards:
		card(item[0], item[1], item[2])

	var mesh := MeshInstance2D.new()
	mesh.name = "MeshInstance2D"
	mesh.mesh = triangle(Color("38bdf8"))
	mesh.position = Vector2(102, 145)
	add_child(mesh)

	var multi := MultiMeshInstance2D.new()
	multi.name = "MultiMeshInstance2D"
	var group := MultiMesh.new()
	group.transform_format = MultiMesh.TRANSFORM_2D
	group.instance_count = 3
	group.mesh = triangle(Color("a78bfa"))
	group.set_instance_transform_2d(0, Transform2D(0, Vector2(-80, 0)))
	group.set_instance_transform_2d(1, Transform2D(0, Vector2(0, 0)))
	group.set_instance_transform_2d(2, Transform2D(0, Vector2(80, 0)))
	multi.multimesh = group
	multi.scale = Vector2(0.65, 0.65)
	multi.position = Vector2(298, 145)
	add_child(multi)

	var touch := TouchScreenButton.new()
	touch.name = "TouchScreenButton"
	touch.texture_normal = framed_texture(Vector2i(110, 80), Color("f472b6"), Color("7c3aed"))
	touch.position = Vector2(439, 105)
	add_child(touch)

	var tiles := tile_set()
	var layer := TileMapLayer.new()
	layer.name = "TileMapLayer"
	layer.tile_set = tiles
	for x in 3:
		for y in 2:
			layer.set_cell(Vector2i(x, y), 0, Vector2i(x if y == 0 else 2 - x, 0))
	layer.position = Vector2(54, 385)
	add_child(layer)

	var old := TileMap.new()
	old.name = "TileMap"
	old.tile_set = tiles
	for x in 3:
		for y in 2:
			old.set_cell(0, Vector2i(x, y), 0, Vector2i(x if y == 0 else 2 - x, 0))
	old.position = Vector2(250, 385)
	add_child(old)

	var patch := NinePatchRect.new()
	patch.name = "NinePatchRect"
	patch.texture = framed_texture(Vector2i(40, 40), Color("34d399"), Color("0f766e"))
	patch.position = Vector2(615, 110)
	patch.size = Vector2(150, 70)
	patch.set_patch_margin(SIDE_LEFT, 8)
	patch.set_patch_margin(SIDE_TOP, 8)
	patch.set_patch_margin(SIDE_RIGHT, 8)
	patch.set_patch_margin(SIDE_BOTTOM, 8)
	add_child(patch)

	var button := TextureButton.new()
	button.name = "TextureButton"
	button.texture_normal = framed_texture(Vector2i(150, 70), Color("fb7185"), Color("be123c"))
	button.position = Vector2(419, 390)
	add_child(button)

	var progress := TextureProgressBar.new()
	progress.name = "TextureProgressBar"
	progress.texture_under = framed_texture(Vector2i(150, 28), Color("334155"), Color("94a3b8"))
	progress.texture_progress = progress_texture()
	progress.position = Vector2(615, 410)
	progress.size = Vector2(150, 28)
	progress.value = 64
	add_child(progress)
