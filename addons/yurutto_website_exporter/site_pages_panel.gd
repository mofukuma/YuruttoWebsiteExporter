# 公開ページJSONをGodot Editor内で編集する下部画面。
# 一覧と主要項目を扱い、画面へ出さない詳細設定を保持して保存する。

@tool
extends VBoxContainer

const SiteConfig := preload("site_config.gd") # JSONの読み書きとページ更新。
const DEFAULT_PATH := "res://yweb-site.json" # 設定fileの既定位置。
const FIELDS := SiteConfig.PAGE_FIELDS # JSON更新処理と共有するページ項目。

var config_path := DEFAULT_PATH # 現在編集中のJSON。
var config_paths: Array[String] = [DEFAULT_PATH] # Export presetに登録されたJSON候補。
var data: Dictionary = {} # 未保存の編集内容。
var selected := "" # 編集中のページ名。
var fields := {} # 項目名から入力Controlへの対応。
var loading := false # 画面への値反映中はsignal処理を止める。

var path_edit: LineEdit # JSON path入力。
var path_menu: OptionButton # 複数presetのJSON選択。
var pages: ItemList # ページ一覧。
var status: Label # 保存結果と入力不足の表示。
var non_page_check: CheckBox # 別Scene内で使う非公開Sceneかの選択。
var json_dialog: EditorFileDialog # JSON選択画面。
var scene_dialog: EditorFileDialog # Scene選択画面。

# 一覧と編集欄を作り、Export presetが指すJSONを開く。
func _ready() -> void:
	if get_child_count() == 0:
		_build()
	_fill_paths()
	load_path(config_path)

# pluginからExport presetに登録されたJSON pathを受け取る。
func setup(paths: Array) -> void:
	config_paths.clear()
	for path in paths:
		var value := String(path)
		if value.begins_with("res://") and not config_paths.has(value):
			config_paths.append(value)
	if config_paths.is_empty():
		config_paths.append(DEFAULT_PATH)
	config_path = config_paths[0]
	if is_node_ready():
		_fill_paths()
		load_path(config_path)

# 指定JSONを読み、ページ一覧へ反映する。
func load_path(path: String) -> bool:
	var candidate := path.strip_edges()
	var result := SiteConfig.read(candidate)
	if result.has("error"):
		path_edit.text = config_path
		_message(String(result.error), true)
		return false
	config_path = candidate
	path_edit.text = config_path
	_select_path(config_path)
	data = result.data
	data["scenes"] = data.get("scenes", {})
	selected = ""
	_refresh()
	_message("Loaded %d pages" % pages.item_count)
	return true

# 編集内容をJSONへ保存する。
func save_pages() -> bool:
	if not _commit():
		return false
	var error := SiteConfig.write(config_path, data)
	if error != OK:
		_message("Could not write JSON: %s" % error_string(error), true)
		return false
	_message("Saved %d pages" % pages.item_count)
	return true

# 指定名のページを画面で選ぶ。検査コードからも同じ経路を使う。
func select_page(key: String) -> bool:
	for index in pages.item_count:
		if pages.get_item_text(index) == key:
			pages.select(index)
			_show(index)
			return true
	return false

# 画面のControlを組み立てる。
func _build() -> void:
	name = "SitePagesPanel"
	custom_minimum_size = Vector2(860, 360)
	add_theme_constant_override("separation", 8)

	var path_row := HBoxContainer.new()
	path_row.name = "PathRow"
	add_child(path_row)
	path_row.add_child(_label("JSON"))
	path_menu = OptionButton.new()
	path_menu.name = "ConfigMenu"
	path_menu.item_selected.connect(_path_selected)
	path_row.add_child(path_menu)
	path_edit = LineEdit.new()
	path_edit.name = "PathEdit"
	path_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	path_row.add_child(path_edit)
	path_row.add_child(_button("Browse", _pick_json))
	path_row.add_child(_button("Load", _load_pressed))
	path_row.add_child(_button("Save", save_pages))

	var split := HSplitContainer.new()
	split.name = "PageSplit"
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(split)
	var left := VBoxContainer.new()
	left.name = "PageColumn"
	left.custom_minimum_size.x = 190
	split.add_child(left)
	pages = ItemList.new()
	pages.name = "PageList"
	pages.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pages.item_selected.connect(_page_selected)
	left.add_child(pages)
	var actions := HBoxContainer.new()
	actions.name = "PageActions"
	left.add_child(actions)
	actions.add_child(_button("Add", _add_page))
	actions.add_child(_button("Delete", _delete_page))

	var scroll := ScrollContainer.new()
	scroll.name = "PageEditorScroll"
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_child(scroll)
	var form := GridContainer.new()
	form.name = "PageForm"
	form.columns = 2
	form.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(form)
	_add_line(form, "Page name", "key")
	_add_page_check(form)
	_add_scene(form)
	_add_line(form, "URI", "uri")
	_add_line(form, "Title", "title")
	_add_text(form, "Description", "description")
	_add_text(form, "Summary", "summary")
	_add_line(form, "Robots", "robots")

	status = Label.new()
	status.name = "Status"
	add_child(status)
	_build_dialogs()

