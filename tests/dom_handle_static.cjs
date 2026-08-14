// gdweb DOM handleの正数契約とroot sentinelをsource上で検査する。
// 旧ObjectID由来の負値、安定割当、双方向回収の退行をbuild前に止める。
// 設計思想：browser境界の32 bit符号とGodot ObjectIDを混同させない。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const cppFile = path.join(root, 'tmp/godot-source/platform/web/gdweb_dom_sync.cpp'); // handle所有source。
const jsFile = path.join(root, 'tmp/godot-source/platform/web/js/libs/library_gdweb_dom.js'); // root判定source。
const resultFile = path.join(root, 'tmp/gdweb/normal-matrix/n07_n08_z_clip/dom-handle-static-result.json'); // 静的証拠。
const cpp = fs.readFileSync(cppFile, 'utf8');
const js = fs.readFileSync(jsFile, 'utf8');

// root判定を製品JSと同じ完全一致で模擬する。
const isRoot = (parentId) => parentId === -1;
const legacyNegative = [-1962933455, -1845492936, -1795161285]; // 実測した旧ObjectID下位32 bit。

assert.equal(isRoot(-1), true);
for (const value of legacyNegative) assert.equal(isRoot(value), false);
assert.match(js, /parentId === -1 \? GDWebDOM\.getRoot\(\)/);
assert.doesNotMatch(js, /parentId < 0 \? GDWebDOM\.getRoot\(\)/);
assert.match(cpp, /HashMap<ObjectID, int> dom_handles/);
assert.match(cpp, /HashMap<int, ObjectID> dom_objects/);
assert.match(cpp, /int next_handle = 1/);
assert.match(cpp, /handle == INT32_MAX \? 1 : handle \+ 1/);
assert.match(cpp, /dom_objects\.erase\(\*handle\)/);
assert.match(cpp, /dom_handles\.erase\(object\)/);
const result = { ok: true, rootSentinel: -1, legacyNegative, firstHandle: 1, wrapAfter: 2147483647 };
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
