#!/usr/bin/env node
// レベル別テンプレートのコンパイル入力を短い識別値へまとめる。
// 共通入力と選んだレベルの設定を分け、無関係なレベルの変更で再ビルドしない設計。

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // ビルド入力を相対化する基準。
const common = [
	'build/source.lock', 'build/template.options',
	'build/patches/web_yweb_text.patch',
	'build/apply_overlay.sh',
]; // 全レベルのコンパイルへ影響する設定と差分。
const packing = [
	'build/distribution.lock', 'build/package_template.cjs', 'build/compress_web.cjs', 'build/manifest_hash.cjs',
	'LICENSES/GODOT-MIT.txt', 'LICENSES/GODOT-COPYRIGHT.txt',
]; // ZIP、圧縮、manifest、通知へ影響する入力。
const levelsFile = path.join(repo, 'build/levels.options'); // レベル固有のSCons設定。
const distributionFile = path.join(repo, 'build/distribution.lock'); // コンパイラを動かすSConsの固定版。
const dockerfile = path.join(repo, 'build/distribution/Dockerfile'); // 配布builderの定義。
const overlay = path.join(repo, 'build/overlay'); // Godotへ重ねる追加source。

// ディレクトリ以下のfileを安定した順番で返す。
function files(root) {
	const found = [];
	function visit(dir) {
		for (const name of fs.readdirSync(dir).sort()) {
			const file = path.join(dir, name);
			if (fs.statSync(file).isDirectory()) visit(file);
			else found.push(file);
		}
	}
	visit(root);
	return found;
}

// 指定レベルの設定行を返し、未知の値を早めに止める。
function levelLine(level) {
	const line = fs.readFileSync(levelsFile, 'utf8').split(/\r?\n/)
		.map((text) => text.trim())
		.find((text) => text && !text.startsWith('#') && text.split(/\s+/)[0] === level);
	assert.ok(line, `書き出しlevelが不正: ${level}`);
	return line;
}

// Docker imageへ実際に効く定義を識別値へまとめる。
function imageKey() {
	const lock = fs.readFileSync(distributionFile, 'utf8');
	const sum = crypto.createHash('sha256').update(fs.readFileSync(dockerfile));
	for (const name of ['BUILDER_PLATFORM', 'SCONS_VERSION', 'UV_VERSION']) {
		const value = new RegExp(`^${name}=(.+)$`, 'm').exec(lock);
		assert.ok(value, `${name}なし`);
		sum.update(`${name}=${value[1]}\n`);
	}
	return sum.digest('hex');
}

// 選んだレベルの完成済みコンパイルを再利用する識別値を返す。
function compileKey(level, environment = imageKey()) {
	const sum = crypto.createHash('sha256');
	for (const file of [...common.map((name) => path.join(repo, name)), ...files(overlay)]) {
		sum.update(path.relative(repo, file).split(path.sep).join('/'));
		sum.update('\0');
		sum.update(fs.readFileSync(file));
		sum.update('\0');
	}
	sum.update(environment);
	sum.update(levelLine(level));
	return sum.digest('hex');
}

// コンパイル後の配布ZIPまで含むレベル別の識別値を返す。
function artifactKey(level, environment = imageKey()) {
	const sum = crypto.createHash('sha256');
	sum.update(compileKey(level, environment));
	for (const name of packing) {
		sum.update(name);
		sum.update('\0');
		sum.update(fs.readFileSync(path.join(repo, name)));
		sum.update('\0');
	}
	return sum.digest('hex');
}

if (require.main === module) {
	let value;
	if (process.argv[2] === '--image') value = imageKey();
	else if (process.argv[2] === '--artifact') value = artifactKey(process.argv[3] || '', process.argv[4] || undefined);
	else value = compileKey(process.argv[2] || '', process.argv[3] || undefined);
	process.stdout.write(`${value}\n`);
}

module.exports = { artifactKey, compileKey, imageKey, levelLine };
