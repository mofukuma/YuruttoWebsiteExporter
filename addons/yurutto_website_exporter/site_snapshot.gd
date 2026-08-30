# Sceneを短く動かした時点の文字と画像を、検索と初期表示に使えるHTML要素へ分類する。
# 明示した意味を優先し、未指定の文字と画像は名前、見た目、ツリー順から補う設計。

extends RefCounted

const HEADING_RATIO := 1.3 # 本文より見出しらしい文字サイズの比率。
const HEADING_LENGTH := 120 # 見出し候補へ含める最大文字数。
const TEXT_LIMIT := 4000 # 一要素が初期HTMLを過度に膨らませない上限。
const ALT_LIMIT := 240 # 画像説明を読み上げやすく保つ文字数。
const IMAGE_EXTENSIONS := ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"] # 元画像を保ったまま公開できる形式。
const DECORATION_WORDS := ["background", "bg", "decoration", "decorative", "overlay", "mask", "shadow", "icon", "pattern", "divider", "noise"] # 画像検索へ出さない装飾名。

# Scene treeを表示順に読み、文字、リンク、画像を公開用要素へ変換する。
func collect(root: Node) -> Dictionary:
	var items: Array[Dictionary] = []
	_visit(root, items)
	_assign(items)
	for item in items:
		for key in ["font", "parent", "node"]:
			item.erase(key)
	return {"items": items}

# 子の順序を変えずに、公開できる文字と画像を集める。
func _visit(node: Node, items: Array[Dictionary]) -> void:
	if node.has_meta("yweb_snapshot") and not bool(node.get_meta("yweb_snapshot")):
		return
	if node is CanvasItem and not node.is_visible_in_tree():
		return
	if node is Node3D and not node.is_visible_in_tree():
		return
	# 元画像を持つ可視Nodeは画像検索向けの情報へ変換する。
	var texture := _node_texture(node)
	if texture:
		var image := _image_item(node, texture)
		if not image.is_empty():
			items.append(image)
	var publish_text := not node.has_meta("yweb_seo_text") or bool(node.get_meta("yweb_seo_text"))
	if publish_text and (node is Label or node is RichTextLabel):
		var text := _text(node)
		if not text.is_empty():
			items.append({
				"tag": _named_tag(node.name), "text": text, "node": String(root_path(node)),
				"font": _font_size(node), "parent": String(root_path(node.get_parent())),
			})
	elif publish_text and node is LinkButton:
		var text := _clean(String(node.text))
		if not text.is_empty():
			items.append({
				"tag": "a", "text": text, "node": String(root_path(node)),
				"href": _uri(node),
			})
	for child in node.get_children(true):
		_visit(child, items)

# Label種ごとの表示文字を同じ形式へ揃える。
func _text(node: Node) -> String:
	var value: String = node.get_parsed_text() if node is RichTextLabel else String(node.text)
	return _clean(value)

# 検索本文へ使える空白と長さへ整える。
func _clean(value: String) -> String:
	var lines := value.replace("\r", "").split("\n")
	var present: Array[String] = []
	for line in lines:
		var text := String(line).strip_edges()
		if not text.is_empty():
			present.append(text)
	return "\n".join(present).substr(0, TEXT_LIMIT)

# Themeが確定した実効font sizeを、見出し候補の比較値として読む。
func _font_size(node: Control) -> int:
	return maxi(node.get_theme_font_size("font_size"), 1)

# LinkButtonの公開URIを読み、未設定なら操作を起こさないhrefにする。
func _uri(node: LinkButton) -> String:
	for property in node.get_property_list():
		if String(property.name) == "uri":
			var value := String(node.get("uri"))
			return value if not value.is_empty() else "#"
	return "#"

# HTMLから参照できる元画像を持つ画像Nodeを棚卸しする。
func _node_texture(node: Node) -> Texture2D:
	var texture: Texture2D = null
	if node is TextureRect or node is NinePatchRect or node is Sprite2D or node is Sprite3D:
		if (node is Sprite2D or node is Sprite3D) and (node.region_enabled or node.hframes > 1 or node.vframes > 1):
			return null
		texture = node.texture
	elif node is AnimatedSprite2D or node is AnimatedSprite3D:
		var frames: SpriteFrames = node.sprite_frames
		if frames and frames.has_animation(node.animation):
			texture = frames.get_frame_texture(node.animation, node.frame)
	# Atlasは元画像全体と表示領域が一致しないため誤った画像を公開しない。
	if texture is AtlasTexture:
		return null
	return texture

