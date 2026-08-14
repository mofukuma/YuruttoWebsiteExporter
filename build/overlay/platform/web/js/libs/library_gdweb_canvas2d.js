/**************************************************************************/
/*  library_gdweb_canvas2d.js                                             */
/**************************************************************************/

// Godotから届くCPU描画命令を唯一のCanvas 2D contextへ反映する。
// GPU context、独自layout、作品固有の分岐を持たない。

const GDWebCanvas2D = {
	$GDWebCanvas2D__deps: ['$GodotConfig', '$GodotDisplayScreen', '$GodotRuntime'],
	$GDWebCanvas2D: {
		textures: new Map(), // 安定handleからCPU画像Canvasへの対応。
		targets: new Map(), // Viewport handleからOffscreenCanvasへの対応。
		context: null, // 現在のrender target描画先。
		clipRect: null, // Godotが確定した現在のclip矩形。
		color: function (r, g, b, a) {
			return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
		},
		path: function (ctx, points, close) {
			ctx.beginPath();
			ctx.moveTo(points[0], points[1]);
			for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
			if (close) ctx.closePath();
		},
		clip: function (ctx) {
			if (!GDWebCanvas2D.clipRect) return;
			ctx.beginPath();
			ctx.rect(...GDWebCanvas2D.clipRect);
			ctx.clip();
		},
		tint: function (texture, sx, sy, sw, sh, color) {
			if (color[0] === 1 && color[1] === 1 && color[2] === 1) return { image: texture, sx, sy };
			const image = new OffscreenCanvas(sw, sh);
			const ctx = image.getContext('2d');
			ctx.drawImage(texture, sx, sy, sw, sh, 0, 0, sw, sh);
			ctx.globalCompositeOperation = 'multiply';
			ctx.fillStyle = GDWebCanvas2D.color(color[0], color[1], color[2], 1);
			ctx.fillRect(0, 0, sw, sh);
			ctx.globalCompositeOperation = 'destination-in';
			ctx.drawImage(texture, sx, sy, sw, sh, 0, 0, sw, sh);
			return { image, sx: 0, sy: 0 };
		},
		patch: function (ctx, image, source, target, modeX, modeY) {
			const [sx, sy, sw, sh] = source;
			const [dx, dy, dw, dh] = target;
			if (!sw || !sh || !dw || !dh) return;
			if (modeX === 0 && modeY === 0) {
				ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
				return;
			}
			const cols = modeX === 0 ? 1 : Math.max(1, modeX === 2 ? Math.round(dw / sw) : Math.ceil(dw / sw));
			const rows = modeY === 0 ? 1 : Math.max(1, modeY === 2 ? Math.round(dh / sh) : Math.ceil(dh / sh));
			const tw = modeX === 2 ? dw / cols : sw;
			const th = modeY === 2 ? dh / rows : sh;
			for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
				const width = Math.min(tw, dw - x * tw);
				const height = Math.min(th, dh - y * th);
				ctx.drawImage(image, sx, sy, sw * width / tw, sh * height / th, dx + x * tw, dy + y * th, width, height);
			}
		},
		triangle: function (ctx, points, colors, texture, uvs) {
			const same = colors.every((value, index) => value === colors[index % 4]);
			GDWebCanvas2D.path(ctx, points, true);
			if (texture && uvs) {
				ctx.save();
				ctx.clip();
				const uv = [...uvs];
				if (Math.max(...uv) <= 1) for (let i = 0; i < 6; i += 2) { uv[i] *= texture.width; uv[i + 1] *= texture.height; }
				const [u1, v1, u2, v2, u3, v3] = uv;
				const [x1, y1, x2, y2, x3, y3] = points;
				const det = (u1 - u3) * (v2 - v3) - (u2 - u3) * (v1 - v3);
				if (det) {
					const a = ((x1 - x3) * (v2 - v3) - (x2 - x3) * (v1 - v3)) / det;
					const c = ((u1 - u3) * (x2 - x3) - (u2 - u3) * (x1 - x3)) / det;
					const b = ((y1 - y3) * (v2 - v3) - (y2 - y3) * (v1 - v3)) / det;
					const d = ((u1 - u3) * (y2 - y3) - (u2 - u3) * (y1 - y3)) / det;
					ctx.transform(a, b, c, d, x1 - a * u1 - c * v1, y1 - b * u1 - d * v1);
					ctx.drawImage(texture, 0, 0);
				}
				ctx.restore();
				return;
			}
			if (same) {
				ctx.fillStyle = GDWebCanvas2D.color(...colors.slice(0, 4));
				ctx.fill();
				return;
			}
			const minX = Math.floor(Math.min(points[0], points[2], points[4]));
			const minY = Math.floor(Math.min(points[1], points[3], points[5]));
			const maxX = Math.ceil(Math.max(points[0], points[2], points[4]));
			const maxY = Math.ceil(Math.max(points[1], points[3], points[5]));
			const width = maxX - minX;
			const height = maxY - minY;
			if (!width || !height) return;
			const image = new ImageData(width, height);
			const [x1, y1, x2, y2, x3, y3] = points;
			const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
			if (!det) return;
			for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
				const px = minX + x + 0.5;
				const py = minY + y + 0.5;
				const a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / det;
				const b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / det;
				const c = 1 - a - b;
				if (a < 0 || b < 0 || c < 0) continue;
				const at = (y * width + x) * 4;
				for (let channel = 0; channel < 4; channel++) image.data[at + channel] = 255 * (a * colors[channel] + b * colors[4 + channel] + c * colors[8 + channel]);
			}
			const raster = new OffscreenCanvas(width, height);
			raster.getContext('2d').putImageData(image, 0, 0);
			ctx.drawImage(raster, minX, minY);
		},
		draw: function (operation, data) {
			const ctx = GDWebCanvas2D.context || GodotDisplayScreen.context;
			if (!ctx) return;
			if (operation === 0) {
				GDWebCanvas2D.clipRect = data[0] ? [...data.slice(1, 5)] : null;
			} else if (operation === 1) {
				ctx.save();
				GDWebCanvas2D.clip(ctx);
				ctx.setTransform(...data.slice(0, 6));
				ctx.fillStyle = GDWebCanvas2D.color(...data.slice(10, 14));
				if (data[14] > 0) { ctx.lineWidth = data[14]; ctx.strokeStyle = ctx.fillStyle; ctx.strokeRect(...data.slice(6, 10)); }
				else ctx.fillRect(...data.slice(6, 10));
				ctx.restore();
			} else if (operation === 2) {
				ctx.save();
				GDWebCanvas2D.clip(ctx);
				const points = data.slice(1, 1 + data[0] * 2);
				if (data[0] === 3) GDWebCanvas2D.triangle(ctx, points, data.slice(9, 21));
				else if (data[0] === 4) {
					const colors = data.slice(9, 25);
					GDWebCanvas2D.triangle(ctx, points.slice(0, 6), colors.slice(0, 12));
					GDWebCanvas2D.triangle(ctx, [points[0], points[1], points[4], points[5], points[6], points[7]], [...colors.slice(0, 4), ...colors.slice(8, 16)]);
				} else {
					GDWebCanvas2D.path(ctx, points, false);
					ctx.strokeStyle = GDWebCanvas2D.color(...data.slice(9, 13));
					ctx.stroke();
				}
				ctx.restore();
			} else if (operation === 7) {
				ctx.save();
				GDWebCanvas2D.clip(ctx);
				GDWebCanvas2D.triangle(ctx, data.slice(0, 6), data.slice(6, 18), GDWebCanvas2D.textures.get(data[24]), data.slice(18, 24));
				ctx.restore();
			} else if (operation === 4) {
				const texture = GDWebCanvas2D.textures.get(data[18]) || GDWebCanvas2D.targets.get(data[18]);
				if (!texture) return;
				let [sx, sy, sw, sh] = data.slice(10, 14);
				if (!sw || !sh) { sx = 0; sy = 0; sw = texture.width; sh = texture.height; }
				const flags = data[19];
				if (flags & 2) { sx = 0; sy = 0; sw = texture.width; sh = texture.height; }
				const tinted = GDWebCanvas2D.tint(texture, sx, sy, sw, sh, data.slice(14, 18));
				ctx.save();
				GDWebCanvas2D.clip(ctx);
				ctx.setTransform(...data.slice(0, 6));
				ctx.globalAlpha = data[17];
				let [dx, dy, dw, dh] = data.slice(6, 10);
				ctx.translate(dx + (flags & 4 ? dw : 0), dy + (flags & 8 ? dh : 0));
				ctx.scale(flags & 4 ? -1 : 1, flags & 8 ? -1 : 1);
				if (flags & 16) { ctx.transform(0, 1, 1, 0, 0, 0); [dw, dh] = [dh, dw]; }
				if (flags & 2) {
					let tile = tinted.image;
					if (tinted.sx || tinted.sy || tile.width !== sw || tile.height !== sh) {
						tile = new OffscreenCanvas(sw, sh);
						tile.getContext('2d').drawImage(tinted.image, tinted.sx, tinted.sy, sw, sh, 0, 0, sw, sh);
					}
					const pattern = ctx.createPattern(tile, 'repeat');
					ctx.fillStyle = pattern;
					ctx.fillRect(0, 0, dw, dh);
				} else ctx.drawImage(tinted.image, tinted.sx, tinted.sy, sw, sh, 0, 0, dw, dh);
				ctx.restore();
			} else if (operation === 6) {
				const texture = GDWebCanvas2D.textures.get(data[22]) || GDWebCanvas2D.targets.get(data[22]);
				if (!texture) return;
				const image = GDWebCanvas2D.tint(texture, 0, 0, texture.width, texture.height, data.slice(18, 22)).image;
				const [dx, dy, dw, dh, sx, sy, sw, sh] = data.slice(6, 14);
				const [left, top, right, bottom] = data.slice(14, 18);
				const xs = [dx, dx + left, dx + dw - right, dx + dw];
				const ys = [dy, dy + top, dy + dh - bottom, dy + dh];
				const us = [sx, sx + left, sx + sw - right, sx + sw];
				const vs = [sy, sy + top, sy + sh - bottom, sy + sh];
				ctx.save();
				GDWebCanvas2D.clip(ctx);
				ctx.setTransform(...data.slice(0, 6));
				ctx.globalAlpha = data[21];
				for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
					if (x === 1 && y === 1 && !data[25]) continue;
					GDWebCanvas2D.patch(ctx, image, [us[x], vs[y], us[x + 1] - us[x], vs[y + 1] - vs[y]], [xs[x], ys[y], xs[x + 1] - xs[x], ys[y + 1] - ys[y]], x === 1 ? data[23] : 0, y === 1 ? data[24] : 0);
				}
				ctx.restore();
			} else if (operation === 8) {
				const target = GDWebCanvas2D.targets.get(data[0]);
				if (!target) return;
				GDWebCanvas2D.context = target.getContext('2d');
				if (data[3]) {
					GDWebCanvas2D.context.setTransform(1, 0, 0, 1, 0, 0);
					GDWebCanvas2D.context.clearRect(0, 0, target.width, target.height);
					if (data[7]) { GDWebCanvas2D.context.fillStyle = GDWebCanvas2D.color(...data.slice(4, 8)); GDWebCanvas2D.context.fillRect(0, 0, target.width, target.height); }
				}
			} else if (operation === 9) {
				const target = GDWebCanvas2D.targets.get(data[0]);
				if (!target) return;
				const screen = GodotDisplayScreen.context;
				let [sx, sy, sw, sh] = data.slice(1, 5);
				if (Math.abs(sw) <= 1 && Math.abs(sh) <= 1) { sx *= target.width; sy *= target.height; sw *= target.width; sh *= target.height; }
				screen.drawImage(target, sx, sy, sw, sh, ...data.slice(5, 9));
				GDWebCanvas2D.context = screen;
			}
		},
	},
	godot_js_gdweb_texture_upload__sig: 'viiipi',
	godot_js_gdweb_texture_upload: function (handle, width, height, pData, size) {
		const canvas = new OffscreenCanvas(width, height);
		const pixels = GodotRuntime.heapSlice(HEAPU8, pData, size);
		canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
		GDWebCanvas2D.textures.set(handle, canvas);
		window.gdwebTextureCount = GDWebCanvas2D.textures.size;
	},
	godot_js_gdweb_texture_free__sig: 'vi',
	godot_js_gdweb_texture_free: function (handle) { GDWebCanvas2D.textures.delete(handle); window.gdwebTextureCount = GDWebCanvas2D.textures.size; },
	godot_js_gdweb_target_resize__sig: 'viii',
	godot_js_gdweb_target_resize: function (handle, width, height) {
		let target = GDWebCanvas2D.targets.get(handle);
		if (!target) target = new OffscreenCanvas(width, height);
		if (target.width !== width) target.width = width;
		if (target.height !== height) target.height = height;
		GDWebCanvas2D.targets.set(handle, target);
		window.gdwebTargetCount = GDWebCanvas2D.targets.size;
	},
	godot_js_gdweb_target_free__sig: 'vi',
	godot_js_gdweb_target_free: function (handle) { GDWebCanvas2D.targets.delete(handle); window.gdwebTargetCount = GDWebCanvas2D.targets.size; },
	godot_js_gdweb_canvas_begin__sig: 'v',
	godot_js_gdweb_canvas_begin: function () {
		const canvas = GodotConfig.canvas;
		const ctx = GodotDisplayScreen.context;
		if (!ctx) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		GDWebCanvas2D.context = ctx;
	},
	godot_js_gdweb_canvas_batch__sig: 'vpi',
	godot_js_gdweb_canvas_batch: function (pData, count) {
		const start = performance.now();
		const batch = GodotRuntime.heapSlice(HEAPF32, pData, count);
		let commands = 0;
		for (let at = 0; at < count;) {
			const operation = batch[at++];
			const size = batch[at++];
			GDWebCanvas2D.draw(operation, batch.subarray(at, at + size));
			at += size;
			commands++;
		}
		window.gdwebFirstCanvasMs ??= start;
		window.gdwebCanvasMetrics = { commands, floats: count, flushes: 1, milliseconds: performance.now() - start, firstCanvasMs: window.gdwebFirstCanvasMs };
	},
};

autoAddDeps(GDWebCanvas2D, '$GDWebCanvas2D');
mergeInto(LibraryManager.library, GDWebCanvas2D);
