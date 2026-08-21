// Web向けの書き足しをしないGodot作品が、書き出しただけでrouteを持つかを確かめる。
// 作品側はget_tree().change_scene_to_file()を呼ぶだけで、Browser側のURLとtitleは
// エンジンが裏で合わせる。この裏方が働いていることを、両方向の移動で固定する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { browserPath } = require('./browser.cjs'); // 導入済みplaywright-coreの固定Chromium。
const { createServer } = require('../build/serve_web.cjs'); // 成果物を配る簡易server。

const repo = path.resolve(__dirname, '..'); // project root。
const work = path.join(repo, 'tmp/native-route'); // 書き出しと確認画像の置き場。
const project = path.join(work, 'project'); // addonを導入する検査project。
const site = path.join(work, 'site'); // Web成果物。

// fixtureを複製して書き出す。addonとimport cacheは書き出し手順が作り直す。
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.cpSync(path.join(repo, 'tests/fixtures/native_route'), project, { recursive: true });
child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], { stdio: 'pipe', timeout: 600000 });

// 画面の中のButtonを押す。文字のDOMは見せるためのもので操作を受けないので、
// その位置を借りてCanvasへクリックを送る。利用者の操作と同じ道筋になる。
async function press(page, label) {
	const box = await page.evaluate((text) => {
		const node = [...document.querySelectorAll('[data-yweb-text]')].find((entry) => entry.textContent.trim() === text);
		if (!node) return null;
		const rect = node.getBoundingClientRect();
		return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
	}, label);
	assert.ok(box, `Buttonが見つからない: ${label}`);
	await page.mouse.click(box.x, box.y);
}

// 作品はscene切替を呼ぶだけ。URLとtitleが追いつくことを行きと帰りで見る。
async function main() {
	const server = createServer(site);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const port = server.address().port;
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	try {
		const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

		// 起点のsceneが、対応表どおりのtitleで出ることを見る。
		await page.getByText('MAIN SCENE', { exact: true }).waitFor({ timeout: 90000 });
		assert.equal(await page.title(), 'Home Route');

		// 作品の中のButtonでscene切替を起こす。URLとtitleが後から追いつく。
		await press(page, 'GO ABOUT');
		await page.getByText('ABOUT SCENE', { exact: true }).waitFor({ timeout: 20000 });
		await page.waitForFunction(() => location.hash === '#/about/', undefined, { timeout: 20000, polling: 'raf' });
		assert.equal(await page.title(), 'About Route');

		// 戻る向きでも同じことが起きる。片道だけの実装になっていないことを見る。
		await press(page, 'GO HOME');
		await page.getByText('MAIN SCENE', { exact: true }).waitFor({ timeout: 20000 });
		await page.waitForFunction(() => location.hash === '#/', undefined, { timeout: 20000, polling: 'raf' });
		assert.equal(await page.title(), 'Home Route');

		// Browser側の戻るでも、Godotのsceneが追いつく。履歴が本物として積まれている証拠。
		await page.goBack();
		await page.getByText('ABOUT SCENE', { exact: true }).waitFor({ timeout: 20000 });
		assert.equal(await page.title(), 'About Route');

		assert.deepEqual(errors, [], `Browser errorが出た: ${errors.join(' / ')}`);

		// 作品側にWeb向けの書き足しが無いことを、fixtureの中身で示す。
		const sources = ['main.gd', 'about.gd'].map((name) => fs.readFileSync(path.join(repo, 'tests/fixtures/native_route', name), 'utf8'));
		for (const source of sources) {
			const code = source.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
			assert.equal(/YWebSite|JavaScriptBridge/.test(code), false, 'Web向けの書き足しが混ざっている');
		}
		console.log(JSON.stringify({ ok: true, routes: ['/', '/about/'], moves: ['forward', 'back', 'history'], siteApiInProject: false }));
	} finally {
		await browser.close();
		server.close();
	}
}

main();
