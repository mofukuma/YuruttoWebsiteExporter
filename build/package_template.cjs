#!/usr/bin/env node
// Godot Web buildを決定的なaddon templateと由来manifestへ変換する。
// raw、Brotli、license、toolchain、全入力hashを一つの配布境界で固定する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { compressSite } = require('./compress_web.cjs');

const repo = path.resolve(__dirname, '..'); // 配布定義を持つproject root。
const archive = path.resolve(process.argv[2] || ''); // Godotが生成したWeb template。
const out = path.resolve(process.argv[3] || path.join(repo, 'tmp/minimum/template-proof')); // 展開確認先。
const level = process.argv[4] || '2d'; // 書き出しlevel。dom、2d、3dのいずれか。
const addon = path.join(repo, 'addons/yurutto_website_exporter/templates'); // addon配布物の配置先。
const template = path.join(addon, `yweb-${level}.zip`); // このlevelのエクスポートテンプレート。
const manifestFile = path.join(addon, 'manifest.json'); // versionと由来の正本。
const rawEntries = ['godot.js', 'godot.wasm', 'godot.audio.worklet.js', 'godot.audio.position.worklet.js', 'godot.html']; // Godot Web起動物。
const compressedEntries = rawEntries.filter((name) => name.endsWith('.js') || name.endsWith('.wasm')); // Brotliを持つ転送対象。
const licenseEntries = ['GODOT_LICENSE.txt']; // Godot本体と組込依存の通知を一つへまとめた成果物。
const licenseSources = ['LICENSES/GODOT-MIT.txt', 'LICENSES/GODOT-COPYRIGHT.txt']; // 通知の追跡元。

// fileまたはBufferのSHA-256を返す。
function sha(value) {
	const data = Buffer.isBuffer(value) ? value : fs.readFileSync(value);
	return crypto.createHash('sha256').update(data).digest('hex');
}

// shell形式lockの単純な固定値だけを読む。
function lock(file) {
	const values = {};
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const match = /^([A-Z][A-Z0-9_]*)=(.+)$/.exec(line.trim());
		if (match) values[match[1]] = match[2];
	}
	return values;
}

// directoryの相対pathと内容を安定順で一つのhashへまとめる。
function treeHash(root) {
	const files = [];
	function visit(current) {
		for (const name of fs.readdirSync(current).sort()) {
			const file = path.join(current, name);
			if (fs.statSync(file).isDirectory()) visit(file);
			else files.push(file);
		}
	}
	visit(root);
	const sum = crypto.createHash('sha256');
	for (const file of files) {
		sum.update(path.relative(root, file).split(path.sep).join('/'));
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
		sum.update(path.relative(repo, file).split(path.sep).join('/'));
		sum.update('\0');
		sum.update(fs.readFileSync(file));
		sum.update('\0');
	}
	return sum.digest('hex');
}

