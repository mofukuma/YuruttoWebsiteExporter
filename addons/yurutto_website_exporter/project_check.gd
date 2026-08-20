# ゆるっとWebへ渡すprojectから非対応のGDExtensionを検出する。
# 3D版テンプレートは3Dを描けるので、境界はGDExtensionだけになる設計。

extends RefCounted

const I18n := preload("i18n.gd") # 画面文言の言語選び。

# 一つのprojectから境界違反を集める。
func inspect(root: String) -> Array[String]:
	var blocked: Array[String] = []
	for file in _files(root):
		var relative := file.trim_prefix(root.trim_suffix("/") + "/")
		if relative.begins_with("addons/yurutto_website_exporter/"):
			continue
		if file.get_extension().to_lower() == "gdextension":
			blocked.append("%s: %s" % [relative, I18n.t("block_gdextension")])
	return blocked

# 隠し生成物を除きproject fileを再帰列挙する。
func _files(root: String) -> Array[String]:
	var found: Array[String] = []
	var pending: Array[String] = [root.trim_suffix("/")]
	while not pending.is_empty():
		var current: String = pending.pop_back()
		var directory := DirAccess.open(current)
		if directory == null:
			continue
		directory.list_dir_begin()
		var name := directory.get_next()
		while not name.is_empty():
			var file := current.path_join(name)
			# 生成物と履歴は中身を見ないので、入り口で外す。
			if name == ".godot" or name == ".git":
				name = directory.get_next()
				continue
			if directory.current_is_dir():
				pending.append(file)
			else:
				found.append(file)
			name = directory.get_next()
		directory.list_dir_end()
	found.sort()
	return found
