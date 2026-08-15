// Hash既定、History直リンク、OGP、Web font、nginx配信を一括検査する。
// fixtureはtmpへ生成し、raw 404とHistory fallbackの差をBrowser実測する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const root = path.join(repo, 'tmp/site-export'); // 全中間成果物。
const project = path.join(root, 'project'); // exporter fixture project。
const hashOut = path.join(root, 'hash'); // 無設定配信用Hash成果物。
const historyOut = path.join(root, 'history'); // nginx配信用History成果物。
const browserPath = '/Users/k/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium'; // 固定Chromium。
const rawPort = 49181; // raw nginx比較port。
const sitePort = 49182; // History nginx検査port。
const containers = []; // 必ず終了するDocker container ID。

// 検査用projectと最小Godot HTML成果物を生成する。
function fixture(mode, target) {
	fs.rmSync(project, { recursive: true, force: true });
	fs.rmSync(target, { recursive: true, force: true });
	fs.mkdirSync(path.join(project, 'fonts'), { recursive: true });
	fs.mkdirSync(path.join(project, 'web'), { recursive: true });
	fs.mkdirSync(target, { recursive: true });
	fs.writeFileSync(path.join(project, 'project.godot'), '[application]\nconfig/name="Site Test"\nrun/main_scene="res://main.tscn"\n');
	fs.writeFileSync(path.join(project, 'main.tscn'), '[gd_scene format=3]\n[node name="Main" type="Node"]\n');
	fs.writeFileSync(path.join(project, 'about.tscn'), '[gd_scene format=3]\n[node name="About" type="Node"]\n');
	fs.writeFileSync(path.join(project, 'export_presets.cfg'), `[preset.0]\nname="Web"\nplatform="Web"\n[preset.0.options]\ngdweb/site/enabled=true\ngdweb/site/config="res://gdweb-site.json"\ngdweb/site/base_url="http://127.0.0.1:${sitePort}"\ngdweb/site/title="Site Test"\ngdweb/site/description="既定概要"\ngdweb/site/locale="ja_JP"\ngdweb/site/favicon=""\ngdweb/routing/mode=${mode}\ngdweb/font/matching_webfont=true\ngdweb/ogp/image="res://web/ogp.png"\ngdweb/ogp/alt="自動生成OGP"\n`);
	fs.writeFileSync(path.join(project, 'gdweb-site.json'), JSON.stringify({ version: 1, scenes: {
		Main: { scene: 'res://main.tscn', uri: '/', title: 'メイン', description: 'メイン概要', scripts: [{ src: 'res://web/main.js', defer: true }], meta: [{ name: 'theme-color', content: '#111111' }], json_ld: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Main' } },
		About: { scene: 'res://about.tscn', uri: '/about/', title: '概要ページ', description: '概要の説明', scripts: [{ src: 'res://web/about.js', defer: true }], meta: [{ name: 'theme-color', content: '#222222' }], json_ld: { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About' } },
	} }));
	fs.writeFileSync(path.join(project, 'web/main.js'), 'window.mainLoads=(window.mainLoads||0)+1;');
	fs.writeFileSync(path.join(project, 'web/about.js'), 'window.aboutLoads=(window.aboutLoads||0)+1;');
	fs.copyFileSync(path.join(repo, 'examples/omochi_game/web/ogp.png'), path.join(project, 'web/ogp.png'));
	fs.copyFileSync(path.join(repo, 'LINESeedJP_A_OTF_Rg.otf'), path.join(project, 'fonts/LINESeedJP_A_OTF_Rg.otf'));
	fs.copyFileSync(path.join(repo, 'LINESeedJP_A_OTF_Rg.woff2'), path.join(project, 'fonts/LINESeedJP_A_OTF_Rg.woff2'));
	fs.writeFileSync(path.join(target, 'index.html'), '<!doctype html><html><head><title>Godot</title></head><body><canvas></canvas></body></html>');
	fs.writeFileSync(path.join(target, 'index.js'), 'globalThis.GODOT_TEST="' + 'x'.repeat(4096) + '";');
	fs.writeFileSync(path.join(target, 'index.wasm'), Buffer.alloc(4096, 0));
	child.execFileSync('node', [path.join(repo, 'addons/gdweb_site/site_export.cjs'), project, path.join(target, 'index.html'), 'Web']);
}

// Docker nginxを固定portで開始し、container IDを回収対象へ積む。
function start(port, site, config = '') {
	const args = ['run', '--rm', '-d', '-p', `127.0.0.1:${port}:${config ? 8080 : 80}`, '-v', `${site}:/usr/share/nginx/html:ro`];
	if (config) args.push('-v', `${config}:/etc/nginx/conf.d/default.conf:ro`);
	args.push('nginx:alpine');
	const id = child.execFileSync('docker', args, { encoding: 'utf8' }).trim();
	containers.push(id);
	return id;
}

// HTTP状態とheaderをBrowserの自動展開なしで読む。
function request(port, pathname, headers = {}) {
	return new Promise((resolve, reject) => {
		const req = http.get({ host: '127.0.0.1', port, path: pathname, headers }, (res) => {
			const chunks = [];
			res.on('data', (chunk) => chunks.push(chunk));
			res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
		});
		req.on('error', reject);
	});
}

// nginx起動直後の短い接続待ちだけを行う。
async function ready(port) {
	for (let count = 0; count < 20; count++) {
		try { return await request(port, '/'); } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
	}
	throw new Error(`nginx起動失敗: ${port}`);
}

// 全境界を一回のBrowser起動で検査する。
async function main() {
	fixture(0, hashOut);
	const hashHtml = fs.readFileSync(path.join(hashOut, 'index.html'), 'utf8');
	const hashData = JSON.parse(fs.readFileSync(path.join(hashOut, 'gdweb-site.json')));
	assert.match(hashHtml, /og:image:width" content="1200"/);
	assert.match(hashHtml, /og:image:height" content="630"/);
	assert.equal(hashData.mode, 'Hash');
	assert.equal(Object.keys(hashData.webfonts).length, 1);
	assert.ok(!fs.existsSync(path.join(hashOut, 'about/index.html')));

	fixture(1, historyOut);
	assert.ok(fs.existsSync(path.join(historyOut, 'about/index.html')));
	assert.match(fs.readFileSync(path.join(historyOut, 'about/index.html'), 'utf8'), /<title>概要ページ<\/title>/);
	assert.ok(fs.existsSync(path.join(historyOut, 'nginx-gdweb-proxy.conf.example')));
	assert.equal(JSON.parse(fs.readFileSync(path.join(historyOut, 'gdweb-compression.json'))).encoding, 'br');

	const browser = await chromium.launch({ executablePath: browserPath, headless: true });
	let wasm;
	try {
		const raw = start(rawPort, hashOut);
		await ready(rawPort);
		assert.equal((await request(rawPort, '/unknown/')).status, 404);
		const hashPage = await browser.newPage({ viewport: { width: 1200, height: 630 } });
		await hashPage.goto(`http://127.0.0.1:${rawPort}/#/about/`, { waitUntil: 'domcontentloaded' });
		assert.equal(await hashPage.title(), '概要ページ');
		assert.equal(new URL(hashPage.url()).hash, '#/about/');
		await hashPage.evaluate(() => {
			window.routeFiles = [];
			GDWebSite.bind((file) => routeFiles.push(file));
			GDWebSite.scene('res://about.tscn');
			GDWebSite.scene('res://main.tscn');
			history.back();
		});
		await hashPage.waitForFunction(() => location.hash === '#/about/' && routeFiles.length >= 2);
		await hashPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		assert.deepEqual(await hashPage.evaluate(() => routeFiles), ['res://about.tscn', 'res://about.tscn']);
		await hashPage.close();
		child.execFileSync('docker', ['stop', raw]);
		containers.splice(containers.indexOf(raw), 1);

		start(sitePort, historyOut, path.join(historyOut, 'nginx-gdweb.conf.example'));
		await ready(sitePort);
		assert.equal((await request(sitePort, '/unknown/')).status, 200);
		wasm = await request(sitePort, '/index.wasm', { 'accept-encoding': 'br' });
		assert.equal(wasm.status, 200);
		assert.equal(wasm.headers['content-encoding'], 'br');
		const identity = await request(sitePort, '/index.wasm', { 'accept-encoding': 'identity' });
		assert.equal(identity.headers['content-encoding'], undefined);
		assert.deepEqual(identity.body, fs.readFileSync(path.join(historyOut, 'index.wasm')));
		const rejected = await request(sitePort, '/index.wasm', { 'accept-encoding': 'gzip, br;q=0' });
		assert.equal(rejected.headers['content-encoding'], undefined);
		assert.deepEqual(rejected.body, identity.body);

		const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
		await page.goto(`http://127.0.0.1:${sitePort}/about/`, { waitUntil: 'domcontentloaded' });
		assert.equal(await page.title(), '概要ページ');
		assert.equal(await page.evaluate(() => window.aboutLoads), 1);
		assert.equal(await page.locator('script[src="/web/about.js"]').count(), 1);
		assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#222222');
		assert.equal(JSON.parse(await page.locator('#gdweb-json-ld').textContent())['@type'], 'AboutPage');
		await page.evaluate(() => {
			window.routeFiles = [];
			GDWebSite.bind((file) => routeFiles.push(file));
			GDWebSite.scene('res://about.tscn');
			window.routeEvents = [];
			document.addEventListener('gdweb:scene-leave', (event) => routeEvents.push(`leave:${event.detail.name}`));
			document.addEventListener('gdweb:scene-enter', (event) => routeEvents.push(`enter:${event.detail.name}`));
			GDWebSite.scene('res://main.tscn');
		});
		await page.waitForFunction(() => window.mainLoads === 1);
		assert.equal(new URL(page.url()).pathname, '/');
		assert.equal(await page.title(), 'メイン');
		assert.deepEqual(await page.evaluate(() => routeEvents), ['leave:About', 'enter:Main']);
		assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#111111');
		await page.goBack({ waitUntil: 'domcontentloaded' });
		assert.equal(new URL(page.url()).pathname, '/about/');
		assert.equal(await page.title(), '概要ページ');
		assert.equal(await page.evaluate(() => window.aboutLoads), 1);
		assert.deepEqual(await page.evaluate(() => routeEvents), ['leave:About', 'enter:Main', 'leave:Main', 'enter:About']);
		await page.screenshot({ path: path.join(root, 'nginx-history.png') });
	} finally {
		await browser.close();
	}
	fs.writeFileSync(path.join(root, 'result.json'), `${JSON.stringify({ hashDefault: true, hashTraversalCallbacks: 1, rawUnknown: 404, historyUnknown: 200, ogp: '1200x630', webfonts: 1, brotli: wasm.headers['content-encoding'], identity: true, sceneScriptLoads: 1 }, null, 2)}\n`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
}).finally(() => {
	for (const id of containers) child.spawnSync('docker', ['stop', id], { stdio: 'ignore' });
});