// コメントを除いたSCons optionを順序どおり返す。
function options(file) {
	return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

// 配布ZIPへ入る一fileの検査値を返す。
function entry(stage, name) {
	const file = path.join(stage, name);
	return { file: name, bytes: fs.statSync(file).size, sha256: sha(file) };
}

// levels.optionsから、このlevelだけの追加optionを読む。
function levelOptions() {
	const line = fs.readFileSync(path.join(repo, 'build/levels.options'), 'utf8')
		.split(/\r?\n/).map((text) => text.trim())
		.find((text) => text && !text.startsWith('#') && text.split(/\s+/)[0] === level);
	assert.ok(line, `levels.optionsに定義なし: ${level}`);
	return Object.fromEntries(line.split(/\s+/).slice(1).map((pair) => pair.split('=')));
}

// 固定mtimeとentry順で配布templateを生成する。
function pack() {
	assert.ok(fs.existsSync(archive), `Godot Web templateなし: ${archive}`);
	const source = lock(path.join(repo, 'build/source.lock'));
	const distribution = lock(path.join(repo, 'build/distribution.lock'));
	const profile = { ...options(path.join(repo, 'build/template.options')), ...levelOptions() };
	const epoch = Number(process.env.SOURCE_DATE_EPOCH || distribution.SOURCE_DATE_EPOCH);
	const quality = Number(distribution.BROTLI_QUALITY);
	assert.ok(Number.isSafeInteger(epoch) && epoch > 0, '再現timestampが不正');
	assert.ok(Number.isInteger(quality) && quality > 0, 'Brotli品質が不正');
	fs.mkdirSync(out, { recursive: true });
	fs.mkdirSync(addon, { recursive: true });
	const stage = fs.mkdtempSync(path.join(out, 'template-package.'));
	try {
		child.execFileSync('unzip', ['-oq', archive, ...rawEntries, '-d', stage]);
		const notice = licenseSources.map((file) => fs.readFileSync(path.join(repo, file), 'utf8').replace(/\n*$/, '\n')).join('\n');
		fs.writeFileSync(path.join(stage, licenseEntries[0]), notice);
		const brotli = compressSite(stage, quality);
		const packed = [...rawEntries, ...licenseEntries, ...compressedEntries.map((name) => `${name}.br`)];
		for (const name of [...packed, 'yweb-compression.json']) fs.utimesSync(path.join(stage, name), epoch, epoch);
		const built = path.join(out, `yweb-${level}-template.zip`);
		fs.rmSync(built, { force: true });
		child.execFileSync('zip', ['-X', '-q', '-9', built, ...packed], { cwd: stage });
		for (const name of [...packed, 'yweb-compression.json']) fs.copyFileSync(path.join(stage, name), path.join(out, name));
		for (const name of ['godot.font.woff2', 'FONT_LICENSE.txt']) fs.rmSync(path.join(out, name), { force: true });
		fs.copyFileSync(built, template);
		const previous = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
		const manifest = {
			schema: 1,
			profile: distribution.TEMPLATE_PROFILE,
			godot: {
				version: source.GODOT_VERSION,
				commit: source.GODOT_COMMIT,
				archiveSha256: source.GODOT_ARCHIVE_SHA256,
			},
			toolchain: {
				platform: distribution.BUILDER_PLATFORM,
				image: distribution.BUILDER_IMAGE,
				node: distribution.NODE_VERSION,
				scons: distribution.SCONS_VERSION,
				emscripten: source.EMSDK_VERSION,
				emscriptenCommit: source.EMSDK_COMMIT,
				emscriptenRelease: source.EMSCRIPTEN_RELEASE,
				sourceDateEpoch: epoch,
			},
			inputs: {
				sourceLockSha256: sha(path.join(repo, 'build/source.lock')),
				distributionLockSha256: sha(path.join(repo, 'build/distribution.lock')),
				templateOptionsSha256: sha(path.join(repo, 'build/template.options')),
				levelsOptionsSha256: sha(path.join(repo, 'build/levels.options')),
				patchSha256: sha(path.join(repo, 'build/patches/web_yweb_text.patch')),
				overlaySha256: treeHash(path.join(repo, 'build/overlay')),
				buildSha256: filesHash([
					'build/distribution/Dockerfile', 'build/build_distribution.sh',
					'build/prepare_template.sh', 'build/build_template.sh',
					'build/apply_overlay.sh', 'build/package_template.cjs',
					'build/compress_web.cjs',
				].map((file) => path.join(repo, file))),
			},
			templates: {
				...previous.templates,
				[level]: {
					file: path.basename(template), bytes: fs.statSync(template).size,
					sha256: sha(template), entries: packed.map((name) => entry(stage, name)),
					features: {
						domText: true, threads: false, gdextension: false,
						canvas: level !== 'dom', threeD: level === '3d',
						webfont: 'external-project-asset',
					},
					options: profile,
					brotli,
				},
			},
		};
		fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
		return manifest;
	} finally {
		fs.rmSync(stage, { recursive: true, force: true });
	}
}

const result = pack();
const made = result.templates[level];
console.log(JSON.stringify({ level, godot: result.godot.version, template: made.sha256, entries: made.entries.length }));
