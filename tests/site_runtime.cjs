// サブディレクトリの物理直リンク、Browser戻り、Godot scene変更を静的hostで検査する。
// 重い公開全体検査からURL遷移を分け、再読込なしの双方向同期を短時間で確かめる設計。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, browserPath } = require('./browser.cjs'); // 固定Chromiumと実行path。

const repo = path.resolve(__dirname, '..'); // yweb project root。
const work = path.join(repo, 'tmp/site-runtime'); // Project copyとWeb成果物。
const project = path.join(work, 'project'); // addonを導入するfixture。
const host = path.join(work, 'host'); // サブディレクトリを置く静的hostのroot。
const site = path.join(host, 'sub'); // `/sub/`で公開するWeb成果物。
const port = 49183; // Browser検査port。
const { createServer } = require('../build/serve_web.cjs'); // 静的検査server。

// Export、静的配信、Browserを一つの失敗境界で検査する。
async function main() {
	// 公開rootと開始pageが異なるfixtureを毎回新しく用意する。
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/site_runtime'), project, { recursive: true });
	const preset = path.join(project, 'export_presets.cfg');
	const source = fs.readFileSync(preset, 'utf8');
	fs.writeFileSync(preset, source.replace(`http://127.0.0.1:${port}`, `http://127.0.0.1:${port}/sub/`));
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], { stdio: 'pipe' });
	assert.ok(fs.existsSync(path.join(site, 'about/index.html')), 'About物理HTMLなし');
	// host rootから配信し、生成HTMLの公開root解決をBrowserへ判断させる。
	const server = createServer(host);
	await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true });
	try {
		// 直リンク起動中の通信失敗と実行errorをまとめて捕捉する。
		const page = await browser.newPage({ viewport: { width: 640, height: 240 } });
		const errors = [];
		const failed = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('response', (response) => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
		await page.goto(`http://127.0.0.1:${port}/sub/about/`, { waitUntil: 'domcontentloaded' });
		await page.locator('[data-yweb-text]', { hasText: /^ABOUT SCENE$/ }).waitFor({ timeout: 8000 });
		assert.equal(await page.title(), 'About Route');
		// Engine資源がhost rootへ抜けず、公開root内から読まれたかを確かめる。
		const resources = await page.evaluate(() => performance.getEntriesByType('resource')
			.filter((entry) => /\.(?:wasm|pck)(?:\?|$)/.test(entry.name))
			.map((entry) => new URL(entry.name).pathname));
		assert.ok(resources.length >= 2 && resources.every((name) => name.startsWith('/sub/')), `公開root外の資源: ${resources}`);
		// BrowserとGodotの両方向へ動かし、URLとSceneが再読込なしで揃うかを確かめる。
		const marker = await page.evaluate(() => window.ywebPageMarker = crypto.randomUUID());
		await page.evaluate(() => { history.pushState({}, '', '/sub/'); dispatchEvent(new PopStateEvent('popstate')); });
		await page.locator('[data-yweb-text]', { hasText: /^MAIN SCENE$/ }).waitFor();
		assert.equal(await page.title(), 'Main Route');
		await page.keyboard.press('n');
		await page.locator('[data-yweb-text]', { hasText: /^ABOUT SCENE$/ }).waitFor();
		await page.waitForFunction(() => location.pathname === '/sub/about/');
		assert.equal(await page.title(), 'About Route');
		assert.equal(await page.evaluate(() => window.ywebPageMarker), marker, 'scene遷移で再読込');
		assert.deepEqual(failed, []);
		assert.deepEqual(errors, []);
		// 目視用画像と機械判定結果を作業領域へ残す。
		await page.screenshot({ path: path.join(work, 'physical-scene.png') });
		fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ root: '/sub/', direct: 'About', browserToGodot: 'Main', godotToBrowser: 'About', reloads: 1 }, null, 2)}\n`);
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
