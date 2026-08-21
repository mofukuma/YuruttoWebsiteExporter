// 検査と実例で使うLINE Seed JPをGoogle Fonts CDNから取得する。
// Fontはtest資材のためrepositoryへ入れず、無い時だけ取得して配置する。

'use strict';

const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const cache = path.join(repo, 'tmp/fonts'); // 取得物の保管先。
const stem = 'LINESeedJP-Regular'; // 取得fontの共通basename。
const css = 'https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400'; // 由来を固定するCDN入口。
const agent = 'Mozilla/4.0'; // 分割woff2ではなく一体TTFを受け取るUA。

// CDNのCSSから一体TTFのURLを取り出す。
function locate() {
	const sheet = child.execFileSync('curl', ['-fsSL', '-A', agent, css], { encoding: 'utf8' });
	const found = sheet.match(/https:\/\/[^)]+\.ttf/);
	if (!found) throw new Error('Google Fonts CSSにTTFのURLなし');
	return found[0];
}

// TTFを取得し、fonttoolsで同じ書体のWOFF2へ変換する。
function download(ttf, woff2) {
	fs.mkdirSync(cache, { recursive: true });
	try {
		child.execFileSync('curl', ['-fsSL', locate(), '-o', ttf], { stdio: 'pipe' });
	} catch (error) {
		throw new Error(`Google Fonts CDNからLINE Seed JPを取得できません: ${error.message}`);
	}
	try {
		// 変換道具はuvがその場で用意する。host側へ事前導入しなくても同じ結果になる。
		child.execFileSync('uv', ['run', '--quiet', '--with', 'fonttools', '--with', 'brotli',
			'python', '-m', 'fontTools.ttLib.woff2', 'compress', '-q', '-o', woff2, ttf], { stdio: 'pipe' });
	} catch (error) {
		fs.rmSync(ttf, { force: true });
		throw new Error(`WOFF2変換にuvが必要です (https://docs.astral.sh/uv/): ${error.message}`);
	}
}

// 取得物を用意し、TTFとWOFF2のpathを返す。
function ensure() {
	const font = { ttf: path.join(cache, `${stem}.ttf`), woff2: path.join(cache, `${stem}.woff2`) };
	const ready = Object.values(font).every((file) => fs.existsSync(file) && fs.statSync(file).size > 0);
	if (!ready) download(font.ttf, font.woff2);
	return font;
}

// 指定directoryへ同じbasenameでTTFとWOFF2を置く。
function install(directory, name = stem) {
	const font = ensure();
	fs.mkdirSync(directory, { recursive: true });
	const placed = { ttf: path.join(directory, `${name}.ttf`), woff2: path.join(directory, `${name}.woff2`) };
	fs.copyFileSync(font.ttf, placed.ttf);
	fs.copyFileSync(font.woff2, placed.woff2);
	return placed;
}

// CLI利用時は取得だけ行い、引数があればそのdirectoryへ配置する。
if (require.main === module) {
	try {
		const target = process.argv[2];
		console.log(JSON.stringify({ ok: true, ...(target ? install(path.resolve(target)) : ensure()) }));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

module.exports = { ensure, install, stem };
