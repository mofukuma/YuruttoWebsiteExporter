// 本家Web loaderからGPU機能検査だけを除いたgdweb用loader sourceを生成する。
// fetch、secure context、thread検査は維持し、Canvas 2D起動に不要な条件だけを外す。
// 設計思想：本家loaderとの差分を小さい機械変換へ固定する。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const featureSource = path.resolve(process.argv[2]); // 本家機能検査。
const engineSource = path.resolve(process.argv[3]); // 本家Engine公開面。
const featureOutput = path.resolve(process.argv[4]); // gdweb機能検査。
const engineOutput = path.resolve(process.argv[5]); // gdweb Engine公開面。
let features = fs.readFileSync(featureSource, 'utf8');
let engine = fs.readFileSync(engineSource, 'utf8');

// GPU context検査関数と必須条件を除去する。
features = features.replace(/\t\/\*\*[\s\S]*?isWebGLAvailable:[\s\S]*?\n\t\},\n\n(?=\t\/\*\*\n\t \* Check whether the Fetch API)/, '');
features = features.replace(/\t\tif \(!Features\.isWebGLAvailable\(2\)\) \{[\s\S]*?\n\t\t\}/, '');
engine = engine.replace(/\n\tSafeEngine\['isWebGLAvailable'\] = Features\.isWebGLAvailable;/, '');

for (const text of [features, engine]) assert.doesNotMatch(text, /webgl|opengl|gles/i, 'GPU機能語がloaderに残存');
assert.match(features, /isFetchAvailable/, 'Fetch検査が欠落');
assert.match(features, /isSecureContext/, 'secure context検査が欠落');
fs.mkdirSync(path.dirname(featureOutput), { recursive: true });
fs.writeFileSync(featureOutput, features);
fs.writeFileSync(engineOutput, engine);
