// site機能を無効にしてもCanvas Theme font設定がHTMLへ伝わることを検査する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const root = path.join(repo, 'tmp/text-config'); // 最小exporter fixture。
const project = path.join(root, 'project'); // addonだけを導入するGodot project。
const html = path.join(root, 'index.html'); // 設定注入対象。
const godot = '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 固定Godot。

// false指定とscriptの一意性を確認する。
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(project, { recursive: true });
fs.cpSync(path.join(repo, 'addons/gdweb_site'), path.join(project, 'addons/gdweb_site'), { recursive: true });
fs.writeFileSync(path.join(project, 'project.godot'), '[application]\nconfig/name="Text Config"\nrun/main_scene="res://main.tscn"\n[editor_plugins]\nenabled=PackedStringArray("res://addons/gdweb_site/plugin.cfg")\n');
fs.writeFileSync(path.join(project, 'main.tscn'), '[gd_scene format=3]\n[node name="Main" type="Node"]\n');
fs.writeFileSync(path.join(project, 'export_presets.cfg'), '[preset.0]\nname="Web"\nplatform="ゆるっとWebサイト"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\n[preset.0.options]\nhtml/focus_canvas_on_start=true\ngdweb/site/enabled=false\ngdweb/font/matching_webfont=true\ngdweb/font/avoid_canvas_theme_font=false\nvram_texture_compression/for_desktop=true\n');
const emptyPath = path.join(root, 'empty-path');
fs.mkdirSync(emptyPath, { recursive: true });
child.execFileSync(godot, ['--headless', '--path', project, '--export-release', 'Web', html], { stdio: 'pipe', env: { ...process.env, PATH: emptyPath } });
const output = fs.readFileSync(html, 'utf8');
assert.match(output, /GDWEB_TEXT_CONFIG=\{"avoidCanvasThemeFont":false\}/);
assert.equal((output.match(/id="gdweb-text-config"/g) || []).length, 1, '設定scriptが重複');
console.log(JSON.stringify({ ok: true, site: false, avoidCanvasThemeFont: false, scripts: 1, nodeRequired: false }));
