// 旧full-dom、標準Web、最小文字DOMの初期表示と配布量を同条件で比較する。
// 一つのBrowser内でcold contextを分け、cache差を混ぜずに起動完了まで測る。
// 設計思想：最小版の速度を単独値で判断せず、保存済み二方式との差で確認する。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');

const base = path.resolve(__dirname, '..'); // 比較成果物を含むproject root。
const output = path.join(base, 'tmp/minimum/compare.json'); // 比較結果の保存先。
const browserPath = '/Users/k/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium'; // 固定Chromium。
const targets = {
	fullDom: path.join(base, 'tmp/daito-site/out'),
	standard: path.join(base, 'tmp/daito-site/full-out'),
	minimum: path.join(base, 'tmp/minimum/site'),
}; // 同じ作品の三方式。
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.woff2': 'font/woff2' }; // 配信に必要な応答型。

// route先の成果物だけを公開する比較用配信。
const server = http.createServer((request, response) => {
	const [, key, ...parts] = request.url.split('/');
	const root = targets[key];
	const name = parts.join('/').split('?')[0] || 'index.html';
	const file = root && path.resolve(root, name);
	if (!file || !file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
		response.writeHead(404).end();
		return;
	}
	response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
	fs.createReadStream(file).pipe(response);
});

// 主配布物のraw量とgzip量を合計する。
function sizes(root) {
	const names = fs.readdirSync(root).filter((name) => /\.(html|js|wasm|pck|woff2)$/.test(name));
	return names.reduce((sum, name) => {
		const data = fs.readFileSync(path.join(root, name));
		sum.raw += data.length;
		sum.gzip += zlib.gzipSync(data, { level: 9 }).length;
		return sum;
	}, { raw: 0, gzip: 0 });
}

// 即時HTMLとGodot起動完了を別々に測る。
async function measure(browser, key, port) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	page.setDefaultTimeout(12000);
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const started = Date.now();
	await page.goto(`http://127.0.0.1:${port}/${key}/index.html`, { waitUntil: 'domcontentloaded' });
	const previewMs = Date.now() - started;
	assert.equal(await page.locator('#site-preview').isVisible(), true, `${key}: 即時表示なし`);
	assert.equal(await page.locator('#status').isVisible(), false, `${key}: loader表示`);
	await page.locator('#site-preview').waitFor({ state: 'detached' });
	const readyMs = Date.now() - started;
	await context.close();
	assert.deepEqual(errors, [], `${key}: ${errors.join(' | ')}`);
	return { previewMs, readyMs };
}

// 奇数個の実測から中央の値を返す。
function median(values) {
	return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

// 三方式を一括測定し、最低限の起動時間上限を固定する。
(async () => {
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	try {
		const result = Object.fromEntries(Object.entries(targets).map(([key, root]) => [key, { samples: [], ...sizes(root) }]));
		const orders = [
			['fullDom', 'standard', 'minimum'],
			['standard', 'minimum', 'fullDom'],
			['minimum', 'fullDom', 'standard'],
		]; // cache順序の偏りを相殺する三巡順。
		for (const order of orders) {
			for (const key of order) result[key].samples.push(await measure(browser, key, server.address().port));
		}
		for (const item of Object.values(result)) {
			item.previewMs = median(item.samples.map((sample) => sample.previewMs));
			item.readyMs = median(item.samples.map((sample) => sample.readyMs));
		}
		assert.ok(result.minimum.previewMs < 2000, `minimum即時表示: ${result.minimum.previewMs} ms`);
		assert.ok(result.minimum.readyMs < 7000, `minimum実画面: ${result.minimum.readyMs} ms`);
		assert.ok(result.minimum.raw < result.standard.raw, `minimum容量: ${result.minimum.raw} >= ${result.standard.raw}`);
		fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
		console.log(JSON.stringify(result));
	} finally {
		await browser.close();
		server.close();
	}
})().catch((error) => {
	console.error(error.stack || error);
	server.close();
	process.exitCode = 1;
});
