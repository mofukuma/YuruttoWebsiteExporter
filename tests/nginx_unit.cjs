// container実行環境の選びかたを、分かれ道すべて通して確かめる単体検査。
// 実際のcommandに頼らず、見つかる場合と見つからない場合を作って固定する。

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime, CANDIDATES } = require('./nginx.cjs');

// 指定した名前だけが動く、という状況を作る。
function only(name) {
	return (candidate) => (candidate === name ? { status: 0 } : { status: 1 });
}

test('先に試すものが動けば、それを使う', () => {
	assert.equal(runtime(only('docker')), 'docker');
});

test('先が駄目でも、後が動けばそれを使う', () => {
	assert.equal(runtime(only('podman')), 'podman');
});

test('どちらも動かなければ、空を返す', () => {
	assert.equal(runtime(() => ({ status: 1 })), '');
});

test('commandが無くて実行できないときも、空を返す', () => {
	assert.equal(runtime(() => ({ error: new Error('ENOENT') })), '');
});

test('実行できないものは飛ばし、動くほうを選ぶ', () => {
	assert.equal(runtime((name) => (name === 'docker' ? { error: new Error('ENOENT') } : { status: 0 })), 'podman');
});

test('試す順は、先にdockerを見る', () => {
	assert.deepEqual(CANDIDATES, ['docker', 'podman']);
});

test('既定の調べかたでも、候補のどれかか空を返す', () => {
	// 手元に何があるかは環境次第なので、値そのものではなく取りうる範囲を確かめる。
	const found = runtime();
	assert.ok(found === '' || CANDIDATES.includes(found), `思わぬ値: ${found}`);
});
