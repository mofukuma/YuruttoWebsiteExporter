# WordPress型のHomeとAboutを一つの部品設計から構築するGodotサイト。
# DOM文字と入力の意味を保ち、写真、面、配置、scrollはGodotの確定値を正本にする。

extends Control

const INK := Color("151b2d") # 見出しとfooterの濃紺。
const BLUE := Color("3f64ff") # 主CTAとlinkの青。
const SKY := Color("eaf0ff") # 淡い情報面の青。
const ORANGE := Color("ff7a45") # 小さな強調と数値の橙。
const PAPER := Color("fbfaf7") # 暖かいpage背景。
const WHITE := Color("ffffff") # cardと反転文字。
const MUTED := Color("667085") # 本文の灰色。
const LINE := Color("dde2ea") # card境界線。
const MOBILE_WIDTH := 760.0 # 1列へ切り替える画面幅。

@export_enum("Home", "About") var page := "Home" # sceneごとの公開page種別。

var scroll: ScrollContainer # Browser scrollへ対応するpage全体。
var page_box: VBoxContainer # 全sectionを順番に並べる本文。
var margins: Array[MarginContainer] = [] # 画面幅に応じて余白を変えるsection。
var grids: Array[Dictionary] = [] # desktop列数を持つGridContainer。
var media: Array[Dictionary] = [] # desktopとmobileで高さを変える写真面。
var responsive_fonts: Array[Dictionary] = [] # 狭い画面で読みやすく収める見出し。
var nav_cta: Button # 狭い画面で省略するheader CTA。
var carousel_image: TextureRect # 現在の事例写真。
var carousel_kind: Label # 現在の事例分類。
var carousel_title: Label # 現在の事例名。
var carousel_body: Label # 現在の事例説明。
var carousel_count: Label # carouselの現在位置。
var carousel_index := 0 # 表示中slide番号。
var carousel_timer: Timer # 事例を自動で送る時計。
var contact_status: Label # CTA操作結果を伝える文字。
var slides: Array[Dictionary] = [] # 事例写真と説明の正本。

# Theme、縦scroll、公開pageを一括構築する。
func _ready() -> void:
	theme = _theme()
	_build_root()
	_build_header()
	if page == "About":
		_build_about()
	else:
		_build_home()
	_build_footer()
	get_viewport().size_changed.connect(_adapt)
	call_deferred("_adapt")

# Browser幅へ列数、余白、写真高を合わせる。
func _adapt() -> void:
	if not is_node_ready():
		return
	var mobile := get_viewport_rect().size.x < MOBILE_WIDTH
	for margin in margins:
		var side := 24 if mobile else 84
		margin.add_theme_constant_override("margin_left", side)
		margin.add_theme_constant_override("margin_right", side)
	for entry in grids:
		var grid: GridContainer = entry.node
		grid.columns = 1 if mobile else int(entry.columns)
	for entry in media:
		var node: Control = entry.node
		node.custom_minimum_size = Vector2(0, float(entry.mobile if mobile else entry.desktop))
	for entry in responsive_fonts:
		var label: Label = entry.node
		label.add_theme_font_size_override("font_size", int(entry.mobile if mobile else entry.desktop))
	nav_cta.visible = not mobile

# ScrollContainerと幅追従する本文を作る。
func _build_root() -> void:
	scroll = ScrollContainer.new()
	scroll.name = "PageScroll"
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll.follow_focus = false
	add_child(scroll)
	page_box = VBoxContainer.new()
	page_box.name = "PageContent"
	page_box.custom_minimum_size = Vector2(360, 0)
	page_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	page_box.add_theme_constant_override("separation", 0)
	scroll.add_child(page_box)

