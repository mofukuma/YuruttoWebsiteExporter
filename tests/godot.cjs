// 検査で使うGodotの実行pathを一箇所で決める。
// 対応版を固定しつつ、置き場所が違う環境でも同じtestを動かせるようにする。

'use strict';

const godot = process.env.GODOT_BIN || '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 対応版のGodot。

module.exports = { godot };
