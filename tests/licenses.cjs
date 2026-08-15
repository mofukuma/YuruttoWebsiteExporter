// Godotとfontのlicenseがtemplateと最終siteへ同じ内容で伝わることを検査する。
// 追跡元、zip entry、公開fileの三境界を一括比較する。

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const template = path.join(root, 'tmp/minimum/runtime-proof/gdweb-minimum-template.zip'); // 配布template。
const site = path.join(root, 'tmp/omochi-game/site'); // 実export成果物。
const files = [
	['GODOT_LICENSE.txt', 'LICENSES/GODOT-MIT.txt'],
	['GODOT_COPYRIGHT.txt', 'LICENSES/GODOT-COPYRIGHT.txt'],
	['FONT_LICENSE.txt', 'LICENSES/OFL-1.1.txt'],
]; // 公開名と追跡元の対応。

for (const [name, source] of files) {
	const expected = fs.readFileSync(path.join(root, source));
	const zipped = childProcess.execFileSync('unzip', ['-p', template, name]);
	assert.deepEqual(zipped, expected, `template license不一致: ${name}`);
	assert.deepEqual(fs.readFileSync(path.join(site, name)), expected, `site license不一致: ${name}`);
}
console.log(JSON.stringify({ ok: true, licenses: files.length, boundaries: 2 }));