# Brand、主要route、相談CTAをheaderへ置く。
func _build_header() -> void:
	var box := _section("Header", WHITE, 22, 22)
	var row := HBoxContainer.new()
	row.name = "HeaderRow"
	row.add_theme_constant_override("separation", 8)
	box.add_child(row)
	var brand := _label("Brand", "LUMA / STUDIO", 22, INK, false)
	brand.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(brand)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	var home := _link("NavHome", "ホーム", "/", WHITE, INK, 72)
	home.pressed.connect(_go_home)
	row.add_child(home)
	var about := _link("NavAbout", "私たち", "/about/", WHITE, INK, 72)
	about.pressed.connect(_go_about)
	row.add_child(about)
	nav_cta = _button("NavContact", "相談する", INK, WHITE, 126)
	nav_cta.pressed.connect(_contact)
	row.add_child(nav_cta)

# Homeの主要sectionを上から順番に組み立てる。
func _build_home() -> void:
	_build_hero()
	_build_services()
	_build_carousel()
	_build_about_preview()
	_build_numbers()
	_build_testimonials()
	_build_cta()

# 大見出し、CTA、写真、実績cardをHeroへ置く。
func _build_hero() -> void:
	var box := _section("Hero", PAPER, 78, 88)
	var grid := _grid("HeroGrid", 2, 34)
	box.add_child(grid)
	var copy := VBoxContainer.new()
	copy.name = "HeroCopy"
	copy.add_theme_constant_override("separation", 22)
	grid.add_child(copy)
	copy.add_child(_tag("HeroTag", "BRAND / DIGITAL / EXPERIENCE"))
	var title := _label("HeroTitle", "らしさを、\n体験に。", 68, INK, true)
	responsive_fonts.append({"node": title, "desktop": 68, "mobile": 52})
	copy.add_child(title)
	copy.add_child(_label("HeroLead", "戦略とデザイン、技術をつなぎ、\n愛される体験をつくります。", 21, MUTED, true))
	var actions := _grid("HeroActions", 2, 12)
	copy.add_child(actions)
	var start := _button("HeroContact", "プロジェクトを相談", BLUE, WHITE, 190)
	start.pressed.connect(_contact)
	actions.add_child(start)
	var more := _link("HeroAbout", "私たちについて", "/about/", WHITE, INK, 174, LINE)
	more.pressed.connect(_go_about)
	actions.add_child(more)
	copy.add_child(_label("HeroTrust", "戦略・デザイン・開発をひとつのチームで", 15, MUTED, false))
	var visual := _photo("HeroVisual", "res://images/facade.jpg", "色鮮やかな幾何学模様の建築ファサード", 520, 360)
	grid.add_child(visual)
	var stat := _floating_card("HeroStat", "ONE TEAM", "構想から運用まで")
	stat.anchor_top = 1.0
	stat.anchor_bottom = 1.0
	stat.offset_left = 24
	stat.offset_top = -124
	stat.offset_right = 244
	stat.offset_bottom = -24
	visual.add_child(stat)

# 3つの専門領域を簡潔なcardへまとめる。
func _build_services() -> void:
	var box := _section("Services", WHITE, 88, 94)
	box.add_child(_tag("ServicesTag", "WHAT WE DO"))
	box.add_child(_label("ServicesTitle", "考える、つくる、育てる。", 46, INK, true))
	box.add_child(_label("ServicesLead", "一度きりの制作ではなく、事業の変化に並走するチームです。", 19, MUTED, true))
	var grid := _grid("ServicesGrid", 3, 18)
	box.add_child(grid)
	grid.add_child(_service("StrategyCard", "01", "ブランド戦略", "顧客の声と事業の強みを整理し、選ばれる理由を言葉と構造にします。"))
	grid.add_child(_service("DesignCard", "02", "体験デザイン", "Web、サービス、店舗まで、迷いなく伝わる一貫した体験を設計します。"))
	grid.add_child(_service("GrowthCard", "03", "グロース支援", "公開後のデータと対話をもとに、小さな改善を積み重ねて成果へつなげます。"))

