// Web presetのAdaptive強制と再実行時の安定性を一括検査する。
// 中間projectをtmpへ限定し、実projectを変更せず正規化境界を確認する。

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const work = fs.mkdtempSync(path.join(root, 'tmp/export-preset-')); // 検査専用project。
const file = path.join(work, 'export_presets.cfg'); // 検査対象preset。
const tool = path.join(root, 'build/force_web_preset.cjs'); // Adaptive正規化処理。
const fixture = `[preset.0]\n\nname="Web"\nplatform="Web"\n\n[preset.0.options]\n\ncustom_template/release="/old/machine/template.zip"\nhtml/canvas_resize_policy=0\nhtml/focus_canvas_on_start=true\ngdweb/routing/mode=1\ngdweb/font/matching_webfont=false\ngdweb/ogp/frame=27\n`;

try {
	fs.writeFileSync(file, fixture);
	childProcess.execFileSync(process.execPath, [tool, work]);
	const once = fs.readFileSync(file, 'utf8');
	assert.equal(once.match(/html\/canvas_resize_policy=2/g)?.length, 1, 'Adaptive強制なし');
	assert.ok(once.includes(path.join(root, 'tmp/minimum/runtime-proof/gdweb-minimum-template.zip')), 'template pathの正規化なし');
	assert.equal(once.includes('/old/machine'), false, 'machine固有pathが残留');
	assert.match(once, /gdweb\/routing\/mode=1/, 'History選択を上書き');
	assert.match(once, /gdweb\/font\/matching_webfont=false/, 'Web font選択を上書き');
	assert.match(once, /gdweb\/ogp\/frame=27/, 'OGP撮影frameを上書き');
	childProcess.execFileSync(process.execPath, [tool, work]);
	assert.equal(fs.readFileSync(file, 'utf8'), once, '再実行でpresetが変化');
	console.log(JSON.stringify({ ok: true, canvasResizePolicy: 2, stable: true }));
} finally {
	fs.rmSync(work, { recursive: true, force: true });
}
