// testが検査するWeb成果物を、Godot projectから必要な時だけ書き出す。
// 事前手順なしで各testを単体実行でき、projectとテンプレートが変わらない再実行では書き出しを省く設計。

'use strict';

const child = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // 書き出しscriptを持つproject root。
const { godot, runGodot } = require('./godot.cjs'); // 対応版のGodotと、異常終了を吸収する起動。
const template = path.join(repo, 'addons/yurutto_website_exporter/templates/yweb-2d.zip'); // 成果物へ入る既定levelのテンプレート。
const generated = new Set(['.godot', 'addons', 'export_presets.cfg']); // 書き出し手順が生成するproject内領域。
// 素のGodot Web templateの置き場。Godotの導入先へ入れず、tmpへ落としたものを直に指す。
// これがないとGodotは書き出しを断るため、比較の相手を用意できない。
const standardTemplate = path.resolve(__dirname, '../tmp/godot-templates/web_nothreads_release.zip');

const standardPreset = `[preset.0]

name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter=""
exclude_filter=""
export_path=""
script_export_mode=2

[preset.0.options]

vram_texture_compression/for_desktop=true
html/focus_canvas_on_start=true
custom_template/release="${standardTemplate}"
`; // 比較用の標準Web書き出し設定。

// project内で最も新しい更新時刻を返す。
function newest(dir) {
	let time = 0;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.') || generated.has(entry.name)) continue;
		const file = path.join(dir, entry.name);
		time = Math.max(time, entry.isDirectory() ? newest(file) : fs.statSync(file).mtimeMs);
	}
	return time;
}

// 成果物が入力より古いかを判断する。
function stale(site, source) {
	const index = path.join(site, 'index.html');
	return !fs.existsSync(index) || fs.statSync(index).mtimeMs < source;
}

// ゆるっとWebテンプレートの成果物を用意する。
// 書き出しはaddonの複製とpreset書き換えをprojectへ行うため、examplesではなくtmpの複製で走らせる。
function ensure(project, site) {
	if (stale(site, Math.max(newest(project), fs.statSync(template).mtimeMs))) {
		const work = `${site}-project`; // 書き出し手順が触ってよい複製。
		// presetは書き出し設定の正本なので複製へ持ち込む。addonとimport cacheは手順が作り直す。
		const skip = new Set(['.godot', 'addons']);
		fs.rmSync(work, { recursive: true, force: true });
		fs.cpSync(project, work, { recursive: true, filter: (from) => !skip.has(path.basename(from)) });
		child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), work, path.join(site, 'index.html')], { stdio: 'pipe' });
	}
	return site;
}

// 同じsceneをGodot標準Webテンプレートで書き出し、比較の対照を用意する。
function ensureStandard(project, site) {
	if (!stale(site, newest(project))) return site;
	const work = `${site}-project`; // addonを外した標準書き出し用の複製。
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(project, work, { recursive: true, filter: (from) => !generated.has(path.basename(from)) });
	assert.ok(fs.existsSync(standardTemplate), `素のGodot Web templateがない: ${standardTemplate}\nbuild/fetch_godot_templates.sh で用意できる。`);
	fs.writeFileSync(path.join(work, 'export_presets.cfg'), standardPreset);
	fs.mkdirSync(site, { recursive: true });
	runGodot(['--headless', '--path', work, '--export-release', 'Web', path.join(site, 'index.html')], { stdio: 'pipe' });
	return site;
}

module.exports = { ensure, ensureStandard };
