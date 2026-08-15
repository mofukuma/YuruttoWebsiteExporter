// Godotのlicenseがtemplateと最終siteへ同じ内容で伝わることを検査する。
// 追跡元、zip entry、公開fileの三境界を一括比較する。

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const template = path.join(root, 'tmp/minimum/runtime-proof/gdweb-minimum-template.zip'); // 配布template。
const site = path.join(root, 'tmp/aa-invaders/site'); // 実export成果物。
const files = [
	['GODOT_LICENSE.txt', 'LICENSES/GODOT-MIT.txt'],
	['GODOT_COPYRIGHT.txt', 'LICENSES/GODOT-COPYRIGHT.txt'],
]; // 公開名と追跡元の対応。

for (const [name, source] of files) {
	const expected = fs.readFileSync(path.join(root, source));
	const zipped = childProcess.execFileSync('unzip', ['-p', template, name]);
	assert.deepEqual(zipped, expected, `template license不一致: ${name}`);
	assert.deepEqual(fs.readFileSync(path.join(site, name)), expected, `site license不一致: ${name}`);
}
// 利用者projectのfontへ誤ったlicenseを付けない境界を確認する。
assert.throws(() => childProcess.execFileSync('unzip', ['-p', template, 'FONT_LICENSE.txt'], { stdio: 'pipe' }));
assert.equal(fs.existsSync(path.join(site, 'FONT_LICENSE.txt')), false);
assert.equal(fs.existsSync(path.join(path.dirname(template), 'godot.font.woff2')), false);
console.log(JSON.stringify({ ok: true, licenses: files.length, boundaries: 2 }));