# 写真、説明、左右操作を持つ事例carouselを作る。
func _build_carousel() -> void:
	slides = [
		{"image": "res://images/team.jpg", "kind": "SERVICE DESIGN", "title": "対話から始まる、\n新しい働き方。", "body": "組織の声を集め、採用サイトと社内体験を同時に再設計。\n応募後の理解度が大きく向上しました。"},
		{"image": "res://images/geometry.jpg", "kind": "BRAND IDENTITY", "title": "街にひらく、\n建築ブランド。", "body": "色と構造を核にブランドを再定義。\nWeb、サイン、提案資料を一つのデザイン言語でつなぎました。"},
		{"image": "res://images/facade.jpg", "kind": "DIGITAL PRODUCT", "title": "複雑さをほどく、\n顧客ポータル。", "body": "業務の流れを観察し、情報を三段階へ整理。\n問い合わせを減らしながら利用率を伸ばしました。"},
	]
	var box := _section("Works", INK, 92, 98)
	box.add_child(_tag("WorksTag", "SELECTED WORKS", ORANGE))
	box.add_child(_label("WorksTitle", "変化が見える仕事。", 46, WHITE, true))
	var grid := _grid("WorksGrid", 2, 36)
	box.add_child(grid)
	var photo := _photo("CarouselVisual", slides[0].image, slides[0].title, 500, 330)
	carousel_image = photo.get_node("Image")
	grid.add_child(photo)
	var copy := VBoxContainer.new()
	copy.name = "CarouselCopy"
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.add_theme_constant_override("separation", 18)
	grid.add_child(copy)
	carousel_kind = _label("CarouselKind", "", 15, ORANGE, false)
	carousel_title = _label("CarouselTitle", "", 40, WHITE, true)
	carousel_body = _label("CarouselBody", "", 18, Color("c8cfdd"), true)
	carousel_count = _label("CarouselCount", "", 15, Color("9aa5ba"), false)
	copy.add_child(carousel_kind)
	copy.add_child(carousel_title)
	copy.add_child(carousel_body)
	var controls := HBoxContainer.new()
	controls.name = "CarouselControls"
	controls.add_theme_constant_override("separation", 10)
	copy.add_child(controls)
	var previous := _button("CarouselPrevious", "前へ", Color("252d43"), WHITE, 104, Color("414b63"))
	previous.pressed.connect(_previous_slide)
	controls.add_child(previous)
	var next := _button("CarouselNext", "次へ", BLUE, WHITE, 104)
	next.pressed.connect(_next_slide)
	controls.add_child(next)
	copy.add_child(carousel_count)
	_show_slide(0)
	carousel_timer = Timer.new()
	carousel_timer.name = "CarouselTimer"
	carousel_timer.wait_time = 4.0
	carousel_timer.one_shot = true
	carousel_timer.timeout.connect(_next_slide)
	add_child(carousel_timer)
	carousel_timer.start()

# Aboutへの導線を写真と文章の2列で示す。
func _build_about_preview() -> void:
	var box := _section("AboutPreview", PAPER, 96, 102)
	var grid := _grid("AboutPreviewGrid", 2, 42)
	box.add_child(grid)
	grid.add_child(_photo("AboutPreviewPhoto", "res://images/team.jpg", "明るいスタジオで対話するデザインチーム", 520, 350))
	var copy := VBoxContainer.new()
	copy.name = "AboutPreviewCopy"
	copy.add_theme_constant_override("separation", 20)
	grid.add_child(copy)
	copy.add_child(_tag("AboutPreviewTag", "ABOUT LUMA"))
	copy.add_child(_label("AboutPreviewTitle", "答えを急がず、\n本質を見つける。", 44, INK, true))
	copy.add_child(_label("AboutPreviewBody", "私たちは、観察と対話からプロジェクトを始めます。見栄えを整える前に、誰にどんな変化を届けたいかを一緒に考えます。", 19, MUTED, true))
	var button := _link("AboutPreviewButton", "スタジオを知る", "/about/", INK, WHITE, 158)
	button.pressed.connect(_go_about)
	copy.add_child(button)

