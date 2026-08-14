// minimum版の3D拒否境界を2D作品と3D fixtureで確認する。
// 同じcheckerへ成功例と失敗例を渡し、書き出し前の終了値を固定する。

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..'); // 検査対象を含むproject root。
const checker = path.join(root, 'build/check_minimum.cjs'); // 3D境界検査。

// projectを検査し、終了値と説明を返す。
function check(project) {
	return spawnSync(process.execPath, [checker, project], { encoding: 'utf8' });
}

const allowed = check(path.join(root, 'examples/daito_projects'));
const blocked = check(path.join(root, 'tests/fixtures/minimum_3d'));
assert.equal(allowed.status, 0, allowed.stderr);
assert.equal(blocked.status, 1, `3D sceneを許可: ${blocked.stderr}`);
assert.match(blocked.stderr, /main\.tscn: 3D型/);
console.log(JSON.stringify({ ok: true, allowed: 1, rejected: 1 }));