# 装飾を除き、検索結果に説明できる画像を初期HTMLへ渡す。
func _image_item(node: Node, texture: Texture2D) -> Dictionary:
	if node.has_meta("yweb_seo_image") and not bool(node.get_meta("yweb_seo_image")):
		return {}
	if node is CanvasItem and _canvas_alpha(node) <= 0.01:
		return {}
	if node is SpriteBase3D and node.modulate.a * (1.0 - node.transparency) <= 0.01:
		return {}
	var explicit := node.has_meta("yweb_alt")
	var alt := _alt(String(node.get_meta("yweb_alt", ""))) if explicit else ""
	if explicit and alt.is_empty():
		return {}
	if not explicit and _is_decoration(node):
		return {}
	var source := texture.resource_path
	if not source.begins_with("res://") or source.get_extension().to_lower() not in IMAGE_EXTENSIONS:
		return {}
	if alt.is_empty():
		alt = _caption(node)
	if alt.is_empty():
		alt = _name_text(source.get_file().get_basename())
	if alt.is_empty():
		alt = _ancestor_text(node)
	if alt.is_empty():
		return {}
	alt = _alt(alt)
	return {
		"tag": "img", "source": source, "alt": alt,
		"width": maxi(texture.get_width(), 1), "height": maxi(texture.get_height(), 1),
		"node": String(root_path(node)),
	}

# Node名と親名から背景やアイコンを検索対象から外す。
func _is_decoration(node: Node) -> bool:
	var current := node
	while current and current != node.get_tree().current_scene:
		for word in _words(String(current.name)):
			if word in DECORATION_WORDS:
				return true
		current = current.get_parent()
	return false

# 同じまとまりのCaption系Labelを画像説明として優先する。
func _caption(node: Node) -> String:
	var parent := node.get_parent()
	if not parent:
		return ""
	var candidates: Array[Dictionary] = []
	var own := _caption_key(String(node.name))
	var node_index := node.get_index()
	for sibling in parent.get_children():
		if sibling == node or not (sibling is Label or sibling is RichTextLabel):
			continue
		var words := _words(String(sibling.name))
		var named := "caption" in words or "alt" in words
		named = named or ("title" in words and ("image" in words or "photo" in words))
		if named:
			var value := _alt(_text(sibling))
			if not value.is_empty():
				var shared := 0
				for word in _caption_key(String(sibling.name)):
					shared += 1 if word in own else 0
				var distance := absi(sibling.get_index() - node_index) * 2
				var order := 1 if sibling.get_index() < node_index else 0
				candidates.append({"text": value, "shared": shared, "near": distance + order})
	if candidates.is_empty():
		return ""
	candidates.sort_custom(func(a: Dictionary, b: Dictionary):
		return a.shared > b.shared if a.shared != b.shared else a.near < b.near)
	return candidates[0].text

# 画像名とCaption名の役割語を除き、番号や固有名の対応を比較する。
func _caption_key(value: String) -> Array[String]:
	var key: Array[String] = []
	for word in _words(value):
		if word not in ["image", "photo", "picture", "media", "texture", "sprite", "caption", "alt", "title"]:
			key.append(word)
	return key

# 親のmodulateを含むCanvasItemの実効alphaを得る。
func _canvas_alpha(node: CanvasItem) -> float:
	var alpha := node.modulate.a * node.self_modulate.a
	var current := node
	while not current.is_set_as_top_level():
		var parent := current.get_parent()
		if not parent is CanvasItem:
			break
		current = parent
		alpha *= current.modulate.a
	return alpha

# ファイル名を人が読める短い代替文へ整える。
func _name_text(value: String) -> String:
	var useful: Array[String] = []
	for word in _words(value):
		var generic := word in ["image", "img", "texture", "sprite", "asset", "dsc", "dcim", "pic", "picture", "untitled", "screenshot", "screen", "capture", "copy", "export"]
		if not generic and not word.is_valid_int() and not _is_hash(word):
			useful.append(word)
	return " ".join(useful)

# Camera名やhashを人向けの説明へ採用しない。
func _is_hash(value: String) -> bool:
	if value.length() < 8:
		return false
	for character in value:
		if String(character).to_lower() not in "0123456789abcdef":
			return false
	return true

# alt属性へ入る改行と長さを読み上げ向けに整える。
func _alt(value: String) -> String:
	return _clean(value).replace("\n", " ").substr(0, ALT_LIMIT)

# ファイル名が汎用名なら最も近い意味のある親名を使う。
func _ancestor_text(node: Node) -> String:
	var current := node.get_parent()
	while current and current != node.get_tree().current_scene:
		var value := _name_text(String(current.name))
		if not value.is_empty() and value.to_lower() not in ["control", "container", "content", "margin", "panel"]:
			return value
		current = current.get_parent()
	return ""