# 支援実績を4つの数値cardで見せる。
func _build_numbers() -> void:
	var box := _section("Numbers", SKY, 72, 78)
	var grid := _grid("NumbersGrid", 4, 14)
	box.add_child(grid)
	grid.add_child(_number("ProjectsNumber", "3", "戦略・設計・開発"))
	grid.add_child(_number("YearsNumber", "11", "年のデザイン経験"))
	grid.add_child(_number("PartnersNumber", "ONE", "一つの伴走チーム"))
	grid.add_child(_number("AwardsNumber", "16", "デザイン受賞"))

# 顧客の声を3枚のcardへ並べる。
func _build_testimonials() -> void:
	var box := _section("Testimonials", WHITE, 90, 96)
	box.add_child(_tag("TestimonialsTag", "VOICES"))
	box.add_child(_label("TestimonialsTitle", "一緒につくった人の声。", 44, INK, true))
	var grid := _grid("TestimonialsGrid", 3, 18)
	box.add_child(grid)
	grid.add_child(_quote("VoiceOne", "『曖昧だった強みが、チーム全員の言葉になりました。』", "Sora Foods / Brand Manager"))
	grid.add_child(_quote("VoiceTwo", "『公開して終わらず、毎月の改善まで同じ目線で進められます。』", "Nami Works / Product Lead"))
	grid.add_child(_quote("VoiceThree", "『事業の話を深く聞いてくれるので、判断が速くなりました。』", "Arc Living / Founder"))

# 相談Buttonと操作結果を最後の強い面へ置く。
func _build_cta() -> void:
	var box := _section("Contact", BLUE, 88, 92)
	box.add_child(_tag("ContactTag", "START A CONVERSATION", Color("bfcaff")))
	box.add_child(_label("ContactTitle", "次の景色を、\n一緒につくろう。", 50, WHITE, true))
	box.add_child(_label("ContactBody", "まだ言葉になっていない相談でも大丈夫です。まずは30分、今の課題を聞かせてください。", 19, Color("dfe4ff"), true))
	var button := _button("ContactButton", "相談をはじめる", WHITE, BLUE, 178)
	button.pressed.connect(_mark_contact)
	box.add_child(button)
	contact_status = _label("ContactStatus", "平日2営業日以内にお返事します。", 15, Color("dfe4ff"), false)
	box.add_child(contact_status)

