// 構造非採用と固定fallback警告を同じEditor buildで検証する。
// 終了codeと全message項目を一回の結果へ集約する。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..'); // project root。
const godot = path.join(root, 'tmp/godot-source/bin/godot.macos.editor.arm64'); // 改変Editor。
const out = path.join(root, 'tmp/gdweb/boundary'); // 書き出し結果と証拠。
const fixtures = new Set(['export_reject', 'export_warning']); // 実行を許可する固定fixture。

// 一つのfixtureを書き出し、終了状態とmessageを返す。
function run(name) {
	assert.ok(fixtures.has(name), `未登録fixture: ${name}`);
	const source = path.join(root, 'tests/fixtures', name);
	const project = path.join(out, 'projects', name);
	fs.rmSync(project, { recursive: true, force: true });
	fs.cpSync(source, project, { recursive: true, filter: (file) => !file.split(path.sep).includes('.godot') });
	const result = spawnSync(godot, ['--headless', '--path', project, '--export-release', 'gdweb', path.join(out, `${name}.html`)], { cwd: root, encoding: 'utf8', timeout: 5000 });
	return { code: result.status, signal: result.signal, text: `${result.stdout}\n${result.stderr}` };
}

fs.mkdirSync(out, { recursive: true });
const reject = run('export_reject');
assert.notEqual(reject.code, 0, '構造非採用作品の書き出しが成功した');
for (const token of ['Node3D', 'CanvasGroup', 'GPUParticles2D', 'MeshInstance2D', 'Skeleton2D', 'Light2D', 'BackBufferCopy', 'JavaScriptBridge', 'RenderingDevice', 'GDExtension', 'load(', 'DirAccess.', 'draw_mesh(']) assert.ok(reject.text.includes(token), `拒否message不足: ${token}`);
const warning = run('export_warning');
assert.equal(warning.code, 0, warning.text);
assert.ok(!warning.text.includes('unsupported dynamic API token'), `静的preloadを誤拒否: ${warning.text}`);
for (const field of ['node=WarningControl', 'property=mouse_default_cursor_shape', 'process=DOM pointer', 'fallback=default cursor', 'property=tooltip_text', 'process=DOM meaning', 'fallback=empty tooltip']) assert.ok(warning.text.includes(field), `警告message不足: ${field}`);

const proof = { ok: true, rejected: 13, warnings: 2, reject_exit: reject.code, warning_exit: warning.code };
fs.writeFileSync(path.join(out, 'runtime-result.json'), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof));
