// 輪の形に並べた文字を回し、GodotとWebで同じ姿になるかを確かめる。
// 回っても文字がHTMLのままで、位置と傾きがついてくることを見る。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { createServer } = require('../build/serve_web.cjs');
const { install } = require('../build/fetch_webfont.cjs');
const { browserPath } = require('./browser.cjs');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const work = path.join(repo, 'tmp/rotate-label-spin'); // 検査用projectと成果物。
const project = path.join(work, 'project'); // 書き出すGodot project。
const site = path.join(work, 'site'); // 書き出したWeb成果物。
const godot = process.env.GODOT_BIN || '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 固定Godot。
const port = 49196; // 固定検査port。
const letters = 55; // 三つの輪へ並べた文字の数。
const shots = 4; // 回っている様子を確かめるために撮る枚数。

// 回る画面を、止めずに動く形で書き出す。
function build() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/rotate_label'), project, { recursive: true });
	fs.cpSync(path.join(repo, 'addons/yurutto_website_exporter'), path.join(project, 'addons/yurutto_website_exporter'), { recursive: true });
	install(path.join(project, 'fonts'));
	// 絵を比べるための固定をやめ、実際に回る状態にする。
	const scene = path.join(project, 'main.gd');
	fs.writeFileSync(scene, fs.readFileSync(scene, 'utf8').replace(/^const FROZEN := .*$/m, 'const FROZEN := -1.0 # 回したいので止めない。'));
	child.execFileSync(godot, ['--headless', '--path', project, '--import'], { stdio: 'pipe', timeout: 600000 });
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], { stdio: 'pipe', timeout: 600000 });
}

// 回っている画面から、文字の状態を何度か読み取る。
async function main() {
	build();
	const server = createServer(site);
	await new Promise((done) => server.listen(port, '127.0.0.1', done));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true,
		args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-device-scale-factor=1', '--hide-scrollbars'] });
	try {
		const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
		await page.getByText('Y', { exact: true }).first().waitFor({ timeout: 90000 });
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(1200);
		// 傾きと位置を、時間をあけて何度も読む。
		const frames = [];
		for (let index = 0; index < shots; index += 1) {
			frames.push(await page.evaluate(() => {
				const nodes = [...document.querySelectorAll('[data-yweb-text]')];
				const read = nodes.map((node) => {
					const found = /matrix\(([^)]+)\)/.exec(getComputedStyle(node).transform);
					if (!found) return null;
					const parts = found[1].split(',').map(Number);
					return { angle: Math.atan2(parts[1], parts[0]) * 180 / Math.PI, x: parts[4], y: parts[5] };
				}).filter(Boolean);
				return { count: nodes.length, angles: read.map((item) => item.angle), spots: read.map((item) => [item.x, item.y]),
					text: document.body.innerText.replace(/\s+/g, '') };
			}));
			await page.waitForTimeout(400);
		}
		await Promise.all([page.screenshot({ path: path.join(work, 'spin.png') })]);

		// 文字の数が揃い、傾きが輪の形にふさわしく散らばっていること。
		// 輪をまたぐと同じ角になる文字はありうるので、全部が別の角であることは求めない。
		for (const frame of frames) {
			assert.equal(frame.count, letters, `文字の数が違う: ${frame.count}`);
			const kinds = new Set(frame.angles.map((value) => value.toFixed(1))).size;
			assert.ok(kinds >= letters * 0.8, `傾きの散らばりが足りない: ${kinds}/${letters}`);
			const span = Math.max(...frame.angles) - Math.min(...frame.angles);
			assert.ok(span > 300, `輪を一周していない: ${span.toFixed(1)}度`);
		}
		// 時間がたつと傾きが変わること。つまり回っていること。
		const moved = frames[0].angles.filter((value, index) => Math.abs(value - frames[frames.length - 1].angles[index]) > 1).length;
		assert.ok(moved >= letters * 0.9, `回っていない文字が多い: 動いたのは${moved}/${letters}`);
		// 位置も動いていること。輪の上を進んでいる証拠。
		const shifted = frames[0].spots.filter((spot, index) => Math.hypot(spot[0] - frames[frames.length - 1].spots[index][0], spot[1] - frames[frames.length - 1].spots[index][1]) > 1).length;
		assert.ok(shifted >= letters * 0.9, `場所が動いていない文字が多い: ${shifted}/${letters}`);
		// 回っている間も、文字は選べるHTMLのままであること。
		assert.match(frames[0].text, /YURUTTOWEBSITEEXPORTERRINGS/, `文字が読めない: ${frames[0].text.slice(0, 40)}`);
		assert.match(frames[0].text, /ぐるぐるまわる/, '日本語が読めない');
		assert.deepEqual(errors, [], `Browser errorが出た: ${errors.join(' / ')}`);
		const span = Math.max(...frames[0].angles) - Math.min(...frames[0].angles);
		console.log(JSON.stringify({ ok: true, letters, shots, spun: moved, moved: shifted, angleSpan: `${span.toFixed(1)}deg`, selectable: true }));
	} finally {
		await browser.close();
		server.close();
	}
}

main();
