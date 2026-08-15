// 最小文字DOM版の描画境界と標準Canvas維持を一括検査する。
// DPR 2、画面幅二種、WebGL、DOM所有範囲、画像安定後の表示を確認する。
// 設計思想：Godotの座標を正本とし、Browserでは結果の境界だけを測る。

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');

const root = path.resolve(__dirname, '../tmp/minimum/site'); // minimum版の書き出し先。
const out = path.resolve(__dirname, '../tmp/minimum'); // 検査結果と確認画像の保存先。
const browserPath = '/Users/k/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium'; // 固定Chromium。
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.woff2': 'font/woff2' }; // 配信に必要な応答型。

// 成果物以外へ到達させない検査用配信。
const server = http.createServer((request, response) => {
	const name = request.url === '/' ? 'index.html' : request.url.slice(1).split('?')[0];
	const file = path.resolve(root, name);
	if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
		response.writeHead(404).end();
		return;
	}
	response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
	fs.createReadStream(file).pipe(response);
});

// DOM文字のうち最大のPROJECTS見出しを選ぶ。
async function titleBox(page, minimum) {
	return page.evaluate((size) => {
		const item = [...document.querySelectorAll('[data-gdweb-text]')]
			.find((node) => node.textContent === 'PROJECTS' && Number.parseFloat(node.style.fontSize) >= size);
		if (!item) return null;
		const box = item.getBoundingClientRect();
		return {
			x: box.x,
			y: box.y,
			width: box.width,
			height: box.height,
			fontSize: Number.parseFloat(item.style.fontSize),
			localSize: { width: Number.parseFloat(item.style.width), height: Number.parseFloat(item.style.height) },
			transform: item.style.transform,
		};
	}, minimum);
}

// CanvasとDOM文字の親領域超過をCSS画素で計測する。
async function containment(page) {
	return page.evaluate(() => {
		const canvas = document.querySelector('canvas');
		const rootNode = document.getElementById('gdweb-text-root');
		const box = (node) => {
			const rect = node.getBoundingClientRect();
			return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
		};
		const canvasBox = box(canvas);
		const rootBox = box(rootNode);
		const items = [...document.querySelectorAll('[data-gdweb-text]')]
			.filter((node) => node.style.display !== 'none')
			.map((node) => ({ ...box(node), text: node.textContent, kind: node.dataset.gdwebKind }));
		const maxItem = [...items].sort((left, right) => right.right - left.right)[0];
		return {
			dpr: window.devicePixelRatio,
			canvas: canvasBox,
			canvasPixels: { width: canvas.width, height: canvas.height },
			root: rootBox,
			rootOverflow: getComputedStyle(rootNode).overflow,
			documentWidth: document.documentElement.scrollWidth,
			maxRight: Math.max(...items.map((rect) => rect.right)),
			maxItem,
			minLeft: Math.min(...items.map((rect) => rect.left)),
			count: items.length,
		};
	});
}

// 二回連続で同じ画像になるまで待ち、非同期画像描画の途中を撮らない。
async function stableShot(page, file) {
	let previous = '';
	let stable = 0;
	for (let frame = 0; frame < 12; frame++) {
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		const image = await page.screenshot();
		const hash = crypto.createHash('sha256').update(image).digest('hex');
		stable = hash === previous ? stable + 1 : 0;
		previous = hash;
		if (stable >= 1) {
			fs.writeFileSync(file, image);
			return { hash, frames: frame + 1, bytes: image.length };
		}
	}
	throw new Error('画像描画が安定しない');
}