# CamelCaseと区切り文字を単語へ分け、h1からh6とpの明示指定を読む。
func _named_tag(value: String) -> String:
	var words := _words(value)
	for heading in range(1, 7):
		for token in ["h%d" % heading, "heading%d" % heading, "title%d" % heading]:
			if token in words:
				return "h%d" % heading
	for token in ["p", "paragraph", "body", "lead", "description", "copy"]:
		if token in words:
			return "p"
	return ""

# Node名を意味判定へ使える小文字の単語へ分割する。
func _words(value: String) -> Array[String]:
	var words: Array[String] = []
	var word := ""
	for index in value.length():
		var character := value.substr(index, 1)
		var code := character.unicode_at(0)
		var upper := code >= 65 and code <= 90
		var previous := value.unicode_at(index - 1) if index > 0 else 0
		var following := value.unicode_at(index + 1) if index + 1 < value.length() else 0
		var previous_word := (previous >= 97 and previous <= 122) or (previous >= 48 and previous <= 57)
		var acronym_end := previous >= 65 and previous <= 90 and following >= 97 and following <= 122
		if upper and (previous_word or acronym_end) and not word.is_empty():
			words.append(word.to_lower())
			word = ""
		if character == "_" or character == "-" or character == " " or character == ".":
			if not word.is_empty():
				words.append(word.to_lower())
				word = ""
		else:
			word += character
	if not word.is_empty():
		words.append(word.to_lower())
	return words

# 明示levelなしでも、一般的な見出し名を節またはcardの見出しとして読む。
func _title_tag(item: Dictionary) -> String:
	var words := _words(String(item.node).get_file())
	var named := "title" in words or "heading" in words or "headline" in words or "subtitle" in words
	if not named:
		return ""
	var parent := String(item.parent).to_lower()
	var nested := parent.contains("card/") or parent.ends_with("card") or parent.contains("item/") or parent.ends_with("item") or parent.contains("tile/") or parent.ends_with("tile")
	return "h3" if nested else "h2"

# 明示指定がないLabelへ、文字サイズとツリー順を使って一つのH1と節H2を補う。
func _assign(items: Array[Dictionary]) -> void:
	var labels: Array[Dictionary] = []
	var h1 := -1
	var has_h2 := false
	for index in items.size():
		var item: Dictionary = items[index]
		if item.tag in ["a", "img"]:
			continue
		labels.append(item)
		if item.tag == "h1":
			if h1 < 0:
				h1 = index
			else:
				item.tag = "h2"
		if item.tag == "h2":
			has_h2 = true
	if labels.is_empty():
		return
	var sizes: Array[int] = []
	for item in labels:
		sizes.append(int(item.font))
	sizes.sort()
	var median := float(sizes[sizes.size() / 2])
	if h1 < 0:
		h1 = _heading(items, 0, median)
		if h1 >= 0:
			items[h1].tag = "h1"
	# Title系の一般名は節をH2、card内をH3として補う。
	for index in range(h1 + 1, items.size()):
		var item: Dictionary = items[index]
		if item.tag.is_empty():
			var tag := _title_tag(item)
			if not tag.is_empty():
				item.tag = tag
				has_h2 = has_h2 or tag == "h2"
	if not has_h2:
		var parents := {}
		for index in range(h1 + 1, items.size()):
			var item: Dictionary = items[index]
			if item.tag != "" or item.text.length() > HEADING_LENGTH:
				continue
			if String(item.text).is_valid_int() or String(item.text).is_valid_float():
				continue
			if float(item.font) < median * HEADING_RATIO:
				continue
			var parent: String = item.parent
			if not parents.has(parent):
				item.tag = "h2"
				parents[parent] = true
				has_h2 = true
	if not has_h2:
		for index in range(h1 + 1, items.size()):
			if items[index].tag == "":
				items[index].tag = "h2"
				break
	for item in items:
		if item.tag.is_empty():
			item.tag = "p"

# 最初に現れる十分大きな短文を選び、無ければ最初のLabelへ戻す。
func _heading(items: Array[Dictionary], start: int, median: float) -> int:
	var first := -1
	for index in range(start, items.size()):
		var item: Dictionary = items[index]
		if item.tag == "img":
			continue
		if not item.tag.is_empty():
			continue
		if first < 0:
			first = index
		if item.text.length() <= HEADING_LENGTH and float(item.font) >= median * HEADING_RATIO:
			return index
	return first

# Scene内で安定するroot相対pathを公開HTMLの対応確認へ使う。
func root_path(node: Node) -> NodePath:
	var tree := node.get_tree()
	var root := tree.current_scene if tree else null
	return root.get_path_to(node) if root else node.get_path()
