/**************************************************************************/
/*  library_gdweb_dom.js                                                  */
/**************************************************************************/

// Godotのdirty GUI状態を安定したHTML要素へ反映する。
// Browserは文字、入力、focus、意味情報だけを所有し、配置値を再計算しない。

const GDWebDOM = {
	$GDWebDOM__deps: ['$GodotConfig', '$GodotRuntime', '$GodotFS'],
	$GDWebDOM: {
		elements: new Map(), parents: new Map(), packs: new Map(), event: null, root: null, rootSize: '',
		// 同じ遅延PCKの同時要求を一回へ束ね、実行中の仮想filesystemへ置く。
		loadPack: function (url, target) {
			if (!GDWebDOM.packs.has(url)) {
				const load = fetch(url).then((response) => {
					if (!response.ok) throw new Error(`gdweb pack ${response.status}: ${url}`);
					return response.arrayBuffer();
				}).then((buffer) => {
					GodotFS.copy_to_fs(target, buffer);
					window.gdwebPackStats = { requests: GDWebDOM.packs.size, bytes: buffer.byteLength, target };
					return target;
				});
				GDWebDOM.packs.set(url, load);
			}
			return GDWebDOM.packs.get(url);
		},
		getRoot: function () {
			let root = GDWebDOM.root && GDWebDOM.root.isConnected ? GDWebDOM.root : document.getElementById('gdweb-dom-root');
			if (!root) {
				root = document.createElement('div');
				root.id = 'gdweb-dom-root';
				GodotConfig.canvas.parentNode.appendChild(root);
			}
			GDWebDOM.root = root;
			if (!root.dataset.gdwebReady) {
				const base = location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
				const style = document.createElement('style');
				style.textContent = `@font-face{font-family:GDWeb;src:url('${base}.font.woff2') format('woff2');font-display:swap}#gdweb-dom-root{font-family:GDWeb,sans-serif}`;
				document.head.appendChild(style);
				root.dataset.gdwebReady = 'true';
				window.gdwebLoadPack = GDWebDOM.loadPack;
				// popup外の操作をGodotのWindow状態へ戻す。
				document.addEventListener('pointerdown', (event) => {
					for (const popup of root.querySelectorAll('[data-gdweb-type^="Popup"]')) {
						if (popup.style.display !== 'none' && !popup.contains(event.target)) GDWebDOM.event(Number(popup.dataset.gdwebHandle), 8, 0, 0, 0);
					}
				}, true);
			}
			return root;
		},
		// Canvas backingとCSS表示の倍率をbatch先頭で一回だけDOM rootへ反映する。
		resizeRoot: function () {
			const root = GDWebDOM.getRoot();
			const rect = GodotConfig.canvas.getBoundingClientRect();
			const width = GodotConfig.canvas.width || rect.width;
			const height = GodotConfig.canvas.height || rect.height;
			const size = `${width}:${height}:${rect.width}:${rect.height}`;
			if (GDWebDOM.rootSize === size) return;
			GDWebDOM.rootSize = size;
			const sx = width ? rect.width / width : 1;
			const sy = height ? rect.height / height : 1;
			root.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;z-index:1;pointer-events:none;overflow:hidden;transform-origin:0 0;transform:scale(${sx},${sy})`;
		},
		tag: function (type) {
			if (type === 'PopupMenu') return 'ul';
			if (type === 'OptionButton') return 'select';
			if (type === 'MenuBar') return 'nav';
			if (type === 'LinkButton') return 'a';
			if (/Button$/.test(type)) return 'button';
			if (type === 'LineEdit') return 'input';
			if (type === 'TextEdit' || type === 'CodeEdit') return 'textarea';
			if (type === 'ProgressBar' || type === 'TextureProgressBar') return 'progress';
			if (/Slider$/.test(type) || /ScrollBar$/.test(type)) return 'input';
			if (type === 'Label' || type === 'RichTextLabel') return 'span';
			if (type === 'ItemList' || type === 'Tree') return 'ul';
			return 'div';
		},
		role: function (type) {
			if (type === 'PopupMenu') return 'menu';
			if (type === 'LinkButton') return 'link';
			if (/Dialog$/.test(type) || /^Popup/.test(type)) return 'dialog';
			if (type === 'Window') return 'application';
			if (type === 'CheckBox') return 'checkbox';
			if (type === 'CheckButton') return 'switch';
			if (type === 'TabBar') return 'tablist';
			if (type === 'MenuBar') return 'menubar';
			if (type === 'ItemList') return 'listbox';
			if (type === 'Tree') return 'tree';
			if (type === 'HSeparator' || type === 'VSeparator') return 'separator';
			if (/Button$/.test(type) || type === 'LineEdit' || type === 'TextEdit' || type === 'CodeEdit' || /Slider$/.test(type) || /ScrollBar$/.test(type) || /ProgressBar$/.test(type)) return '';
			return 'presentation';
		},
		items: function (element, type, text, selected) {
			if (element.dataset.gdwebItems !== text) {
				element.dataset.gdwebItems = text;
				element.replaceChildren();
				for (const [index, value] of text.split('\\n').filter(Boolean).entries()) {
					const item = document.createElement(type === 'OptionButton' ? 'option' : type === 'TabBar' ? 'button' : 'li');
					item.textContent = value;
					if (type === 'PopupMenu' || type === 'MenuBar') item.setAttribute('role', 'menuitem');
					else if (type === 'Tree') item.setAttribute('role', 'treeitem');
					else if (type === 'TabBar') item.setAttribute('role', 'tab');
					else if (type === 'ItemList') item.setAttribute('role', 'option');
					if (type !== 'OptionButton') item.addEventListener('click', (event) => { event.stopPropagation(); GDWebDOM.event(Number(element.dataset.gdwebHandle), 6, 0, index, 0); });
					element.appendChild(item);
				}
			}
			const items = [...element.children].filter((item) => !item.dataset.gdwebHandle);
			for (const [index, item] of items.entries()) if (item.hasAttribute('role')) item.setAttribute('aria-selected', index === selected ? 'true' : 'false');
		},
		forwardPointer: function (element, event) {
			const rect = element.getBoundingClientRect();
			const init = { bubbles: true, clientX: event.clientX || rect.left + rect.width / 2, clientY: event.clientY || rect.top + rect.height / 2, button: event.button || 0 };
			GodotConfig.canvas.dispatchEvent(new MouseEvent('mousedown', init));
			GodotConfig.canvas.dispatchEvent(new MouseEvent('mouseup', init));
		},
		disabled: function (element, event) {
			if (element.dataset.gdwebDisabled !== 'true') return false;
			event.preventDefault();
			event.stopPropagation();
			return true;
		},
		index: function (value, utf16) { return Array.from(value.slice(0, utf16)).length; },
		sendText: function (element, handle, kind) {
			const text = kind === 1 ? GodotRuntime.allocString(element.value) : 0;
			GDWebDOM.event(handle, kind, text, GDWebDOM.index(element.value, element.selectionStart || 0), GDWebDOM.index(element.value, element.selectionEnd || 0));
			if (text) GodotRuntime.free(text);
		},
		bind: function (element, handle) {
			element.dataset.gdwebBindings = String(Number(element.dataset.gdwebBindings || 0) + 1);
			// HTML所有の入力がGodotのBrowser入力へ二重に届くことを防ぐ。
			for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) element.addEventListener(name, (event) => event.stopPropagation());
			element.addEventListener('click', (event) => { if (GDWebDOM.disabled(element, event)) return; event.stopPropagation(); if (element.dataset.gdwebAction === 'button') { event.preventDefault(); GDWebDOM.event(handle, 7, 0, 0, 0); } else if (event.detail) GDWebDOM.forwardPointer(element, event); });
			element.addEventListener('focus', () => GDWebDOM.event(handle, 3, 0, 0, 0));
			element.addEventListener('blur', () => GDWebDOM.event(handle, 4, 0, 0, 0));
			element.addEventListener('keydown', (event) => {
				if (GDWebDOM.disabled(element, event)) return;
				event.stopPropagation();
				if (event.key === 'Tab') { event.preventDefault(); GDWebDOM.event(handle, 9, 0, event.shiftKey ? 1 : 0, 0); return; }
				if (element.dataset.gdwebAction === 'button' && element.dataset.gdwebType !== 'OptionButton') {
					if (!['BUTTON', 'A'].includes(element.tagName) && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); GDWebDOM.event(handle, 7, 0, 0, 0); }
					return;
				}
				if (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') GodotConfig.canvas.dispatchEvent(new KeyboardEvent('keydown', event));
			});
			element.addEventListener('keyup', (event) => {
				event.stopPropagation();
				if (element.dataset.gdwebAction === 'button' && element.dataset.gdwebType !== 'OptionButton') return;
				if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') GDWebDOM.sendText(element, handle, 5);
				else GodotConfig.canvas.dispatchEvent(new KeyboardEvent('keyup', event));
			});
			element.addEventListener('wheel', (event) => GodotConfig.canvas.dispatchEvent(new WheelEvent('wheel', event)));
			if (element.tagName === 'SELECT') element.addEventListener('change', () => GDWebDOM.event(handle, 6, 0, element.selectedIndex, 0));
			if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
				element.addEventListener('compositionstart', () => { element.dataset.gdwebComposing = 'true'; });
				element.addEventListener('compositionend', () => { delete element.dataset.gdwebComposing; GDWebDOM.sendText(element, handle, 1); });
				element.addEventListener('input', () => {
					if (element.type === 'range') GDWebDOM.event(handle, 2, 0, Number(element.value), 0);
					else if (!element.dataset.gdwebComposing) GDWebDOM.sendText(element, handle, 1);
				});
				element.addEventListener('select', () => GDWebDOM.sendText(element, handle, 5));
			}
		},
		create: function (handle, type, text) {
			const tag = GDWebDOM.tag(type);
			const seo = [...GDWebDOM.getRoot().querySelectorAll('[data-gdweb-seo]:not([data-gdweb-handle])')].find((item) => item.dataset.gdwebType === type && item.tagName.toLowerCase() === tag && item.textContent === text);
			const element = seo || document.createElement(tag);
			element.dataset.gdwebHandle = String(handle);
			if (seo) element.dataset.gdwebHydrated = 'true';
				element.style.cssText = 'position:absolute;left:0;top:0;box-sizing:border-box;background:transparent;border:0;outline:none;margin:0;padding:0;color:inherit;pointer-events:auto;transform-origin:0 0';
			GDWebDOM.elements.set(handle, element);
			GDWebDOM.bind(element, handle);
			return element;
		},
	},
	godot_js_gdweb_dom_set_event_cb__sig: 'vp',
	godot_js_gdweb_dom_set_event_cb: function (callback) { GDWebDOM.event = GodotRuntime.get_func(callback); },
	godot_js_gdweb_dom_begin__sig: 'v',
	godot_js_gdweb_dom_begin: function () { GDWebDOM.resizeRoot(); },
	godot_js_gdweb_dom_sync__sig: 'viiiiffffffffiiiddddffffffffffffffff',
	godot_js_gdweb_dom_sync: function (handle, parentId, pType, pText, xx, xy, yx, yy, x, y, width, height, flags, z, order, value, min, max, step, red, green, blue, alpha, fontSize, outlineRed, outlineGreen, outlineBlue, outlineAlpha, outlineSize, shadowRed, shadowGreen, shadowBlue, shadowAlpha, shadowX, shadowY) {
		const type = GodotRuntime.parseString(pType);
		const text = GodotRuntime.parseString(pText);
		let element = GDWebDOM.elements.get(handle);
		if (!element || element.tagName.toLowerCase() !== GDWebDOM.tag(type)) {
			if (element) element.remove();
			element = GDWebDOM.create(handle, type, text);
		}
		GDWebDOM.parents.set(handle, parentId);
			element.dataset.gdwebType = type;
			const disabled = !!(flags & 2);
			if (type === 'LinkButton' && !disabled) element.setAttribute('href', '#'); else if (type === 'LinkButton') element.removeAttribute('href');
		element.style.width = `${width}px`;
		element.style.height = `${height}px`;
		element.style.transform = `matrix(${xx},${xy},${yx},${yy},${x},${y})`;
		element.style.display = flags & 1 ? '' : 'none';
		element.style.overflow = flags & 4 ? 'hidden' : 'visible';
		element.style.zIndex = String(z);
			element.dataset.gdwebOrder = String(order);
			element.dataset.gdwebValue = String(value);
			element.style.color = `rgba(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)},${alpha})`;
			element.style.fontSize = `${fontSize}px`;
			element.style.webkitTextStroke = outlineSize > 0 && outlineAlpha > 0 ? `${outlineSize}px rgba(${Math.round(outlineRed * 255)},${Math.round(outlineGreen * 255)},${Math.round(outlineBlue * 255)},${outlineAlpha})` : '0 transparent';
			element.style.textShadow = shadowAlpha > 0 ? `${shadowX}px ${shadowY}px 0 rgba(${Math.round(shadowRed * 255)},${Math.round(shadowGreen * 255)},${Math.round(shadowBlue * 255)},${shadowAlpha})` : 'none';
			element.dir = flags & 16 ? 'rtl' : 'ltr';
			element.tabIndex = flags & 8 && !disabled ? 0 : -1;
			element.disabled = disabled;
			element.dataset.gdwebDisabled = String(disabled);
			if (disabled) element.setAttribute('aria-disabled', 'true'); else element.removeAttribute('aria-disabled');
			element.dataset.gdwebAction = flags & 1024 ? 'button' : '';
			element.dataset.gdwebFocus = flags & 2048 ? 'true' : 'false';
			const interactive = flags & 1024 || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || ['ItemList', 'Tree', 'TabBar', 'MenuBar', 'PopupMenu'].includes(type);
			element.style.pointerEvents = interactive ? 'auto' : 'none';
		const role = GDWebDOM.role(type);
		if (role) element.setAttribute('role', role); else element.removeAttribute('role');
		if (type === 'CheckBox' || type === 'CheckButton') element.setAttribute('aria-checked', flags & 512 ? 'true' : 'false');
		if (flags & 32) {
			element.setAttribute('aria-label', text || type);
			element.setAttribute('aria-modal', flags & 64 ? 'true' : 'false');
		} else {
			element.removeAttribute('aria-label');
			element.removeAttribute('aria-modal');
		}
		if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
			if (/Slider$/.test(type) || /ScrollBar$/.test(type)) {
				element.type = 'range';
				element.min = String(min); element.max = String(max); element.step = String(step); element.value = String(value);
			} else {
				if (element.tagName === 'INPUT') element.type = flags & 256 ? 'password' : 'text';
					if (document.activeElement !== element && !element.dataset.gdwebComposing && element.value !== text) element.value = text;
			}
		} else if (['PopupMenu', 'OptionButton', 'MenuBar', 'ItemList', 'Tree', 'TabBar'].includes(type)) {
				GDWebDOM.items(element, type, text, Math.trunc(value));
			if (type === 'OptionButton') element.selectedIndex = Math.max(0, value);
			} else if (element.tagName === 'PROGRESS') {
				element.max = max; element.value = value;
			} else if (type === 'Window') {
				// 画面名を補助情報に保ち、本文への重複描画を防ぐ。
				element.setAttribute('aria-label', text);
			} else if (element.textContent !== text) element.textContent = text;
			if (flags & 2048 && document.activeElement !== element) element.focus({ preventScroll: true });
	},
	godot_js_gdweb_dom_remove__sig: 'vi',
	godot_js_gdweb_dom_remove: function (handle) {
		const element = GDWebDOM.elements.get(handle);
		if (element) element.remove();
		GDWebDOM.elements.delete(handle);
		GDWebDOM.parents.delete(handle);
	},
	godot_js_gdweb_dom_end__sig: 'v',
		godot_js_gdweb_dom_end: function () {
		for (const [handle, element] of GDWebDOM.elements) {
			const parentId = GDWebDOM.parents.get(handle);
			const parent = parentId === -1 ? GDWebDOM.getRoot() : GDWebDOM.elements.get(parentId) || GDWebDOM.getRoot();
			if (element.parentNode !== parent) parent.appendChild(element);
		}
			for (const parent of [GDWebDOM.getRoot(), ...GDWebDOM.elements.values()]) {
			const children = [...parent.children].filter((child) => child.dataset.gdwebHandle);
			const sorted = [...children].sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex) || Number(a.dataset.gdwebOrder) - Number(b.dataset.gdwebOrder));
			for (let i = 0; i < sorted.length; i++) if (parent.children[i] !== sorted[i]) parent.insertBefore(sorted[i], parent.children[i] || null);
			}
			for (const item of GDWebDOM.getRoot().querySelectorAll('[data-gdweb-seo]:not([data-gdweb-handle])')) item.remove();
		},
};

autoAddDeps(GDWebDOM, '$GDWebDOM');
mergeInto(LibraryManager.library, GDWebDOM);
