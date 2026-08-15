#!/usr/bin/env node
// Godot Web成果物をscene別metadata、route、Web font、配信設定付きsiteへ変換する。
// ExportPluginとCLIが同じ処理を使い、HTMLと配信物の差を生まない設計。

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const project = path.resolve(process.argv[2] || '.'); // Godot project root。
const output = path.resolve(process.argv[3] || 'index.html'); // 生成済みWeb HTML。
const presetName = process.argv[4] || 'Web'; // 読み込むexport preset名。
const out = path.dirname(output); // site成果物directory。
const BEGIN = '<!-- GDWEB_SITE_BEGIN -->'; // 再生成範囲の開始印。
const END = '<!-- GDWEB_SITE_END -->'; // 再生成範囲の終了印。

// HTMLへ安全に埋め込める文字列へ変換する。
function esc(value) {
	return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// JSONをscript終了文字列の影響なくHTMLへ埋め込む。
function json(value) {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

// site機能と独立した文字所有設定を一つのscriptへまとめる。
function textConfig(avoidCanvasThemeFont) {
	return `<script id="gdweb-text-config">window.GDWEB_TEXT_CONFIG=${json({ avoidCanvasThemeFont })}</script>`;
}

// site無効時も文字所有設定だけをexport HTMLへ反映する。
function writeTextConfig(avoidCanvasThemeFont) {
	let html = fs.readFileSync(output, 'utf8');
	html = html.replace(/<script id="gdweb-text-config">[\s\S]*?<\/script>\n?/g, '');
	html = html.replace('</head>', `${textConfig(avoidCanvasThemeFont)}\n</head>`);
	fs.writeFileSync(output, html);
}

// 内容から短い公開file名用hashを返す。
function hash(data) {
	return crypto.createHash('sha256').update(data).digest('hex').slice(0, 12);
}

// ConfigFileの単純値をJavaScript値へ直す。
function scalar(raw) {
	const value = raw.trim();
	if (value === 'true' || value === 'false') return value === 'true';
	if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
	if (value.startsWith('"')) {
		try { return JSON.parse(value); } catch { return value.slice(1, -1); }
	}
	return value;
}

// 指定presetのoptionsをConfigFileから読む。
function preset(file, name) {
	const text = fs.readFileSync(file, 'utf8');
	const sections = new Map();
	let current = '';
	for (const line of text.split(/\r?\n/)) {
		const head = /^\[([^\]]+)\]$/.exec(line.trim());
		if (head) {
			current = head[1];
			sections.set(current, {});
			continue;
		}
		const pair = /^([^=;]+)=(.*)$/.exec(line);
		if (pair && current) sections.get(current)[pair[1].trim()] = scalar(pair[2]);
	}
	const index = [...sections].find(([key, values]) => /^preset\.\d+$/.test(key) && values.name === name)?.[0]?.split('.')[1];
	assert.notEqual(index, undefined, `Web presetなし: ${name}`);
	return sections.get(`preset.${index}.options`) || {};
}

// project.godotからapplication既定値を読む。
function projectInfo() {
	const file = path.join(project, 'project.godot');
	const text = fs.readFileSync(file, 'utf8');
	const title = /^config\/name="([^"]+)"$/m.exec(text)?.[1] || 'Godot Web Site';
	const scene = /^run\/main_scene="([^"]+)"$/m.exec(text)?.[1] || '';
	return { title, scene };
}