# About pageへ思想、価値観、歩み、CTAを構成する。
func _build_about() -> void:
	var hero := _section("AboutHero", PAPER, 82, 92)
	hero.add_child(_tag("AboutHeroTag", "ABOUT / LUMA STUDIO"))
	var title := _label("AboutHeroTitle", "よく見る。\nよく聞く。\n一緒に考える。", 64, INK, true)
	responsive_fonts.append({"node": title, "desktop": 64, "mobile": 50})
	hero.add_child(title)
	hero.add_child(_label("AboutHeroLead", "私たちは、企業や地域の中にすでにある価値を見つけ、\n未来へ届く体験として編集するデザインスタジオです。", 21, MUTED, true))
	hero.add_child(_photo("AboutHeroPhoto", "res://images/team.jpg", "制作方針を話し合うLUMINAのチーム", 620, 360))
	var values := _section("Values", WHITE, 88, 94)
	values.add_child(_tag("ValuesTag", "OUR VALUES"))
	values.add_child(_label("ValuesTitle", "仕事で大切にしていること。", 44, INK, true))
	var value_grid := _grid("ValuesGrid", 3, 18)
	values.add_child(value_grid)
	value_grid.add_child(_service("ObserveValue", "01", "観察する", "会議室の外へ出て、使う人、働く人、街の空気から本当の課題を見つけます。"))
	value_grid.add_child(_service("ShareValue", "02", "共有する", "判断の理由と途中経過をひらき、専門の違う人も同じ地図を見られるようにします。"))
	value_grid.add_child(_service("GrowValue", "03", "育てる", "完成を終点にせず、変化を見ながら小さく試し、長く育つ仕組みを残します。"))
	var story := _section("Story", SKY, 92, 98)
	var story_grid := _grid("StoryGrid", 2, 40)
	story.add_child(story_grid)
	var copy := VBoxContainer.new()
	copy.name = "StoryCopy"
	copy.add_theme_constant_override("separation", 18)
	story_grid.add_child(copy)
	copy.add_child(_tag("StoryTag", "OUR STORY"))
	copy.add_child(_label("StoryTitle", "小さな編集室から、\n共創するスタジオへ。", 42, INK, true))
	copy.add_child(_label("StoryBody", "2015年、編集者とデザイナーの二人でLuma Studioは始まりました。現在は戦略、デザイン、開発のメンバーが集まり、事業の節目に並走しています。", 19, MUTED, true))
	story_grid.add_child(_photo("StoryPhoto", "res://images/geometry.jpg", "青空の下に立つ幾何学的な現代建築", 500, 330))
	var milestones := _section("Milestones", INK, 74, 82)
	var milestone_grid := _grid("MilestonesGrid", 4, 14)
	milestones.add_child(milestone_grid)
	milestone_grid.add_child(_dark_number("StartMilestone", "2015", "小さな編集室として創業"))
	milestone_grid.add_child(_dark_number("TeamMilestone", "12", "専門の異なるメンバー"))
	milestone_grid.add_child(_dark_number("CityMilestone", "7", "一緒に仕事をした地域"))
	milestone_grid.add_child(_dark_number("NowMilestone", "NOW", "次の10年を共創中"))
	_build_cta()

# Footerへbrand、site route、連絡先をまとめる。
func _build_footer() -> void:
	var box := _section("Footer", INK, 64, 70)
	var grid := _grid("FooterGrid", 3, 28)
	box.add_child(grid)
	var brand := VBoxContainer.new()
	brand.name = "FooterBrand"
	brand.add_theme_constant_override("separation", 12)
	grid.add_child(brand)
	brand.add_child(_label("FooterLogo", "LUMA / STUDIO", 24, WHITE, false))
	brand.add_child(_label("FooterNote", "らしさを見つけ、\n長く愛される体験へ。", 16, Color("aeb8ca"), true))
	var links := VBoxContainer.new()
	links.name = "FooterLinks"
	links.add_theme_constant_override("separation", 8)
	grid.add_child(links)
	links.add_child(_label("FooterMenu", "MENU", 13, ORANGE, false))
	var home := _link("FooterHome", "ホーム", "/", INK, WHITE, 120)
	home.pressed.connect(_go_home)
	links.add_child(home)
	var about := _link("FooterAbout", "私たち", "/about/", INK, WHITE, 120)
	about.pressed.connect(_go_about)
	links.add_child(about)
	var address := VBoxContainer.new()
	address.name = "FooterAddress"
	address.add_theme_constant_override("separation", 10)
	grid.add_child(address)
	address.add_child(_label("FooterContact", "CONTACT", 13, ORANGE, false))
	address.add_child(_label("FooterMail", "hello@luma-studio.example\nTokyo / Yokohama", 16, Color("d5dae5"), true))
	box.add_child(_label("Copyright", "© 2026 Luma Studio — Built with Godot + Yurutto Website Exporter", 13, Color("7f899d"), true))

# 背景面、余白、縦方向の間隔を持つsectionを共通生成する。
func _section(node_name: String, color: Color, top: int, bottom: int) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.name = node_name
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", _box(color, 0))
	page_box.add_child(panel)
	var margin := MarginContainer.new()
	margin.name = "%sMargin" % node_name
	margin.add_theme_constant_override("margin_top", top)
	margin.add_theme_constant_override("margin_bottom", bottom)
	panel.add_child(margin)
	margins.append(margin)
	var box := VBoxContainer.new()
	box.name = "%sContent" % node_name
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_constant_override("separation", 22)
	margin.add_child(box)
	return box

