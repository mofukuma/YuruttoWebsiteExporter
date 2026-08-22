// 関連レベルだけをビルドする入口と入力識別値を短く検査する。
// 重いGodotコンパイルを起動せず、高速化の分岐が消えた場合に止める。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { artifactKey, compileKey, levelLine } = require('../build/template_key.cjs');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const read = (name) => fs.readFileSync(path.join(repo, name), 'utf8'); // 検査するscript本文の読込。
const keys = ['dom', '2d', '3d'].map((level) => compileKey(level)); // レベル別コンパイル入力。
const artifacts = ['dom', '2d', '3d'].map((level) => artifactKey(level)); // レベル別配布入力。

assert.equal(new Set(keys).size, 3, 'level別の入力識別値が分かれていない');
assert.equal(new Set(artifacts).size, 3, 'level別の配布識別値が分かれていない');
assert.match(levelLine('dom'), /opengl3=no/);
assert.match(levelLine('2d'), /disable_3d=yes/);
assert.match(levelLine('3d'), /disable_3d=no/);
assert.throws(() => levelLine('bad'));

const template = read('build/build_template.sh');
assert.match(template, /compileKey|template_key\.cjs/);
assert.match(template, /cache_path=/);
assert.match(template, /コンパイル再利用/);
assert.match(template, /パッケージ再利用/);
assert.match(read('build/prepare_template.sh'), /for level in "\$@"/);
assert.match(read('build/prepare_template.sh'), /find build\/overlay -type f/);
assert.match(read('build/dev_template.sh'), /find build\/overlay -type f/);
assert.match(read('build/build_distribution.sh'), /"\$image" "\$@"/);
assert.match(read('build/check_template.sh'), /YWEB_TEMPLATE=/);

console.log(JSON.stringify({ ok: true, levels: 3, distinctKeys: new Set(keys).size, sconsCache: true, compileSkip: true, packageSkip: true }));