// res:// pathをproject外へ出さずfilesystem pathへ変換する。
function resource(value) {
	if (!value) return '';
	assert.match(value, /^res:\/\//, `res:// pathではありません: ${value}`);
	const file = path.resolve(project, value.slice(6));
	assert.ok(file === project || file.startsWith(`${project}${path.sep}`), `project外path: ${value}`);
	return file;
}

// URIをsite rootから始まるdirectory形式へ正規化する。
function route(value) {
	let uri = String(value || '/').trim();
	assert.ok(uri.startsWith('/') && !uri.includes('..') && !/[?#]/.test(uri), `不正URI: ${uri}`);
	if (!uri.endsWith('/')) uri += '/';
	return uri.replace(/\/+/g, '/');
}

// 公開URLをbase URL配下へ組み立てる。
function urls(base) {
	const parsed = new URL(base);
	assert.match(parsed.protocol, /^https?:$/, `HTTP URLではありません: ${base}`);
	const root = `${parsed.pathname.replace(/\/+$/, '')}/`.replace(/^\/\//, '/');
	const publicPath = (file = '') => `${root}${String(file).replace(/^\/+/, '')}`;
	const absolute = (file = '') => `${parsed.origin}${publicPath(file)}`;
	return { root, publicPath, absolute };
}

// PNG、JPEG、WebPのMIMEとPNG寸法を取得する。
function imageInfo(file) {
	const data = fs.readFileSync(file);
	const ext = path.extname(file).toLowerCase();
	const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
	const info = { type: types[ext] || 'application/octet-stream', width: 0, height: 0 };
	if (ext === '.png' && data.subarray(1, 4).toString() === 'PNG') {
		info.width = data.readUInt32BE(16);
		info.height = data.readUInt32BE(20);
	}
	return { ...info, data };
}

// project内fileを拡張子で再帰列挙する。
function files(root, extensions, found = []) {
	if (!fs.existsSync(root)) return found;
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		if (entry.name === '.godot') continue;
		const file = path.join(root, entry.name);
		if (entry.isDirectory()) files(file, extensions, found);
		else if (extensions.has(path.extname(entry.name).toLowerCase())) found.push(file);
	}
	return found;
}

// 同じpathとbasenameのwoff2をTheme font pathへ対応付ける。
function webfonts(enabled, publicPath) {
	const map = {};
	if (!enabled) return map;
	const target = path.join(out, 'gdweb-fonts');
	for (const font of files(project, new Set(['.woff2'])).sort()) {
		const stem = font.slice(0, -6);
		for (const ext of ['.ttf', '.otf']) {
			const source = `${stem}${ext}`;
			if (!fs.existsSync(source)) continue;
			fs.mkdirSync(target, { recursive: true });
			const data = fs.readFileSync(font);
			const name = `${path.basename(stem).replace(/[^a-z0-9_-]/gi, '-')}-${hash(data)}.woff2`;
			fs.writeFileSync(path.join(target, name), data);
			const key = `res://${path.relative(project, source).split(path.sep).join('/')}`;
			map[key] = { family: `GDWeb-${hash(key)}`, url: publicPath(`gdweb-fonts/${name}`) };
		}
	}
	return map;
}

// site全体とscene値を既定値込みで構築する。
function configuration(options) {
	const info = projectInfo();
	const configPath = options['gdweb/site/config'] || 'res://gdweb-site.json';
	const file = resource(configPath);
	const source = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
	assert.equal(source.version ?? 1, 1, 'gdweb-site.json versionは1だけ対応');
	const site = {
		name: options['gdweb/site/title'] || source.site?.name || info.title,
		base_url: options['gdweb/site/base_url'] || source.site?.base_url || 'https://example.com',
		description: options['gdweb/site/description'] || source.site?.description || 'Godotで作成したWebサイトです。',
		locale: options['gdweb/site/locale'] || source.site?.locale || 'ja_JP',
		favicon: options['gdweb/site/favicon'] || source.site?.favicon || '',
		meta: source.site?.meta || [],
		styles: source.site?.styles || [],
		scripts: source.site?.scripts || [],
	};
	const fallbackKey = path.basename(info.scene, path.extname(info.scene)) || 'Main';
	const entries = source.scenes && Object.keys(source.scenes).length ? source.scenes : {
		[fallbackKey]: { scene: info.scene, uri: '/', title: site.name, description: site.description, summary: site.description },
	};
	const scenes = {};
	const seen = new Set();
	for (const [key, value] of Object.entries(entries)) {
		assert.ok(value.scene && fs.existsSync(resource(value.scene)), `sceneなし: ${key}`);
		const uri = route(value.uri);
		assert.ok(!seen.has(uri), `URI重複: ${uri}`);
		seen.add(uri);
		scenes[key] = {
			scene: value.scene, uri, title: value.title || site.name,
			description: value.description || site.description,
			summary: value.summary || value.description || site.description,
			robots: value.robots || 'index,follow',
			meta: value.meta || [],
			styles: value.styles || [], scripts: value.scripts || [],
			json_ld: value.json_ld || { '@context': 'https://schema.org', '@type': 'WebPage', name: value.title || site.name },
		};
	}
	return { site, scenes, ogp: options['gdweb/ogp/image'] || 'res://web/ogp.png', alt: options['gdweb/ogp/alt'] || 'サイトのプレビュー画像' };
}

// 許可した属性だけをhead tag用文字列へ変換する。
function attrs(value, names) {
	return names.filter((name) => value[name] !== undefined && value[name] !== false).map((name) => value[name] === true ? ` ${name}` : ` ${name}="${esc(value[name])}"`).join('');
}

// 設定済みstyleとscriptを安全な属性だけでhead tagへ変換する。
function assets(styles, scripts, scene = false) {
	const styleFlag = scene ? ' data-gdweb-scene-asset="true"' : '';
	const links = styles.map((item) => {
		const value = typeof item === 'string' ? { href: item } : item;
		return `<link rel="stylesheet" href="${esc(value.href)}"${attrs(value, ['media', 'integrity', 'crossorigin', 'referrerpolicy'])}${styleFlag}>`;
	});
	const tags = scripts.map((item) => {
		const value = typeof item === 'string' ? { src: item } : item;
		const marker = scene ? ` data-gdweb-asset="${esc(value.src)}"` : '';
		return `<script src="${esc(value.src)}"${attrs(value, ['type', 'defer', 'async', 'integrity', 'crossorigin', 'referrerpolicy'])}${marker}></script>`;
	});
	return [...links, ...tags].join('\n');
}

// 任意metaをnameまたはpropertyの一方だけへ限定して生成する。
function metas(items, scene = false) {
	return items.map((item) => {
		const key = item.name ? 'name' : 'property';
		assert.ok(item[key] && item.content !== undefined, 'metaにはnameまたはpropertyとcontentが必要');
		return `<meta ${key}="${esc(item[key])}" content="${esc(item.content)}"${scene ? ' data-gdweb-scene-meta="true"' : ''}>`;
	}).join('\n');
}

// Project内参照のstyleとscriptを公開directoryへ複製する。
function copyAssets(data, url) {
	const lists = [[data.site.styles, 'href'], [data.site.scripts, 'src']];
	for (const scene of Object.values(data.scenes)) lists.push([scene.styles, 'href'], [scene.scripts, 'src']);
	for (const [list, fallback] of lists) {
		for (let index = 0; index < list.length; index++) {
			const item = typeof list[index] === 'string' ? { [fallback]: list[index] } : list[index];
			const key = item.href ? 'href' : 'src';
			const value = item[key];
			if (!value || /^https?:\/\//.test(value)) continue;
			const relative = value.startsWith('res://') ? value.slice(6) : value.replace(/^\/+/, '');
			const source = path.resolve(project, relative);
			if (!source.startsWith(`${project}${path.sep}`) || !fs.existsSync(source)) continue;
			const target = path.resolve(out, relative);
			assert.ok(target.startsWith(`${out}${path.sep}`), `公開asset path不正: ${value}`);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.copyFileSync(source, target);
			item[key] = url.publicPath(relative.split(path.sep).join('/'));
			list[index] = item;
		}
	}
}

// 一sceneの静的SEO headを生成する。
function head(data, scene, image, url, fontMap) {
	const canonical = url.absolute(scene.uri.slice(1));
	const imageUrl = image ? url.absolute(`gdweb-assets/${image.file}`) : '';
	const tags = [
		'<meta charset="utf-8">',
		`<base href="${esc(url.root)}">`,
		`<meta name="description" content="${esc(scene.description)}">`,
		`<meta name="robots" content="${esc(scene.robots)}">`,
		`<link rel="canonical" href="${esc(canonical)}">`,
		`<meta property="og:title" content="${esc(scene.title)}">`,
		'<meta property="og:type" content="website">',
		`<meta property="og:url" content="${esc(canonical)}">`,
		`<meta property="og:description" content="${esc(scene.description)}">`,
		`<meta property="og:site_name" content="${esc(data.site.name)}">`,
		`<meta property="og:locale" content="${esc(data.site.locale)}">`,
		'<meta name="twitter:card" content="summary_large_image">',
		`<meta name="twitter:title" content="${esc(scene.title)}">`,
		`<meta name="twitter:description" content="${esc(scene.description)}">`,
	];
	if (image) tags.push(
		`<meta property="og:image" content="${esc(imageUrl)}">`,
		`<meta property="og:image:url" content="${esc(imageUrl)}">`,
		`<meta property="og:image:type" content="${image.type}">`,
		`<meta property="og:image:alt" content="${esc(data.alt)}">`,
		`<meta name="twitter:image" content="${esc(imageUrl)}">`,
		`<meta name="twitter:image:alt" content="${esc(data.alt)}">`,
	);
	if (image?.width && image?.height) tags.push(`<meta property="og:image:width" content="${image.width}">`, `<meta property="og:image:height" content="${image.height}">`);
	if (imageUrl.startsWith('https:')) tags.push(`<meta property="og:image:secure_url" content="${esc(imageUrl)}">`);
	if (data.site.favicon) tags.push(`<link rel="icon" href="${esc(url.publicPath('gdweb-assets/favicon' + path.extname(data.site.favicon)))}">`);
	const fontFaces = Object.values(fontMap).map((font) => `@font-face{font-family:${font.family};src:url('${font.url}') format('woff2');font-display:swap}`).join('');
	tags.push(`<style id="gdweb-font-faces">${fontFaces}</style>`);
	tags.push(metas(data.site.meta));
	tags.push(metas(scene.meta, true));
	tags.push(assets(data.site.styles, data.site.scripts));
	tags.push(assets(scene.styles, scene.scripts, true));
	tags.push(`<script id="gdweb-json-ld" type="application/ld+json">${json(scene.json_ld)}</script>`);
	tags.push(`<script>window.GDWEB_FONT_MAP=${json(fontMap)}</script>`);
	tags.push(textConfig(data.avoid_canvas_theme_font));
	tags.push(`<script id="gdweb-site-config" type="application/json">${json({ mode: data.mode, root: url.root, site: data.site, scenes: data.scenes })}</script>`);
	tags.push(`<script src="${esc(url.publicPath('gdweb-site.js'))}" defer></script>`);
	return `${BEGIN}\n${tags.filter(Boolean).join('\n')}\n${END}`;
}

// Godot HTMLへ一sceneのtitle、head、起動前概要を差し込む。
function render(base, data, scene, image, url, fontMap) {
	let html = base.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}\\n?`, 'g'), '');
	html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(scene.title)}</title>`);
	html = html.replace(/<html(?:\s[^>]*)?>/i, (tag) => tag.includes(' lang=') ? tag.replace(/lang="[^"]*"/, `lang="${esc(data.site.locale.split('_')[0])}"`) : tag.replace('>', ` lang="${esc(data.site.locale.split('_')[0])}">`));
	html = html.replace('</head>', `${head(data, scene, image, url, fontMap)}\n</head>`);
	const summary = `<main id="gdweb-site-summary"><h1>${esc(scene.title)}</h1><p>${esc(scene.summary)}</p></main><noscript>${esc(scene.summary)}</noscript>`;
	html = html.replace(/<main id="gdweb-site-summary">[\s\S]*?<\/main><noscript>[\s\S]*?<\/noscript>/, '');
	return html.replace(/<body([^>]*)>/i, `<body$1>${summary}`);
}

// Browser内scene変更とHistory/Hashを同期する小さなcontrollerを返す。
function runtime() {
	return `// Scene resource pathをURL、head、Browser履歴へ同期する。
(() => {
'use strict';
const cfg=JSON.parse(document.getElementById('gdweb-site-config').textContent);
const list=cfg.scenes;let callback=null;let pending='';let current='';
const route=()=>{let p=cfg.mode==='Hash'?(location.hash.slice(1)||'/'):location.pathname.slice(cfg.root.length-1);if(!p.startsWith('/'))p='/'+p;if(!p.endsWith('/'))p+='/';return Object.entries(list).find(([,v])=>v.uri===p)?.[0]||Object.keys(list)[0]};
const set=(selector,attribute,value)=>{const node=document.querySelector(selector);if(node)node.setAttribute(attribute,value)};
const load=(items,tag)=>{for(const item of items||[]){const v=typeof item==='string'?{[tag==='LINK'?'href':'src']:item}:item;const key=v.href||v.src;if(document.querySelector('[data-gdweb-asset="'+CSS.escape(key)+'"]'))continue;const node=document.createElement(tag);for(const [name,value] of Object.entries(v)){if(value===true)node.setAttribute(name,'');else if(value!==false)node.setAttribute(name,value)}node.dataset.gdwebAsset=key;document.head.appendChild(node)}};
const apply=(name)=>{const page=list[name];if(!page)return;const changed=current!==name;if(changed&&current)document.dispatchEvent(new CustomEvent('gdweb:scene-leave',{detail:{name:current,page:list[current]}}));document.title=page.title;set('meta[name="description"]','content',page.description);set('meta[name="robots"]','content',page.robots);set('link[rel="canonical"]','href',page.canonical);for(const key of ['title','url','description'])set('meta[property="og:'+key+'"]','content',key==='title'?page.title:key==='description'?page.description:page.canonical);set('meta[name="twitter:title"]','content',page.title);set('meta[name="twitter:description"]','content',page.description);const ld=document.getElementById('gdweb-json-ld');if(ld)ld.textContent=JSON.stringify(page.json_ld);document.querySelectorAll('[data-gdweb-scene-meta]').forEach(n=>n.remove());for(const meta of page.meta||[]){const node=document.createElement('meta');node.setAttribute(meta.name?'name':'property',meta.name||meta.property);node.content=meta.content;node.dataset.gdwebSceneMeta='true';document.head.appendChild(node)}document.querySelectorAll('[data-gdweb-scene-asset]').forEach(n=>n.remove());for(const style of page.styles||[]){const v=typeof style==='string'?{href:style}:style;const node=document.createElement('link');node.rel='stylesheet';for(const [key,value] of Object.entries(v))node.setAttribute(key,value);node.dataset.gdwebSceneAsset='true';document.head.appendChild(node)}load(page.scripts,'SCRIPT');document.getElementById('gdweb-site-summary')?.remove();if(changed){current=name;document.dispatchEvent(new CustomEvent('gdweb:scene-enter',{detail:{name,page}}))}};
const address=(page,replace)=>{const url=cfg.mode==='Hash'?cfg.root+'#'+page.uri:cfg.root.replace(/\\/$/,'')+page.uri;(replace?history.replaceState:history.pushState).call(history,{gdweb:true},'',url)};
const emit=()=>{const name=route();pending=name;apply(name);callback?.(list[name].scene)};
window.GDWebSite={bind(fn){callback=fn;emit()},initialScene(){return list[route()].scene},scene(path){const found=Object.entries(list).find(([,page])=>page.scene===path);if(!found)return;const [name,page]=found;if(pending){if(pending!==name)return;pending='';apply(name);return}apply(name);address(page,false)}};
addEventListener(cfg.mode==='Hash'?'hashchange':'popstate',emit);apply(route());
})();
`;
}

// History fallback、Brotli、MIME、cacheを一つのnginx設定へまとめる。
function nginx() {
	return `# gdweb Web site配信用。/etc/nginx/conf.d/default.confへ配置。\nmap $http_accept_encoding $gdweb_br_suffix {\n    default "";\n    "~*(?:^|,)\\s*br\\s*;\\s*q=0(?:\\.0*)?\\s*(?:,|$)" "";\n    "~*(?:^|,)\\s*br(?:\\s*;[^,]*)?\\s*(?:,|$)" ".br";\n}\nmap $gdweb_br_suffix $gdweb_content_encoding {\n    default "";\n    ".br" br;\n}\nserver {\n    listen 8080;\n    server_name _;\n    root /usr/share/nginx/html;\n    index index.html;\n\n    add_header X-Content-Type-Options nosniff always;\n    add_header Referrer-Policy strict-origin-when-cross-origin always;\n    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\n\n    location ~* \\.wasm$ {\n        default_type application/wasm;\n        add_header Content-Encoding $gdweb_content_encoding always;\n        add_header Vary Accept-Encoding always;\n        try_files $uri$gdweb_br_suffix $uri =404;\n    }\n    location ~* \\.js$ {\n        default_type application/javascript;\n        add_header Content-Encoding $gdweb_content_encoding always;\n        add_header Vary Accept-Encoding always;\n        try_files $uri$gdweb_br_suffix $uri =404;\n    }\n    location ~* \\.(png|jpg|jpeg|webp|svg|woff2)$ {\n        expires 30d;\n        try_files $uri =404;\n    }\n    location / {\n        add_header Cache-Control "no-cache";\n        try_files $uri $uri/ $uri/index.html /index.html;\n    }\n}\n`;
}

// 既存static originを前段nginxでHistory fallbackする設定を返す。
function nginxProxy() {
	return `# upstream名とTLS serverへ合わせて貼り付けるHistory API用reverse proxy例。\nupstream gdweb_origin {\n    server static-origin:8080;\n}\nserver {\n    listen 8080;\n    server_name _;\n\n    location / {\n        proxy_pass http://gdweb_origin;\n        proxy_set_header Host $host;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_intercept_errors on;\n        error_page 404 = @gdweb_shell;\n    }\n    location @gdweb_shell {\n        proxy_pass http://gdweb_origin/index.html;\n    }\n}\n`;
}

// GUIとCLIの両exportでJavaScriptとWebAssemblyをBrotli必須成果物へする。
function compress() {
	const entries = [];
	for (const file of files(out, new Set(['.js', '.wasm'])).sort()) {
		const raw = fs.readFileSync(file);
		const encoded = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } });
		assert.ok(encoded.length < raw.length, `Brotliで縮まない成果物: ${path.relative(out, file)}`);
		fs.writeFileSync(`${file}.br`, encoded);
		entries.push({ file: path.relative(out, file), originalBytes: raw.length, brotliBytes: encoded.length, sha256: crypto.createHash('sha256').update(raw).digest('hex') });
	}
	assert.ok(entries.some((entry) => entry.file.endsWith('.wasm')), 'WebAssembly成果物なし');
	assert.ok(entries.some((entry) => entry.file.endsWith('.js')), 'JavaScript成果物なし');
	fs.writeFileSync(path.join(out, 'gdweb-compression.json'), `${JSON.stringify({ encoding: 'br', quality: 6, entries }, null, 2)}\n`);
	return entries.length;
}

