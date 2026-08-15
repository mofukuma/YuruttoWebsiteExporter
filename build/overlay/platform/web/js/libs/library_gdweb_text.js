/**************************************************************************/
/*  library_gdweb_text.js                                                 */
/**************************************************************************/

// Godotが確定した文字矩形を意味に合うDOM要素へ反映する。
// ObjectIDで要素を固定し、確定入力と意味操作だけをGodotへ戻す。

const GDWebText = {
	$GDWebText__deps: ['$GodotConfig', '$GodotRuntime'],
	$GDWebText: {
		elements: new Map(),
		event: null,
		siteEvent: null,
		siteCallback: null,
		root: null,
		rootSize: '',
		mouseDown: false,
		kinds: ['Label', 'Button', 'LinkButton', 'LineEdit', 'TextEdit'],
		tags: ['span', 'button', 'a', 'input', 'textarea'],
		// Canvasと同じ親へ文字と入力専用rootを一度だけ作る。
		getRoot: function () {
			if (GDWebText.root?.isConnected) return GDWebText.root;
			const canvas = GodotConfig.canvas;
			const root = document.createElement('div');
			root.id = 'gdweb-text-root';
			root.style.cssText = 'position:absolute;transform-origin:0 0;pointer-events:none;overflow:hidden;z-index:1;font-family:sans-serif';
			const style = document.createElement('style');
			style.textContent = '#gdweb-text-root input::placeholder,#gdweb-text-root textarea::placeholder{color:var(--gdweb-placeholder,currentColor);opacity:1}';
			document.head.appendChild(style);
			canvas.parentElement.appendChild(root);
			canvas.addEventListener('mousedown', () => { GDWebText.mouseDown = true; });
			window.addEventListener('mouseup', () => { GDWebText.mouseDown = false; });
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
		},
		// Godotの線形色をCSSの8bit色へ変換する。
		color: function (red, green, blue, alpha) {
			return `rgba(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)},${alpha})`;
		},
		// BrowserのUTF-16位置をGodotのUnicode文字位置へ変換する。
		index: function (value, utf16) {
			return Array.from(value.slice(0, utf16)).length;
		},
		// GodotのUnicode文字位置をBrowserのUTF-16位置へ変換する。
		offset: function (value, index) {
			return Array.from(value).slice(0, index).join('').length;
		},
		// 入力値と選択を一つの確定通知としてGodotへ返す。
		send: function (element, kind) {
			if (!GDWebText.event) return;
			const value = 'value' in element ? element.value : '';
			const start = kind === 7 ? Math.round(element.scrollTop) : GDWebText.index(value, element.selectionStart || 0);
			const end = kind === 7 ? Math.round(element.scrollLeft) : GDWebText.index(value, element.selectionEnd || 0);
			const state = `${kind}:${value}:${start}:${end}`;
			if (element.dataset.gdwebSent === state) return;
			element.dataset.gdwebSent = state;
			const uid = GodotRuntime.allocString(element.dataset.gdwebText);
			const text = GodotRuntime.allocString(value);
			GDWebText.event(uid, kind, text, start, end);
			GodotRuntime.free(text);
			GodotRuntime.free(uid);
		},
		// LineEditの上限をBrowserのUTF-16数でなくGodotと同じUnicode文字数で適用する。
		limit: function (element) {
			const max = Number(element.dataset.gdwebMaxLength || 0);
			const chars = Array.from(element.value);
			if (!max || chars.length <= max) return;
			const start = Math.min(GDWebText.index(element.value, element.selectionStart || 0), max);
			const end = Math.min(GDWebText.index(element.value, element.selectionEnd || 0), max);
			element.value = chars.slice(0, max).join('');
			element.setSelectionRange(GDWebText.offset(element.value, start), GDWebText.offset(element.value, end));
		},
		// Button系のnative clickをGodotの標準Button状態遷移へ渡す。
		activate: function (element) {
			if (!GDWebText.event || element.disabled || element.getAttribute('aria-disabled') === 'true') return;
			const uid = GodotRuntime.allocString(element.dataset.gdwebText);
			const text = GodotRuntime.allocString('');
			GDWebText.event(uid, 6, text, 0, 0);
			GodotRuntime.free(text);
			GodotRuntime.free(uid);
		},
		// inputとtextareaへIME、選択、focusの双方向境界を一度だけ結ぶ。
		bindInput: function (element) {
			for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) {
				element.addEventListener(name, (event) => event.stopPropagation());
			}
			element.addEventListener('focus', () => {
				delete element.dataset.gdwebBlurPending;
				element.dataset.gdwebFocusPending = 'true';
				GDWebText.send(element, 3);
			});
			element.addEventListener('blur', () => {
				delete element.dataset.gdwebFocusPending;
				element.dataset.gdwebBlurPending = 'true';
				GDWebText.send(element, 4);
			});
			element.addEventListener('compositionstart', () => { element.dataset.gdwebComposing = 'true'; });
			element.addEventListener('compositionend', () => {
				delete element.dataset.gdwebComposing;
				GDWebText.limit(element);
				GDWebText.send(element, 1);
			});
			element.addEventListener('input', () => {
				if (!element.dataset.gdwebComposing) {
					GDWebText.limit(element);
					GDWebText.send(element, 1);
				}
			});
			element.addEventListener('scroll', () => GDWebText.send(element, 7));
			element.addEventListener('select', () => GDWebText.send(element, 2));
			element.addEventListener('keyup', () => GDWebText.send(element, 2));
			element.addEventListener('keydown', (event) => {
				event.stopPropagation();
				if (element.tagName === 'INPUT' && event.key === 'Enter' && !event.isComposing) {
					event.preventDefault();
					GDWebText.send(element, 5);
			}
			});
		},
		// Button系へkeyboard focusとnative keyboard clickだけを結ぶ。
		bindAction: function (element) {
			element.addEventListener('focus', () => {
				delete element.dataset.gdwebBlurPending;
				element.dataset.gdwebFocusPending = 'true';
				GDWebText.send(element, 3);
			});
			element.addEventListener('blur', () => {
				delete element.dataset.gdwebFocusPending;
				element.dataset.gdwebBlurPending = 'true';
				GDWebText.send(element, 4);
			});
			element.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				if (!event.detail) GDWebText.activate(element);
			});
		},
		// Control種別に合う意味要素を既定装飾なしで作る。
		create: function (uid, kind) {
			const tag = GDWebText.tags[kind] || 'span';
			const element = document.createElement(tag);
			element.id = `gdweb-text-${uid}`;
			element.dataset.gdwebText = uid;
			element.style.cssText = 'position:absolute;box-sizing:border-box;transform-origin:0 0;margin:0;padding:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;border-radius:0';
			if (tag === 'button') element.type = 'button';
			if (tag === 'input' || tag === 'textarea') {
				element.style.pointerEvents = 'auto';
				element.style.userSelect = 'text';
				element.style.appearance = 'none';
				element.style.resize = 'none';
				GDWebText.bindInput(element);
			} else {
				element.style.pointerEvents = 'none';
				element.style.userSelect = 'text';
				element.style.display = 'flex';
				if (tag === 'button' || tag === 'a') GDWebText.bindAction(element);
			}
			GDWebText.getRoot().appendChild(element);
			GDWebText.elements.set(uid, element);
			return element;
		},
	},
	gdweb_text_set_event_cb__sig: 'vp',
	// Browser入力を受けるC++ callbackを登録する。
	gdweb_text_set_event_cb: function (callback) {
		GDWebText.event = GodotRuntime.get_func(callback);
	},
	gdweb_site_set_event_cb__sig: 'vp',
	// Browser route通知をGodot scene切替callbackへ結ぶ。
	gdweb_site_set_event_cb: function (callback) {
		GDWebText.siteEvent = GodotRuntime.get_func(callback);
		GDWebText.siteCallback = (path) => {
			const value = GodotRuntime.allocString(path);
			GDWebText.siteEvent(value);
			GodotRuntime.free(value);
		};
		globalThis.GDWebSite?.bind(GDWebText.siteCallback);
	},
	gdweb_site_scene__sig: 'vi',
	// Godot current sceneのresource pathをBrowser titleとURLへ通知する。
	gdweb_site_scene: function (pPath) {
		globalThis.GDWebSite?.scene(GodotRuntime.parseString(pPath));
	},
	gdweb_text_begin__sig: 'v',
	// 一frameの文字同期前にroot寸法を更新する。
	gdweb_text_begin: function () {
		GDWebText.resizeRoot();
	},
	gdweb_text_sync__sig: 'viiii' + 'f'.repeat(8) + 'i'.repeat(8) + 'f'.repeat(25),
	// 一つのControl状態をObjectID対応の意味要素へ反映する。
	gdweb_text_sync: function (pUid, pText, pAux, pFont, xx, xy, yx, yy, x, y, width, height, flags, z, horizontal, vertical, kind, maxLength, selectionStart, selectionEnd, red, green, blue, alpha, fontSize, lineSpacing, outlineRed, outlineGreen, outlineBlue, outlineAlpha, outlineSize, shadowRed, shadowGreen, shadowBlue, shadowAlpha, shadowX, shadowY, underlineOffset, underlineThickness, placeholderRed, placeholderGreen, placeholderBlue, placeholderAlpha, scrollX, scrollY) {
		const uid = GodotRuntime.parseString(pUid);
		const text = GodotRuntime.parseString(pText);
		const aux = GodotRuntime.parseString(pAux);
		const font = GodotRuntime.parseString(pFont);
		const tag = GDWebText.tags[kind] || 'span';
		let element = GDWebText.elements.get(uid);
		if (!element || element.tagName.toLowerCase() !== tag) {
			element?.remove();
			element = GDWebText.create(uid, kind);
		}
		const type = GDWebText.kinds[kind] || 'Control';
		if (element.dataset.gdwebKind !== type) element.dataset.gdwebKind = type;
		const transform = [xx, xy, yx, yy, x, y].join(',');
		if (element.dataset.gdwebTransform !== transform) {
			element.dataset.gdwebTransform = transform;
			element.style.transform = `matrix(${xx},${xy},${yx},${yy},${x},${y})`;
		}
		if (tag === 'input' || tag === 'textarea') {
			if (!element.dataset.gdwebComposing && element.value !== text) {
				element.value = text;
				delete element.dataset.gdwebSent;
			}
			element.placeholder = aux;
			element.readOnly = !(flags & 32);
			if (tag === 'input') element.type = flags & 128 ? 'password' : 'text';
			element.dataset.gdwebMaxLength = String(maxLength);
			if (maxLength > 0) element.maxLength = maxLength * 2; else element.removeAttribute('maxlength');
			element.wrap = flags & 8 ? 'soft' : 'off';
			if (!element.dataset.gdwebComposing) {
				const start = GDWebText.offset(text, selectionStart);
				const end = GDWebText.offset(text, selectionEnd);
				if (element.selectionStart !== start || element.selectionEnd !== end) element.setSelectionRange(start, end);
			}
			if (flags & 64 && !element.dataset.gdwebBlurPending) {
				delete element.dataset.gdwebFocusPending;
				if (document.activeElement !== element) element.focus({ preventScroll: true });
			} else if (!(flags & 64)) {
				delete element.dataset.gdwebBlurPending;
				if (document.activeElement === element && !element.dataset.gdwebFocusPending) element.blur();
			}
		} else {
			if (element.textContent !== text) element.textContent = text;
			if (tag === 'button') element.disabled = !!(flags & 256);
			if (tag === 'a') {
				if (aux && !(flags & 256)) element.href = aux; else element.removeAttribute('href');
			}
			if (flags & 256) element.setAttribute('aria-disabled', 'true'); else element.removeAttribute('aria-disabled');
			element.tabIndex = flags & 1024 ? 0 : -1;
			if (flags & 64 && !GDWebText.mouseDown && !element.dataset.gdwebBlurPending) {
				delete element.dataset.gdwebFocusPending;
				if (document.activeElement !== element) element.focus({ preventScroll: true });
			} else if (!(flags & 64)) {
				delete element.dataset.gdwebBlurPending;
				if (document.activeElement === element && !element.dataset.gdwebFocusPending) element.blur();
			}
		}
		if (tag === 'textarea') {
			if (Math.abs(element.scrollLeft - scrollX) > 0.5) element.scrollLeft = scrollX;
			if (Math.abs(element.scrollTop - scrollY) > 0.5) element.scrollTop = scrollY;
		}
		const appearance = [width, height, flags, z, horizontal, vertical, font, red, green, blue, alpha, fontSize, lineSpacing, outlineRed, outlineGreen, outlineBlue, outlineAlpha, outlineSize, shadowRed, shadowGreen, shadowBlue, shadowAlpha, shadowX, shadowY, underlineOffset, underlineThickness, placeholderRed, placeholderGreen, placeholderBlue, placeholderAlpha].join(',');
		if (element.dataset.gdwebAppearance === appearance) return;
		element.dataset.gdwebAppearance = appearance;
		element.style.display = flags & 1 ? (tag === 'input' || tag === 'textarea' ? 'block' : 'flex') : 'none';
		element.style.width = `${width}px`;
		element.style.height = `${height}px`;
		element.style.zIndex = String(z);
		element.style.direction = flags & 2 ? 'rtl' : 'ltr';
		element.style.overflow = tag === 'textarea' ? 'auto' : flags & 4 ? 'hidden' : 'visible';
		element.style.whiteSpace = flags & 8 ? 'pre-wrap' : 'pre';
		element.style.overflowWrap = flags & 8 ? 'anywhere' : 'normal';
		element.style.justifyContent = ['flex-start', 'center', 'flex-end', 'space-between'][horizontal] || 'flex-start';
		element.style.alignItems = ['flex-start', 'center', 'flex-end', 'stretch'][vertical] || 'flex-start';
		element.style.textAlign = ['left', 'center', 'right', 'justify'][horizontal] || 'left';
		element.style.color = GDWebText.color(red, green, blue, alpha);
		element.style.setProperty('--gdweb-placeholder', GDWebText.color(placeholderRed, placeholderGreen, placeholderBlue, placeholderAlpha));
		element.style.fontFamily = globalThis.GDWEB_FONT_MAP?.[font]?.family || 'sans-serif';
		element.style.fontSize = `${fontSize}px`;
		element.style.lineHeight = `${fontSize + lineSpacing}px`;
		element.style.webkitTextStroke = outlineSize > 0 && outlineAlpha > 0 ? `${outlineSize}px ${GDWebText.color(outlineRed, outlineGreen, outlineBlue, outlineAlpha)}` : '0 transparent';
		element.style.textShadow = shadowAlpha > 0 ? `${shadowX}px ${shadowY}px 0 ${GDWebText.color(shadowRed, shadowGreen, shadowBlue, shadowAlpha)}` : 'none';
		element.style.textDecorationLine = flags & 16 ? 'underline' : 'none';
		element.style.textUnderlineOffset = flags & 16 ? `${underlineOffset}px` : 'auto';
		element.style.textDecorationThickness = flags & 16 ? `${underlineThickness}px` : 'auto';
	},
	gdweb_text_remove__sig: 'vi',
	// 解放済みControlの意味要素とObjectID対応を回収する。
	gdweb_text_remove: function (pUid) {
		const uid = GodotRuntime.parseString(pUid);
		GDWebText.elements.get(uid)?.remove();
		GDWebText.elements.delete(uid);
	},
	gdweb_text_end__sig: 'v',
	// Emscripten側の同期境界を明示する。
	gdweb_text_end: function () {},
};

autoAddDeps(GDWebText, '$GDWebText');
mergeInto(LibraryManager.library, GDWebText);