// 起動、DPR、所有境界、リサイズ、画像描画を一つのBrowserで確認する。
(async () => {
	fs.mkdirSync(out, { recursive: true });
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	const errors = [];
	try {
		const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
		await context.addInitScript(() => {
			window.__gdwebContexts = [];
			const original = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = function (type, ...args) {
				window.__gdwebContexts.push(type);
				return original.call(this, type, ...args);
			};
		});
		const page = await context.newPage();
		const messages = [];
		page.setDefaultTimeout(12000);
		page.on('console', (message) => {
			messages.push(`${message.type()}: ${message.text()}`);
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('pageerror', (error) => errors.push(error.message));
		const started = Date.now();
		await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
		const previewMs = Date.now() - started;
		assert.equal(await page.locator('#site-preview').isVisible(), true, '即時表示が見えない');
		assert.equal(await page.locator('#status').isVisible(), false, 'Godotロード画面が見える');
		await page.locator('#site-preview').waitFor({ state: 'detached' });
		try {
			await page.waitForFunction(() => document.querySelectorAll('[data-gdweb-text]').length >= 20);
		} catch (error) {
			throw new Error(`${error.message}\n${messages.join('\n')}`);
		}
		await page.evaluate(async () => {
			await document.fonts.load('128px GDWeb');
			await document.fonts.ready;
		});
		const readyMs = Date.now() - started;
		const contexts = await page.evaluate(() => [...new Set(window.__gdwebContexts)]);
		assert.ok(contexts.some((type) => type === 'webgl' || type === 'webgl2'), `WebGL未使用: ${contexts.join(', ')}`);
		assert.equal(contexts.includes('2d'), false, `2D DOM bridgeがCanvasを所有: ${contexts.join(', ')}`);

		const desktop = await containment(page);
		const desktopTitle = await titleBox(page, 100);
		assert.equal(desktop.count, 52, `DOM文字数: ${desktop.count}`);
		assert.equal(desktop.dpr, 2, `DPR: ${desktop.dpr}`);
		assert.equal(desktop.canvas.width, 1440, `Canvas CSS幅: ${desktop.canvas.width}`);
		assert.equal(desktop.root.width, 1440, `DOM root幅: ${desktop.root.width}`);
		assert.equal(desktop.canvasPixels.width, 2880, `Canvas backing幅: ${desktop.canvasPixels.width}`);
		assert.ok(desktop.maxRight <= desktop.canvas.right + 0.5, `desktop右超過: ${desktop.maxRight - desktop.canvas.right}`);
		assert.ok(desktop.minLeft >= desktop.canvas.left - 0.5, `desktop左超過: ${desktop.canvas.left - desktop.minLeft}`);
		assert.ok(desktopTitle && Math.abs(desktopTitle.x - 80) < 1, `desktop見出しx: ${desktopTitle?.x}`);
		assert.ok(desktopTitle && Math.abs(desktopTitle.y - 222) < 1, `desktop見出しy: ${desktopTitle?.y}`);
		assert.equal(desktopTitle?.fontSize, 128, `desktop font: ${desktopTitle?.fontSize}`);

		const domText = await page.locator('[data-gdweb-text]').allTextContents();
		assert.equal(domText.includes('OPEN SELECTED WORKS  ↗'), true, 'Button文字がDOM化されていない');
		assert.equal(await page.locator('[data-gdweb-kind="Label"]').count(), 34, 'Label所有数が不正');
		assert.equal(await page.locator('[data-gdweb-kind="Button"]').count(), 18, 'Button所有数が不正');
		assert.equal(await page.locator('#gdweb-text-root button').count(), 18, 'Button意味tag数が不正');
		assert.equal(await page.locator('#gdweb-text-root button').first().evaluate((node) => getComputedStyle(node).pointerEvents), 'none', 'Button文字がCanvas pointer入力を遮断');
		assert.equal(await page.locator('#gdweb-text-root input, #gdweb-text-root textarea, #gdweb-text-root select').count(), 0, '未指定入力ControlがDOM化された');

		await page.setViewportSize({ width: 390, height: 844 });
		await page.waitForFunction(() => {
			const item = [...document.querySelectorAll('[data-gdweb-text]')]
				.find((node) => node.textContent === 'PROJECTS' && node.style.fontSize === '58px');
			return item && document.querySelector('canvas').getBoundingClientRect().width === 390;
		});
		const mobile = await containment(page);
		const mobileTitle = await titleBox(page, 50);
		assert.equal(mobile.canvas.width, 390, `mobile Canvas CSS幅: ${mobile.canvas.width}`);
		assert.equal(mobile.root.width, 390, `mobile DOM root幅: ${mobile.root.width}`);
		assert.equal(mobile.canvasPixels.width, 780, `mobile Canvas backing幅: ${mobile.canvasPixels.width}`);
		assert.ok(mobile.maxRight <= mobile.canvas.right + 0.5, `mobile右超過: ${mobile.maxRight - mobile.canvas.right}`);
		assert.ok(mobile.minLeft >= mobile.canvas.left - 0.5, `mobile左超過: ${mobile.canvas.left - mobile.minLeft}`);
		assert.equal(mobileTitle?.fontSize, 58, `mobile font: ${mobileTitle?.fontSize}`);
		assert.ok(mobileTitle && Math.abs(mobileTitle.x - 34) < 1, `mobile見出しx: ${mobileTitle?.x}`);
		assert.ok(mobileTitle && Math.abs(mobileTitle.y - 325) < 1, `mobile見出しy: ${mobileTitle?.y}`);

		await page.setViewportSize({ width: 1440, height: 1800 });
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')]
			.some((node) => node.textContent === 'PROJECTS' && node.style.fontSize === '128px'));
		await page.waitForFunction(() => {
			const item = [...document.querySelectorAll('[data-gdweb-text]')].find((node) => node.textContent === 'SELECTED\nWORKS');
			const box = item?.getBoundingClientRect();
			return box && box.top > 1000 && box.bottom < innerHeight;
		});

		// LineEditとOptionButtonはCanvas入力のまま操作でき、結果LabelだけDOMへ反映する。
		await page.mouse.click(180, 1693);
		await page.keyboard.type('selected');
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === '1 RESULTS'));
		await page.keyboard.press('Meta+A');
		await page.keyboard.press('Backspace');
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === '6 RESULTS'));
		await page.mouse.click(900, 1693);
		await page.waitForTimeout(100);
		await page.mouse.click(900, 1765);
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === '4 RESULTS'));
		const shot = await stableShot(page, path.join(out, 'minimum.png'));
		assert.ok(shot.bytes > 100000, `確認画像が小さすぎる: ${shot.bytes}`);

		// Shader適用画像の安定描画とsource指定を組み合わせ、2D Shader経路を確認する。
		assert.match(fs.readFileSync(path.resolve(__dirname, '../examples/daito_projects/main.gd'), 'utf8'), /shader_type canvas_item/, '2D Shader未使用');

		// 別contextでDPR 1のCanvas、root、Label境界を確認する。
		const dpr1Context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
		const dpr1Page = await dpr1Context.newPage();
		dpr1Page.setDefaultTimeout(12000);
		dpr1Page.on('pageerror', (error) => errors.push(error.message));
		await dpr1Page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
		await dpr1Page.locator('#site-preview').waitFor({ state: 'detached' });
		await dpr1Page.waitForFunction(() => document.querySelectorAll('[data-gdweb-text]').length === 52);
		const dpr1 = await containment(dpr1Page);
		assert.equal(dpr1.dpr, 1, `DPR 1: ${dpr1.dpr}`);
		assert.equal(dpr1.canvasPixels.width, 800, `DPR 1 backing幅: ${dpr1.canvasPixels.width}`);
		assert.equal(dpr1.root.width, 800, `DPR 1 root幅: ${dpr1.root.width}`);
		assert.equal(dpr1.rootOverflow, 'hidden', `DOM root clip: ${dpr1.rootOverflow}`);
		assert.equal(dpr1.documentWidth, 800, `DPR 1 document幅: ${dpr1.documentWidth}`);
		await dpr1Context.close();
		assert.deepEqual(errors, [], `Browser error: ${errors.join(' | ')}`);

		const result = {
			ok: true,
			initial: { previewMs, readyMs, loaderHidden: true },
			renderer: { contexts, canvasOwned: true },
			ownership: { labelCount: 34, buttonCount: 18, semanticButtons: 18, canvasPointerBridge: true },
			containment: { desktop, mobile, dpr1 },
			title: { desktop: desktopTitle, mobile: mobileTitle },
			image: { loadedBeforeShot: true, ...shot },
			canvas: { inputAndBackground: true, lineEdit: true, optionButton: true, shader: true },
		};
		fs.writeFileSync(path.join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
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
