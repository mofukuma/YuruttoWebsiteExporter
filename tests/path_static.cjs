// 移設後のroot、外部入力、font、生成先を一括検査する。
// build前に古いpathと異なるsourceを止め、同じ入力だけを使う。
// 設計思想：絶対pathは実行時にrootから導出し、固定値はlockへ集約する。

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const lockFile = path.join(root, 'build/source.lock'); // 外部入力の正本。
const source = path.join(root, 'tmp/godot-source'); // Godot source固定先。
const emsdk = path.join(root, 'tmp/emsdk'); // Emscripten固定先。
const resultFile = path.join(root, 'tmp/gdweb/path-static-result.json'); // 静的検査証跡。
const checkedDirs = ['build', 'tests']; // 実行pathを持つ管理対象。
const overlay = path.join(root, 'build/overlay'); // Godot追加sourceの正本。

// lockの単純なKEY=VALUEだけを読み込む。
function readLock(file) {
	const values = {};
	for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
		const match = line.match(/^([A-Z0-9_]+)=(.+)$/);
		if (match) values[match[1]] = match[2];
	}
	return values;
}

// 小さい固定入力の内容を直接照合する。
function sha256(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// source内の管理対象fileを再帰列挙する。
function files(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(dir, entry.name);
		return entry.isDirectory() ? files(file) : [file];
	});
}

// overlayが作業sourceへ完全反映されているか確認する。
function overlayDiff() {
	return files(overlay).flatMap((file) => {
		const relative = path.relative(overlay, file);
		const target = path.join(source, relative);
		if (!fs.existsSync(target)) return [`${relative}:missing`];
		return fs.readFileSync(file).equals(fs.readFileSync(target)) ? [] : [`${relative}:different`];
	});
}

const lock = readLock(lockFile);
const version = fs.readFileSync(path.join(source, 'version.py'), 'utf8');
const texts = checkedDirs.flatMap((dir) => files(path.join(root, dir)))
	.filter((file) => /\.(?:cjs|gd|sh)$/.test(file))
	.map((file) => ({ file: path.relative(root, file), text: fs.readFileSync(file, 'utf8') }));
const stale = texts.filter(({ file }) => file !== 'tests/path_static.cjs').flatMap(({ file, text }) => {
	const found = [];
	if (text.includes('.tmp/')) found.push(`${file}:.tmp`);
	if (/path\.join\((?:repo|root), ['"]gdweb\//.test(text)) found.push(`${file}:gdweb-prefix`);
	if (/__dirname, ['"]\.\.\/\.\.['"]/.test(text)) found.push(`${file}:parent-root`);
	return found;
});
const emsdkCommit = execFileSync('git', ['-C', emsdk, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const emscriptenRelease = fs.readFileSync(path.join(emsdk, 'upstream/.emsdk_version'), 'utf8').trim();
const webDetect = fs.readFileSync(path.join(source, 'platform/web/detect.py'), 'utf8');
const webBuild = fs.readFileSync(path.join(source, 'platform/web/SCsub'), 'utf8');
const webDisplay = fs.readFileSync(path.join(source, 'platform/web/js/libs/library_gdweb_display.js'), 'utf8');
const overlayChanges = overlayDiff();
const artifacts = {
	archive: sha256(path.join(root, 'tmp/godot-4.7.1-stable.tar.xz')),
	otf: sha256(path.join(root, 'LINESeedJP_A_OTF_Rg.otf')),
	woff2: sha256(path.join(root, 'LINESeedJP_A_OTF_Rg.woff2')),
}; // 配布入力のhash。

assert.match(version, /major = 4\s+minor = 7\s+patch = 1\s+status = "stable"/s, 'Godot version不一致');
assert.equal(artifacts.archive, lock.GODOT_ARCHIVE_SHA256, 'Godot source archive不一致');
assert.equal(artifacts.otf, lock.OTF_SHA256, 'OTF不一致');
assert.equal(artifacts.woff2, lock.WOFF2_SHA256, 'WOFF2不一致');
assert.equal(emsdkCommit, lock.EMSDK_COMMIT, 'emsdk commit不一致');
assert.equal(emscriptenRelease, lock.EMSCRIPTEN_RELEASE, 'Emscripten release不一致');
assert.deepEqual(stale, [], `旧root参照あり: ${stale.join(', ')}`);
assert.deepEqual(overlayChanges, [], `overlay未反映: ${overlayChanges.join(', ')}`);
assert.match(webDetect, /BoolVariable\("gdweb_2d"/i, 'gdweb_2d build optionがない');
assert.match(webBuild, /if not env\["gdweb_2d"\]/, 'GPU JS除外分岐がない');
assert.doesNotMatch(webDisplay, /webgl|opengl|gles/i, 'Display JSにGPU context語が残存');
for (const dir of [source, emsdk, path.dirname(resultFile)]) assert.ok(path.isAbsolute(dir), `絶対pathではない: ${dir}`);

const result = {
	ok: true,
	root,
	godot: lock.GODOT_VERSION,
	emscripten: lock.EMSDK_VERSION,
	artifacts,
	stale,
	overlayChanges,
}; // 次工程へ渡す固定入力の結果。
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
