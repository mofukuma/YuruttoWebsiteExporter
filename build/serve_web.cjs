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
	'.json': 'application/json; charset=utf-8',
}; // Godot Web成果物の応答型。

// URLを公開directory内の安全なfileへ解決する。
function resolveFile(root, requestUrl) {
	const name = new URL(requestUrl, 'http://localhost').pathname === '/' ? 'index.html' : decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname.slice(1));
	const file = path.resolve(root, name);
	return file.startsWith(`${root}${path.sep}`) ? file : null;
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
			'Cache-Control': 'no-cache',
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

module.exports = { createServer };
