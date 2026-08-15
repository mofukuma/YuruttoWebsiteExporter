// 公開WebAssemblyが圧縮header付きで配信されることを検査する。
// exporterの圧縮file生成だけで配布完了と誤判定しないための公開gate。

const assert = require('node:assert/strict');

const url = process.argv[2]; // 公開済み`.wasm`のURL。
assert.ok(url, 'WebAssembly URL required');

// header受信時点で配信設定を判定し、大容量bodyの読込を止める。
(async () => {
	const response = await fetch(url, { headers: { 'Accept-Encoding': 'br, gzip' } });
	const encoding = response.headers.get('content-encoding');
	const type = response.headers.get('content-type');
	await response.body?.cancel();
	assert.equal(response.status, 200, `HTTP status: ${response.status}`);
	assert.equal(encoding, 'br', `Brotli配信なし: ${encoding}`);
	assert.match(type || '', /^application\/wasm(?:;|$)/, `Content-Type不正: ${type}`);
	console.log(JSON.stringify({ ok: true, url, encoding, type }));
})().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
