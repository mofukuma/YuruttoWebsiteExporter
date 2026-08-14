/**************************************************************************/
/*  library_gdweb_text.js                                                 */
/**************************************************************************/

// Godotが決めたLabel矩形と文字装飾だけをCanvas上のDOMへ反映する。
// Label以外の表示、入力、配置判断をBrowserへ移さない。

const GDWebText = {
	$GDWebText__deps: ['$GodotConfig', '$GodotRuntime'],
	$GDWebText: {
		elements: new Map(),
		root: null,
		rootSize: '',
		// Canvasと同じ親へ文字専用rootを一度だけ作る。
		getRoot: function () {
			if (GDWebText.root?.isConnected) return GDWebText.root;
			const canvas = GodotConfig.canvas;
			const root = document.createElement('div');
			root.id = 'gdweb-text-root';
			root.style.cssText = 'position:absolute;transform-origin:0 0;pointer-events:none;overflow:visible;z-index:1;font-family:GDWeb,sans-serif';
			const style = document.createElement('style');
			const base = location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
			style.textContent = `@font-face{font-family:GDWeb;src:url('${base}.font.woff2') format('woff2');font-display:swap}`;
			document.head.appendChild(style);
			canvas.parentElement.appendChild(root);
			GDWebText.root = root;
			return root;
		},
		// rootをCanvasのCSS表示矩形へ一致させる。
		resizeRoot: function () {
			const canvas = GodotConfig.canvas;
			const root = GDWebText.getRoot();
			const parent = canvas.parentElement;
			const box = canvas.getBoundingClientRect();
			const parentBox = parent.getBoundingClientRect();
			const value = `${box.left - parentBox.left},${box.top - parentBox.top},${box.width},${box.height}`;
			if (value === GDWebText.rootSize) return;
			GDWebText.rootSize = value;
			root.style.left = `${box.left - parentBox.left}px`;
			root.style.top = `${box.top - parentBox.top}px`;
			root.style.width = `${box.width}px`;
			root.style.height = `${box.height}px`;
			root.style.transform = 'none';
		},
		// Godotの線形色をCSSの8bit色へ変換する。
		color: function (red, green, blue, alpha) {
			return `rgba(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)},${alpha})`;
		},
	},
	godot_js_gdweb_text_begin__sig: 'v',
	// 一frameの文字同期前にroot寸法を更新する。
	godot_js_gdweb_text_begin: function () {
		GDWebText.resizeRoot();
	},
	godot_js_gdweb_text_sync__sig: 'vii' + 'f'.repeat(8) + 'iiii' + 'f'.repeat(17),
	// 一つのLabel状態を対応するspanへ反映する。
	godot_js_gdweb_text_sync: function (handle, pText, xx, xy, yx, yy, x, y, width, height, flags, z, horizontal, vertical, red, green, blue, alpha, fontSize, lineSpacing, outlineRed, outlineGreen, outlineBlue, outlineAlpha, outlineSize, shadowRed, shadowGreen, shadowBlue, shadowAlpha, shadowX, shadowY) {
		const text = GodotRuntime.parseString(pText);
		let element = GDWebText.elements.get(handle);
		if (!element) {
			element = document.createElement('span');
			element.dataset.gdwebText = String(handle);
			element.style.cssText = 'position:absolute;box-sizing:border-box;transform-origin:0 0;pointer-events:none;user-select:text;display:flex;margin:0;padding:0;border:0';
			GDWebText.getRoot().appendChild(element);
			GDWebText.elements.set(handle, element);
		}
		if (element.textContent !== text) element.textContent = text;
		element.style.display = flags & 1 ? 'flex' : 'none';
		element.style.transform = `matrix(${xx},${xy},${yx},${yy},${x},${y})`;
		element.style.width = `${width}px`;
		element.style.height = `${height}px`;
		element.style.zIndex = String(z);
		element.style.direction = flags & 2 ? 'rtl' : 'ltr';
		element.style.overflow = flags & 4 ? 'hidden' : 'visible';
		element.style.whiteSpace = flags & 8 ? 'pre-wrap' : 'pre';
		element.style.overflowWrap = flags & 8 ? 'anywhere' : 'normal';
		element.style.justifyContent = ['flex-start', 'center', 'flex-end', 'space-between'][horizontal] || 'flex-start';
		element.style.alignItems = ['flex-start', 'center', 'flex-end', 'stretch'][vertical] || 'flex-start';
		element.style.textAlign = ['left', 'center', 'right', 'justify'][horizontal] || 'left';
		element.style.color = GDWebText.color(red, green, blue, alpha);
		element.style.fontSize = `${fontSize}px`;
		element.style.lineHeight = `${fontSize + lineSpacing}px`;
		element.style.webkitTextStroke = outlineSize > 0 && outlineAlpha > 0 ? `${outlineSize}px ${GDWebText.color(outlineRed, outlineGreen, outlineBlue, outlineAlpha)}` : '0 transparent';
		element.style.textShadow = shadowAlpha > 0 ? `${shadowX}px ${shadowY}px 0 ${GDWebText.color(shadowRed, shadowGreen, shadowBlue, shadowAlpha)}` : 'none';
	},
	godot_js_gdweb_text_remove__sig: 'vi',
	// 解放済みLabelのspanと対応表を回収する。
	godot_js_gdweb_text_remove: function (handle) {
		GDWebText.elements.get(handle)?.remove();
		GDWebText.elements.delete(handle);
	},
	godot_js_gdweb_text_end__sig: 'v',
	// Emscripten側の同期境界を明示する。
	godot_js_gdweb_text_end: function () {},
};

autoAddDeps(GDWebText, '$GDWebText');
mergeInto(LibraryManager.library, GDWebText);
