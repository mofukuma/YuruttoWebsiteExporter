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

// machine依存pathとAdaptive値を現在repositoryの一意な値へ正規化する。
const values = {
	'custom_template/release': `"${template}"`,
	'html/canvas_resize_policy': '2',
};
for (const [key, value] of Object.entries(values)) {
	const line = new RegExp(`^${key.replace('/', '\\/')}=.*$`, 'm');
	if (line.test(options)) options = options.replace(line, `${key}=${value}`);
	else options = `${options.replace(/\s*$/, '')}\n${key}=${value}\n`;
}
text = text.slice(0, body) + options + text.slice(end);
fs.writeFileSync(file, text);
console.log(JSON.stringify({ preset: name, canvasResizePolicy: 2, template }));
