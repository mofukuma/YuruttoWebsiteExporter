// 同一の動的文字ラボを標準Canvasとminimum文字DOMで交互に計測する。
// 一方式三回のframe中央値を取り、ソフトウェアWebGL環境の相対負荷を記録する。
// 設計思想：単独の絶対値で判断せず、同一sceneと交替順で描画方式だけを比較する。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');

const base = path.resolve(__dirname, '../tmp/text-lab'); // 比較成果物と結果の保存先。
const roots = { minimum: path.join(base, 'site'), standard: path.join(base, 'standard') }; // 同一sceneの二方式。
const { browserPath } = require('./browser.cjs'); // 導入済みplaywright-coreの固定Chromium。
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.woff2': 'font/woff2', '.png': 'image/png' }; // 配信に必要な応答型。

// 一方式をsite rootとして独立originへ配信する。
function serve(root) {
	return http.createServer((request, response) => {
		const name = request.url.slice(1).split('?')[0] || 'index.html';
		const file = path.resolve(root, name);
		if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
			response.writeHead(404).end();
			return;
		}
		response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
		fs.createReadStream(file).pipe(response);
	});
}

// 数列の中央値を返す。
function median(values) {
	return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

// 起動後の描画を温め、動的sceneのframe間隔を採取する。
async function measure(browser, kind, port) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	page.setDefaultTimeout(12000);
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
	await page.locator('#status').waitFor({ state: 'detached' });
	if (kind === 'minimum') {
		await page.waitForFunction(() => document.querySelectorAll('[data-gdweb-text]').length >= 110);
		await page.evaluate(() => document.fonts.ready);
	}
	const gaps = await page.evaluate(() => new Promise((resolve) => {
		const values = [];
		let warm = 10;
		let previous = performance.now();
		const tick = (now) => {
			if (warm > 0) warm--;
			else values.push(now - previous);
			previous = now;
			if (values.length >= 30) resolve(values);
			else requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}));
	await context.close();
	assert.deepEqual(errors, [], `${kind}: ${errors.join(' | ')}`);
	return median(gaps);
}

// 比較用keyで動きを固定し、同一frameの画像と文字maskを取得する。
async function capture(browser, kind, port) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	page.setDefaultTimeout(12000);
	await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
	await page.locator('#status').waitFor({ state: 'detached' });
	if (kind === 'minimum') {
		await page.waitForFunction(() => document.querySelectorAll('[data-gdweb-text]').length >= 110);
		await page.evaluate(() => document.fonts.ready);
	}
	await page.keyboard.press('f');
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
	const masks = kind === 'minimum' ? await page.evaluate(() => [...document.querySelectorAll('[data-gdweb-text]')]
		.filter((node) => getComputedStyle(node).display !== 'none')
		.map((node) => {
			const box = node.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, height: box.height };
		})) : [];
	const image = await page.screenshot();
	await context.close();
	return { image, masks };
}

// 文字mask外の二画像をRGBA画素単位で比較する。
async function compareImages(browser, standard, minimum, masks) {
	const page = await browser.newPage();
	const result = await page.evaluate(async ({ left, right, boxes }) => {
		const decode = async (source) => createImageBitmap(await (await fetch(`data:image/png;base64,${source}`)).blob());
		const [leftImage, rightImage] = await Promise.all([decode(left), decode(right)]);
		if (leftImage.width !== rightImage.width || leftImage.height !== rightImage.height) throw new Error('比較画像寸法が不一致');
		const width = leftImage.width;
		const height = leftImage.height;
		const read = (image) => {
			const canvas = new OffscreenCanvas(width, height);
			const context = canvas.getContext('2d');
			context.drawImage(image, 0, 0);
			return context.getImageData(0, 0, width, height).data;
		};
		const leftData = read(leftImage);
		const rightData = read(rightImage);
		const mask = new Uint8Array(width * height);
		const scale = 2;
		const padding = 20;
		for (const box of boxes) {
			const startX = Math.max(0, Math.floor((box.x - padding) * scale));
			const endX = Math.min(width, Math.ceil((box.x + box.width + padding) * scale));
			const startY = Math.max(0, Math.floor((box.y - padding) * scale));
			const endY = Math.min(height, Math.ceil((box.y + box.height + padding) * scale));
			for (let y = startY; y < endY; y++) mask.fill(1, y * width + startX, y * width + endX);
		}
		let compared = 0;
		let exactChanges = 0;
		let tolerantChanges = 0;
		let maxDelta = 0;
		let minX = width;
		let minY = height;
		let maxX = 0;
		let maxY = 0;
		for (let pixel = 0; pixel < mask.length; pixel++) {
			if (mask[pixel]) continue;
			compared++;
			const index = pixel * 4;
			let delta = 0;
			for (let channel = 0; channel < 4; channel++) delta = Math.max(delta, Math.abs(leftData[index + channel] - rightData[index + channel]));
			if (delta > 0) exactChanges++;
			if (delta > 3) {
				tolerantChanges++;
				const x = pixel % width;
				const y = Math.floor(pixel / width);
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
			}
			maxDelta = Math.max(maxDelta, delta);
		}
		return { compared, exactChanges, tolerantChanges, maxDelta, changedBounds: { minX, minY, maxX, maxY } };
	}, { left: standard.toString('base64'), right: minimum.toString('base64'), boxes: masks });
	await page.close();
	return result;
}

// 順序を交替し、frame負荷の中央値と倍率を保存する。
(async () => {
	const servers = { minimum: serve(roots.minimum), standard: serve(roots.standard) };
	await Promise.all(Object.values(servers).map((server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))));
	const ports = Object.fromEntries(Object.entries(servers).map(([kind, server]) => [kind, server.address().port]));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	try {
		const samples = { minimum: [], standard: [] };
		for (const order of [['standard', 'minimum'], ['minimum', 'standard'], ['standard', 'minimum']]) {
			for (const kind of order) samples[kind].push(await measure(browser, kind, ports[kind]));
		}
		const frameMs = { minimum: median(samples.minimum), standard: median(samples.standard) };
		const ratio = frameMs.minimum / frameMs.standard;
		assert.ok(ratio < 2, `動的文字DOM負荷: ${ratio.toFixed(2)}倍`);
		const standard = await capture(browser, 'standard', ports.standard);
		const minimum = await capture(browser, 'minimum', ports.minimum);
		fs.writeFileSync(path.join(base, 'standard-frozen.png'), standard.image);
		fs.writeFileSync(path.join(base, 'minimum-frozen.png'), minimum.image);
		const nonText = await compareImages(browser, standard.image, minimum.image, minimum.masks);
		assert.equal(nonText.exactChanges, 0, `文字mask外の相違: ${JSON.stringify(nonText)}`);
		const result = { ok: true, samples, frameMs, ratio, nonText };
		fs.writeFileSync(path.join(base, 'compare.json'), `${JSON.stringify(result, null, 2)}\n`);
		console.log(JSON.stringify(result));
	} finally {
		await browser.close();
		for (const server of Object.values(servers)) server.close();
	}
})().catch((error) => {
	console.error(error.stack || error);
	process.exitCode = 1;
});
