// 検査と実例で使うLINE Seed JPをGoogle Fonts CDNから取得する。
// Fontはtest資材のためrepositoryへ入れず、無い時だけ取得して配置する。
// 一度そろえたものは作り直さない。取得は途中で止まっても中途半端な形を残さない。

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

// fileが名乗りどおりの形で、途中で切れていないかを見る。
// 大きさを見るのみでは、途中まで書かれたfileを本物と取り違える。
function intact(file, kind) {
	if (!fs.existsSync(file)) return false;
	let handle;
	try {
		handle = fs.openSync(file, 'r');
		const size = fs.fstatSync(handle).size;
		const head = Buffer.alloc(12);
		if (fs.readSync(handle, head, 0, 12, 0) < 12) return false;
		// WOFF2は先頭にwOF2と名乗り、全体の長さも自分で持つ。切れていれば合わない。
		if (kind === 'woff2') return head.subarray(0, 4).toString('latin1') === 'wOF2' && head.readUInt32BE(8) === size;
		// TTFは先頭のsfntVersionと表の数を持ち、表ごとに位置と長さを並べる。
		// その並びが指す末尾までfileがあるかを見れば、途中で切れたものを見抜ける。
		if (head.readUInt32BE(0) !== 0x00010000) return false;
		const tables = head.readUInt16BE(4);
		if (tables <= 0 || size < 12 + tables * 16) return false;
		const list = Buffer.alloc(tables * 16);
		if (fs.readSync(handle, list, 0, list.length, 12) < list.length) return false;
		for (let index = 0; index < tables; index += 1) {
			const at = index * 16;
			if (list.readUInt32BE(at + 8) + list.readUInt32BE(at + 12) > size) return false;
		}
		return true;
	} catch {
		return false;
	} finally {
		if (handle !== undefined) fs.closeSync(handle);
	}
}

// TTFを取得し、fonttoolsで同じ書体のWOFF2へ変換する。
// 途中で止まっても本来のpathへは置かない。作り終えてから名前を移す。
function download(ttf, woff2) {
	fs.mkdirSync(cache, { recursive: true });
	const parts = { ttf: `${ttf}.part`, woff2: `${woff2}.part` };
	try {
		try {
			child.execFileSync('curl', ['-fsSL', locate(), '-o', parts.ttf], { stdio: 'pipe' });
		} catch (error) {
			throw new Error(`Google Fonts CDNからLINE Seed JPを取得できません: ${error.message}`);
		}
		if (!intact(parts.ttf, 'ttf')) throw new Error('取得したTTFが途中で切れています');
		try {
			// 変換道具はuvがその場で用意する。host側へ事前導入しなくても同じ結果になる。
			child.execFileSync('uv', ['run', '--quiet', '--with', 'fonttools', '--with', 'brotli',
				'python', '-m', 'fontTools.ttLib.woff2', 'compress', '-q', '-o', parts.woff2, parts.ttf], { stdio: 'pipe' });
		} catch (error) {
			throw new Error(`WOFF2変換にuvが必要です (https://docs.astral.sh/uv/): ${error.message}`);
		}
		if (!intact(parts.woff2, 'woff2')) throw new Error('変換したWOFF2が途中で切れています');
		fs.renameSync(parts.ttf, ttf);
		fs.renameSync(parts.woff2, woff2);
	} finally {
		for (const part of Object.values(parts)) fs.rmSync(part, { force: true });
	}
}

// 取得物を用意し、TTFとWOFF2のpathを返す。
// 揃っていれば取りに行かない。中途半端に残っていた時は取り直す。
function ensure() {
	const font = { ttf: path.join(cache, `${stem}.ttf`), woff2: path.join(cache, `${stem}.woff2`) };
	if (intact(font.ttf, 'ttf') && intact(font.woff2, 'woff2')) return font;
	download(font.ttf, font.woff2);
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

module.exports = { ensure, install, intact, stem };
