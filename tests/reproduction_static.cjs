// 固定archiveへpatchとoverlayを適用し、改変sourceを再構成できるか検査する。
// 設計思想：作業中sourceを正本にせず、build以下の定義だけを再現入力とする。

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..'); // project root。
const archive = path.join(root, 'tmp/godot-4.7.1-stable.tar.xz'); // 固定Godot source。
const current = path.join(root, 'tmp/godot-source'); // 実装済み比較対象。
const overlay = path.join(root, 'build/overlay'); // 追加source正本。
const patchFile = path.join(root, 'build/patches/web_gdweb_2d.patch'); // 本家file差分。
const expectedArchive = '0230d490846467c4fd772cc70b08dc56cb3adfedd55d039de0af74ddfdba00eb'; // source.lock固定値。
const generated = [
	'platform/web/js/libs/library_gdweb_display.js',
	'platform/web/js/engine/gdweb_features.js',
	'platform/web/js/engine/gdweb_engine.js',
]; // 本家sourceから決定的に生成するfile。

// file内容の一致判定へ使うSHA-256。
function hash(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// directory以下のfileを相対pathへ揃える。
function files(dir) {
	return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((item) => item.isFile())
		.map((item) => path.join(item.parentPath || item.path, item.name).slice(dir.length + 1));
}

const work = fs.mkdtempSync(path.join(root, 'tmp/reproduction-')); // 一回限りの再構成先。
const source = path.join(work, 'godot');
try {
	assert.equal(hash(archive), expectedArchive, 'Godot archive hash不一致');
	fs.mkdirSync(source);
	const patchFiles = [...fs.readFileSync(patchFile, 'utf8').matchAll(/^\+\+\+ b\/(.+)$/gm)].map((match) => match[1]);
	const sourceFiles = [...new Set(['version.py', ...patchFiles, 'platform/web/js/libs/library_godot_display.js', 'platform/web/js/engine/features.js', 'platform/web/js/engine/engine.js'])];
	execFileSync('/usr/bin/tar', ['-xJf', archive, '-C', source, '--strip-components=1', ...sourceFiles.map((name) => `godot-4.7.1-stable/${name}`)]);
	execFileSync(path.join(root, 'build/apply_overlay.sh'), [source], { stdio: 'pipe' });
	const targets = [...new Set([...patchFiles, ...files(overlay), ...generated])].sort();
	const mismatched = targets.filter((name) => hash(path.join(source, name)) !== hash(path.join(current, name)));
	assert.deepEqual(mismatched, [], `再構成不一致: ${mismatched.join(', ')}`);
	const result = { ok: true, archiveSha256: expectedArchive, patchSha256: hash(patchFile), files: targets.length, mismatched };
	const output = path.join(root, 'tmp/gdweb/reproduction/result.json');
	fs.mkdirSync(path.dirname(output), { recursive: true });
	fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
	console.log(JSON.stringify(result));
} finally {
	fs.rmSync(work, { recursive: true, force: true });
}
