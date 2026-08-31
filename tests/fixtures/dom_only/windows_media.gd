# Window、SubViewport、Videoの最終描画を平坦DOMへ移す検査画面。
# 別描画先と埋め込みWindowの子も、Godotが決めた画面座標で揃うことを確かめる。

extends Control

# VideoStreamPlayerへ静止画像を返す検査用再生器。
class TestPlayback extends VideoStreamPlayback:
	var texture: Texture2D # 動画frameとして返す画像。
	var playing := false # Playerから渡された再生状態。
	var paused := false # Playerから渡された一時停止状態。
	var position := 0.0 # 経過時間。

	func _init(frame: Texture2D) -> void:
		texture = frame

	func _play() -> void:
		playing = true

	func _stop() -> void:
		playing = false
		position = 0

	func _is_playing() -> bool:
		return playing

	func _set_paused(value: bool) -> void:
		paused = value

	func _is_paused() -> bool:
		return paused

	func _get_length() -> float:
		return 60

	func _get_playback_position() -> float:
		return position

	func _seek(value: float) -> void:
		position = value

	func _set_audio_track(_track: int) -> void:
		pass

	func _get_texture() -> Texture2D:
		return texture

	func _update(delta: float) -> void:
		if playing and not paused:
			position += delta

# 検査用再生器をVideoStreamPlayerへ渡すResource。
class TestStream extends VideoStream:
	var texture: Texture2D # 全frameで使う画像。

	func _init(frame: Texture2D) -> void:
		texture = frame

	func _instantiate_playback() -> VideoStreamPlayback:
		return TestPlayback.new(texture)

# Window内の型名を同じ位置規則で置く。
func window_label(window: Window, text: String) -> void:
	var label := Label.new()
	label.text = text
	label.position = Vector2(12, 10)
	label.add_theme_font_size_override("font_size", 14)
	window.add_child(label)

