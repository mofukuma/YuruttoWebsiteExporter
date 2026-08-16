// Theme fontと同名同pathのwoff2選択とBrowser標準fontを実runtimeで検査する。
// Web fontの無効化やfile不足でも文字DOMを維持する所有境界を確認する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { install } = require('../build/fetch_webfont.cjs');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const work = path.join(repo, 'tmp/webfont'); // 検査用projectと成果物。
const project = path.join(work, 'project'); // Fontを加えたfixture。
const { browserPath } = require('./browser.cjs'); // 導入済みplaywright-coreの固定Chromium。

// file内容のSHA-256を返す。
function hash(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

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
		const state = await page.evaluate(() => {
			const node = [...document.querySelectorAll('[data-gdweb-text]')].find((item) => item.textContent.includes('Web Font'));
			return { map: window.GDWEB_FONT_MAP, dom: !!node, family: node ? getComputedStyle(node).fontFamily : '' };
		});
		const names = ['index.js', 'index.wasm', 'index.js.br', 'index.wasm.br'];
		state.runtime = Object.fromEntries(names.map((name) => [name, hash(path.join(output, name))]));
		const fonts = path.join(output, 'gdweb-fonts');
		state.fontFiles = fs.existsSync(fonts) ? fs.readdirSync(fonts).filter((name) => name.endsWith('.woff2')).length : 0;
		state.fontBrotli = fs.existsSync(fonts) ? fs.readdirSync(fonts).filter((name) => name.endsWith('.woff2.br')).length : 0;
		return state;
	} finally {
		if (page) await page.close();
		await new Promise((resolve) => host.close(resolve));
	}
}

// ON/OFFを同じBrowser processで比較する。
async function main() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/webfont'), project, { recursive: true });
	install(path.join(project, 'fonts'), 'Test');
	const browser = await chromium.launch({ executablePath: browserPath, headless: true });
	try {
		const on = await inspect(browser, true, path.join(work, 'on'));
		const off = await inspect(browser, false, path.join(work, 'off'));
		fs.unlinkSync(path.join(project, 'fonts/Test.woff2'));
		const missing = await inspect(browser, true, path.join(work, 'missing'));
		assert.equal(on.dom, true);
		assert.match(on.family, /^GDWeb-/);
		assert.ok(on.map['res://fonts/Test.ttf']);
		assert.equal(off.dom, true);
		assert.equal(off.family, 'sans-serif');
		assert.deepEqual(off.map, {});
		assert.equal(missing.dom, true);
		assert.equal(missing.family, 'sans-serif');
		assert.deepEqual(missing.map, {});
		assert.deepEqual(on.runtime, off.runtime, 'Web font OFFでruntimeが変化');
		assert.deepEqual(on.runtime, missing.runtime, 'Web font不足でruntimeが変化');
		assert.deepEqual([on.fontFiles, off.fontFiles, missing.fontFiles], [1, 0, 0]);
		assert.deepEqual([on.fontBrotli, off.fontBrotli, missing.fontBrotli], [0, 0, 0]);
		fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ on, off, missing }, null, 2)}\n`);
	} finally {
		await browser.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