# 一行入力を追加し、項目名から参照できるようにする。
func _add_line(form: GridContainer, caption: String, field: String) -> LineEdit:
	form.add_child(_label(caption))
	var edit := LineEdit.new()
	edit.name = field.to_pascal_case() + "Edit"
	edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	form.add_child(edit)
	fields[field] = edit
	return edit

# 複数行入力を追加する。
func _add_text(form: GridContainer, caption: String, field: String) -> void:
	form.add_child(_label(caption))
	var edit := TextEdit.new()
	edit.name = field.to_pascal_case() + "Edit"
	edit.custom_minimum_size = Vector2(420, 68)
	edit.scroll_fit_content_height = true
	form.add_child(edit)
	fields[field] = edit

# Scene入力へproject内fileの選択Buttonを添える。
func _add_scene(form: GridContainer) -> void:
	form.add_child(_label("Scene"))
	var row := HBoxContainer.new()
	row.name = "SceneRow"
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	form.add_child(row)
	var edit := LineEdit.new()
	edit.name = "SceneEdit"
	edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(edit)
	row.add_child(_button("Browse", _pick_scene))
	fields["scene"] = edit

# Sceneを独立ページとして公開するか選ぶ欄を追加する。
func _add_page_check(form: GridContainer) -> void:
	form.add_child(_label("Page"))
	non_page_check = CheckBox.new()
	non_page_check.name = "NonPageCheck"
	non_page_check.text = "Not a page (used inside another scene)"
	non_page_check.toggled.connect(_non_page_toggled)
	form.add_child(non_page_check)

# JSONとSceneのfile選択画面を一度作って再利用する。
func _build_dialogs() -> void:
	# データ検査ではEditor専用classを作らず、画面検査を0.2秒以内に保つ。
	if not Engine.is_editor_hint():
		return
	json_dialog = EditorFileDialog.new()
	json_dialog.name = "JsonDialog"
	json_dialog.access = EditorFileDialog.ACCESS_RESOURCES
	json_dialog.file_mode = EditorFileDialog.FILE_MODE_OPEN_FILE
	json_dialog.filters = PackedStringArray(["*.json ; JSON"])
	json_dialog.file_selected.connect(_switch_path)
	add_child(json_dialog)
	scene_dialog = EditorFileDialog.new()
	scene_dialog.name = "SceneDialog"
	scene_dialog.access = EditorFileDialog.ACCESS_RESOURCES
	scene_dialog.file_mode = EditorFileDialog.FILE_MODE_OPEN_FILE
	scene_dialog.filters = PackedStringArray(["*.tscn, *.scn ; Scene"])
	scene_dialog.file_selected.connect(_scene_picked)
	add_child(scene_dialog)

# Export presetが複数ある場合にJSON候補を選べるようにする。
func _fill_paths() -> void:
	path_menu.clear()
	for path in config_paths:
		path_menu.add_item(path)
	path_menu.visible = path_menu.item_count > 1
	_select_path(config_path)

# 現在pathに対応する候補を選択表示する。
func _select_path(path: String) -> void:
	for index in path_menu.item_count:
		if path_menu.get_item_text(index) == path:
			path_menu.select(index)
			return
	path_menu.select(-1)

# 候補から選んだJSONへ編集対象を切り替える。
func _path_selected(index: int) -> void:
	if not _switch_path(path_menu.get_item_text(index)):
		_select_path(config_path)

# 現在の編集を保存できた場合に限り、別のJSONへ切り替える。
func _switch_path(path: String) -> bool:
	if not data.is_empty() and not save_pages():
		return false
	return load_path(path)

