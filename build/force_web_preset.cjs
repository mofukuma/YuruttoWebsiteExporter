// minimum Web書き出しで画面全体へ追従するAdaptiveを必須化する。
// 対象presetだけを正規化し、Godot標準exporterへ同じ設定を渡す。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(process.argv[2] || '.'); // Godot project root。
const name = process.argv[3] || 'Web'; // 書き出し対象preset名。
const file = path.join(project, 'export_presets.cfg'); // Godot export設定。
const repo = path.resolve(__dirname, '..'); // gdweb project root。
const template = path.join(repo, 'tmp/minimum/runtime-proof/gdweb-minimum-template.zip'); // 固定minimum template。

assert.ok(fs.existsSync(file), `export_presets.cfgなし: ${file}`);
let text = fs.readFileSync(file, 'utf8');
const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const preset = new RegExp(`^\\[preset\\.(\\d+)\\]\\n(?:(?!^\\[preset\\.).*\\n?)*?^name="${escaped}"$`, 'm').exec(text);
assert.ok(preset, `Web presetなし: ${name}`);
const index = preset[1];
const header = `[preset.${index}.options]`;
const start = text.indexOf(header);
assert.ok(start >= 0, `Web preset optionsなし: ${name}`);
const body = start + header.length;
const next = text.indexOf('\n[preset.', body);
const end = next >= 0 ? next : text.length;
let options = text.slice(body, end);

// Machine依存pathとAdaptiveだけを一意な値へ正規化する。
const forced = {
	'custom_template/release': `"${template}"`,
	'html/canvas_resize_policy': '2',
};
const defaults = {
	'gdweb/site/enabled': 'true',
	'gdweb/site/config': '"res://gdweb-site.json"',
	'gdweb/site/base_url': '"https://example.com"',
	'gdweb/site/description': '"Godotで作成したWebサイトです。"',
	'gdweb/site/locale': '"ja_JP"',
	'gdweb/site/favicon': '""',
	'gdweb/routing/mode': '0',
	'gdweb/font/matching_webfont': 'true',
	'gdweb/font/avoid_canvas_theme_font': 'true',
	'gdweb/ogp/image': '"res://web/ogp.png"',
	'gdweb/ogp/alt': '"サイトのプレビュー画像"',
	'gdweb/ogp/frame': '2',
};
for (const [key, value] of Object.entries(forced)) {
	const line = new RegExp(`^${key.replace('/', '\\/')}=.*$`, 'm');
	if (line.test(options)) options = options.replace(line, `${key}=${value}`);
	else options = `${options.replace(/\s*$/, '')}\n${key}=${value}\n`;
}

// Site設定は未設定時だけ既定値を補い、ユーザー選択を保持する。
for (const [key, value] of Object.entries(defaults)) {
	const line = new RegExp(`^${key.replace('/', '\\/')}=.*$`, 'm');
	if (!line.test(options)) options = `${options.replace(/\s*$/, '')}\n${key}=${value}\n`;
}
text = text.slice(0, body) + options + text.slice(end);
fs.writeFileSync(file, text);
console.log(JSON.stringify({ preset: name, canvasResizePolicy: 2, template }));