# PopupのTheme枠を見分けやすい色と角へ揃える。
func popup_style(color: Color, border_color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border_color
	style.set_border_width_all(2)
	style.set_corner_radius_all(7)
	style.shadow_color = Color(0, 0, 0, 0.45)
	style.shadow_size = 4
	return style

# PopupMenuの画像項目を検査する小さな不透明画像を作る。
func menu_icon() -> Texture2D:
	var image := Image.create(14, 14, false, Image.FORMAT_RGBA8)
	image.fill(Color("f59e0b"))
	return ImageTexture.create_from_image(image)

# 表示先が異なるSubViewportをContainerへ拡大して置く。
func add_subviewport() -> void:
	var panel := SubViewportContainer.new()
	panel.name = "SubViewportContainer"
	panel.position = Vector2(18, 48)
	panel.size = Vector2(250, 150)
	panel.stretch = true
	add_child(panel)

	var viewport := SubViewport.new()
	viewport.name = "SubViewport"
	viewport.size = Vector2i(125, 75)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	panel.add_child(viewport)

	var back := ColorRect.new()
	back.color = Color("1d4ed8")
	back.position = Vector2(8, 7)
	back.size = Vector2(109, 61)
	viewport.add_child(back)

	var label := Label.new()
	label.text = "SUBVIEWPORT"
	label.position = Vector2(18, 25)
	label.add_theme_font_size_override("font_size", 13)
	viewport.add_child(label)

# VideoStreamPlayerへ再生Textureを与える。
func add_video() -> void:
	var image := Image.create(220, 124, false, Image.FORMAT_RGBA8)
	image.fill(Color("fb7185"))
	for y in range(18, 106):
		for x in range(26, 194):
			if (x / 14 + y / 14) % 2 == 0:
				image.set_pixel(x, y, Color("fef08a"))
	var player := VideoStreamPlayer.new()
	player.name = "VideoStreamPlayer"
	player.position = Vector2(292, 48)
	player.size = Vector2(220, 124)
	player.expand = true
	player.stream = TestStream.new(ImageTexture.create_from_image(image))
	player.autoplay = true
	add_child(player)

	var label := Label.new()
	label.text = "VideoStreamPlayer"
	label.position = Vector2(292, 176)
	add_child(label)

# 埋め込みWindow系を重ならない位置へ並べる。
func add_windows() -> void:
	var accept := AcceptDialog.new()
	accept.name = "AcceptDialog"
	accept.position = Vector2i(18, 230)
	accept.size = Vector2i(230, 125)
	accept.title = "Accept"
	window_label(accept, "AcceptDialog")
	add_child(accept)
	accept.show()

	var confirm := ConfirmationDialog.new()
	confirm.name = "ConfirmationDialog"
	confirm.position = Vector2i(270, 230)
	confirm.size = Vector2i(250, 125)
	confirm.title = "Confirm"
	window_label(confirm, "ConfirmationDialog")
	add_child(confirm)
	confirm.show()

	var files := FileDialog.new()
	files.name = "FileDialog"
	files.position = Vector2i(18, 370)
	files.size = Vector2i(500, 210)
	files.title = "Files"
	files.current_dir = "res://file_dialog_fixture"
	files.filters = PackedStringArray(["*.png ; Images"])
	window_label(files, "FileDialog")
	add_child(files)
	files.show()

	var menu := PopupMenu.new()
	menu.name = "PopupMenu"
	menu.position = Vector2i(540, 48)
	menu.size = Vector2i(220, 190)
	menu.add_theme_stylebox_override("panel", popup_style(Color("343b4a"), Color("60a5fa")))
	menu.add_item("PopupMenu")
	menu.add_item("Disabled Item")
	menu.set_item_disabled(1, true)
	menu.add_separator("OPTIONS")
	menu.add_check_item("Checked Item")
	menu.set_item_checked(3, true)
	menu.add_icon_item(menu_icon(), "Icon Item")
	var submenu := PopupMenu.new()
	submenu.name = "PopupSubmenu"
	submenu.add_item("Nested Item")
	menu.add_submenu_node_item("Submenu", submenu)
	menu.hide_on_item_selection = false
	menu.id_pressed.connect(func(id: int) -> void: get_node("MenuStatus").text = "MENU STATUS %d" % id)
	add_child(menu)
	menu.show()
	menu.set_flag(Window.FLAG_POPUP, false)

	var popup := PopupPanel.new()
	popup.name = "PopupPanel"
	popup.position = Vector2i(540, 280)
	popup.size = Vector2i(220, 150)
	popup.add_theme_stylebox_override("panel", popup_style(Color("293241cc"), Color("fb7185")))
	window_label(popup, "PopupPanel")
	add_child(popup)
	popup.show()
	popup.set_flag(Window.FLAG_POPUP, false)

	# 閉じたPopupの内蔵ControlがDOMへ漏れないことを同じ画面で確認する。
	var hidden_menu := PopupMenu.new()
	hidden_menu.name = "HiddenPopupMenu"
	hidden_menu.add_item("HIDDEN MENU ITEM")
	add_child(hidden_menu)
	var hidden_panel := PopupPanel.new()
	hidden_panel.name = "HiddenPopupPanel"
	window_label(hidden_panel, "HIDDEN PANEL ITEM")
	add_child(hidden_panel)

# 同じ画面で全描画先をまとめて検査する。
func _ready() -> void:
	var background := ColorRect.new()
	background.color = Color("0f172a")
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var title := Label.new()
	title.text = "WINDOW VIEWPORT VIDEO"
	title.position = Vector2(18, 12)
	title.add_theme_font_size_override("font_size", 20)
	add_child(title)
	var status := Label.new()
	status.name = "MenuStatus"
	status.text = "MENU STATUS idle"
	status.position = Vector2(540, 250)
	add_child(status)
	add_subviewport()
	add_video()
	add_windows()
