// Godotのlicenseが単体配布templateへ同じ内容で入ることを検査する。
// 公開site境界は実書き出しtestで検査し、ここでは配布元だけを固定する。

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // yuruttoweb project root。
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'addons/yurutto_website_exporter/templates/runtime.json'))); // 配布runtime情報。
const template = path.join(root, 'addons/yurutto_website_exporter/templates', runtime.template.file); // 配布template。
const files = [
	['GODOT_LICENSE.txt', 'LICENSES/GODOT-MIT.txt'],
	['GODOT_COPYRIGHT.txt', 'LICENSES/GODOT-COPYRIGHT.txt'],
]; // 公開名と追跡元の対応。

for (const [name, source] of files) {
	const expected = fs.readFileSync(path.join(root, source));
	const zipped = childProcess.execFileSync('unzip', ['-p', template, name]);
	assert.deepEqual(zipped, expected, `template license不一致: ${name}`);
}
// 利用者projectのfontへ誤ったlicenseを付けない境界を確認する。
assert.throws(() => childProcess.execFileSync('unzip', ['-p', template, 'FONT_LICENSE.txt'], { stdio: 'pipe' }));
assert.equal(fs.existsSync(path.join(path.dirname(template), 'godot.font.woff2')), false);
console.log(JSON.stringify({ ok: true, licenses: files.length, boundary: 'template' }));