# 画面幅で列数を変えるGridContainerを登録する。
func _grid(node_name: String, columns: int, gap: int) -> GridContainer:
	var grid := GridContainer.new()
	grid.name = node_name
	grid.columns = columns
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", gap)
	grid.add_theme_constant_override("v_separation", gap)
	grids.append({"node": grid, "columns": columns})
	return grid

# 写真を切り抜く固定高の媒体面を作る。
func _photo(node_name: String, path: String, alt: String, desktop: float, mobile: float) -> Control:
	var frame := Control.new()
	frame.name = node_name
	frame.clip_contents = true
	frame.custom_minimum_size = Vector2(0, desktop)
	frame.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var background := Panel.new()
	background.name = "Background"
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.add_theme_stylebox_override("panel", _box(SKY, 24))
	frame.add_child(background)
	var image := TextureRect.new()
	image.name = "Image"
	image.texture = load(path)
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	image.set_meta("yweb_alt", alt)
	image.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame.add_child(image)
	media.append({"node": frame, "desktop": desktop, "mobile": mobile})
	return frame

# サービス番号、題名、説明を共通cardへまとめる。
func _service(node_name: String, number: String, title: String, body: String) -> PanelContainer:
	var card := _card(node_name, WHITE, 22)
	var box: VBoxContainer = card.get_node("Margin/Content")
	box.add_child(_label("Number", number, 16, BLUE, false))
	box.add_child(_label("Title", title, 25, INK, true))
	box.add_child(_label("Body", body, 17, MUTED, true))
	return card

# 白い数値cardを作る。
func _number(node_name: String, value: String, caption: String) -> PanelContainer:
	var card := _card(node_name, WHITE, 18)
	var box: VBoxContainer = card.get_node("Margin/Content")
	box.add_child(_label("Value", value, 38, BLUE, false))
	box.add_child(_label("Caption", caption, 15, MUTED, true))
	return card

# 濃色section用の数値cardを作る。
func _dark_number(node_name: String, value: String, caption: String) -> PanelContainer:
	var card := _card(node_name, Color("20283d"), 18, Color("364059"))
	var box: VBoxContainer = card.get_node("Margin/Content")
	box.add_child(_label("Value", value, 34, ORANGE, false))
	box.add_child(_label("Caption", caption, 15, Color("c8cfdd"), true))
	return card

# 顧客の声と所属をcardへまとめる。
func _quote(node_name: String, quote: String, person: String) -> PanelContainer:
	var card := _card(node_name, PAPER, 22)
	var box: VBoxContainer = card.get_node("Margin/Content")
	box.add_child(_label("Quote", quote, 19, INK, true))
	box.add_child(_label("Person", person, 14, MUTED, true))
	return card

# 余白付きcardを共通生成する。
func _card(node_name: String, color: Color, radius: int, border := LINE) -> PanelContainer:
	var card := PanelContainer.new()
	card.name = node_name
	card.custom_minimum_size = Vector2(250, 190)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.add_theme_stylebox_override("panel", _box(color, radius, border))
	var margin := MarginContainer.new()
	margin.name = "Margin"
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_%s" % side, 26)
	card.add_child(margin)
	var box := VBoxContainer.new()
	box.name = "Content"
	box.add_theme_constant_override("separation", 14)
	margin.add_child(box)
	return card

# Hero写真へ重ねる実績cardを作る。
func _floating_card(node_name: String, value: String, caption: String) -> PanelContainer:
	var card := PanelContainer.new()
	card.name = node_name
	card.add_theme_stylebox_override("panel", _box(WHITE, 18))
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_%s" % side, 16)
	card.add_child(margin)
	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	margin.add_child(box)
	var value_label := _label("Value", value, 24, BLUE, false)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(value_label)
	var caption_label := _label("Caption", caption, 13, MUTED, false)
	caption_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(caption_label)
	return card

