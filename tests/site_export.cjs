// 物理page、共有hash成果物、SEO、Web font、静的配信を一括検査する。
// server固有のURL書換えなしで直リンクと無再読込遷移を成立させる設計。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { ensure, stem } = require('../build/fetch_webfont.cjs');
const { cache, createServer } = require('../build/serve_web.cjs');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const root = path.join(repo, 'tmp/site-export'); // 全中間成果物。
const project = path.join(root, 'project'); // exporter fixture project。
const host = path.join(root, 'host'); // 静的hostの公開root。
const site = path.join(host, 'sub'); // sub pathへ置く成果物。
const port = 49182; // Browser検査port。
const { browserPath } = require('./browser.cjs'); // 固定Chromium。
const { godot } = require('./godot.cjs'); // 対応版Godot。
const font = ensure(); // 取得済みWeb font。

// file内容のSHA-256を返す。
function sha(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// directoryの公開fileを相対pathと内容hashで比較できる形にする。
function treeState(directory) {
	const state = {};
	const walk = (current) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const file = path.join(current, entry.name);
			if (entry.isDirectory()) walk(file);
			else state[path.relative(directory, file)] = sha(file);
		}
	};
	walk(directory);
	return state;
}

// HTTP状態、header、bodyを生のまま読む。
function request(pathname, headers = {}) {
	return new Promise((resolve, reject) => {
		const req = http.get({ host: '127.0.0.1', port, path: pathname, headers }, (res) => {
			const chunks = [];
			res.on('data', (chunk) => chunks.push(chunk));
			res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
		});
		req.on('error', reject);
	});
}

