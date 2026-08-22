// 配布物の由来hashを、buildと検査で同じ計算式から出す。
// 式もfile一覧も二重に書くと片方だけ更新されて検査が無言で通るため、ここを正本にする。

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // hashへ入れるpathを相対化する基準。
const BUILD_FILES = [
	'build/distribution/Dockerfile', 'build/build_distribution.sh',
	'build/prepare_template.sh', 'build/build_template.sh',
	'build/apply_overlay.sh', 'build/package_template.cjs',
	'build/compress_web.cjs', 'build/template_key.cjs',
]; // buildSha256の対象。

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

module.exports = { sha, lock, treeHash, filesHash, BUILD_FILES, repo };