// 設定、asset、route HTML、付属fileを一括生成する。
function build() {
	assert.ok(fs.existsSync(output), `export HTMLなし: ${output}`);
	const options = preset(path.join(project, 'export_presets.cfg'), presetName);
	const avoidCanvasThemeFont = options['gdweb/font/avoid_canvas_theme_font'] !== false;
	if (options['gdweb/site/enabled'] === false) {
		writeTextConfig(avoidCanvasThemeFont);
		return { enabled: false, avoidCanvasThemeFont };
	}
	const data = configuration(options);
	data.avoid_canvas_theme_font = avoidCanvasThemeFont;
	const url = urls(data.site.base_url);
	data.mode = Number(options['gdweb/routing/mode'] || 0) === 1 ? 'History' : 'Hash';
	for (const scene of Object.values(data.scenes)) scene.canonical = url.absolute(scene.uri.slice(1));
	copyAssets(data, url);
	const fontMap = webfonts(options['gdweb/font/matching_webfont'] !== false, url.publicPath);
	const assetDir = path.join(out, 'gdweb-assets');
	fs.mkdirSync(assetDir, { recursive: true });
	let image = null;
	const ogp = resource(data.ogp);
	if (ogp && fs.existsSync(ogp)) {
		image = imageInfo(ogp);
		image.file = `ogp${path.extname(ogp).toLowerCase()}`;
		fs.writeFileSync(path.join(assetDir, image.file), image.data);
	}
	if (data.site.favicon) {
		const icon = resource(data.site.favicon);
		assert.ok(fs.existsSync(icon), `faviconなし: ${data.site.favicon}`);
		fs.copyFileSync(icon, path.join(assetDir, `favicon${path.extname(icon)}`));
	}
	const base = fs.readFileSync(output, 'utf8');
	const first = Object.values(data.scenes).find((scene) => scene.uri === '/') || Object.values(data.scenes)[0];
	fs.writeFileSync(output, render(base, data, first, image, url, fontMap));
	const missing = { ...first, title: `ページが見つかりません | ${data.site.name}`, description: '指定されたページは見つかりませんでした。', summary: '指定されたページは見つかりませんでした。', robots: 'noindex,nofollow', uri: '/404/' };
	fs.writeFileSync(path.join(out, '404.html'), render(base, data, missing, image, url, fontMap));
	if (data.mode === 'History') {
		for (const scene of Object.values(data.scenes)) {
			if (scene.uri === '/') continue;
			const dir = path.join(out, scene.uri.slice(1));
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(path.join(dir, 'index.html'), render(base, data, scene, image, url, fontMap));
		}
	}
	fs.writeFileSync(path.join(out, 'gdweb-site.js'), runtime());
	fs.writeFileSync(path.join(out, 'gdweb-site.json'), `${JSON.stringify({ ...data, webfonts: fontMap }, null, 2)}\n`);
	fs.writeFileSync(path.join(out, 'nginx-gdweb.conf.example'), nginx());
	fs.writeFileSync(path.join(out, 'nginx-gdweb-proxy.conf.example'), nginxProxy());
	const pages = Object.values(data.scenes).map((scene) => `<url><loc>${esc(scene.canonical)}</loc></url>`).join('');
	fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages}</urlset>\n`);
	fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${url.absolute('sitemap.xml')}\n`);
	return { enabled: true, mode: data.mode, scenes: Object.keys(data.scenes).length, webfonts: Object.keys(fontMap).length, ogp: image ? `${image.width}x${image.height}` : null };
}

const result = build();
result.compressed = compress();
console.log(JSON.stringify(result));
