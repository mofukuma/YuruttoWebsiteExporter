// Web書き出しのBrotli生成、配信選択、公開header gateを一括検査する。
// 圧縮fileが存在するだけの未設定配信を成功扱いしない。

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const util = require('node:util');
const { createServer } = require('../build/serve_web.cjs');

const execFile = util.promisify(childProcess.execFile); // 公開gateを別processで実行する入口。
const root = path.resolve(__dirname, '..'); // gdweb project root。
const out = path.join(root, 'tmp/compression'); // 圧縮検査専用出力。

// 再現可能な成果物を圧縮し、同じURLからBrotli応答されることを確認する。
(async () => {
	fs.rmSync(out, { recursive: true, force: true });
	fs.mkdirSync(out, { recursive: true });
	fs.writeFileSync(path.join(out, 'index.html'), '<canvas></canvas>');
	fs.writeFileSync(path.join(out, 'index.js'), 'const value = "gdweb";\n'.repeat(1000));
	fs.writeFileSync(path.join(out, 'index.wasm'), Buffer.alloc(1024 * 1024, 7));
	childProcess.execFileSync(process.execPath, [path.join(root, 'build/compress_web.cjs'), out]);

	const manifest = JSON.parse(fs.readFileSync(path.join(out, 'gdweb-compression.json')));
	assert.equal(manifest.encoding, 'br');
	assert.equal(manifest.entries.length, 2);
	assert.ok(manifest.entries.every((entry) => entry.brotliBytes < entry.originalBytes));

	const server = createServer(out);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
		const url = `http://127.0.0.1:${server.address().port}/index.wasm`;
		const response = await fetch(url, { method: 'HEAD', headers: { 'Accept-Encoding': 'br' } });
		assert.equal(response.headers.get('content-encoding'), 'br');
		assert.equal(response.headers.get('content-type'), 'application/wasm');
		assert.equal(response.headers.get('vary'), 'Accept-Encoding');
		const gate = await execFile(process.execPath, [path.join(root, 'build/verify_web_compression.cjs'), url]);
		assert.equal(JSON.parse(gate.stdout).ok, true);
		const plain = http.createServer((request, response) => response.writeHead(200, { 'Content-Type': 'application/wasm' }).end('plain'));
		await new Promise((resolve) => plain.listen(0, '127.0.0.1', resolve));
		try {
			const plainUrl = `http://127.0.0.1:${plain.address().port}/index.wasm`;
			await assert.rejects(execFile(process.execPath, [path.join(root, 'build/verify_web_compression.cjs'), plainUrl]), /Brotli/);
		} finally {
			plain.close();
		}
		const gzip = http.createServer((request, response) => response.writeHead(200, { 'Content-Type': 'application/wasm', 'Content-Encoding': 'gzip' }).end());
		await new Promise((resolve) => gzip.listen(0, '127.0.0.1', resolve));
		try {
			const gzipUrl = `http://127.0.0.1:${gzip.address().port}/index.wasm`;
			await assert.rejects(execFile(process.execPath, [path.join(root, 'build/verify_web_compression.cjs'), gzipUrl]), /Brotli/);
		} finally {
			gzip.close();
		}
		fs.writeFileSync(path.join(out, 'result.json'), `${JSON.stringify({ ok: true, manifest, headers: true, gate: true, rejectsPlain: true, rejectsGzip: true }, null, 2)}\n`);
		console.log(JSON.stringify({ ok: true, entries: manifest.entries.length }));
	} finally {
		server.close();
	}
})().catch((error) => {
	console.error(error.stack || error);
	process.exitCode = 1;
});
