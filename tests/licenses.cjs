// Godotのlicenseが単体配布templateへ同じ内容で入ることを検査する。
// 公開site境界は実書き出しtestで検査し、ここでは配布元だけを固定する。

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // yuruttoweb project root。
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'addons/yurutto_website_exporter/templates/runtime.json'))); // 配布runtime情報。
const template = path.join(root, 'addons/yurutto_website_exporter/templates', runtime.template.file); // 配布template。
const notice = 'GODOT_LICENSE.txt'; // 公開する通知file。
const sources = ['LICENSES/GODOT-MIT.txt', 'LICENSES/GODOT-COPYRIGHT.txt']; // 通知の追跡元。

const expected = sources.map((file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\n*$/, '\n')).join('\n');
assert.equal(childProcess.execFileSync('unzip', ['-p', template, notice], { encoding: 'utf8' }), expected, `template license不一致: ${notice}`);
// 通知を分けずに一つへまとめた境界を確認する。
assert.throws(() => childProcess.execFileSync('unzip', ['-p', template, 'GODOT_COPYRIGHT.txt'], { stdio: 'pipe' }));
// 利用者projectのfontへ誤ったlicenseを付けない境界を確認する。
assert.throws(() => childProcess.execFileSync('unzip', ['-p', template, 'FONT_LICENSE.txt'], { stdio: 'pipe' }));
assert.equal(fs.existsSync(path.join(path.dirname(template), 'godot.font.woff2')), false);
console.log(JSON.stringify({ ok: true, licenses: sources.length, notice, boundary: 'template' }));
