// gdwebと本家full Webを同じChromium、同じHTTP条件で各7組測定する。
// cold pageを保持した同一sessionの別pageで、warm cacheの初期表示と実通信量を記録する。

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');

const root = path.resolve(__dirname, '..'); // project root。
const roots = { gdweb: path.join(root, 'tmp/gdweb/smoke-export'), full: path.join(root, 'tmp/gdweb/full-export') }; // 比較対象。
const browserPath = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium'); // 固定Chromium。
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.woff2': 'font/woff2', '.png': 'image/png' }; // 配信形式。
const served = { requests: 0, bytes: 0, active: 0 }; // Browserが実際にHTTP取得した量。

// 比較root外へ出ない固定HTTP配信。
const server = http.createServer((request, response) => {
	const match = request.url.match(/^\/(gdweb|full)\/(.*)$/);
	if (!match) return response.writeHead(404).end();
	const name = match[2] || 'index.html';
	const file = path.resolve(roots[match[1]], name);
	if (!file.startsWith(`${roots[match[1]]}${path.sep}`) || !fs.existsSync(file)) return response.writeHead(404).end();
	served.requests++;
	served.bytes += fs.statSync(file).size;
	served.active++;
	let complete = false;
	const finish = () => { if (!complete) served.active--; complete = true; };
	response.once('finish', finish);
	response.once('close', finish);
	response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=3600, immutable' });
	fs.createReadStream(file).pipe(response);
});

// 遅れて開始するworkletを含め、HTTP応答0件が100ms続くまで待つ。
async function settle() {
	const deadline = Date.now() + 500;
	let quiet = Date.now();
	while (Date.now() < deadline) {
		if (served.active && Date.now() >= quiet) quiet = Date.now();
		if (!served.active && Date.now() - quiet >= 100) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`HTTP応答が安定しない: active=${served.active}`);
}

// 一回の画面初期化をBrowser内時刻とResource Timingで測る。
async function load(page, url, kind) {
	const before = { ...served };
	await page.addInitScript(() => {
		// 本家full Webだけ、最初のWebGL描画命令を比較用時刻として観測する。
		const getContext = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (type, ...args) {
			const context = getContext.call(this, type, ...args);
			if (!/^webgl/.test(type) || !context || context.gdwebMeasured) return context;
			context.gdwebMeasured = true;
			for (const name of ['drawArrays', 'drawElements']) {
				const draw = context[name];
				context[name] = function (...values) {
					window.gdwebFullFirstCanvasMs ??= performance.now();
					return draw.apply(this, values);
				};
			}
			return context;
		};
	});
	await page.bringToFront();
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForFunction(() => document.getElementById('status') === null, null, { timeout: 10000 });
	const result = await page.evaluate(() => {
		const paints = performance.getEntriesByType('paint');
		const ready = performance.now();
		return {
			fcp_ms: paints.find((item) => item.name === 'first-contentful-paint')?.startTime || 0,
			runtime_ms: ready,
			first_canvas_ms: window.gdwebFirstCanvasMs || window.gdwebFullFirstCanvasMs || 0,
			interactive_ms: ready,
		};
	});
	await settle();
	Object.assign(result, await page.evaluate(() => {
		const resources = performance.getEntriesByType('resource');
		return {
			transfer_bytes: resources.reduce((sum, item) => sum + item.transferSize, 0),
			body_bytes: resources.reduce((sum, item) => sum + item.encodedBodySize, 0),
		};
	}));
	result.network_requests = served.requests - before.requests;
	result.network_bytes = served.bytes - before.bytes;
	return result;
}

// 測定対象の全file hashを固定し、後の書き出しとの混同を防ぐ。
function artifacts(dir) {
	return Object.fromEntries(fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile()).map((name) => {
		const data = fs.readFileSync(path.join(dir, name));
		return [name, crypto.createHash('sha256').update(data).digest('hex')];
	}));
}

// medianとnearest-rank p95を同じ規則で返す。
function summary(rows, key) {
	const values = rows.map((row) => row[key]).sort((a, b) => a - b);
	return { median: values[Math.floor(values.length / 2)], p95: values[Math.ceil(values.length * 0.95) - 1] };
}

(async () => {
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true });
	try {
		const samples = { gdweb: { cold: [], warm: [] }, full: { cold: [], warm: [] } };
		for (const kind of ['gdweb', 'full']) {
			const url = `http://127.0.0.1:${server.address().port}/${kind}/index.html`;
			for (let index = 0; index < 7; index++) {
				const context = await browser.newContext();
				const coldPage = await context.newPage();
				samples[kind].cold.push(await load(coldPage, url, kind));
				const warmPage = await context.newPage();
				await coldPage.close();
				samples[kind].warm.push(await load(warmPage, url, kind));
				await context.close();
			}
		}
		const result = { ok: true, artifacts: { gdweb: artifacts(roots.gdweb), full: artifacts(roots.full) }, samples, summary: {} };
		for (const kind of ['gdweb', 'full']) {
			result.summary[kind] = {};
			for (const state of ['cold', 'warm']) result.summary[kind][state] = Object.fromEntries(['fcp_ms', 'runtime_ms', 'first_canvas_ms', 'interactive_ms', 'transfer_bytes', 'body_bytes', 'network_requests', 'network_bytes'].map((key) => [key, summary(samples[kind][state], key)]));
		}
		assert.equal(samples.gdweb.cold.length, 7);
		assert.equal(samples.full.warm.length, 7);
		const output = path.join(root, 'tmp/gdweb/metrics/performance.json');
		fs.mkdirSync(path.dirname(output), { recursive: true });
		fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
		console.log(JSON.stringify({ ok: true, summary: result.summary }));
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}
})().catch((error) => {
	console.error(error);
	server.close();
	process.exitCode = 1;
});