// 検査用projectを一度書き出す。
function fixture() {
	fs.rmSync(root, { recursive: true, force: true });
	fs.mkdirSync(path.join(project, 'fonts'), { recursive: true });
	fs.mkdirSync(path.join(project, 'web'), { recursive: true });
	fs.mkdirSync(site, { recursive: true });
	for (const name of ['yweb-000000000000.js', 'yweb-000000000000.js.br', 'site-000000000000.pck']) fs.writeFileSync(path.join(site, name), 'old');
	fs.mkdirSync(path.join(site, 'removed'));
	fs.writeFileSync(path.join(site, 'removed/index.html'), 'old page');
	fs.writeFileSync(path.join(site, 'yweb-site.json'), JSON.stringify({ scenes: { Removed: { uri: '/removed/' } } }));
	fs.cpSync(path.join(repo, 'addons/yurutto_website_exporter'), path.join(project, 'addons/yurutto_website_exporter'), { recursive: true });
	fs.writeFileSync(path.join(project, 'project.godot'), '[application]\nconfig/name="Site Test"\nrun/main_scene="res://main.tscn"\n[display]\nwindow/size/viewport_width=1200\nwindow/size/viewport_height=630\n[editor_plugins]\nenabled=PackedStringArray("res://addons/yurutto_website_exporter/plugin.cfg")\n');
	fs.writeFileSync(path.join(project, 'scene.gd'), `# 静的HTMLへ採取する文字と画像を持つ検査Scene。
# routeごとのprocess分離と見出し推定を同じ構造で確かめる。

extends Control

static var launches := 0

# 3フレーム目の動的Nodeも初期HTMLへ入ることを再現する。
func _ready():
	launches += 1
	await get_tree().process_frame
	if name == "Main":
		label("Brand", "Aurora", 18)
		label("HeroTitle", "Aurora Platform", 52)
		label("Lead", "Ideas become useful products.", 20)
		label("SectionTitle", "Features", 34)
		label("BodyCopy", "A practical platform for creative teams.", 16)
		label("WebP", "Web branch" if OS.has_feature("web") else "Desktop branch", 16)
		label("EnvP", OS.get_environment("YWEB_SNAPSHOT_VALUE"), 16)
		photo("HeroPhoto", "res://web/ogp.png", "Auroraの製品を囲む制作チーム")
		caption_photo("res://web/team-photo.png")
		var card := VBoxContainer.new()
		card.name = "DirectCard"
		add_child(card)
		var title := Label.new()
		title.name = "Title"
		title.text = "Direct card"
		title.add_theme_font_size_override("font_size", 24)
		card.add_child(title)
	else:
		label("H1About", "About Aurora", 38)
		label("H2Story", "Our story", 28)
		label("PIntro", "We design calm digital experiences.", 16)
		label("StateP", "Fresh state" if launches == 1 else "Leaked state", 16)
		photo("TeamPhoto", "res://web/team-photo.png", "")
		photo("Background", "res://web/team-photo.png", "")
		photo("InvisiblePhoto", "res://web/team-photo.png", "", 0.0)
		photo("ExcludedPhoto", "res://web/ogp.png", "公開しない画像", 1.0, false)
		var link := LinkButton.new()
		link.name = "HomeLink"
		link.text = "Home"
		if link.get_property_list().any(func(item): return item.name == "uri"):
			link.set("uri", "/")
		add_child(link)

# 名前、本文、文字サイズの異なるLabelを同じ方法で用意する。
func label(node_name, value, size):
	var node := Label.new()
	node.name = node_name
	node.text = value
	node.add_theme_font_size_override("font_size", size)
	add_child(node)

# 検索対象と装飾のTextureRectを同じ経路で用意する。
func photo(node_name, path, alt, alpha = 1.0, seo = true):
	var node := TextureRect.new()
	node.name = node_name
	node.texture = load(path)
	node.custom_minimum_size = Vector2(320, 180)
	node.self_modulate.a = alpha
	if not alt.is_empty():
		node.set_meta("yweb_alt", alt)
	if not seo:
		node.set_meta("yweb_seo_image", false)
	add_child(node)

# Caption系Labelを画像説明へ使うまとまりを用意する。
func caption_photo(path):
	var group := Control.new()
	group.name = "FeatureMedia"
	add_child(group)
	var caption := Label.new()
	caption.name = "ImageCaption"
	caption.text = "対話しながら設計するAuroraチーム"
	group.add_child(caption)
	var image := TextureRect.new()
	image.name = "Media"
	image.texture = load(path)
	image.custom_minimum_size = Vector2(320, 180)
	group.add_child(image)
`);
	fs.writeFileSync(path.join(project, 'snapshot_unit.gd'), `# 画像Node種、範囲除外、Caption対応、透明度をnative Godotで検査する。
# SEO画像の抽出規則をScene起動なしで短く確認する入口。

extends SceneTree

const Snapshot = preload("res://addons/yurutto_website_exporter/site_snapshot.gd") # 画像抽出規則の検査対象。

# 失敗理由を終了codeへ反映する。
func need(value, message):
	if value:
		return
	push_error(message)
	quit(1)

# 六種の画像Nodeと誤公開を起動一回で検査する。
func _init():
	var texture: Texture2D = load("res://web/ogp.png")
	var snapshot = Snapshot.new()
	var nodes = [TextureRect.new(), NinePatchRect.new(), Sprite2D.new(), Sprite3D.new()]
	for node in nodes:
		node.texture = texture
	var frames := SpriteFrames.new()
	frames.add_frame("default", texture)
	var animated_2d := AnimatedSprite2D.new()
	animated_2d.sprite_frames = frames
	var animated_3d := AnimatedSprite3D.new()
	animated_3d.sprite_frames = frames
	nodes.append_array([animated_2d, animated_3d])
	for node in nodes:
		need(snapshot._node_texture(node) == texture, "%sの画像を取得できない" % node.get_class())
	var sheet := Sprite2D.new()
	sheet.texture = texture
	sheet.hframes = 2
	need(snapshot._node_texture(sheet) == null, "spritesheet全体を公開した")
	var group := Control.new()
	var image_1 := TextureRect.new()
	image_1.name = "Image1"
	group.add_child(image_1)
	var caption_1 := Label.new()
	caption_1.name = "Caption1"
	caption_1.text = "一枚目"
	group.add_child(caption_1)
	var image_2 := TextureRect.new()
	image_2.name = "Image2"
	group.add_child(image_2)
	var caption_2 := Label.new()
	caption_2.name = "Caption2"
	caption_2.text = "二枚目"
	group.add_child(caption_2)
	need(snapshot._caption(image_1) == "一枚目", "一枚目のCaptionが違う")
	need(snapshot._caption(image_2) == "二枚目", "二枚目のCaptionが違う")
	group.modulate.a = 0.0
	image_1.texture = texture
	image_1.set_meta("yweb_alt", "非表示")
	need(snapshot._image_item(image_1, texture).is_empty(), "親透明度を見落とした")
	image_1.top_level = true
	need(not snapshot._image_item(image_1, texture).is_empty(), "top levelへ親透明度を適用した")
	var hidden_3d := Sprite3D.new()
	hidden_3d.texture = texture
	hidden_3d.modulate.a = 0.0
	hidden_3d.set_meta("yweb_alt", "非表示3D")
	need(snapshot._image_item(hidden_3d, texture).is_empty(), "3D透明度を見落とした")
	quit()
`);
	fs.writeFileSync(path.join(project, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource path="res://scene.gd" type="Script" id="1"]\n[node name="Main" type="Control"]\nscript = ExtResource("1")\n');
	fs.writeFileSync(path.join(project, 'about.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource path="res://scene.gd" type="Script" id="1"]\n[node name="About" type="Control"]\nscript = ExtResource("1")\n');
	fs.writeFileSync(path.join(project, 'company.tscn'), '[gd_scene format=3]\n[node name="Company" type="Node"]\n');
	fs.writeFileSync(path.join(project, 'component.gd'), `# 非ページSceneが初期HTML採取で起動されないことを検査する部品。
# 起動時markerにより、公開処理と通常Scene利用の境界を確かめる。

extends Node

# 非ページSceneが初期HTML採取で起動された場合にmarkerを残す。
func _ready():
	var marker = OS.get_environment("YWEB_NON_PAGE_MARKER")
	if not marker.is_empty():
		FileAccess.open(marker, FileAccess.WRITE).store_string("started")
`);
	fs.writeFileSync(path.join(project, 'component.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource path="res://component.gd" type="Script" id="1"]\n[node name="Component" type="Node"]\nscript = ExtResource("1")\n');
	fs.writeFileSync(path.join(project, 'export_presets.cfg'), `[preset.0]\nname="Web"\nplatform="Yurutto Website"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\n[preset.0.options]\nhtml/focus_canvas_on_start=true\nyweb/site/enabled=true\nyweb/site/config="res://yweb-site.json"\nyweb/site/base_url="http://127.0.0.1:${port}/sub/"\nyweb/site/title="Site Test"\nyweb/site/description="既定概要"\nyweb/site/locale="ja_JP"\nyweb/site/favicon=""\nyweb/font/matching_webfont=true\nyweb/font/avoid_canvas_theme_font=true\nyweb/ogp/image="res://web/ogp.png"\nyweb/ogp/alt="自動生成OGP"\nvram_texture_compression/for_desktop=true\n`);
	fs.writeFileSync(path.join(project, 'yweb-site.json'), JSON.stringify({ version: 1, scenes: {
		Main: { scene: 'res://main.tscn', uri: '/', title: 'メイン', description: 'メイン概要', scripts: [{ src: 'res://web/main.js', defer: true }], meta: [{ name: 'theme-color', content: '#111111' }] },
		About: { scene: 'res://about.tscn', uri: '/about/', title: '概要ページ', description: '概要の説明', summary: '物理HTMLの概要', scripts: [{ src: 'res://web/about.js', defer: true }], meta: [{ name: 'theme-color', content: '#222222' }], json_ld: { '@context': 'https://schema.org', '@type': 'AboutPage' } },
		Company: { scene: 'res://company.tscn', uri: '/会社 案内/', title: '会社案内', description: '日本語URLの説明' },
		Component: { scene: 'res://component.tscn', uri: '/component/', title: '内部Component', page: false },
	} }));
	const mainScript = Buffer.from('window.mainLoads=(window.mainLoads||0)+1;');
	fs.writeFileSync(path.join(project, 'web/main.js'), mainScript);
	fs.writeFileSync(path.join(project, 'web/main.js.br'), zlib.brotliCompressSync(mainScript, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }));
	fs.writeFileSync(path.join(project, 'web/about.js'), 'window.aboutLoads=(window.aboutLoads||0)+1;');
	fs.copyFileSync(path.join(repo, 'examples/omochi_game/web/ogp.png'), path.join(project, 'web/ogp.png'));
	fs.copyFileSync(path.join(repo, 'examples/omochi_game/web/ogp.png'), path.join(project, 'web/team-photo.png'));
	fs.copyFileSync(font.ttf, path.join(project, `fonts/${stem}.ttf`));
	fs.copyFileSync(font.woff2, path.join(project, `fonts/${stem}.woff2`));
	const empty = path.join(root, 'empty-path');
	const nonPageMarker = path.join(root, 'non-page-snapshot.txt');
	fs.mkdirSync(empty, { recursive: true });
	const env = { ...process.env, PATH: empty, YWEB_NON_PAGE_MARKER: nonPageMarker, YWEB_SNAPSHOT_VALUE: 'FIRST SNAPSHOT' };
	child.execFileSync(godot, ['--headless', '--path', project, '--import'], { stdio: 'pipe', env });
	child.execFileSync(godot, ['--headless', '--path', project, '--script', 'res://snapshot_unit.gd'], { stdio: 'pipe', env });
	fs.rmSync(path.join(project, 'snapshot_unit.gd'));
	child.execFileSync(godot, ['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], { stdio: 'pipe', env });
	assert.match(fs.readFileSync(path.join(site, 'index.html'), 'utf8'), /FIRST SNAPSHOT/, '初回の環境値を採取していない');
	// 同じ内容の再exportでhash画像を書き直さないことを確かめる。
	const imageDir = path.join(site, 'yweb-images');
	const before = Object.fromEntries(fs.readdirSync(imageDir).map((name) => {
		const stat = fs.statSync(path.join(imageDir, name));
		return [name, { ino: stat.ino, mtimeMs: stat.mtimeMs }];
	}));
	const stale = fs.readdirSync(site).find((name) => /^yweb-[0-9a-f]{12}\.wasm\.br$/.test(name));
	assert.ok(stale, '更新検査用のBrotliがない');
	fs.writeFileSync(path.join(site, stale), 'old quality');
	env.YWEB_SNAPSHOT_VALUE = 'SECOND SNAPSHOT';
	child.execFileSync(godot, ['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], { stdio: 'pipe', env });
	const after = Object.fromEntries(fs.readdirSync(imageDir).map((name) => {
		const stat = fs.statSync(path.join(imageDir, name));
		return [name, { ino: stat.ino, mtimeMs: stat.mtimeMs }];
	}));
	assert.deepEqual(after, before, '不変画像を書き直した');
	const refreshed = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
	assert.match(refreshed, /SECOND SNAPSHOT/, '同じPCKでSceneを再採取していない');
	assert.doesNotMatch(refreshed, /FIRST SNAPSHOT/, '前回の外部状態を再利用した');
	const compressed = path.join(site, stale);
	assert.deepEqual(zlib.brotliDecompressSync(fs.readFileSync(compressed)), fs.readFileSync(compressed.slice(0, -3)), '品質変更後のBrotliを更新していない');
	assert.equal(fs.existsSync(nonPageMarker), false, 'ページではないSceneを初期HTML採取で起動した');
}

// 共有成果物の名前が内容から決まり、全pageが同じ名前を読むことを確かめる。
function outputs() {
	const names = fs.readdirSync(site);
	const engine = names.find((name) => /^yweb-[0-9a-f]{12}\.js$/.test(name));
	const pack = names.find((name) => /^site-[0-9a-f]{12}\.pck$/.test(name));
	assert.ok(engine && pack, `hash成果物なし: ${names.join(', ')}`);
	const base = engine.slice(0, -3);
	const files = ['.js', '.wasm', '.audio.worklet.js', '.audio.position.worklet.js'].map((suffix) => path.join(site, base + suffix));
	const digest = crypto.createHash('sha256');
	for (const file of files) digest.update(sha(file));
	assert.equal(base, `yweb-${digest.digest('hex').slice(0, 12)}`, 'engine名が内容hashでない');
	assert.equal(pack, `site-${sha(path.join(site, pack)).slice(0, 12)}.pck`, 'PCK名が内容hashでない');
	for (const file of files) assert.ok(fs.existsSync(`${file}.br`), `Brotliなし: ${file}`);
	for (const file of ['index.js', 'index.wasm', 'index.pck']) assert.equal(fs.existsSync(path.join(site, file)), false, `固定名が残留: ${file}`);
	return { base, pack };
}

// 静的hostと一つのBrowserで直リンク、履歴、cacheを検査する。
async function main() {
	fixture();
	const files = outputs();
	child.execFileSync(godot, ['--headless', '--path', site, '--main-pack', path.join(site, files.pack), '--script', path.join(repo, 'tests/non_page_pack_scene.gd')], { stdio: 'pipe' });
	assert.equal(cache(`C:\\site\\${files.base}.js`), 'public, max-age=31536000, immutable', 'Windows cache判定不一致');
	assert.equal(cache('C:\\site\\yweb-images\\photo-0123456789ab.jpg'), 'public, max-age=31536000, immutable', 'Windows画像cache判定不一致');
	const index = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
	const about = fs.readFileSync(path.join(site, 'about/index.html'), 'utf8');
	for (const html of [index, about]) {
		assert.ok(html.includes(`${files.base}.js`), '共有engine参照なし');
		assert.ok(html.includes(`"mainPack":"${files.pack}"`), '共有PCK参照なし');
		assert.match(html, new RegExp(`<link rel="preload" href="${files.base}\\.wasm" as="fetch" type="application/wasm" crossorigin="anonymous">`), 'WASM preloadなし');
		assert.match(html, new RegExp(`<link rel="preload" href="${files.pack.replace('.', '\\.')}" as="fetch" crossorigin="anonymous">`), 'PCK preloadなし');
		assert.ok(html.indexOf('<base href=') < html.indexOf('rel="preload"'), 'baseがpreloadより後ろ');
		assert.match(html, /#yweb-site-summary\{position:fixed/, '初期HTMLの表示体裁なし');
		assert.equal((html.match(/<meta\s+charset=/gi) || []).length, 1, 'charset宣言が一意でない');
		assert.ok(html.indexOf('<meta charset="utf-8">') < 1024, 'charset宣言が先頭1024 byte外');
	}
	assert.match(about, /<title>概要ページ<\/title>/);
	assert.match(about, /物理HTMLの概要/);
	assert.match(index, /<h1[^>]*>Aurora Platform<\/h1>/, '自動H1なし');
	assert.match(index, /<h2[^>]*>Features<\/h2>/, '自動H2なし');
	assert.match(index, /<h3[^>]*>Direct card<\/h3>/, '直下Cardの自動H3なし');
	assert.match(index, /<p[^>]*>Aurora<\/p>/, '残りLabelの本文化なし');
	assert.match(index, /<p[^>]*>Web branch<\/p>/, 'Web向け分岐なし');
	assert.doesNotMatch(index, /Desktop branch/, 'desktop分岐が混入');
	assert.match(about, /<h1[^>]*>About Aurora<\/h1>/, '名前指定H1なし');
	assert.match(about, /<h2[^>]*>Our story<\/h2>/, '名前指定H2なし');
	assert.match(about, /<p[^>]*>We design calm digital experiences\.<\/p>/, '名前指定Pなし');
	assert.match(about, /<a[^>]*href="\/sub\/"[^>]*>Home<\/a>/, 'LinkButtonのhrefなし');
	assert.match(about, /<p[^>]*>Fresh state<\/p>/, 'route状態が独立していない');
	assert.match(index, /<img src="\/sub\/yweb-images\/ogp-[0-9a-f]{12}\.png" alt="Auroraの製品を囲む制作チーム" width="1200" height="630" decoding="async" loading="eager" fetchpriority="high">/, '明示alt画像なし');
	assert.match(index, /<img src="\/sub\/yweb-images\/team-photo-[0-9a-f]{12}\.png" alt="対話しながら設計するAuroraチーム" width="1200" height="630" decoding="async" loading="lazy">/, 'Caption由来alt画像なし');
	assert.match(about, /<img src="\/sub\/yweb-images\/team-photo-[0-9a-f]{12}\.png" alt="team photo" width="1200" height="630" decoding="async" loading="eager" fetchpriority="high">/, 'ファイル名alt画像なし');
	assert.equal((about.match(/<img src="\/sub\/yweb-images\//g) || []).length, 1, '装飾、透明、除外指定画像のいずれかが検索対象へ混入');
	assert.doesNotMatch(about, /Leaked state/, '前routeのstatic状態が混入');
	assert.doesNotMatch(index + about, /data-yweb-node=/, '未使用Node pathがHTMLへ残留');
	assert.equal((index.match(/<h1(?:\s|>)/g) || []).length, 1, 'H1が一意でない');
	assert.equal(fs.readdirSync(site).some((name) => name.endsWith('.conf')), false, 'server設定が残留');
	assert.equal(fs.readdirSync(site).some((name) => name.includes('000000000000')), false, '旧hash成果物が残留');
	assert.equal(fs.existsSync(path.join(site, 'removed/index.html')), false, '削除routeが残留');
	assert.equal(fs.existsSync(path.join(site, 'component/index.html')), false, 'ページではないSceneを物理routeへ出した');
	const published = JSON.parse(fs.readFileSync(path.join(site, 'yweb-site.json'), 'utf8'));
	assert.equal(Object.hasOwn(published.scenes, 'Component'), false, 'ページではないSceneをBrowser routeへ出した');
	assert.equal(fs.readFileSync(path.join(site, 'sitemap.xml'), 'utf8').includes('/component/'), false, 'ページではないSceneをsitemapへ出した');
	const compression = JSON.parse(fs.readFileSync(path.join(site, 'yweb-compression.json')));
	assert.equal(compression.templateQuality, 9, 'Site圧縮品質がtemplateと違う');
	assert.equal(compression.entries.length, 5);
	assert.equal(compression.entries.filter((entry) => entry.file.startsWith(files.base)).length, 4, '内蔵runtimeの圧縮対応数が違う');
	assert.ok(compression.entries.filter((entry) => entry.file.startsWith(files.base)).every((entry) => entry.quality === 9), '内蔵runtimeの圧縮品質が不明');
	assert.equal(Object.hasOwn(compression.entries.find((entry) => entry.file === 'web/main.js'), 'quality'), false, '独自Brotliへ内蔵品質を流用した');
	const seoImages = fs.readdirSync(path.join(site, 'yweb-images'));
	assert.equal(seoImages.length, 2, `検索画像数が不正: ${seoImages.join(', ')}`);

	const server = createServer(host);
	await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true });
	try {
		assert.equal((await request('/sub/about/')).status, 200);
		assert.equal((await request('/sub/%E4%BC%9A%E7%A4%BE%20%E6%A1%88%E5%86%85/')).status, 200);
		assert.equal((await request('/sub/unknown/')).status, 404);
		assert.equal((await request(`/sub/${files.base}.js`)).headers['cache-control'], 'public, max-age=31536000, immutable');
		const imageResponse = await request(`/sub/yweb-images/${seoImages.find((name) => name.startsWith('ogp-'))}`);
		assert.equal(imageResponse.headers['content-type'], 'image/png');
		assert.equal(imageResponse.headers['cache-control'], 'public, max-age=31536000, immutable');
		assert.equal((await request('/sub/about/')).headers['cache-control'], 'no-cache');
		assert.equal((await request(`/sub/${files.base}.wasm`, { 'accept-encoding': 'br' })).headers['content-encoding'], 'br');
		// JavaScriptなしでも物理HTMLの本文とLinkButton導線を読めることを確かめる。
		const staticContext = await browser.newContext({ javaScriptEnabled: false });
		const staticPage = await staticContext.newPage();
		await staticPage.goto(`http://127.0.0.1:${port}/sub/about/`, { waitUntil: 'domcontentloaded' });
		assert.equal(await staticPage.getByRole('heading', { level: 1 }).textContent(), 'About Aurora');
		const staticImage = staticPage.getByRole('img', { name: 'team photo' });
		await staticImage.waitFor();
		assert.equal(await staticImage.evaluate((node) => node.naturalWidth), 1200);
		assert.equal(await staticPage.locator('#yweb-site-summary').evaluate((node) => getComputedStyle(node).overflowY), 'auto');
		await staticPage.getByRole('link', { name: 'Home' }).click();
		await staticPage.waitForURL(`http://127.0.0.1:${port}/sub/`);
		assert.equal(await staticPage.getByRole('heading', { level: 1 }).textContent(), 'Aurora Platform');
		await staticContext.close();
		const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
		const errors = [];
		const failedResponses = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('response', (response) => { if (response.status() >= 400) failedResponses.push([response.status(), response.url()]); });
		await page.goto(`http://127.0.0.1:${port}/sub/%E4%BC%9A%E7%A4%BE%20%E6%A1%88%E5%86%85/`, { waitUntil: 'domcontentloaded' });
		await page.locator('#yweb-site-summary').waitFor({ state: 'detached', timeout: 5000 });
		const preload = await page.evaluate(() => performance.getEntriesByType('resource')
			.filter((entry) => entry.name.endsWith('.wasm') || entry.name.endsWith('.pck'))
			.map((entry) => ({ name: new URL(entry.name).pathname, type: entry.initiatorType })));
		assert.equal(preload.filter((entry) => entry.name.endsWith('.wasm')).length, 1, `WASM preload重複: ${JSON.stringify(preload)}`);
		assert.equal(preload.filter((entry) => entry.name.endsWith('.pck')).length, 1, `PCK preload重複: ${JSON.stringify(preload)}`);
		assert.deepEqual(preload.map((entry) => entry.name).sort(), [`/sub/${files.base}.wasm`, `/sub/${files.pack}`].sort(), `非root preload URL不一致: ${JSON.stringify(preload)}`);
		assert.ok(preload.every((entry) => entry.type === 'link'), `非root preload起点不一致: ${JSON.stringify(preload)}`);
		assert.deepEqual(failedResponses, [], `初期取得4xx: ${JSON.stringify(failedResponses)}`);
		assert.equal(await page.title(), '会社案内');
		assert.equal(await page.evaluate(() => YWebSite.initialScene()), 'res://company.tscn');
		await page.goto(`http://127.0.0.1:${port}/sub/about/`, { waitUntil: 'domcontentloaded' });
		assert.equal(await page.title(), '概要ページ');
		assert.equal(await page.evaluate(() => window.aboutLoads), 1);
		assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#222222');
		const marker = await page.evaluate(() => window.ywebPageMarker = crypto.randomUUID());
		await page.evaluate(() => YWebSite.scene('res://main.tscn'));
		await page.waitForFunction(() => location.pathname === '/sub/' && window.mainLoads === 1);
		assert.equal(await page.evaluate(() => window.ywebPageMarker), marker, 'scene遷移で再読込');
		await page.goBack();
		await page.waitForFunction(() => location.pathname === '/sub/about/');
		assert.equal(await page.evaluate(() => window.ywebPageMarker), marker, '戻る操作で再読込');
		assert.equal(await page.evaluate(() => window.aboutLoads), 1, '戻る操作でscript再実行');
		assert.deepEqual(errors, []);
		await page.screenshot({ path: path.join(root, 'static-pages.png') });
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}
	const preset = path.join(project, 'export_presets.cfg');
	// 生成途中の失敗で、公開中のHTML、画像、PCKを混在させないことを確かめる。
	const oldSite = treeState(site);
	fs.appendFileSync(path.join(project, 'company.tscn'), '\n; transaction fixture\n');
	fs.writeFileSync(preset, fs.readFileSync(preset, 'utf8').replace(/yweb\/site\/base_url="[^"]+"/, 'yweb/site/base_url="ftp://invalid.example/sub/"'));
	const failed = child.spawnSync(godot, ['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], { encoding: 'utf8' });
	assert.notEqual(failed.status, 0, '不正URLのexportが成功した');
	assert.deepEqual(treeState(site), oldSite, '失敗時に公開成果物の組合せを変えた');
	assert.ok(fs.existsSync(path.join(site, files.pack)), '失敗時に旧PCKを削除した');
	// 画像回収後のHTML生成失敗でも、公開画像を含む全fileを維持する。
	fs.writeFileSync(preset, fs.readFileSync(preset, 'utf8').replace('ftp://invalid.example/sub/', `http://127.0.0.1:${port}/sub/`));
	const configPath = path.join(project, 'yweb-site.json');
	const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
	config.scenes.Main.meta = [{}];
	fs.writeFileSync(configPath, JSON.stringify(config));
	const scenePath = path.join(project, 'scene.gd');
	const reduced = fs.readFileSync(scenePath, 'utf8')
		.replace(/\n\s*caption_photo\("res:\/\/web\/team-photo\.png"\)/, '')
		.replace(/\n\s*photo\("(?:TeamPhoto|Background|InvisiblePhoto)"[^\n]+/g, '');
	fs.writeFileSync(scenePath, reduced);
	const lateFailed = child.spawnSync(godot, ['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], { encoding: 'utf8' });
	assert.notEqual(lateFailed.status, 0, '不正metaのexportが成功した');
	assert.deepEqual(treeState(site), oldSite, '後段失敗時に公開画像またはHTMLを変えた');
	fs.writeFileSync(preset, fs.readFileSync(preset, 'utf8').replace('yweb/site/enabled=true', 'yweb/site/enabled=false'));
	child.execFileSync(godot, ['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], { stdio: 'pipe' });
	for (const name of ['about/index.html', '会社 案内/index.html', 'yweb-site.json', 'sitemap.xml', 'robots.txt', '404.html']) {
		assert.equal(fs.existsSync(path.join(site, name)), false, `Site無効後の付属物が残留: ${name}`);
	}
	assert.equal(fs.existsSync(path.join(site, 'yweb-images')), false, 'Site無効後の検索画像が残留');
	// project内tmpを公開先にしても、作業stageを自己再帰させず完了する。
	const nested = path.join(project, 'tmp/index.html');
	child.execFileSync(godot, ['--headless', '--path', project, '--export-release', 'Web', nested], { stdio: 'pipe' });
	assert.ok(fs.existsSync(nested), 'project内tmpへのexportが完了しない');
	const internalWork = path.join(project, 'tmp/yweb-exporter');
	assert.equal(fs.existsSync(internalWork) && fs.readdirSync(internalWork).some((name) => name.startsWith('publish-')), false, '公開先内へstageを作った');
	// 親向きsymlinkを公開treeとして辿らず、短時間で安全に拒否する。
	if (process.platform !== 'win32') {
		const loop = path.join(project, 'tmp/ParentLoop');
		fs.symlinkSync('.', loop, 'dir');
		const linked = child.spawnSync(godot, ['--headless', '--path', project, '--export-release', 'Web', nested], { encoding: 'utf8', timeout: 5000 });
		fs.unlinkSync(loop);
		assert.notEqual(linked.error?.code, 'ETIMEDOUT', 'symlinkを再帰して停止した');
		assert.notEqual(linked.status, 0, 'symlinkを含む公開treeを受理した');
	}
	fs.writeFileSync(path.join(root, 'result.json'), `${JSON.stringify({ physicalPages: 3, semanticSnapshot: { frame: 3, isolated: true, webFeature: true, h1: 1, h2: 1, h3: 1, link: 1, images: 2, imageNodeTypes: 6, captionPairs: 2 }, sharedEngine: files.base, sharedPack: files.pack, serverConfig: false, immutable: true, unchangedImageWrites: 0, reloads: 1, siteDisabledCleanup: true }, null, 2)}\n`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