# 小見出しを追跡DOM Labelとして作る。
func _tag(node_name: String, text: String, color := BLUE) -> Label:
	return _label(node_name, text, 14, color, false)

# 意味文字を共通のwrap設定で生成する。
func _label(node_name: String, text: String, size: int, color: Color, wrap: bool) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.set_meta("yweb_dom_text", true)
	return label

# 色、境界、hoverをButton系へ共通設定する。
func _style_action(button: BaseButton, color: Color, font: Color, width: float, border: Color) -> void:
	button.custom_minimum_size = Vector2(width, 48)
	button.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_font_size_override("font_size", 15)
	button.add_theme_color_override("font_color", font)
	button.add_theme_color_override("font_hover_color", font)
	button.add_theme_stylebox_override("normal", _box(color, 14, border))
	button.add_theme_stylebox_override("hover", _box(color.lightened(0.08), 14, border))
	button.add_theme_stylebox_override("pressed", _box(color.darkened(0.08), 14, border))
	button.set_meta("yweb_dom_text", true)

# 押下操作をGodotへ渡す意味Buttonを作る。
func _button(node_name: String, text: String, color: Color, font: Color, width: float, border := Color.TRANSPARENT) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text
	_style_action(button, color, font, width, border)
	return button

# 実URLを持ち、通常clickをGodotへ渡す意味LinkButtonを作る。
func _link(node_name: String, text: String, uri: String, color: Color, font: Color, width: float, border := Color.TRANSPARENT) -> LinkButton:
	var link := LinkButton.new()
	link.name = node_name
	link.text = text
	link.uri = uri
	link.underline = LinkButton.UNDERLINE_MODE_NEVER
	_style_action(link, color, font, width, border)
	return link

# Flatな面styleを一箇所で作る。
func _box(color: Color, radius: int, border := Color.TRANSPARENT) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.border_color = border
	box.set_border_width_all(1 if border.a > 0.0 else 0)
	box.set_corner_radius_all(radius)
	return box

# 全Controlが共有する基本文字と間隔を返す。
func _theme() -> Theme:
	var value := Theme.new()
	value.default_font_size = 17
	value.set_constant("separation", "VBoxContainer", 14)
	value.set_constant("separation", "HBoxContainer", 12)
	return value

# 指定slideの写真と文字を同時に更新する。
func _show_slide(index: int) -> void:
	carousel_index = posmod(index, slides.size())
	var slide := slides[carousel_index]
	carousel_image.texture = load(String(slide.image))
	carousel_kind.text = slide.kind
	carousel_title.text = slide.title
	carousel_body.text = slide.body
	carousel_count.text = "%02d / %02d" % [carousel_index + 1, slides.size()]
	carousel_image.modulate.a = 0.25
	var tween := create_tween()
	tween.tween_property(carousel_image, "modulate:a", 1.0, 0.35)
	if carousel_timer:
		carousel_timer.start()

# 一つ前の事例へ戻す。
func _previous_slide() -> void:
	_show_slide(carousel_index - 1)

# 一つ次の事例へ進む。
func _next_slide() -> void:
	_show_slide(carousel_index + 1)

# Home sceneへ切り替える。
func _go_home() -> void:
	if scene_file_path != "res://main.tscn":
		get_tree().change_scene_to_file("res://main.tscn")

# About sceneへ切り替える。
func _go_about() -> void:
	if scene_file_path != "res://about.tscn":
		get_tree().change_scene_to_file("res://about.tscn")

# 相談の受付状態を文字へ反映し、scroll位置はBrowserへ任せる。
func _contact() -> void:
	_mark_contact()
	nav_cta.text = "相談受付済み"

# 相談Buttonの操作結果を文字へ返す。
func _mark_contact() -> void:
	if contact_status:
		contact_status.text = "ありがとうございます。相談内容を受け付けました。"