# 一覧をデータ順に作り直し、先頭または現在ページを選ぶ。
func _refresh(preferred := "") -> void:
	loading = true
	pages.clear()
	var scenes: Dictionary = data.get("scenes", {})
	for key in scenes:
		pages.add_item(String(key))
	var target := String(preferred) if not String(preferred).is_empty() else selected
	if not target.is_empty() and select_page(target):
		pass
	elif pages.item_count > 0:
		pages.select(0)
		_show(0)
	else:
		selected = ""
		_clear_form()
	loading = false

# 別ページへ移る前に現在値を保持する。
func _page_selected(index: int) -> void:
	if loading:
		return
	var next := pages.get_item_text(index)
	if next == selected:
		return
	if not _commit():
		select_page(selected)
		return
	select_page(next)

# 選択ページの値を入力欄へ出す。
func _show(index: int) -> void:
	selected = pages.get_item_text(index)
	var page: Dictionary = data.get("scenes", {}).get(selected, {})
	loading = true
	_set_field("key", selected)
	non_page_check.button_pressed = not bool(page.get("page", true))
	for field in FIELDS:
		_set_field(field, String(page.get(field, "")))
	loading = false

# 入力欄を選択ページへ反映し、名前変更時は一覧順を保つ。
func _commit() -> bool:
	if selected.is_empty():
		return true
	var key := _field("key").strip_edges()
	var values := {}
	for field in FIELDS:
		values[field] = _field(field)
	values["page"] = not non_page_check.button_pressed
	var error := SiteConfig.update_page(data, selected, key, values)
	if not error.is_empty():
		_message(error, true)
		return false
	selected = key
	_refresh(key)
	return true

# 新しいページをmain sceneと未使用URIで追加する。
func _add_page() -> void:
	if not _commit():
		return
	var scenes: Dictionary = data.get("scenes", {})
	var index := scenes.size() + 1
	var key := "Page%d" % index
	while scenes.has(key):
		index += 1
		key = "Page%d" % index
	var uri := "/page-%d/" % index
	while _uri_used(scenes, uri):
		index += 1
		uri = "/page-%d/" % index
	scenes[key] = {
		"scene": String(ProjectSettings.get_setting("application/run/main_scene", "")),
		"uri": uri,
		"robots": "index,follow",
	}
	data["scenes"] = scenes
	_refresh(key)

# 選択ページを未保存データから外す。
func _delete_page() -> void:
	if selected.is_empty():
		return
	SiteConfig.remove_page(data, selected)
	selected = ""
	_refresh()

# URIが既存ページと重なるか調べる。
func _uri_used(scenes: Dictionary, uri: String) -> bool:
	var normalized := SiteConfig.normalize_uri(uri)
	for page in scenes.values():
		if page is Dictionary and SiteConfig.normalize_uri(String(page.get("uri", ""))) == normalized:
			return true
	return false

# 非公開Sceneではroute用入力を止め、保持済みの文言は再公開時に戻す。
func _non_page_toggled(enabled: bool) -> void:
	for field in ["uri", "title", "description", "summary", "robots"]:
		var edit: Control = fields.get(field)
		if edit is LineEdit:
			(edit as LineEdit).editable = not enabled
		elif edit is TextEdit:
			(edit as TextEdit).editable = not enabled

# 入力Controlから文字列を読む。
func _field(field: String) -> String:
	var edit: Control = fields[field]
	return edit.text

# 入力Controlへ文字列を入れる。
func _set_field(field: String, value: String) -> void:
	var edit: Control = fields[field]
	edit.text = value

# 選択がない場合の入力欄を空にする。
func _clear_form() -> void:
	for field in fields:
		_set_field(field, "")

# JSON選択画面を現在位置から開く。
func _pick_json() -> void:
	json_dialog.current_path = config_path
	json_dialog.popup_file_dialog()

# Scene選択画面を現在値から開く。
func _pick_scene() -> void:
	scene_dialog.current_path = _field("scene")
	scene_dialog.popup_file_dialog()

# 選んだScene pathを入力欄へ反映する。
func _scene_picked(path: String) -> void:
	_set_field("scene", path)

# path入力欄のJSONを開く。
func _load_pressed() -> void:
	_switch_path(path_edit.text)

# 短いLabelを作る。
func _label(text: String) -> Label:
	var label := Label.new()
	label.text = text
	return label

# signal接続済みButtonを作る。
func _button(text: String, call: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.pressed.connect(call)
	return button

# 結果を画面下へ表示する。
func _message(text: String, error := false) -> void:
	status.text = text
	status.modulate = Color(1.0, 0.45, 0.4) if error else Color(0.65, 0.85, 1.0)
