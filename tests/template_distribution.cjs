// 配布テンプレートのGodot版、toolchain、build option、ZIP内容を一括検査する。
// addon manifestを正本とし、version更新時の入力漏れと成果物混在を防ぐ。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..'); // yweb project root。
const build = path.join(root, 'build'); // 配布build定義。
const templateDir = path.join(root, 'addons/yurutto_website_exporter/templates'); // addon内テンプレート。
const manifest = JSON.parse(fs.readFileSync(path.join(templateDir, 'manifest.json'))); // 配布物の由来正本。
const template = path.join(templateDir, manifest.template.file); // 検査対象ZIP。
const work = path.join(root, 'tmp/template-distribution'); // 検査結果保存先。
const buffer = { maxBuffer: 32 * 1024 * 1024 }; // WASM展開に必要な上限。

// fileまたはBufferのSHA-256を返す。
function sha(value) {
	const data = Buffer.isBuffer(value) ? value : fs.readFileSync(value);
	return crypto.createHash('sha256').update(data).digest('hex');
}

// shell形式lockの固定値を読む。
function lock(file) {
	const values = {};
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const match = /^([A-Z][A-Z0-9_]*)=(.+)$/.exec(line.trim());
		if (match) values[match[1]] = match[2];
	}
	return values;
}

// directoryのpathと内容を安定順で一つのhashへまとめる。
function treeHash(base) {
	const files = [];
	function visit(current) {
		for (const name of fs.readdirSync(current).sort()) {
			const file = path.join(current, name);
			if (fs.statSync(file).isDirectory()) visit(file);
			else files.push(file);
		}
	}
	visit(base);
	const sum = crypto.createHash('sha256');
	for (const file of files) {
		sum.update(path.relative(base, file).split(path.sep).join('/'));
		sum.update('\0');
		sum.update(fs.readFileSync(file));
		sum.update('\0');
	}
	return sum.digest('hex');
}

// 複数fileのpathと内容を安定順で一つのhashへまとめる。
function filesHash(files) {
	const sum = crypto.createHash('sha256');
	for (const file of [...files].sort()) {
		sum.update(path.relative(root, file).split(path.sep).join('/'));
		sum.update('\0');
		sum.update(fs.readFileSync(file));
		sum.update('\0');
	}
	return sum.digest('hex');
}

const source = lock(path.join(build, 'source.lock'));
const distribution = lock(path.join(build, 'distribution.lock'));
const options = fs.readFileSync(path.join(build, 'template.options'), 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
const dockerfile = fs.readFileSync(path.join(build, 'distribution/Dockerfile'), 'utf8');
const distributionScript = fs.readFileSync(path.join(build, 'build_distribution.sh'), 'utf8');

assert.equal(manifest.schema, 1);
assert.equal(manifest.godot.version, source.GODOT_VERSION);
assert.equal(manifest.godot.commit, source.GODOT_COMMIT);
assert.equal(manifest.godot.archiveSha256, source.GODOT_ARCHIVE_SHA256);
assert.equal(manifest.toolchain.platform, distribution.BUILDER_PLATFORM);
assert.equal(manifest.toolchain.image, distribution.BUILDER_IMAGE);
assert.equal(manifest.toolchain.node, distribution.NODE_VERSION);
assert.equal(manifest.toolchain.scons, distribution.SCONS_VERSION);
assert.equal(manifest.toolchain.emscripten, source.EMSDK_VERSION);
assert.equal(manifest.toolchain.sourceDateEpoch, Number(distribution.SOURCE_DATE_EPOCH));
assert.equal(manifest.features.webfont, 'external-project-asset');
assert.equal(manifest.features.domText, true);
assert.equal(manifest.features.threeD, false);
assert.deepEqual(manifest.options, options);
assert.ok(options.includes('yweb_text_dom=yes'));
assert.ok(options.includes('threads=no'));
assert.ok(options.includes('dlink_enabled=no'));
assert.ok(options.includes('disable_3d=yes'));

assert.match(dockerfile, new RegExp(distribution.BUILDER_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(dockerfile, new RegExp(`SCONS_VERSION=${distribution.SCONS_VERSION.replaceAll('.', '\\.')}`));
assert.match(distributionScript, /--platform "\$BUILDER_PLATFORM"/);
assert.match(distributionScript, /tests\/template_distribution\.cjs/);

assert.equal(manifest.inputs.sourceLockSha256, sha(path.join(build, 'source.lock')));
assert.equal(manifest.inputs.distributionLockSha256, sha(path.join(build, 'distribution.lock')));
assert.equal(manifest.inputs.templateOptionsSha256, sha(path.join(build, 'template.options')));
assert.equal(manifest.inputs.patchSha256, sha(path.join(build, 'patches/web_yweb_text.patch')));
assert.equal(manifest.inputs.overlaySha256, treeHash(path.join(build, 'overlay')));
assert.equal(manifest.inputs.buildSha256, filesHash([
	'distribution/Dockerfile', 'build_distribution.sh', 'prepare_template.sh',
	'build_template.sh', 'apply_overlay.sh', 'package_template.cjs', 'compress_web.cjs',
].map((file) => path.join(build, file))));

assert.equal(fs.readdirSync(templateDir).filter((name) => name.endsWith('.zip')).length, 1, 'テンプレートZIPが複数');
assert.equal(manifest.template.sha256, sha(template));
assert.equal(manifest.template.bytes, fs.statSync(template).size);
const names = child.execFileSync('unzip', ['-Z1', template], { encoding: 'utf8' }).trim().split('\n');
assert.deepEqual(names, manifest.template.entries.map((entry) => entry.file));
assert.equal(names.includes('godot.font.woff2'), false);
assert.equal(names.includes('FONT_LICENSE.txt'), false);
for (const entry of manifest.template.entries) {
	const data = child.execFileSync('unzip', ['-p', template, entry.file], buffer);
	assert.equal(data.length, entry.bytes, `entry容量不一致: ${entry.file}`);
	assert.equal(sha(data), entry.sha256, `entry hash不一致: ${entry.file}`);
}
for (const item of manifest.brotli.entries) {
	const raw = child.execFileSync('unzip', ['-p', template, item.file], buffer);
	const encoded = child.execFileSync('unzip', ['-p', template, `${item.file}.br`], buffer);
	assert.deepEqual(zlib.brotliDecompressSync(encoded), raw, `Brotli不一致: ${item.file}`);
}
const notice = ['GODOT-MIT.txt', 'GODOT-COPYRIGHT.txt'].map((file) => fs.readFileSync(path.join(root, 'LICENSES', file), 'utf8').replace(/\n*$/, '\n')).join('\n');
assert.equal(child.execFileSync('unzip', ['-p', template, 'GODOT_LICENSE.txt'], { ...buffer, encoding: 'utf8' }), notice);

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const result = { ok: true, godot: manifest.godot.version, profile: manifest.profile, inputs: Object.keys(manifest.inputs).length, entries: names.length, brotli: manifest.brotli.entries.length, template: manifest.template.sha256 };
fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
