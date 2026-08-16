// Godot Web成果物へ配信用Brotliを決定的に生成する。
// 圧縮効果の高いWASMとJavaScriptだけを対象にし、配信検査用manifestを残す。

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const extensions = new Set(['.wasm', '.js']); // Brotliで転送量が減る必須形式。

// 配信manifestへ使う内容hashを返す。
function hash(data) {
	return crypto.createHash('sha256').update(data).digest('hex');
}

// 子directoryを含む圧縮対象fileを安定順で列挙する。
function files(root, current = root) {
	const found = [];
	for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
		const file = path.join(current, entry.name);
		if (entry.isDirectory()) found.push(...files(root, file));
		else if (extensions.has(path.extname(entry.name)) && !entry.name.endsWith('.br')) found.push(file);
	}
	return found.sort();
}

// 一つの成果物をBrowser標準Brotliへ圧縮する。
function compress(file, site, quality) {
	const raw = fs.readFileSync(file);
	const encoded = zlib.brotliCompressSync(raw, {
		params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality },
	});
	assert.ok(encoded.length < raw.length, `Brotliで縮まない成果物: ${path.relative(site, file)}`);
	fs.writeFileSync(`${file}.br`, encoded);
	return {
		file: path.relative(site, file),
		originalBytes: raw.length,
		brotliBytes: encoded.length,
		ratio: Number((encoded.length / raw.length).toFixed(4)),
		sha256: hash(raw),
		brotliSha256: hash(encoded),
	};
}

// 一directoryの必須形式を圧縮し、配信manifestを返す。
function compressSite(target, quality = 6) {
	const site = path.resolve(target);
	const entries = files(site).map((file) => compress(file, site, quality));
	assert.ok(entries.some((entry) => entry.file.endsWith('.wasm')), 'WebAssembly成果物なし');
	assert.ok(entries.some((entry) => entry.file.endsWith('.js')), 'JavaScript成果物なし');
	const manifest = { encoding: 'br', quality, entries };
	fs.writeFileSync(path.join(site, 'yweb-compression.json'), `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

// CLI利用時だけ指定directoryを圧縮する。
if (require.main === module) {
	const site = path.resolve(process.argv[2] || '.');
	const quality = Number(process.env.YWEB_BROTLI_QUALITY || 6);
	console.log(JSON.stringify(compressSite(site, quality)));
}

module.exports = { compressSite };
