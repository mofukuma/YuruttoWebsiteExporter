// PNGの読み取りと絵の比べかたを、分かれ道すべて通して確かめる単体検査。
// PNGを手で組み立てられるので、外の絵に頼らず境目の振る舞いまで固定できる。

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const zlib = require('node:zlib');
const { decode, meanAbsoluteError, rootMeanSquareError } = require('./png.cjs');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNGの署名。

// chunk一つ分を、長さと種類と中身と検査値の形へ組み立てる。
function chunk(kind, body) {
	const head = Buffer.alloc(4);
	head.writeUInt32BE(body.length, 0);
	const tail = Buffer.alloc(4); // 検査値は読み側が見ないので0で足りる。
	return Buffer.concat([head, Buffer.from(kind, 'ascii'), body, tail]);
}

// 見出しchunkを、大きさと色の形から作る。
function header(width, height, color, depth = 8, interlace = 0) {
	const body = Buffer.alloc(13);
	body.writeUInt32BE(width, 0);
	body.writeUInt32BE(height, 4);
	body[8] = depth;
	body[9] = color;
	body[12] = interlace;
	return chunk('IHDR', body);
}

// 行ごとの予測種別と画素から、一枚のPNGを組み立てる。
function png(width, height, color, rows) {
	const raw = Buffer.concat(rows.map((row) => Buffer.from([row.filter, ...row.bytes])));
	return Buffer.concat([SIGNATURE, header(width, height, color), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// 絵の(x,y)の色をRGBで返す。添字の数え間違いを避けるための助け。
function at(image, x, y) {
	const base = (y * image.width + x) * 4;
	return [...image.pixels.subarray(base, base + 3)];
}

// 一色で埋めた絵を、比べる側の材料として作る。
function solid(width, height, value) {
	const rows = [];
	for (let y = 0; y < height; y += 1) rows.push({ filter: 0, bytes: new Array(width * 3).fill(value) });
	return decode(png(width, height, 2, rows));
}

test('RGBのPNGを、不透明のRGBAとして読む', () => {
	const image = decode(png(2, 1, 2, [{ filter: 0, bytes: [10, 20, 30, 40, 50, 60] }]));
	assert.equal(image.width, 2);
	assert.equal(image.height, 1);
	assert.deepEqual([...image.pixels], [10, 20, 30, 255, 40, 50, 60, 255]);
});

test('RGBAのPNGを、そのまま読む', () => {
	const image = decode(png(1, 1, 6, [{ filter: 0, bytes: [1, 2, 3, 4] }]));
	assert.deepEqual([...image.pixels], [1, 2, 3, 4]);
});

test('予測なし(filter 0)を読む', () => {
	const image = decode(png(1, 2, 2, [{ filter: 0, bytes: [9, 9, 9] }, { filter: 0, bytes: [7, 7, 7] }]));
	assert.deepEqual(at(image, 0, 1), [7, 7, 7]);
});

test('左を足す予測(filter 1)を戻す', () => {
	// 一行目は左が無いところから始まり、次の画素で左の値が足される。
	const image = decode(png(2, 1, 2, [{ filter: 1, bytes: [10, 20, 30, 5, 5, 5] }]));
	assert.deepEqual([...image.pixels], [10, 20, 30, 255, 15, 25, 35, 255]);
});

test('上を足す予測(filter 2)を戻す', () => {
	const image = decode(png(1, 2, 2, [{ filter: 0, bytes: [10, 20, 30] }, { filter: 2, bytes: [1, 2, 3] }]));
	assert.deepEqual(at(image, 0, 1), [11, 22, 33]);
});

test('左と上の平均を足す予測(filter 3)を戻す', () => {
	// 二行目の二画素目は、左(20)と上(10)の平均15が足される。
	const image = decode(png(2, 2, 2, [
		{ filter: 0, bytes: [10, 10, 10, 10, 10, 10] },
		{ filter: 3, bytes: [15, 15, 15, 0, 0, 0] },
	]));
	assert.deepEqual(at(image, 0, 1), [20, 20, 20]);
	assert.deepEqual(at(image, 1, 1), [15, 15, 15]);
});

test('Paeth予測(filter 4)で、上が近いときは上を選ぶ', () => {
	// 二行目の一画素目は左が無いので予測は上(10)。5を足して15になる。
	// 二画素目は左15、上200、左上10。予測値205に一番近いのは上なので200が選ばれる。
	const image = decode(png(2, 2, 2, [
		{ filter: 0, bytes: [10, 10, 10, 200, 200, 200] },
		{ filter: 4, bytes: [5, 5, 5, 0, 0, 0] },
	]));
	assert.deepEqual(at(image, 0, 1), [15, 15, 15]);
	assert.deepEqual(at(image, 1, 1), [200, 200, 200]);
});

test('Paeth予測(filter 4)で、左が近いときは左を選ぶ', () => {
	// 二画素目は左10、上10、左上10。三つとも同じなら左が選ばれる。
	const image = decode(png(2, 2, 2, [
		{ filter: 0, bytes: [10, 10, 10, 10, 10, 10] },
		{ filter: 4, bytes: [0, 0, 0, 3, 3, 3] },
	]));
	assert.deepEqual(at(image, 0, 1), [10, 10, 10]);
	assert.deepEqual(at(image, 1, 1), [13, 13, 13]);
});

test('Paeth予測(filter 4)で、左上が近いときは左上を選ぶ', () => {
	// 二画素目は左200、上0、左上100。予測値100に一番近いのは左上なので100が選ばれる。
	const image = decode(png(2, 2, 2, [
		{ filter: 0, bytes: [100, 100, 100, 0, 0, 0] },
		{ filter: 4, bytes: [100, 100, 100, 7, 7, 7] },
	]));
	assert.deepEqual(at(image, 0, 1), [200, 200, 200]);
	assert.deepEqual(at(image, 1, 1), [107, 107, 107]);
});

test('扱えない色の形は、理由を言って断る', () => {
	assert.throws(() => decode(png(1, 1, 0, [{ filter: 0, bytes: [0] }])), /未対応PNG色形式/);
});

test('扱えない深さは、理由を言って断る', () => {
	const body = Buffer.concat([SIGNATURE, header(1, 1, 2, 16), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
	assert.throws(() => decode(body), /未対応PNG/);
});

test('入り組んだ並び(interlace)は、理由を言って断る', () => {
	const body = Buffer.concat([SIGNATURE, header(1, 1, 2, 8, 1), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
	assert.throws(() => decode(body), /未対応PNG/);
});

test('同じ絵どうしの食い違いは0', () => {
	assert.equal(meanAbsoluteError(solid(4, 4, 100), solid(4, 4, 100)), 0);
});

test('黒と白の食い違いは1', () => {
	assert.equal(meanAbsoluteError(solid(2, 2, 0), solid(2, 2, 255)), 1);
});

test('食い違いは、色の差の割合で返る', () => {
	// 全画素が各色51だけ違うので、51/255=0.2になる。
	assert.equal(+meanAbsoluteError(solid(3, 3, 0), solid(3, 3, 51)).toFixed(6), 0.2);
});

test('透明度は食い違いに数えない', () => {
	// 色が同じで透明度だけ違う絵は、食い違い0として扱う。
	const opaque = decode(png(1, 1, 6, [{ filter: 0, bytes: [10, 20, 30, 255] }]));
	const clear = decode(png(1, 1, 6, [{ filter: 0, bytes: [10, 20, 30, 0] }]));
	assert.equal(meanAbsoluteError(opaque, clear), 0);
});

test('大きさが違う絵どうしは、理由を言って断る', () => {
	assert.throws(() => meanAbsoluteError(solid(2, 2, 0), solid(3, 3, 0)), /大きさが違う/);
	assert.throws(() => meanAbsoluteError(solid(2, 3, 0), solid(2, 4, 0)), /大きさが違う/);
});

test('二乗平均でも、同じ絵どうしの食い違いは0', () => {
	assert.equal(rootMeanSquareError(solid(4, 4, 100), solid(4, 4, 100)), 0);
});

test('二乗平均でも、黒と白の食い違いは1', () => {
	assert.equal(rootMeanSquareError(solid(2, 2, 0), solid(2, 2, 255)), 1);
});

test('二乗平均は、一部の大きな崩れを平均より強く数える', () => {
	// 4画素のうち1画素だけが真っ白。平均は0.25、二乗平均は0.5になる。
	const black = decode(png(2, 2, 6, [
		{ filter: 0, bytes: [0, 0, 0, 255, 0, 0, 0, 255] },
		{ filter: 0, bytes: [0, 0, 0, 255, 0, 0, 0, 255] },
	]));
	const spot = decode(png(2, 2, 6, [
		{ filter: 0, bytes: [255, 255, 255, 255, 0, 0, 0, 255] },
		{ filter: 0, bytes: [0, 0, 0, 255, 0, 0, 0, 255] },
	]));
	assert.equal(+meanAbsoluteError(black, spot).toFixed(6), 0.25);
	assert.equal(+rootMeanSquareError(black, spot).toFixed(6), 0.5);
});

test('二乗平均でも、大きさが違う絵どうしは理由を言って断る', () => {
	assert.throws(() => rootMeanSquareError(solid(2, 2, 0), solid(3, 3, 0)), /大きさが違う/);
	assert.throws(() => rootMeanSquareError(solid(2, 3, 0), solid(2, 4, 0)), /大きさが違う/);
});
