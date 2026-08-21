// Godotのlicenseが単体配布templateへ同じ内容で入ることを検査する。
// 公開site境界は実書き出しtestで検査し、ここでは配布元だけを固定する。

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // yweb project root。
const distribution = JSON.parse(fs.readFileSync(path.join(root, 'addons/yurutto_website_exporter/templates/manifest.json'))); // 配布テンプレート情報。
const templates = Object.values(distribution.templates).map((item) => path.join(root, 'addons/yurutto_website_exporter/templates', item.file)); // level別の配布template。
const notice = 'GODOT_LICENSE.txt'; // 公開する通知file。
const sources = ['LICENSES/GODOT-MIT.txt', 'LICENSES/GODOT-COPYRIGHT.txt']; // 通知の追跡元。

const expected = sources.map((file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\n*$/, '\n')).join('\n');

// levelごとのtemplateが、同じ通知を同じ形で持つことを確かめる。
for (const template of templates) {
	const level = path.basename(template);
	assert.equal(childProcess.execFileSync('unzip', ['-p', template, notice], { encoding: 'utf8' }), expected, `template license不一致: ${level}`);
	// 通知を分けずに一つへまとめた境界を確認する。
	assert.throws(() => childProcess.execFileSync('unzip', ['-p', template, 'GODOT_COPYRIGHT.txt'], { stdio: 'pipe' }), `通知が分かれている: ${level}`);
	// 利用者projectのfontへ誤ったlicenseを付けない境界を確認する。
	assert.throws(() => childProcess.execFileSync('unzip', ['-p', template, 'FONT_LICENSE.txt'], { stdio: 'pipe' }), `font通知が混入: ${level}`);
	assert.equal(fs.existsSync(path.join(path.dirname(template), 'godot.font.woff2')), false, `font混入: ${level}`);
}
console.log(JSON.stringify({ ok: true, templates: templates.length, licenses: sources.length, notice, boundary: 'template' }));
