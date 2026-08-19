// PNGを画素の並びへ戻し、二枚の絵の違いを数で表す。
// 外部moduleを足さずに済むよう、比較に必要な8bit RGB/RGBAだけを扱う。

'use strict';

const zlib = require('node:zlib');

// PNGのchunkを順に読み、見出しと画素データを取り出す。
function chunks(buffer) {
	const parts = { data: [] };
	let at = 8; // PNG署名の次から読む。
	while (at + 8 <= buffer.length) {
		const size = buffer.readUInt32BE(at);
		const kind = buffer.toString('ascii', at + 4, at + 8);
		const body = buffer.subarray(at + 8, at + 8 + size);
		if (kind === 'IHDR') {
			parts.width = body.readUInt32BE(0);
			parts.height = body.readUInt32BE(4);
			parts.depth = body[8];
			parts.color = body[9];
			parts.interlace = body[12];
		} else if (kind === 'IDAT') {
			parts.data.push(Buffer.from(body));
		}
		at += 12 + size; // 長さ、種類、本体、検査値。
	}
	return parts;
}

// PNGの行ごとの予測を戻し、生の画素へ直す。
function unfilter(raw, width, height, channels) {
	const stride = width * channels;
	const out = Buffer.alloc(stride * height);
	let at = 0;
	for (let y = 0; y < height; y += 1) {
		const kind = raw[at];
		at += 1;
		const line = raw.subarray(at, at + stride);
		at += stride;
		const base = y * stride;
		const above = base - stride;
		for (let x = 0; x < stride; x += 1) {
			const left = x >= channels ? out[base + x - channels] : 0;
			const up = y > 0 ? out[above + x] : 0;
			const corner = y > 0 && x >= channels ? out[above + x - channels] : 0;
			let value = line[x];
			if (kind === 1) value += left;
			else if (kind === 2) value += up;
			else if (kind === 3) value += (left + up) >> 1;
			else if (kind === 4) {
				// Paeth。左、上、左上のうち予測に一番近いものを選ぶ。
				const estimate = left + up - corner;
				const dl = Math.abs(estimate - left);
				const du = Math.abs(estimate - up);
				const dc = Math.abs(estimate - corner);
				value += dl <= du && dl <= dc ? left : du <= dc ? up : corner;
			}
			out[base + x] = value & 0xff;
		}
	}
	return out;
}

// PNG fileを、幅と高さとRGBAの並びへ開く。
function decode(buffer) {
	const parts = chunks(buffer);
	if (parts.depth !== 8 || parts.interlace !== 0) throw new Error(`未対応PNG: depth=${parts.depth} interlace=${parts.interlace}`);
	const channels = parts.color === 6 ? 4 : parts.color === 2 ? 3 : 0;
	if (!channels) throw new Error(`未対応PNG色形式: ${parts.color}`);
	const raw = zlib.inflateSync(Buffer.concat(parts.data));
	const flat = unfilter(raw, parts.width, parts.height, channels);
	if (channels === 4) return { width: parts.width, height: parts.height, pixels: flat };
	// RGBだけの絵は、比較しやすいよう不透明のRGBAへ揃える。
	const rgba = Buffer.alloc(parts.width * parts.height * 4, 0xff);
	for (let index = 0; index < parts.width * parts.height; index += 1) {
		rgba[index * 4] = flat[index * 3];
		rgba[index * 4 + 1] = flat[index * 3 + 1];
		rgba[index * 4 + 2] = flat[index * 3 + 2];
	}
	return { width: parts.width, height: parts.height, pixels: rgba };
}

// 二枚の絵の、画素ごとの色の食い違いを平均で返す。
// 0が完全一致、1が正反対。割合で見たいので255で割った値にする。
function meanAbsoluteError(left, right) {
	if (left.width !== right.width || left.height !== right.height) {
		throw new Error(`大きさが違う: ${left.width}x${left.height} と ${right.width}x${right.height}`);
	}
	let total = 0;
	const count = left.width * left.height;
	for (let index = 0; index < count; index += 1) {
		const at = index * 4;
		total += Math.abs(left.pixels[at] - right.pixels[at]);
		total += Math.abs(left.pixels[at + 1] - right.pixels[at + 1]);
		total += Math.abs(left.pixels[at + 2] - right.pixels[at + 2]);
	}
	return total / (count * 3 * 255);
}

module.exports = { decode, meanAbsoluteError };
