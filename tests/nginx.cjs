// nginxを使うtestが、手元にcontainer実行環境が無いときへ揃って対処する。
// 開発中はDockerを前提にしないので、無い場合は失敗ではなく省略として扱う。

'use strict';

const child = require('node:child_process');

// container commandとして実際に動くものを一つ選ぶ。無ければ空。
function runtime() {
	for (const name of ['docker', 'podman']) {
		const found = child.spawnSync(name, ['version'], { stdio: 'ignore' });
		if (!found.error && found.status === 0) return name;
	}
	return '';
}

module.exports = { runtime };
