// RichTextLabelのBBCodeが、書き出しの段ごとにどう出るかを固定する。
// いまのExporterはRichTextLabelを文字DOMの対象にしていない。Canvasのある2Dでは
// Godotが描くので見えるが、Canvasを積まないDOM onlyでは文字が消える。
// 対応する時にこの検査が落ちるので、消えたままの状態へ戻ることを防げる。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const child = require('node:child_process');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { browserPath } = require('./browser.cjs'); // 導入済みplaywright-coreの固定Chromium。
const { createServer } = require('../build/serve_web.cjs'); // 成果物を配る簡易server。

const repo = path.resolve(__dirname, '..'); // project root。
const work = path.join(repo, 'tmp/bbcode'); // 書き出しと結果の置き場。
const size = { width: 900, height: 700 }; // fixtureの画面寸法と揃える。
// 見た目の変わりかたで分けたBBCodeの一覧。fixtureのSAMPLESと同じ並びを持つ。
// 記法ごとに置いた言葉。飾りが落ちても、この言葉はDOMへ残るはず。
const WORDS = ['ふつうの文字', '太字', '斜体', '下線', '取消', 'code();', '色つき', '背景', '前景',
	'縁取り', '大きい', '中央', '右', '両端', '字下げ', 'リンク', 'ゆれ', '渦', 'ふるえ', '薄れ',
	'虹', '明滅', '一つ目', '補足'];
const TAGS = ['plain', 'b', 'i', 'u', 's', 'code', 'color', 'bgcolor', 'fgcolor', 'outline',
	'font_size', 'center', 'right', 'fill', 'indent', 'url', 'wave', 'tornado', 'shake', 'fade',
	'rainbow', 'pulse', 'ul', 'hint', 'char'];

// 指定levelでfixtureを書き出し、成果物の置き場を返す。
function build(level) {
	const project = path.join(work, `project-${level}`);
	const site = path.join(work, `site-${level}`);
	fs.rmSync(project, { recursive: true, force: true });
	fs.rmSync(site, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/bbcode'), project, { recursive: true });
	fs.writeFileSync(path.join(project, 'export_presets.cfg'), ['[preset.0]', '',
		'name="Web"', 'platform="Yurutto Website"', 'runnable=true', 'export_filter="all_resources"',
		'include_filter=""', 'exclude_filter=""', 'export_path=""', '', '[preset.0.options]', '',
		`yweb/level=${level}`, 'html/focus_canvas_on_start=true', ''].join('\n'));
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')],
		{ stdio: 'pipe', timeout: 600000 });
	return site;
}

// 成果物を開き、文字DOMとCanvasの状態を読む。
async function observe(browser, site) {
	const server = createServer(site);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
		const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
		// 比べる相手のLabelが出るまで待つ。ここまで来れば画面は動いている。
		await page.waitForFunction(() => [...document.querySelectorAll('[data-yweb-text]')]
			.some((node) => node.textContent === 'PLAIN LABEL'), undefined, { timeout: 90000, polling: 'raf' });
		await page.evaluate(() => document.fonts.ready);
		const state = await page.evaluate(() => {
			const canvas = document.querySelector('canvas');
			const visible = canvas ? getComputedStyle(canvas).visibility !== 'hidden' : false;
			let lit = 0;
			if (visible) {
				// Canvasに何か描かれているかを、明るい画素の数で見る。
				const probe = document.createElement('canvas');
				probe.width = canvas.width;
				probe.height = canvas.height;
				probe.getContext('2d').drawImage(canvas, 0, 0);
				const pixels = probe.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
				for (let at = 0; at < pixels.length; at += 4) {
					if (pixels[at] + pixels[at + 1] + pixels[at + 2] > 140) lit += 1;
				}
			}
			return { visible, lit, text: document.body.innerText.replace(/\s+/g, ' ').trim() };
		});
		assert.deepEqual(errors, [], `Browser errorが出た: ${errors.join(' / ')}`);
		await page.close();
		return state;
	} finally {
		server.close();
	}
}

// 2DとDOM onlyの両方を見て、いまの扱いを固定する。
async function main() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.mkdirSync(work, { recursive: true });
	// fixtureが並べる記法の数と、この検査が知っている数を揃える。
	const source = fs.readFileSync(path.join(repo, 'tests/fixtures/bbcode/main.gd'), 'utf8');
	const listed = [...source.matchAll(/^\t\["([a-z_]+)",/gm)].map((found) => found[1]);
	assert.deepEqual(listed, TAGS, 'fixtureのBBCode一覧と検査の一覧が違う');

	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	try {
		// 2DはCanvasを積むので、GodotがBBCodeを描く。描かれていることを画素で見る。
		const canvas = await observe(browser, build(1));
		assert.equal(canvas.visible, true, '2DでCanvasが隠れている');
		assert.ok(canvas.lit > 3000, `2DでBBCodeが描かれていない: 明るい画素${canvas.lit}`);
		assert.match(canvas.text, /PLAIN LABEL/, '2Dで比べる相手のLabelが出ていない');

		// DOM onlyはCanvasを積まない。RichTextLabelは行ごとの文字としてDOMへ出る。
		// 飾りそのものは行を丸ごと一つの要素にする作りでは表せないが、中身の文字は残る。
		// 記法ごとに置いた言葉が読めることを見て、文字が落ちていないことを固定する。
		const dom = await observe(browser, build(0));
		assert.equal(dom.visible, false, 'DOM onlyでCanvasが残っている');
		assert.match(dom.text, /PLAIN LABEL/, 'DOM onlyで比べる相手のLabelが出ていない');
		const missing = WORDS.filter((word) => !dom.text.includes(word));
		assert.deepEqual(missing, [], `DOM onlyで読めないBBCodeがある: ${missing.join(' ')}`);

		const result = { ok: true, tags: TAGS.length, words: WORDS.length, canvas: { lit: canvas.lit } };
		fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
		console.log(JSON.stringify(result));
	} finally {
		await browser.close();
	}
}

main();
