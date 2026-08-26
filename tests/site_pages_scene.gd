# ページ設定画面からJSONを更新し、画面外の詳細項目が残ることを確かめる入口。
# 読込、名前変更、追加、削除、保存を一つのEditor用Controlで順に操作する。

extends SceneTree

const PagesPanel := preload("res://addons/yurutto_website_exporter/site_pages_panel.gd") # 検査対象の画面。
const SiteConfig := preload("res://addons/yurutto_website_exporter/site_config.gd") # 再起動時の自動補完検査。
const PATH := "res://web/pages.json" # Export presetが指す検査用JSON。

var panel: Control # 実際にsignalを送る編集画面。

# ControlがTreeへ入った次frameから画面操作を始める。
func _init() -> void:
	panel = PagesPanel.new()
	panel.setup([PATH, "res://web/other.json"])
	root.add_child(panel)
	_run.call_deferred()

# 主要なButtonと入力欄を使い、保存結果を標準出力へ返す。
func _run() -> void:
	await process_frame
	var before: Dictionary = panel.data
	var result := {
		"preferred": panel.config_path,
		"path_options": panel.path_menu.item_count,
		"initial": before.scenes.keys(),
		"controls": ["PageList", "KeyEdit", "NonPageCheck", "SceneEdit", "UriEdit", "TitleEdit", "DescriptionEdit", "SummaryEdit", "RobotsEdit"].all(
			func(name: String) -> bool: return panel.find_child(name, true, false) != null
		),
	}

	# JSON候補を替える前に、入力変更と一覧操作を現在fileへ保存する。
	panel.select_page("About")
	_edit("TitleEdit", "Autosaved About")
	panel.path_menu.item_selected.emit(1)
	var switched: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	_button("Add").pressed.emit()
	panel.path_menu.item_selected.emit(0)
	var added: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://web/other.json"))
	panel.path_menu.item_selected.emit(1)
	panel.select_page("Page1")
	_button("Delete").pressed.emit()
	panel.path_menu.item_selected.emit(0)
	var removed: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://web/other.json"))
	result["path_switch"] = [switched.scenes.About.title, added.scenes.has("Page1"), removed.scenes.is_empty()]

	# AboutをCompanyへ改名し、主要文言を画面から更新する。
	panel.select_page("About")
	_edit("UriEdit", "/")
	_button("Save").pressed.emit()
	result["duplicate"] = panel.status.text
	_edit("KeyEdit", "Company")
	_edit("UriEdit", "/company")
	_edit("TitleEdit", "Company title")
	_edit("DescriptionEdit", "Company description")
	_edit("SummaryEdit", "Company summary")
	_edit("RobotsEdit", "noindex,follow")
	_button("Save").pressed.emit()
	_edit("SceneEdit", "res://company.tscn")
	_button("Save").pressed.emit()
	SiteConfig.ensure(PATH)
	panel.select_page("Home")
	panel.non_page_check.button_pressed = true
	result["page_fields_disabled"] = ["uri", "title", "description", "summary", "robots"].all(
		func(field: String) -> bool: return not panel.fields[field].editable
	)
	_button("Save").pressed.emit()
	SiteConfig.ensure(PATH)

	# AddとDeleteも同じ画面のButtonを通し、未保存一覧へ反映する。
	_button("Add").pressed.emit()
	var added_key: String = panel.selected
	_edit("SceneEdit", "res://temporary.tscn")
	_edit("UriEdit", "/temporary/")
	_button("Save").pressed.emit()
	panel.select_page(added_key)
	_button("Delete").pressed.emit()
	_button("Save").pressed.emit()
	SiteConfig.ensure(PATH)

	# 読込に失敗したpathを保存先にせず、project fileを保護する。
	panel.path_edit.text = "res://main.gd"
	_button("Load").pressed.emit()
	result["bad_path"] = panel.status.text
	result["active_path"] = panel.config_path
	panel.path_edit.text = "res://../site-pages-outside.json"
	_button("Load").pressed.emit()
	result["traversal"] = panel.status.text
	_button("Save").pressed.emit()

	var saved: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	result["saved"] = saved.scenes.keys()
	result["company"] = saved.scenes.Company
	result["home"] = saved.scenes.Home
	result["site"] = saved.site
	result["advanced"] = saved.scenes.Company.json_ld
	result["ignored"] = saved.ignored_scenes
	result["main_safe"] = FileAccess.get_file_as_string("res://main.gd")
	result["status"] = panel.status.text
	result["bad_entry"] = SiteConfig.read("res://web/bad.json").get("error", "")
	print(JSON.stringify(result))
	quit()

# 一行・複数行入力へ同じ方法で文字列を入れる。
func _edit(name: String, value: String) -> void:
	var edit: Control = panel.find_child(name, true, false)
	edit.text = value

# 表示文字から操作Buttonを探す。
func _button(text: String) -> Button:
	for node in panel.find_children("*", "Button", true, false):
		if node.text == text:
			return node
	return null
