/**************************************************************************/
/*  library_yuruttoweb_text.js                                                 */
/**************************************************************************/

// Godotが確定した文字矩形を意味に合うDOM要素へ反映する。
// ObjectIDで要素を固定し、確定入力と意味操作だけをGodotへ戻す。

const YuruttoWebText = {
	$YuruttoWebText__deps: ['$GodotConfig', '$GodotRuntime'],
	$YuruttoWebText: {
		elements: new Map(),
		seen: new Set(), // 現frameで同期されたDOM ID。
		event: null,
		siteEvent: null,
		siteCallback: null,
		root: null,
		rootSize: '',
		mouseDown: false,
		kinds: ['Label', 'Button', 'LinkButton', 'LineEdit', 'TextEdit', 'ControlText'],
		tags: ['span', 'button', 'a', 'input', 'textarea', 'span'],
		// Canvasと同じ親へ文字と入力専用rootを一度だけ作る。
		getRoot: function () {
			if (YuruttoWebText.root?.isConnected) return YuruttoWebText.root;
			const canvas = GodotConfig.canvas;
			const root = document.createElement('div');
			root.id = 'yuruttoweb-text-root';
			root.style.cssText = 'position:absolute;transform-origin:0 0;pointer-events:none;overflow:hidden;z-index:1;font-family:sans-serif';
			const style = document.createElement('style');
			style.textContent = '#yuruttoweb-text-root input::placeholder,#yuruttoweb-text-root textarea::placeholder{color:var(--yuruttoweb-placeholder,currentColor);opacity:1}';
			document.head.appendChild(style);
			canvas.parentElement.appendChild(root);
			canvas.addEventListener('mousedown', () => { YuruttoWebText.mouseDown = true; });
			window.addEventListener('mouseup', () => { YuruttoWebText.mouseDown = false; });
			YuruttoWebText.root = root;
			return root;
		},
		// rootをCanvasのCSS表示矩形へ一致させる。
		resizeRoot: function () {
			const canvas = GodotConfig.canvas;
			const root = YuruttoWebText.getRoot();
			const parent = canvas.parentElement;
			const box = canvas.getBoundingClientRect();
			const parentBox = parent.getBoundingClientRect();
			const value = `${box.left - parentBox.left},${box.top - parentBox.top},${box.width},${box.height}`;
			if (value === YuruttoWebText.rootSize) return;
			YuruttoWebText.rootSize = value;
			root.style.left = `${box.left - parentBox.left}px`;
			root.style.top = `${box.top - parentBox.top}px`;
			root.style.width = `${box.width}px`;
			root.style.height = `${box.height}px`;
		},
		// Godot位置行列とBrowser fontの横幅補正を一つのtransformへ反映する。
		place: function (element) {
			const matrix = element.dataset.yuruttowebMatrix;
			const scale = element.dataset.yuruttowebTextScale || '1';
			element.style.transform = `matrix(${matrix}) scaleX(${scale})`;
		},
		// Browser fontの実幅をGodotが確定した項目幅へ折返さず収める。
		fit: function (element) {
			const width = Number.parseFloat(element.style.width);
			const natural = element.scrollWidth;
			const scale = natural > width && natural > 0 ? width / natural : 1;
			element.dataset.yuruttowebTextScale = String(scale);
			YuruttoWebText.place(element);
		},
		// 実際に指定したWeb fontの読込後へ幅補正を更新する。
		loadFont: function (element) {
			const font = getComputedStyle(element).font;
			const key = `${font}\n${element.textContent}`;
			element.dataset.yuruttowebFontRequest = key;
			const done = () => {
				if (element.isConnected && element.dataset.yuruttowebFontRequest === key) YuruttoWebText.fit(element);
			};
			document.fonts.load(font, element.textContent).then(done, done);
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
			if (!YuruttoWebText.event) return;
			const value = 'value' in element ? element.value : '';
			const start = kind === 7 ? Math.round(element.scrollTop) : YuruttoWebText.index(value, element.selectionStart || 0);
			const end = kind === 7 ? Math.round(element.scrollLeft) : YuruttoWebText.index(value, element.selectionEnd || 0);
			const state = `${kind}:${value}:${start}:${end}`;
			if (element.dataset.yuruttowebSent === state) return;
			element.dataset.yuruttowebSent = state;
			const uid = GodotRuntime.allocString(element.dataset.yuruttowebText);
			const text = GodotRuntime.allocString(value);
			YuruttoWebText.event(uid, kind, text, start, end);
			GodotRuntime.free(text);
			GodotRuntime.free(uid);
		},
		// LineEditの上限をBrowserのUTF-16数でなくGodotと同じUnicode文字数で適用する。
		limit: function (element) {
			const max = Number(element.dataset.yuruttowebMaxLength || 0);
			const chars = Array.from(element.value);
			if (!max || chars.length <= max) return;
			const start = Math.min(YuruttoWebText.index(element.value, element.selectionStart || 0), max);
			const end = Math.min(YuruttoWebText.index(element.value, element.selectionEnd || 0), max);
			element.value = chars.slice(0, max).join('');
			element.setSelectionRange(YuruttoWebText.offset(element.value, start), YuruttoWebText.offset(element.value, end));
		},
		// Button系のnative clickをGodotの標準Button状態遷移へ渡す。
		activate: function (element) {
			if (!YuruttoWebText.event || element.disabled || element.getAttribute('aria-disabled') === 'true') return;
			const uid = GodotRuntime.allocString(element.dataset.yuruttowebText);
			const text = GodotRuntime.allocString('');
			YuruttoWebText.event(uid, 6, text, 0, 0);
			GodotRuntime.free(text);
			GodotRuntime.free(uid);
		},
		// inputとtextareaへIME、選択、focusの双方向境界を一度だけ結ぶ。
		bindInput: function (element) {
			for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) {
				element.addEventListener(name, (event) => event.stopPropagation());
			}
			element.addEventListener('focus', () => {
				delete element.dataset.yuruttowebBlurPending;
				element.dataset.yuruttowebFocusPending = 'true';
				YuruttoWebText.send(element, 3);
			});
			element.addEventListener('blur', () => {
				delete element.dataset.yuruttowebFocusPending;
				element.dataset.yuruttowebBlurPending = 'true';
				YuruttoWebText.send(element, 4);
			});
			element.addEventListener('compositionstart', () => { element.dataset.yuruttowebComposing = 'true'; });
			element.addEventListener('compositionend', () => {
				delete element.dataset.yuruttowebComposing;
				YuruttoWebText.limit(element);
				YuruttoWebText.send(element, 1);
			});
			element.addEventListener('input', () => {
				if (!element.dataset.yuruttowebComposing) {
					YuruttoWebText.limit(element);
					YuruttoWebText.send(element, 1);
				}
			});
			element.addEventListener('scroll', () => YuruttoWebText.send(element, 7));
			element.addEventListener('select', () => YuruttoWebText.send(element, 2));
			element.addEventListener('keyup', () => YuruttoWebText.send(element, 2));
			element.addEventListener('keydown', (event) => {
				event.stopPropagation();
				if (element.tagName === 'INPUT' && event.key === 'Enter' && !event.isComposing) {
					event.preventDefault();
					YuruttoWebText.send(element, 5);
			}
			});
		},
		// Button系へkeyboard focusとnative keyboard clickだけを結ぶ。
		bindAction: function (element) {
			element.addEventListener('focus', () => {
				delete element.dataset.yuruttowebBlurPending;
				element.dataset.yuruttowebFocusPending = 'true';
				YuruttoWebText.send(element, 3);
			});
			element.addEventListener('blur', () => {
				delete element.dataset.yuruttowebFocusPending;
				element.dataset.yuruttowebBlurPending = 'true';
				YuruttoWebText.send(element, 4);
			});
			element.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				if (!event.detail) YuruttoWebText.activate(element);
			});
		},
		// Control種別に合う意味要素を既定装飾なしで作る。
		create: function (uid, kind) {
			const tag = YuruttoWebText.tags[kind] || 'span';
			const element = document.createElement(tag);
			element.id = `yuruttoweb-text-${uid}`;
			element.dataset.yuruttowebText = uid;
			element.style.cssText = 'position:absolute;box-sizing:border-box;transform-origin:0 0;margin:0;padding:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;border-radius:0';
			if (tag === 'button') element.type = 'button';
			if (tag === 'input' || tag === 'textarea') {
				element.style.pointerEvents = 'auto';
				element.style.userSelect = 'text';
				element.style.appearance = 'none';
				element.style.resize = 'none';
				YuruttoWebText.bindInput(element);
			} else {
				element.style.pointerEvents = 'none';
				element.style.userSelect = 'text';
				element.style.display = 'flex';
				if (tag === 'button' || tag === 'a') YuruttoWebText.bindAction(element);
			}
			YuruttoWebText.getRoot().appendChild(element);
			YuruttoWebText.elements.set(uid, element);
			return element;
		},
	},
	yuruttoweb_text_set_event_cb__sig: 'vp',
	// Browser入力を受けるC++ callbackを登録する。
	yuruttoweb_text_set_event_cb: function (callback) {
		YuruttoWebText.event = GodotRuntime.get_func(callback);
	},
	yuruttoweb_text_prefer_dom__sig: 'i',
	// Canvas Theme fontを避ける既定方針をC++所有判定へ返す。
	yuruttoweb_text_prefer_dom: function () {
		return globalThis.YURUTTOWEB_TEXT_CONFIG?.avoidCanvasThemeFont === false ? 0 : 1;
	},
	yuruttoweb_site_set_event_cb__sig: 'vp',
	// Browser route通知をGodot scene切替callbackへ結ぶ。
	yuruttoweb_site_set_event_cb: function (callback) {
		YuruttoWebText.siteEvent = GodotRuntime.get_func(callback);
		YuruttoWebText.siteCallback = (path) => {
			const value = GodotRuntime.allocString(path);
			YuruttoWebText.siteEvent(value);
			GodotRuntime.free(value);
		};
		globalThis.YuruttoWebSite?.bind(YuruttoWebText.siteCallback);
	},
	yuruttoweb_site_scene__sig: 'vi',
	// Godot current sceneのresource pathをBrowser titleとURLへ通知する。
	yuruttoweb_site_scene: function (pPath) {
		globalThis.YuruttoWebSite?.scene(GodotRuntime.parseString(pPath));
	},
	yuruttoweb_text_begin__sig: 'v',
	// 一frameの文字同期前にroot寸法を更新する。
	yuruttoweb_text_begin: function () {
		YuruttoWebText.resizeRoot();
		YuruttoWebText.seen.clear();
	},
	yuruttoweb_text_sync__sig: 'viiii' + 'f'.repeat(8) + 'i'.repeat(8) + 'f'.repeat(25),
	// 一つのControl状態をObjectID対応の意味要素へ反映する。
	yuruttoweb_text_sync: function (pUid, pText, pAux, pFont, xx, xy, yx, yy, x, y, width, height, flags, z, horizontal, vertical, kind, maxLength, selectionStart, selectionEnd, red, green, blue, alpha, fontSize, lineSpacing, outlineRed, outlineGreen, outlineBlue, outlineAlpha, outlineSize, shadowRed, shadowGreen, shadowBlue, shadowAlpha, shadowX, shadowY, underlineOffset, underlineThickness, placeholderRed, placeholderGreen, placeholderBlue, placeholderAlpha, scrollX, scrollY) {
		const uid = GodotRuntime.parseString(pUid);
		YuruttoWebText.seen.add(uid);
		const text = GodotRuntime.parseString(pText);
		const aux = GodotRuntime.parseString(pAux);
		const font = GodotRuntime.parseString(pFont);
		const tag = YuruttoWebText.tags[kind] || 'span';
		let element = YuruttoWebText.elements.get(uid);
		if (!element || element.tagName.toLowerCase() !== tag) {
			element?.remove();
			element = YuruttoWebText.create(uid, kind);
		}
		const type = YuruttoWebText.kinds[kind] || 'Control';
		if (element.dataset.yuruttowebKind !== type) element.dataset.yuruttowebKind = type;
		const transform = [xx, xy, yx, yy, x, y].join(',');
		if (element.dataset.yuruttowebTransform !== transform) {
			element.dataset.yuruttowebTransform = transform;
			element.dataset.yuruttowebMatrix = transform;
			YuruttoWebText.place(element);
		}
		let textChanged = false;
		if (tag === 'input' || tag === 'textarea') {
			if (!element.dataset.yuruttowebComposing && element.value !== text) {
				element.value = text;
				delete element.dataset.yuruttowebSent;
			}
			element.placeholder = aux;
			element.readOnly = !(flags & 32);
			if (tag === 'input') element.type = flags & 128 ? 'password' : 'text';
			element.dataset.yuruttowebMaxLength = String(maxLength);
			if (maxLength > 0) element.maxLength = maxLength * 2; else element.removeAttribute('maxlength');
			element.wrap = flags & 8 ? 'soft' : 'off';
			if (!element.dataset.yuruttowebComposing) {
				const start = YuruttoWebText.offset(text, selectionStart);
				const end = YuruttoWebText.offset(text, selectionEnd);
				if (element.selectionStart !== start || element.selectionEnd !== end) element.setSelectionRange(start, end);
			}
			if (flags & 64 && !element.dataset.yuruttowebBlurPending) {
				delete element.dataset.yuruttowebFocusPending;
				if (document.activeElement !== element) element.focus({ preventScroll: true });
			} else if (!(flags & 64)) {
				delete element.dataset.yuruttowebBlurPending;
				if (document.activeElement === element && !element.dataset.yuruttowebFocusPending) element.blur();
			}
		} else {
			if (element.textContent !== text) {
				element.textContent = text;
				textChanged = true;
			}
			if (tag === 'button') element.disabled = !!(flags & 256);
			if (tag === 'a') {
				if (aux && !(flags & 256)) element.href = aux; else element.removeAttribute('href');
			}
			if (flags & 256) element.setAttribute('aria-disabled', 'true'); else element.removeAttribute('aria-disabled');
			element.tabIndex = flags & 1024 ? 0 : -1;
			if (flags & 64 && !YuruttoWebText.mouseDown && !element.dataset.yuruttowebBlurPending) {
				delete element.dataset.yuruttowebFocusPending;
				if (document.activeElement !== element) element.focus({ preventScroll: true });
			} else if (!(flags & 64)) {
				delete element.dataset.yuruttowebBlurPending;
				if (document.activeElement === element && !element.dataset.yuruttowebFocusPending) element.blur();
			}
		}
		if (tag === 'textarea') {
			if (Math.abs(element.scrollLeft - scrollX) > 0.5) element.scrollLeft = scrollX;
			if (Math.abs(element.scrollTop - scrollY) > 0.5) element.scrollTop = scrollY;
		}
		const appearance = [width, height, flags, z, horizontal, vertical, font, red, green, blue, alpha, fontSize, lineSpacing, outlineRed, outlineGreen, outlineBlue, outlineAlpha, outlineSize, shadowRed, shadowGreen, shadowBlue, shadowAlpha, shadowX, shadowY, underlineOffset, underlineThickness, placeholderRed, placeholderGreen, placeholderBlue, placeholderAlpha].join(',');
		if (element.dataset.yuruttowebAppearance === appearance && !(kind === 5 && textChanged)) return;
		element.dataset.yuruttowebAppearance = appearance;
		element.style.display = flags & 1 ? (tag === 'input' || tag === 'textarea' || kind === 5 ? 'block' : 'flex') : 'none';
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
		element.style.color = YuruttoWebText.color(red, green, blue, alpha);
		element.style.setProperty('--yuruttoweb-placeholder', YuruttoWebText.color(placeholderRed, placeholderGreen, placeholderBlue, placeholderAlpha));
		element.style.fontFamily = globalThis.YURUTTOWEB_FONT_MAP?.[font]?.family || 'sans-serif';
		element.style.fontSize = `${fontSize}px`;
		// 標準Controlの文字はGodotが確定した行の高さを行ボックスへそのまま使い、Browser fontの行送りではみ出させない。
		element.style.lineHeight = `${kind === 5 ? height : fontSize + lineSpacing}px`;
		element.style.webkitTextStroke = outlineSize > 0 && outlineAlpha > 0 ? `${outlineSize}px ${YuruttoWebText.color(outlineRed, outlineGreen, outlineBlue, outlineAlpha)}` : '0 transparent';
		element.style.textShadow = shadowAlpha > 0 ? `${shadowX}px ${shadowY}px 0 ${YuruttoWebText.color(shadowRed, shadowGreen, shadowBlue, shadowAlpha)}` : 'none';
		element.style.textDecorationLine = flags & 16 ? 'underline' : 'none';
		element.style.textUnderlineOffset = flags & 16 ? `${underlineOffset}px` : 'auto';
		element.style.textDecorationThickness = flags & 16 ? `${underlineThickness}px` : 'auto';
		if (kind === 5) {
			YuruttoWebText.fit(element);
			YuruttoWebText.loadFont(element);
		}
	},
	yuruttoweb_text_remove__sig: 'vi',
	// 解放済みControlの意味要素とObjectID対応を回収する。
	yuruttoweb_text_remove: function (pUid) {
		const uid = GodotRuntime.parseString(pUid);
		YuruttoWebText.elements.get(uid)?.remove();
		YuruttoWebText.elements.delete(uid);
	},
	yuruttoweb_text_end__sig: 'v',
	// 今frameで使われなかった複数項目と解放済み要素を回収する。
	yuruttoweb_text_end: function () {
		for (const [uid, element] of YuruttoWebText.elements) {
			if (YuruttoWebText.seen.has(uid)) continue;
			element.remove();
			YuruttoWebText.elements.delete(uid);
		}
	},
};

autoAddDeps(YuruttoWebText, '$YuruttoWebText');
mergeInto(LibraryManager.library, YuruttoWebText);
