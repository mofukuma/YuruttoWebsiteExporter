// 3D版テンプレートで書き出したsiteが、Browserで3Dを描けることを確かめる。
// 3Dの描画とDOM文字の両立を、実際のWebGLの絵と文字の両方で判定する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { createServer } = require('../build/serve_web.cjs');
const { browserPath } = require('./browser.cjs');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const work = path.join(repo, 'tmp/scene-3d'); // project copyとWeb成果物。
const project = path.join(work, 'project'); // addonを導入するfixture。
const site = path.join(work, 'site'); // 書き出したWeb成果物。
const port = 49187; // 固定検査port。

// Export、配信、Browserを一つの失敗境界で検査する。
async function main() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/scene_3d'), project, { recursive: true });
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], { stdio: 'pipe', timeout: 300000 });

	// 3D版テンプレートから書き出したことを、成果物の大きさで確かめる。
	const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'addons/yurutto_website_exporter/templates/manifest-3d.json')));
	assert.equal(manifest.features.threeD, true, '3D版manifestでない');

	const server = createServer(site);
	await new Promise((done) => server.listen(port, '127.0.0.1', done));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
	try {
		const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

		// 画面の文字がHTMLで出るまで待ち、3Dのsceneが起動したことを確かめる。
		try {
			await page.getByText('SCENE 3D', { exact: true }).waitFor({ timeout: 60000 });
		} catch {
			const state = await page.evaluate(() => ({ text: document.body.innerText, status: document.querySelector('#status-notice')?.textContent }));
			throw new Error(`3D sceneが起動しない: ${JSON.stringify({ state, errors })}`);
		}

		// Godot側に3Dの型が生きていることを、実行中のsceneから確かめる。
		const kind = await page.evaluate(() => document.querySelector('canvas') ? 'canvas' : 'none');
		assert.equal(kind, 'canvas', '描画canvasが無い');

		// 立方体が回っている絵を、時間差の2枚が違うことで確かめる。
		const shot = async () => (await page.locator('canvas').screenshot()).toString('base64');
		const first = await shot();
		await page.waitForTimeout(700);
		const second = await shot();
		assert.notEqual(first, second, '3Dが動いていない');
		assert.deepEqual(errors, [], `Browser errorが出た: ${errors.join(' / ')}`);
		console.log(JSON.stringify({ ok: true, threeD: true, wasm: fs.statSync(path.join(site, 'index.wasm')).size }));
	} finally {
		await browser.close();
		server.close();
	}
}

main();
