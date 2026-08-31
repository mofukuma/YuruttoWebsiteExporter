// tmpへ作った対象別テンプレートの内容と由来を検査する。
// addonへ部分反映せず、固定Dockerで作った一段の完成状態を確かめる設計。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { artifactKey, compileKey, levelLine } = require('../build/template_key.cjs');
const { sha } = require('../build/manifest_hash.cjs');

const root = path.resolve(__dirname, '..'); // yweb project root。
const template = path.resolve(process.argv[2] || ''); // tmpへ作った検査対象ZIP。
const level = process.argv[3] || ''; // dom、3dのいずれか。
const proofFile = path.join(path.dirname(template), `yweb-${level}-manifest.json`); // package時の由来記録。
const buffer = { maxBuffer: 32 * 1024 * 1024 }; // WASM展開に必要な上限。

levelLine(level);
assert.ok(fs.existsSync(template), `templateなし: ${template}`);
assert.ok(fs.existsSync(proofFile), `由来記録なし: ${proofFile}`);
const proof = JSON.parse(fs.readFileSync(proofFile));
assert.equal(proof.level, level);
assert.equal(proof.sha256, sha(template));
assert.equal(proof.bytes, fs.statSync(template).size);
assert.equal(proof.compileKey, compileKey(level));
assert.equal(proof.artifactKey, artifactKey(level));

const names = child.execFileSync('unzip', ['-Z1', template], { encoding: 'utf8' }).trim().split('\n');
assert.deepEqual(names, proof.entries.map((entry) => entry.file));
for (const item of proof.brotli.entries) {
	const raw = child.execFileSync('unzip', ['-p', template, item.file], buffer);
	const encoded = child.execFileSync('unzip', ['-p', template, `${item.file}.br`], buffer);
	assert.deepEqual(zlib.brotliDecompressSync(encoded), raw, `Brotli不一致: ${item.file}`);
}

console.log(JSON.stringify({ ok: true, level, bytes: proof.bytes, entries: names.length }));
