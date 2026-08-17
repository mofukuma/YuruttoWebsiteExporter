// 何も用意していないGodot projectへaddonを入れただけで書き出せることを検査する。
// Scene情報JSONの自動生成、既定値だけのpreset、Scene遷移3枚の公開成果物を通しで確かめる。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // project root。
const work = path.join(repo, 'tmp/first-export'); // 新規projectと成果物の置き場。
const project = path.join(work, 'project'); // 利用者側を模した検査project。
const site = path.join(work, 'site'); // 書き出したWeb成果物。
const godot = process.env.GODOT_BIN || '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 固定Godot。
const pages = [ // 表示文とその次の遷移先。
	{ name: 'main', node: 'Main', text: 'MAIN PAGE', next: 'res://news.tscn' },
	{ name: 'news', node: 'News', text: 'NEWS PAGE', next: 'res://contact.tscn' },
	{ name: 'contact', node: 'Contact', text: 'CONTACT PAGE', next: 'res://main.tscn' },
];

// 押すと次のSceneへ移るだけの画面を作る。
function page(item) {
	return `# ${item.text}を表示し、Buttonで次のSceneへ移る検査画面。\n`
		+ '# DOM文字とroute切り替えを、利用者projectと同じ書き方で確かめる。\n\n'
		+ 'extends Control\n\n'
		+ '# 見出しと遷移Buttonを置く。\n'
		+ 'func _ready() -> void:\n'
		+ '\tvar label := Label.new()\n'
		+ `\tlabel.text = "${item.text}"\n`
		+ '\tlabel.position = Vector2(40, 60)\n'
		+ '\tlabel.add_theme_font_size_override("font_size", 42)\n'
		+ '\tadd_child(label)\n'
		+ '\tvar button := Button.new()\n'
		+ '\tbutton.text = "NEXT"\n'
		+ '\tbutton.position = Vector2(40, 140)\n'
		+ '\tbutton.pressed.connect(_go)\n'
		+ '\tadd_child(button)\n\n'
		+ '# 次のSceneへ切り替える。\n'
		+ 'func _go() -> void:\n'
		+ `\tget_tree().change_scene_to_file("${item.next}")\n`;
}

// Scene一枚分のresourceを作る。
function scene(item) {
	return '[gd_scene load_steps=2 format=3]\n\n'
		+ `[ext_resource path="res://${item.name}.gd" type="Script" id="1"]\n\n`
		+ `[node name="${item.node}" type="Control"]\n`
		+ 'layout_mode = 3\nanchors_preset = 15\nanchor_right = 1.0\nanchor_bottom = 1.0\n'
		+ 'script = ExtResource("1")\n';
}

// addonを入れただけの新規projectを組み立てる。
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(project, 'addons'), { recursive: true });
fs.cpSync(path.join(repo, 'addons/yurutto_website_exporter'), path.join(project, 'addons/yurutto_website_exporter'), { recursive: true });
fs.writeFileSync(path.join(project, 'project.godot'), '[application]\n\nconfig/name="First Export"\nrun/main_scene="res://main.tscn"\n\n[editor_plugins]\n\nenabled=PackedStringArray("res://addons/yurutto_website_exporter/plugin.cfg")\n');
for (const item of pages) {
	fs.writeFileSync(path.join(project, `${item.name}.gd`), page(item));
	fs.writeFileSync(path.join(project, `${item.name}.tscn`), scene(item));
}
// 既定値だけで書き出せるかを見るため、presetへはplatformと出力先しか書かない。
fs.writeFileSync(path.join(project, 'export_presets.cfg'), '[preset.0]\n\nname="Web"\nplatform="Yurutto Website"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\nexport_path=""\n\n[preset.0.options]\n\n');

// Editorを一度起動し、addonにScene情報JSONを用意させる。
child.execFileSync(godot, ['--headless', '--path', project, '--import'], { stdio: 'pipe', timeout: 120000 });

const configPath = path.join(project, 'yweb-site.json');
assert.ok(fs.existsSync(configPath), 'Scene情報JSONが自動生成されない');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
assert.equal(config.version, 1, 'versionが1でない');
assert.deepEqual(Object.keys(config.scenes), ['Main', 'Contact', 'News'], `main scene優先とfile容量順が崩れた: ${Object.keys(config.scenes)}`);
assert.equal(config.scenes.Main.uri, '/', 'main sceneがsite rootでない');
assert.deepEqual(Object.keys(config.scenes.Main).sort(), ['scene', 'uri'], '既定値で足りる項目まで書いている');

// 設定を一切足さずに書き出す。
fs.mkdirSync(site, { recursive: true });
child.execFileSync(godot, ['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], { stdio: 'pipe', timeout: 300000 });

// 3枚分の公開URLと主要成果物が揃うことを確かめる。
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
assert.match(html, /<title>/, 'titleが無い');
assert.match(html, /og:title/, 'OGPが無い');
for (const name of ['index.js', 'index.wasm', 'index.pck', 'sitemap.xml', 'robots.txt', '404.html']) {
	assert.ok(fs.existsSync(path.join(site, name)), `成果物が足りない: ${name}`);
}
const sitemap = fs.readFileSync(path.join(site, 'sitemap.xml'), 'utf8');
for (const uri of ['/', '/news/', '/contact/']) {
	assert.ok(sitemap.includes(`<loc>https://example.com${uri}</loc>`), `sitemapにURIが無い: ${uri}`);
}
const exported = JSON.parse(fs.readFileSync(path.join(site, 'yweb-site.json'), 'utf8'));
assert.equal(Object.keys(exported.scenes).length, 3, '公開Scene数が3枚でない');

console.log(JSON.stringify({ ok: true, generated: Object.keys(config.scenes), uris: Object.values(config.scenes).map((item) => item.uri), assets: fs.readdirSync(site).length, defaults: true }));
