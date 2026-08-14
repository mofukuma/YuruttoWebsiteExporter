// gdwebと本家full Webの配布物をraw、gzip-9、Brotli-q11で比較する。
// 各分類の合計を全体と照合し、未分類byteを残さない。

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..'); // project root。
const dirs = { gdweb: path.join(root, 'tmp/gdweb/smoke-export'), full: path.join(root, 'tmp/gdweb/full-export') }; // 配布物root。
const output = path.join(root, 'tmp/gdweb/metrics/sizes.json'); // hash付き測定cache兼結果。
const previous = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {}; // 同一fileの再圧縮を省く値。

// C実装のBrotli q11をstream計数し、大容量Wasmを並列圧縮する。
function brotli(file) {
	return new Promise((resolve, reject) => {
		const child = spawn('/opt/homebrew/bin/brotli', ['-q', '11', '-c', file], { stdio: ['ignore', 'pipe', 'pipe'] });
		let bytes = 0;
		let error = '';
		child.stdout.on('data', (chunk) => { bytes += chunk.length; });
		child.stderr.on('data', (chunk) => { error += chunk; });
		child.on('close', (code) => code === 0 ? resolve(bytes) : reject(new Error(error || `brotli code=${code}`)));
	});
}

// 一つのfileを決定的圧縮し三容量を返す。
async function sizes(file, cached) {
	const data = fs.readFileSync(file);
	const sha256 = crypto.createHash('sha256').update(data).digest('hex');
	if (cached?.sha256 === sha256) return cached;
	return {
		sha256,
		raw: data.length,
		gzip: zlib.gzipSync(data, { level: 9, mtime: 0 }).length,
		brotli: await brotli(file),
	};
}

// 実際に配信する全fileを拡張子分類へ集約する。
async function measure(dir, cached = {}) {
	const names = fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile());
	const files = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await sizes(path.join(dir, name), cached.files?.[name])])));
	const totals = Object.fromEntries(['raw', 'gzip', 'brotli'].map((key) => [key, Object.values(files).reduce((sum, item) => sum + item[key], 0)]));
	const groups = {};
	for (const [name, value] of Object.entries(files)) {
		const group = name.endsWith('.wasm') ? 'wasm' : name.endsWith('.pck') ? (name === 'delayed.pck' ? 'delayed_pck' : 'initial_pck') : name.endsWith('.woff2') ? 'font' : name.includes('worklet') ? 'worklet' : name.endsWith('.js') ? 'javascript' : name.endsWith('.html') ? 'html' : 'image';
		groups[group] ||= { raw: 0, gzip: 0, brotli: 0 };
		for (const key of ['raw', 'gzip', 'brotli']) groups[group][key] += value[key];
	}
	for (const key of ['raw', 'gzip', 'brotli']) assert.equal(Object.values(groups).reduce((sum, group) => sum + group[key], 0), totals[key], `${key}分類合計が一致しない`);
	return { files, groups, totals };
}

(async () => {
	const [gdweb, full] = await Promise.all([measure(dirs.gdweb, previous.gdweb), measure(dirs.full, previous.full)]);
	const result = { ok: true, gdweb, full };
	result.reduction = Object.fromEntries(['raw', 'gzip', 'brotli'].map((key) => [key, 1 - result.gdweb.totals[key] / result.full.totals[key]]));
	fs.mkdirSync(path.dirname(output), { recursive: true });
	fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
	console.log(JSON.stringify({ ok: true, gdweb: result.gdweb.totals, full: result.full.totals, reduction: result.reduction }));
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
