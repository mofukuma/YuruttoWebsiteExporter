// nginxを使うtestが、手元にcontainer実行環境が無いときへ揃って対処する。
// 開発中はDockerを前提にしないので、無い場合は失敗ではなく省略として扱う。

'use strict';

const child = require('node:child_process');

const CANDIDATES = ['docker', 'podman']; // 試す順。先に見つかったものを使う。

// container commandとして実際に動くものを一つ選ぶ。無ければ空。
// 実行の仕方を差し替えられるようにして、検査から全ての分かれ道を通せるようにする。
function runtime(run = (name) => child.spawnSync(name, ['version'], { stdio: 'ignore' })) {
	for (const name of CANDIDATES) {
		const found = run(name);
		if (!found.error && found.status === 0) return name;
	}
	return '';
}

module.exports = { runtime, CANDIDATES };
