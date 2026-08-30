// 配布テンプレートのGodot版、toolchain、build option、ZIP内容を一括検査する。
// addon manifestを正本とし、version更新時の入力漏れと成果物混在を防ぐ。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sha, lock, treeHash, filesHash, BUILD_FILES } = require('../build/manifest_hash.cjs');
const { artifactKey, compileKey, levelLine } = require('../build/template_key.cjs');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..'); // yweb project root。
const build = path.join(root, 'build'); // 配布build定義。
const templateDir = path.join(root, 'addons/yurutto_website_exporter/templates'); // addon内テンプレート。
const manifest = JSON.parse(fs.readFileSync(path.join(templateDir, 'manifest.json'))); // 配布物の由来正本。
const requested = process.argv.slice(2); // 指定時に検査する書き出しlevel。
for (const level of requested) levelLine(level);
const allLevels = Object.entries(manifest.templates); // addonが持つ全level。
const levels = allLevels.filter(([level]) => requested.length === 0 || requested.includes(level)); // 今回の検査対象ZIP。
const work = path.join(root, 'tmp/template-distribution'); // 検査結果保存先。
const buffer = { maxBuffer: 32 * 1024 * 1024 }; // WASM展開に必要な上限。

const source = lock(path.join(build, 'source.lock'));
const distribution = lock(path.join(build, 'distribution.lock'));
const options = fs.readFileSync(path.join(build, 'template.options'), 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
const dockerfile = fs.readFileSync(path.join(build, 'distribution/Dockerfile'), 'utf8');
const distributionScript = fs.readFileSync(path.join(build, 'build_distribution.sh'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/template.yml'), 'utf8');
const browserLock = fs.readFileSync(path.join(root, 'tests/browser/package-lock.json'), 'utf8');

// Godot版とtoolchainが、lockの固定値どおりmanifestへ入っているかを見る。
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
assert.ok(options.includes('yweb_text_dom=yes'));
assert.ok(options.includes('threads=no'));
assert.ok(options.includes('dlink_enabled=no'));

assert.match(dockerfile, new RegExp(distribution.BUILDER_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(dockerfile, new RegExp(`SCONS_VERSION=${distribution.SCONS_VERSION.replaceAll('.', '\\.')}`));
assert.match(dockerfile, new RegExp(`UV_VERSION=${distribution.UV_VERSION.replaceAll('.', '\\.')}`));
assert.match(dockerfile, new RegExp(`UV_SHA256=${distribution.UV_SHA256}`));
assert.match(dockerfile, new RegExp(`SCONS_SHA256=${distribution.SCONS_SHA256}`));
assert.match(dockerfile, /sha256sum -c -/);
assert.equal(dockerfile.includes('python3 -m pip'), false, 'Python道具の導入がuv以外');
assert.equal(dockerfile.includes('curl |'), false, '取得物を検証せず実行している');
assert.match(distributionScript, /--platform "\$BUILDER_PLATFORM"/);
assert.match(distributionScript, /--build-arg "UV_SHA256=\$UV_SHA256"/);
assert.match(distributionScript, /--build-arg "SCONS_SHA256=\$SCONS_SHA256"/);
assert.match(distributionScript, /tests\/template_distribution\.cjs/);
// Release候補を外部Browser取得前に確定し、無権限jobの合格後にmainから公開する。
assert.doesNotMatch(workflow.split('\n  test:')[0], /playwright|npm ci/, '候補確定前にBrowserを実行している');
assert.match(workflow, /cp tests\/browser\/package\.json tests\/browser\/package-lock\.json tmp\/playwright\//);
assert.match(workflow, /npm ci --prefix tmp\/playwright --ignore-scripts/);
assert.match(browserLock, /"integrity": "sha512-/);
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(workflow, /environment: production/);
assert.match(workflow, /needs: \[template, test\]/);
assert.ok(levels.length > 0, '検査するtemplateがない');

// build入力fileの内容が、manifestへ記録したhashと一致するかを見る。
assert.equal(manifest.inputs.sourceLockSha256, sha(path.join(build, 'source.lock')));
assert.equal(manifest.inputs.distributionLockSha256, sha(path.join(build, 'distribution.lock')));
assert.equal(manifest.inputs.templateOptionsSha256, sha(path.join(build, 'template.options')));
assert.equal(manifest.inputs.levelsOptionsSha256, sha(path.join(build, 'levels.options')));
assert.equal(manifest.inputs.patchSha256, sha(path.join(build, 'patches/web_yweb_text.patch')));
assert.equal(manifest.inputs.overlaySha256, treeHash(path.join(build, 'overlay')));
assert.equal(manifest.inputs.buildSha256, filesHash(BUILD_FILES.map((file) => path.join(root, file))));

assert.equal(fs.readdirSync(templateDir).filter((name) => name.endsWith('.zip')).length, allLevels.length, `テンプレートZIP数がlevel数と違う`);
const notice = ['GODOT-MIT.txt', 'GODOT-COPYRIGHT.txt'].map((file) => fs.readFileSync(path.join(root, 'LICENSES', file), 'utf8').replace(/\n*$/, '\n')).join('\n');
const counts = {}; // level別のentry数。

// level別に、ZIPの中身がmanifestの記録と一致することを見る。
for (const [level, item] of levels) {
	const template = path.join(templateDir, item.file);
	assert.equal(item.brotli.quality, Number(distribution.BROTLI_QUALITY), `Brotli品質が古い: ${level}`);
	assert.equal(item.compileKey, compileKey(level), `compile入力が古い: ${level}`);
	assert.equal(item.artifactKey, artifactKey(level), `配布入力が古い: ${level}`);
	assert.equal(item.sha256, sha(template), `template hash不一致: ${level}`);
	assert.equal(item.bytes, fs.statSync(template).size, `template容量不一致: ${level}`);
	const names = child.execFileSync('unzip', ['-Z1', template], { encoding: 'utf8' }).trim().split('\n');
	assert.deepEqual(names, item.entries.map((entry) => entry.file), `entry構成不一致: ${level}`);
	assert.equal(names.includes('godot.font.woff2'), false, `font混入: ${level}`);
	assert.equal(names.includes('FONT_LICENSE.txt'), false, `font通知混入: ${level}`);
	for (const entry of item.entries) {
		const data = child.execFileSync('unzip', ['-p', template, entry.file], buffer);
		assert.equal(data.length, entry.bytes, `entry容量不一致: ${level} ${entry.file}`);
		assert.equal(sha(data), entry.sha256, `entry hash不一致: ${level} ${entry.file}`);
	}
	for (const brotli of item.brotli.entries) {
		const raw = child.execFileSync('unzip', ['-p', template, brotli.file], buffer);
		const encoded = child.execFileSync('unzip', ['-p', template, `${brotli.file}.br`], buffer);
		assert.deepEqual(zlib.brotliDecompressSync(encoded), raw, `Brotli不一致: ${level} ${brotli.file}`);
	}
	assert.equal(child.execFileSync('unzip', ['-p', template, 'GODOT_LICENSE.txt'], { ...buffer, encoding: 'utf8' }), notice, `license不一致: ${level}`);
	counts[level] = names.length;
}

// levelごとの機能境界が、選んだbuild optionと合っていることを見る。
for (const [level, item] of levels) {
	assert.equal(item.features.canvas, level !== 'dom', `canvas境界が不正: ${level}`);
	assert.equal(item.features.threeD, level !== '2d', `3D境界が不正: ${level}`);
	assert.equal(item.options.opengl3, level === 'dom' ? 'no' : 'yes', `描画option不一致: ${level}`);
}

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const result = { ok: true, godot: manifest.godot.version, profile: manifest.profile, inputs: Object.keys(manifest.inputs).length, levels: Object.fromEntries(levels.map(([level, item]) => [level, { bytes: item.bytes, entries: counts[level] }])) };
fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
