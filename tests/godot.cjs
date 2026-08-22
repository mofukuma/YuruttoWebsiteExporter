// 検査で使うGodotの実行pathを一箇所で決め、異常終了した時のやり直しもここへ集める。
// 対応版を固定しつつ、置き場所が違う環境でも同じtestを動かせるようにする。

'use strict';

const child = require('node:child_process');

const godot = process.env.GODOT_BIN || '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 対応版のGodot。
const crashed = new Set(['SIGSEGV', 'SIGABRT', 'SIGBUS']); // 作業threadの異常終了を表す合図。
const retries = 2; // 異常終了した時にやり直す回数。

// Godotを走らせる。異常終了した時はやり直し、それ以外の失敗はそのまま投げる。
// Godotはfontを二つ同時に取り込むとき、作業threadの中で稀に落ちる。crash reportは
// どれもWorkerThreadでのnull参照(0x10)で、同じ入力でも起きたり起きなかったりする。
// 書き出しや取り込みの中身とは関わりがないため、ここで吸収する。
function runGodot(args, options = {}) {
	for (let attempt = 0; ; attempt += 1) {
		try {
			return child.execFileSync(godot, args, { stdio: 'pipe', ...options });
		} catch (error) {
			if (!crashed.has(error.signal) || attempt >= retries) throw error;
		}
	}
}

module.exports = { godot, runGodot };
