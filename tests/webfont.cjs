// Theme fontと同名同pathのwoff2選択とBrowser標準fontを実runtimeで検査する。
// Web fontの無効化やfile不足でも文字DOMを維持する所有境界を確認する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const work = path.join(repo, 'tmp/webfont'); // 検査用projectと成果物。
const project = path.join(work, 'project'); // Fontを加えたfixture。
const browserPath = '/Users/k/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium'; // 固定Chromium。

// BrowserへGodot成果物を正しいMIMEで返す。
function server(root) {
	return http.createServer((request, response) => {
		const name = request.url === '/' ? 'index.html' : request.url.slice(1).split('?')[0];
		const file = path.resolve(root, name);
		if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) return response.writeHead(404).end();
		const type = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.woff2': 'font/woff2' }[path.extname(file)] || 'application/octet-stream';
		response.writeHead(200, { 'content-type': type });
		fs.createReadStream(file).pipe(response);
	});
}

// 指定optionで書き出し、DOM所有結果を返す。
async function inspect(browser, enabled, output) {
	let preset = fs.readFileSync(path.join(project, 'export_presets.cfg'), 'utf8');
	preset = preset.replace(/^gdweb\/font\/matching_webfont=.*$/m, `gdweb/font/matching_webfont=${enabled}`);
	fs.writeFileSync(path.join(project, 'export_presets.cfg'), preset);
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(output, 'index.html')], { stdio: 'pipe' });
	const host = server(output);
	await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
	let page;
	try {
		const port = host.address().port;
		page = await browser.newPage({ viewport: { width: 640, height: 240 } });
		await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => document.querySelector('#canvas')?.width > 0);
		await page.waitForTimeout(250);
		return await page.evaluate(() => {
			const node = [...document.querySelectorAll('[data-gdweb-text]')].find((item) => item.textContent.includes('Web Font'));
			return { map: window.GDWEB_FONT_MAP, dom: !!node, family: node ? getComputedStyle(node).fontFamily : '' };
		});
	} finally {
		if (page) await page.close();
		await new Promise((resolve) => host.close(resolve));
	}
}

// ON/OFFを同じBrowser processで比較する。
async function main() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/webfont'), project, { recursive: true });
	fs.mkdirSync(path.join(project, 'fonts'), { recursive: true });
	fs.copyFileSync(path.join(repo, 'LINESeedJP_A_OTF_Rg.otf'), path.join(project, 'fonts/Test.otf'));
	fs.copyFileSync(path.join(repo, 'LINESeedJP_A_OTF_Rg.woff2'), path.join(project, 'fonts/Test.woff2'));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true });
	try {
		const on = await inspect(browser, true, path.join(work, 'on'));
		const off = await inspect(browser, false, path.join(work, 'off'));
		fs.unlinkSync(path.join(project, 'fonts/Test.woff2'));
		const missing = await inspect(browser, true, path.join(work, 'missing'));
		assert.equal(on.dom, true);
		assert.match(on.family, /^GDWeb-/);
		assert.ok(on.map['res://fonts/Test.otf']);
		assert.equal(off.dom, true);
		assert.equal(off.family, 'sans-serif');
		assert.deepEqual(off.map, {});
		assert.equal(missing.dom, true);
		assert.equal(missing.family, 'sans-serif');
		assert.deepEqual(missing.map, {});
		fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ on, off, missing }, null, 2)}\n`);
	} finally {
		await browser.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
