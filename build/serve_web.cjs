// Brotli事前圧縮済みGodot Web成果物を正しいHTTP headerで配信する。
// 開発時も本番と同じURL、Content-Type、Content-Encodingを再現する。

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const mime = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.wasm': 'application/wasm',
	'.pck': 'application/octet-stream',
	'.woff2': 'font/woff2',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.avif': 'image/avif',
	'.svg': 'image/svg+xml',
	'.json': 'application/json; charset=utf-8',
}; // Godot Web成果物の応答型。

// URLを公開directory内の安全なfileへ解決する。
function resolveFile(root, requestUrl) {
	let name;
	try { name = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname.slice(1)); } catch { return null; }
	if (!name || name.endsWith('/')) name += 'index.html';
	const file = path.resolve(root, name);
	return file.startsWith(`${root}${path.sep}`) ? file : null;
}

// 内容hash付き成果物は更新確認を省き、HTMLは毎回更新を確認する。
function cache(file) {
	const parts = file.split(/[\\/]/);
	const name = parts.pop();
	const runtime = /^(?:yweb|site)-[0-9a-f]{12}\.(?:js|wasm|pck|audio\.worklet\.js|audio\.position\.worklet\.js)$/.test(name);
	const image = parts.at(-1) === 'yweb-images' && /-[0-9a-f]{12}\.(?:png|jpe?g|webp|gif|avif|svg)$/.test(name);
	return runtime || image
		? 'public, max-age=31536000, immutable' : 'no-cache';
}

// Brotli対応clientへ同じURLの圧縮fileを選ぶHTTP serverを作る。
// routesを渡すと、file配信より先にそのURLだけを自前で応答できる。
function createServer(root, routes = {}) {
	const site = path.resolve(root);
	return http.createServer((request, response) => {
		const route = routes[(request.url || '/').split('?')[0]];
		if (route) {
			route(request, response);
			return;
		}
		const file = resolveFile(site, request.url || '/');
		if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
			response.writeHead(404).end();
			return;
		}
		const useBrotli = /(?:^|,)\s*br\s*(?:,|$)/.test(request.headers['accept-encoding'] || '') && fs.existsSync(`${file}.br`);
		const headers = {
			'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
			'Vary': 'Accept-Encoding',
			'Cache-Control': cache(file),
		};
		if (useBrotli) headers['Content-Encoding'] = 'br';
		response.writeHead(200, headers);
		if (request.method === 'HEAD') response.end();
		else fs.createReadStream(useBrotli ? `${file}.br` : file).pipe(response);
	});
}

// CLI利用時だけ指定portで配信を開始する。
if (require.main === module) {
	const root = path.resolve(process.argv[2] || '.');
	const port = Number(process.argv[3] || 4173);
	createServer(root).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
}

module.exports = { cache, createServer };
