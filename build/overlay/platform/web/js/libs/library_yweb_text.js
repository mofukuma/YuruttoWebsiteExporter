/**************************************************************************/
/*  library_yweb_text.js                                                 */
/**************************************************************************/

// Godotが確定した文字矩形を意味に合うDOM要素へ反映する。
// ObjectIDで要素を固定し、確定入力と意味操作をGodotへ戻す。

const YWebText = {
	$YWebText__deps: ['$GodotConfig', '$GodotRuntime'],
	$YWebText: {
		elements: new Map(),
		images: new Map(), // 識別値ごとの画像data URI。
		drawn: new Set(), // 描画命令から作った要素。次の描画まで残す。
		drawOwners: new Map(), // CanvasItemごとの描画DOM ID。
		nodeOwners: new Map(), // Nodeごとの全DOM ID。3D射影を所有要素数で処理する。
		clips: new Map(), // ObjectIDごとのGodot確定切り抜き矩形。
		scrolls: new Map(), // ScrollContainerごとのBrowserスクロール状態。
		scrollMembers: new Map(), // Nodeごとの祖先ScrollContainer ID。
		scrollOwners: new Map(), // ScrollContainerごとの子Node ID。操作中の更新範囲を絞る。
		scrollSeen: new Set(), // 現frameにも存在するScrollContainer ID。
		activeAnimations: new Map(), // _draw中に後続命令へ付ける時間範囲。
		elementAnimations: new Map(), // DOM IDごとの時間範囲。
		meshes: new Map(), // 今frameの3D三角形をNodeと色ごとにまとめる領域。
		projected: new Set(), // SubViewportから3D平面へ射影したDOM ID。
		seen: new Set(), // 現frameで同期されたDOM ID。
		event: null,
		siteEvent: null,
		siteCallback: null,
		root: null,
		rootSize: '',
		tintIndex: 0, // 画像ごとの色filter IDを重複させない連番。
		mouseDown: false,
		metricsContext: null, // Browser字形を同じfontと寸法で測るCanvas文脈。
		glyphFilter: null, // ChromiumとGodotの縁alpha差を揃える共有filter。
		fontLoads: new Map(), // 書体ごとの読込Promise。scroll時の再要求を避ける。
		fontRetryMs: 250, // 一時的なWeb font失敗を一度再確認する間隔。
		glyphRaster: 0.4, // 単一行で両rendererの画素中心を揃える字形高。
		glyphMultiRaster: -0.4, // 複数行で変形後の端pixelを除く字形高。
		glyphMultiShift: 1, // 複数行でBrowserの画素丸めを戻す位置。
		glyphOpacity: 0.95, // FreeTypeとChromiumの縁合成量を揃える濃度。
		lineCache: {}, // 書体と寸法ごとの、本来の行送り。測り直しを避ける。
		ruler: null, // 行送りを測るための、見えない物差し。
		kinds: ['Label', 'Button', 'LinkButton', 'LineEdit', 'TextEdit', 'ControlText', 'CodeEdit'],
		tags: ['span', 'button', 'a', 'input', 'textarea', 'span', 'div'],
		// Canvasと同じ親へ文字と入力専用rootを一度作る。
		getRoot: function () {
			if (YWebText.root?.isConnected) return YWebText.root;
			const canvas = GodotConfig.canvas;
			const root = document.createElement('div');
			root.id = 'yweb-text-root';
			// -webkit-font-smoothing:antialiasedは、字の縁を灰色の濃淡で描かせる指定。
			// Godotも同じ描きかたをするので、これを揃えるとCanvasとDOMの文字の見た目が近づく。
			root.style.cssText = 'position:absolute;transform-origin:0 0;pointer-events:none;overflow:hidden;z-index:1;font-family:sans-serif;text-rendering:geometricPrecision;-webkit-font-smoothing:antialiased';
			const style = document.createElement('style');
			style.textContent = [
				'#yweb-text-root input::placeholder,#yweb-text-root textarea::placeholder{color:var(--yweb-placeholder,currentColor);opacity:1}',
				'#yweb-text-root textarea[data-yweb-code-input]{color:transparent;-webkit-text-fill-color:transparent;caret-color:var(--yweb-caret,currentColor)}',
				'#yweb-text-root textarea[data-yweb-code-input]::selection{background:var(--yweb-selection,Highlight);color:transparent;-webkit-text-fill-color:transparent}',
				'#yweb-text-root textarea[data-yweb-code-input]::-webkit-scrollbar{width:8px;height:8px}',
				'#yweb-text-root textarea[data-yweb-code-input]::-webkit-scrollbar-track{background:transparent}',
				'#yweb-text-root textarea[data-yweb-code-input]::-webkit-scrollbar-thumb{background:#808080;border-radius:4px}',
				'#yweb-text-root [data-yweb-scroll]{scrollbar-color:#cbd5e1 #1e293b;scrollbar-width:auto}',
				'#yweb-text-root [data-yweb-scroll]::-webkit-scrollbar{width:14px;height:14px}',
				'#yweb-text-root [data-yweb-scroll]::-webkit-scrollbar-track{background:#1e293b}',
				'#yweb-text-root [data-yweb-scroll]::-webkit-scrollbar-thumb{background:#cbd5e1;border:3px solid #1e293b;border-radius:7px}',
			].join('');
			document.head.appendChild(style);
			canvas.parentElement.appendChild(root);
			canvas.addEventListener('mousedown', () => { YWebText.mouseDown = true; });
			window.addEventListener('mouseup', () => { YWebText.mouseDown = false; });
			window.addEventListener('wheel', (event) => YWebText.wheel(event), { passive: false });
			YWebText.root = root;
			return root;
		},
		// CodeEditの入力本体を他の意味要素と同じ操作経路へ渡す。
		form: function (element) {
			return element.ywebInput || element;
		},
		// Browser scrollを仮想化した構文行、行番号、ガイドへ即時反映する。
		codeScroll: function (input) {
			const owner = input?.ywebOwner;
			if (!owner?.ywebRows) return;
			const gutter = Number(owner.dataset.ywebCodeGutter || 0);
			for (const row of owner.ywebRows.values()) {
				row.style.top = `${Number(row.dataset.ywebCodeY) - input.scrollTop}px`;
				row.ywebCode.style.left = `${gutter - input.scrollLeft}px`;
			}
			// Godotの1px線は座標を中心に描くため、CSS borderの左端へ1px戻す。
			for (const guide of owner.ywebGuides || []) guide.style.left = `${Number(guide.dataset.ywebX) - input.scrollLeft - 1}px`;
			if (owner.ywebBar) {
				const range = Math.max(0, input.scrollHeight - input.clientHeight);
				owner.ywebBar.ywebKnob.style.top = `${range ? input.scrollTop / range * owner.ywebBar.ywebTravel : 0}px`;
			}
			if (owner.ywebMinimap) {
				const range = Math.max(0, input.scrollHeight - input.clientHeight);
				const ratio = range ? input.scrollTop / range : 0;
				owner.ywebMinimap.ywebViewport.style.top = `${ratio * owner.ywebMinimap.ywebTravel}px`;
			}
		},
		// CodeEditの文字矩形外にある補助表示を、同じGodot行列でrootへ置く。
		placeCodePart: function (owner, part) {
			if (!part || !owner?.dataset.ywebMatrix) return;
			const matrix = YWebText.scrollMatrix(owner.dataset.ywebUid, owner.dataset.ywebMatrix).split(',').map(Number);
			if (matrix.length !== 6 || matrix.some((value) => !Number.isFinite(value))) return;
			const [x, y] = part.ywebLocal;
			matrix[4] += matrix[0] * x + matrix[2] * y;
			matrix[5] += matrix[1] * x + matrix[3] * y;
			part.style.transform = `matrix(${matrix})`;
			part.style.zIndex = owner.style.zIndex;
			YWebText.clip(part, owner.dataset.ywebUid, ...matrix);
		},
		// Minimapの構文区間を1x2pxの矩形へまとめ、文字DOMを増やさない。
		minimapBlocks: function (segments, tab, width) {
			const blocks = [];
			let column = 0;
			for (const segment of segments) {
				let run = 0;
				const flush = () => {
					if (run) blocks.push({ x: column - run, width: Math.min(run, width - column + run), color: segment.color });
					run = 0;
				};
				for (const char of Array.from(segment.text)) {
					if (/\s/u.test(char)) {
						flush();
						column += char === '\t' ? tab - column % tab : 1;
					} else {
						column++;
						run++;
					}
					if (column >= width) break;
				}
				flush();
				if (column >= width) break;
			}
			return blocks.filter((block) => block.width > 0);
		},
		// SyntaxHighlighterの可視行を、同じ行DOMを保ったまま色付きspanへ反映する。
		code: function (owner, source) {
			if (!owner?.ywebInput || owner.dataset.ywebCodeState === source) return;
			owner.dataset.ywebCodeState = source;
			const state = JSON.parse(source);
			const input = owner.ywebInput;
			owner.dataset.ywebCodeGutter = String(state.gutter);
			owner.style.setProperty('--yweb-caret', state.caret_color);
			owner.style.setProperty('--yweb-selection', state.selection_color);
			owner.style.setProperty('--yweb-code-color', state.text_color);
			if (state.minimap) {
				if (!owner.ywebMinimap) {
					const minimap = document.createElement('div');
					const content = document.createElement('div');
					const viewport = document.createElement('i');
					minimap.dataset.ywebCodeMinimap = owner.dataset.ywebUid;
					content.style.cssText = 'position:absolute;inset:0;pointer-events:none';
					viewport.style.cssText = 'position:absolute;left:0;right:0;pointer-events:none';
					minimap.append(content, viewport);
					YWebText.getRoot().appendChild(minimap);
					owner.ywebMinimap = minimap;
					minimap.ywebContent = content;
					minimap.ywebViewport = viewport;
					minimap.ywebRows = new Map();
					minimap.ywebMove = (event) => {
						event.preventDefault();
						event.stopPropagation();
						const root = YWebText.getRoot().getBoundingClientRect();
						const point = new DOMPoint(event.clientX - root.left, event.clientY - root.top).matrixTransform(new DOMMatrix(minimap.style.transform).inverse());
						const at = point.y;
						const ratio = Math.max(0, Math.min(1, (at - minimap.ywebViewport.offsetHeight / 2) / Math.max(1, minimap.ywebTravel)));
						const input = owner.ywebInput;
						input.scrollTop = ratio * Math.max(0, input.scrollHeight - input.clientHeight);
						input.dispatchEvent(new Event('scroll', { bubbles: true }));
					};
					minimap.addEventListener('pointerenter', () => { if (!minimap.ywebPointer) viewport.style.background = minimap.ywebColors[1]; });
					minimap.addEventListener('pointerleave', () => { if (!minimap.ywebPointer) viewport.style.background = minimap.ywebColors[0]; });
					minimap.addEventListener('pointerdown', (event) => {
						minimap.ywebPointer = event.pointerId;
						minimap.setPointerCapture(event.pointerId);
						viewport.style.background = minimap.ywebColors[2];
						minimap.ywebMove(event);
					});
					minimap.addEventListener('pointermove', (event) => { if (minimap.ywebPointer === event.pointerId) minimap.ywebMove(event); });
					minimap.addEventListener('pointerup', (event) => {
						if (minimap.ywebPointer !== event.pointerId) return;
						minimap.releasePointerCapture(event.pointerId);
						delete minimap.ywebPointer;
						viewport.style.background = minimap.ywebColors[1];
					});
				}
				const minimap = owner.ywebMinimap;
				minimap.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;width:${state.minimap.width}px;height:${state.minimap.height}px;overflow:hidden;pointer-events:auto;cursor:default`;
				minimap.dataset.ywebMinimapTotal = String(state.minimap.total);
				minimap.ywebLocal = [state.minimap.x, state.minimap.y];
				minimap.ywebViewport.style.height = `${state.minimap.viewport}px`;
				minimap.ywebColors = [state.minimap.viewport_color, state.minimap.viewport_hover_color, state.minimap.viewport_pressed_color];
				if (!minimap.ywebPointer) minimap.ywebViewport.style.background = state.minimap.viewport_color;
				minimap.ywebTravel = Math.max(0, state.minimap.height - state.minimap.viewport);
				const seen = new Set();
				for (const line of state.minimap.lines) {
					const key = String(line.at);
					seen.add(key);
					let row = minimap.ywebRows.get(key);
					if (!row) {
						row = document.createElement('i');
						row.style.cssText = 'position:absolute;left:0;right:0;height:2px;pointer-events:none';
						minimap.ywebContent.appendChild(row);
						minimap.ywebRows.set(key, row);
					}
					row.dataset.ywebMinimapLine = String(line.line);
					row.style.top = `${line.at * 3}px`;
					row.style.background = line.current ? state.current_color : 'transparent';
					const blocks = YWebText.minimapBlocks(line.segments, state.tab, state.minimap.width);
					const signature = JSON.stringify(blocks);
					if (row.dataset.ywebBlocks !== signature) {
						row.dataset.ywebBlocks = signature;
						for (let index = 0; index < blocks.length; index++) {
							const block = blocks[index];
							const item = row.children[index] || row.appendChild(document.createElement('i'));
							item.style.cssText = `display:block;position:absolute;left:${block.x}px;width:${block.width}px;height:2px;background:${block.color};opacity:.6`;
						}
						for (let index = blocks.length; index < row.children.length; index++) row.children[index].style.display = 'none';
					}
				}
				for (const [key, row] of minimap.ywebRows) {
					if (seen.has(key)) continue;
					row.remove();
					minimap.ywebRows.delete(key);
				}
				YWebText.placeCodePart(owner, minimap);
			} else if (owner.ywebMinimap) {
				owner.ywebMinimap.remove();
				owner.ywebMinimap = null;
			}
			if (state.scroll) {
				if (!owner.ywebBar) {
					const bar = document.createElement('i');
					const knob = document.createElement('i');
					bar.dataset.ywebCodeScroll = owner.dataset.ywebUid;
					bar.style.pointerEvents = 'none';
					knob.style.cssText = 'position:absolute;left:0;right:0;pointer-events:none';
					bar.appendChild(knob);
					YWebText.getRoot().appendChild(bar);
					owner.ywebBar = bar;
					bar.ywebKnob = knob;
				}
				const bar = owner.ywebBar;
				bar.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;width:${state.scroll.width}px;height:${state.scroll.height}px;background:${state.scroll.track_color};border-radius:${state.scroll.track_radius}px;pointer-events:none`;
				bar.ywebLocal = [state.scroll.x, state.scroll.y];
				bar.ywebKnob.style.height = `${state.scroll.knob}px`;
				bar.ywebKnob.style.background = state.scroll.grabber_color;
				bar.ywebKnob.style.borderRadius = `${state.scroll.grabber_radius}px`;
				bar.ywebTravel = state.scroll.height - state.scroll.knob;
				YWebText.placeCodePart(owner, bar);
			} else if (owner.ywebBar) {
				owner.ywebBar.remove();
				owner.ywebBar = null;
			}
			input.style.paddingLeft = `${state.gutter}px`;
			input.style.tabSize = String(state.tab);
			input.dataset.ywebIndent = state.indent || '\t';
			const seen = new Set();
			for (const line of state.lines) {
				const key = String(line.line);
				seen.add(key);
				let row = owner.ywebRows.get(key);
				if (!row) {
					row = document.createElement('div');
					row.dataset.ywebCodeLine = key;
					row.style.cssText = 'position:absolute;left:0;right:0;pointer-events:none;white-space:pre';
					const number = document.createElement('span');
					number.dataset.ywebCodeNumber = key;
					number.style.cssText = 'position:absolute;text-align:left;white-space:pre;transform-origin:0 0';
					const main = document.createElement('span');
					main.dataset.ywebCodeMain = key;
					main.style.cssText = 'position:absolute;text-align:center;white-space:pre';
					const breakpoint = document.createElement('b');
					breakpoint.dataset.ywebCodeBreakpoint = key;
					const bookmark = document.createElement('b');
					bookmark.dataset.ywebCodeBookmark = key;
					const executing = document.createElement('b');
					executing.dataset.ywebCodeExecuting = key;
					for (const mark of [breakpoint, bookmark, executing]) mark.style.cssText = 'position:absolute;inset:0;font:inherit';
					main.append(breakpoint, bookmark, executing);
					const fold = document.createElement('span');
					fold.dataset.ywebCodeFold = key;
					fold.style.cssText = 'position:absolute;text-align:center;white-space:pre';
					const code = document.createElement('code');
					code.dataset.ywebCodeText = key;
					code.style.cssText = 'position:absolute;top:0;white-space:pre;font:inherit;line-height:inherit;transform-origin:0 0';
					row.append(number, main, fold, code);
					row.ywebNumber = number;
					row.ywebMain = main;
					row.ywebBreakpoint = breakpoint;
					row.ywebBookmark = bookmark;
					row.ywebExecuting = executing;
					row.ywebFold = fold;
					row.ywebCode = code;
					owner.ywebLayer.appendChild(row);
					owner.ywebRows.set(key, row);
				}
				row.dataset.ywebCodeY = String(line.y);
				row.style.height = `${state.line_height}px`;
				row.style.lineHeight = `${state.line_height}px`;
				row.style.background = line.line === state.current ? state.current_color : 'transparent';
				const number = state.line_numbers ? line.number : '';
				if (row.ywebNumber.textContent !== number) row.ywebNumber.textContent = number;
				row.ywebBreakpoint.textContent = line.breakpoint ? '●' : '';
				row.ywebBreakpoint.style.opacity = line.breakpoint ? '.55' : '1';
				row.ywebBookmark.textContent = line.bookmark ? '◆' : '';
				row.ywebExecuting.textContent = line.executing ? '▶' : '';
				const fold = line.fold === 'closed' ? '▸' : line.fold === 'open' ? '▾' : '';
				if (row.ywebFold.textContent !== fold) row.ywebFold.textContent = fold;
				row.ywebNumber.style.left = `${state.line_numbers_x || 0}px`;
				row.ywebNumber.style.width = `${state.line_numbers_width || 0}px`;
				row.ywebMain.style.left = `${state.main_gutter_x || 0}px`;
				row.ywebMain.style.width = `${state.main_gutter_width || 0}px`;
				row.ywebFold.style.left = `${state.fold_gutter_x || 0}px`;
				row.ywebFold.style.width = `${state.fold_gutter_width || 0}px`;
				row.ywebNumber.style.color = line.line_color || state.line_color;
				row.ywebBreakpoint.style.color = state.breakpoint_color;
				row.ywebBookmark.style.color = state.bookmark_color;
				row.ywebExecuting.style.color = state.executing_color;
				row.ywebFold.style.color = state.fold_color;
				const signature = JSON.stringify(line.segments);
				if (row.ywebCode.dataset.ywebSegments !== signature) {
					row.ywebCode.dataset.ywebSegments = signature;
					row.ywebCode.replaceChildren(...line.segments.map((part) => {
						const span = document.createElement('span');
						span.textContent = part.text;
						span.style.color = part.color;
						return span;
					}));
				}
				const baseline = Math.max(0, state.line_height - state.font_ascent - state.font_descent) / 2 + state.font_ascent;
				YWebText.glyphNode(row.ywebCode, row.ywebCode.textContent, Number(line.glyph_top), Number(line.glyph_bottom), Number(line.glyph_ascent), false, baseline, line.glyph_edge === true);
				YWebText.glyphNode(row.ywebNumber, number, Number(line.number_top), Number(line.number_bottom), Number(line.number_ascent), false, baseline, line.number_edge === true);
			}
			for (const [key, row] of owner.ywebRows) {
				if (seen.has(key)) continue;
				row.remove();
				owner.ywebRows.delete(key);
			}
			for (const guide of owner.ywebGuides || []) guide.remove();
			owner.ywebGuides = (state.guides || []).map((value, index) => {
				const guide = document.createElement('i');
				guide.dataset.ywebColumn = String(value.column);
				guide.dataset.ywebX = String(value.x);
				guide.style.cssText = `position:absolute;top:0;bottom:0;border-left:1px solid ${state.guide_color};opacity:${index ? .6 : 1};pointer-events:none`;
				owner.ywebLayer.appendChild(guide);
				return guide;
			});
			YWebText.codeScroll(input);
			// Web fontの読込後に同じGodot輪郭から補正を再計算する。
			const font = getComputedStyle(owner).font;
			const fontKey = font;
			if (owner.dataset.ywebCodeFont !== fontKey) {
				owner.dataset.ywebCodeFont = fontKey;
				owner.dataset.ywebCodeFontReady = '0';
				const sample = state.lines.map((line) => line.number + line.segments.map((part) => part.text).join('')).join('\n');
				let loaded = YWebText.fontLoads.get(font);
				if (!loaded) {
					loaded = document.fonts.load(font, sample);
					YWebText.fontLoads.set(font, loaded);
				}
				loaded.then(() => {
					if (!owner.isConnected || owner.dataset.ywebCodeFont !== fontKey) return;
					const current = owner.dataset.ywebCodeState;
					if (!current) return;
					delete owner.dataset.ywebCodeFontRetried;
					delete owner.dataset.ywebCodeState;
					YWebText.code(owner, current);
					owner.dataset.ywebCodeFontReady = '1';
				}, () => {
					if (YWebText.fontLoads.get(font) === loaded) YWebText.fontLoads.delete(font);
					if (!owner.isConnected || owner.dataset.ywebCodeFont !== fontKey) return;
					owner.dataset.ywebCodeFontReady = '1';
					if (owner.dataset.ywebCodeFontRetried === fontKey) {
						delete owner.dataset.ywebCodeFont;
						return;
					}
					owner.dataset.ywebCodeFontRetried = fontKey;
					setTimeout(() => {
						if (!owner.isConnected || owner.dataset.ywebCodeFont !== fontKey) return;
						const current = owner.dataset.ywebCodeState;
						if (!current) return;
						delete owner.dataset.ywebCodeFont;
						delete owner.dataset.ywebCodeState;
						YWebText.code(owner, current);
					}, YWebText.fontRetryMs);
				});
			}
		},
		// DOM onlyでは描画しないCanvasを画面から外す。寸法はrootの基準として残す。
		hideCanvas: function () {
			const canvas = GodotConfig.canvas;
			if (canvas.dataset.ywebHidden) return;
			canvas.dataset.ywebHidden = '1';
			canvas.style.visibility = 'hidden';
			YWebText.getRoot().style.pointerEvents = 'auto';
		},
		// rootをCanvasのCSS表示矩形へ一致させる。
		resizeRoot: function () {
			const canvas = GodotConfig.canvas;
			const root = YWebText.getRoot();
			const parent = canvas.parentElement;
			const box = canvas.getBoundingClientRect();
			const parentBox = parent.getBoundingClientRect();
			const value = `${box.left - parentBox.left},${box.top - parentBox.top},${box.width},${box.height}`;
			if (value === YWebText.rootSize) return;
			YWebText.rootSize = value;
			root.style.left = `${box.left - parentBox.left}px`;
			root.style.top = `${box.top - parentBox.top}px`;
			root.style.width = `${box.width}px`;
			root.style.height = `${box.height}px`;
		},
		// 書体が持つ本来の行送りを測る。同じ書体と寸法の組は初回に測って覚える。
		naturalLine: function (element, fontSize) {
			const family = element.style.fontFamily || 'sans-serif';
			const key = `${family}/${fontSize}`;
			if (YWebText.lineCache[key] === undefined) {
				const ruler = YWebText.ruler || (YWebText.ruler = (() => {
					const node = document.createElement('div');
					node.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;line-height:normal;top:-9999px;left:-9999px';
					node.textContent = 'Mg';
					document.body.appendChild(node);
					return node;
				})());
				ruler.style.fontFamily = family;
				ruler.style.fontSize = `${fontSize}px`;
				YWebText.lineCache[key] = ruler.getBoundingClientRect().height;
			}
			return YWebText.lineCache[key];
		},
		// Godot位置行列とBrowser fontの横幅補正を一つのtransformへ反映する。
		place: function (element) {
			const matrix = YWebText.scrollMatrix(element.dataset.ywebUid, element.dataset.ywebMatrix);
			const scale = element.dataset.ywebTextScale || '1';
			element.style.transform = `matrix(${matrix}) scaleX(${scale})`;
		},
		// Chromiumの字形edgeをGodotのFreeType描画へ近づけるfilterを一つ共有する。
		glyphEdge: function () {
			if (YWebText.glyphFilter) return YWebText.glyphFilter;
			const ns = 'http://www.w3.org/2000/svg';
			const svg = document.createElementNS(ns, 'svg');
			svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
			svg.innerHTML = '<filter id="yweb-glyph-edge"><feComponentTransfer><feFuncA type="gamma" amplitude="1" exponent="2.75" offset="0"/></feComponentTransfer></filter>';
			document.body.appendChild(svg);
			YWebText.glyphFilter = 'url("#yweb-glyph-edge")';
			return YWebText.glyphFilter;
		},
		// 配列を作らず、複数行Labelの先頭にある実文字行を得る。
		firstLine: function (text) {
			let start = 0;
			while (start < text.length) {
				const found = text.indexOf('\n', start);
				const end = found < 0 ? text.length : found;
				if (end > start) return text.slice(start, end);
				if (found < 0) break;
				start = found + 1;
			}
			return '';
		},
		// GodotとBrowserの実字形範囲を対応させ、外側の配置と操作領域は動かさない。
		glyphNode: function (glyph, text, top, bottom, ascent, blocked = false, baseline = NaN, edge = false) {
			if (!text || blocked || !(bottom > top)) {
				glyph.style.transform = 'none';
				glyph.style.opacity = '';
				glyph.style.filter = 'none';
				glyph.style.lineHeight = '';
				return;
			}
			// 複数行の補正値を再入力にせず、親から継承する基準行高へ毎回戻す。
			glyph.style.lineHeight = '';
			const style = getComputedStyle(glyph);
			const context = YWebText.metricsContext || (YWebText.metricsContext = document.createElement('canvas').getContext('2d'));
			context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
			const multiline = text.includes('\n');
			const sample = multiline ? YWebText.firstLine(text) : text;
			const metrics = context.measureText(sample);
			const browserAscent = metrics.actualBoundingBoxAscent;
			const browserDescent = metrics.actualBoundingBoxDescent;
			const fontAscent = metrics.fontBoundingBoxAscent || browserAscent;
			const fontDescent = metrics.fontBoundingBoxDescent || browserDescent;
			const lineHeight = Number.parseFloat(style.lineHeight);
			const lead = Math.max(0, lineHeight - fontAscent - fontDescent) / 2;
			const browserTop = lead + fontAscent - browserAscent;
			const browserBottom = lead + fontAscent + browserDescent;
			const height = browserBottom - browserTop;
			if (!(height > 0)) {
				glyph.style.transform = 'none';
				return;
			}
			const raster = (multiline ? YWebText.glyphMultiRaster : YWebText.glyphRaster) / devicePixelRatio;
			let scale = Math.max(0.5, Math.min(2, (bottom - top + raster) / height));
			if (Number.isFinite(baseline)) {
				glyph.style.transformOrigin = '0 0';
				const shift = baseline + top - browserTop * scale + YWebText.glyphRaster / devicePixelRatio;
				glyph.style.opacity = '';
				glyph.style.filter = edge ? YWebText.glyphEdge() : 'none';
				glyph.style.transform = `matrix(1,0,0,${scale},0,${shift})`;
				return;
			}
			glyph.style.opacity = String(YWebText.glyphOpacity);
			glyph.style.filter = 'none';
			glyph.style.transformOrigin = '0 0';
			glyph.style.lineHeight = multiline ? `${lineHeight / scale}px` : '';
			const shift = ascent + top - browserTop * scale - (multiline ? YWebText.glyphMultiShift / devicePixelRatio : 0);
			glyph.style.transform = `matrix(1,0,0,${scale},0,${shift})`;
		},
		// 通常文字の内側spanへ、共有した字形補正を適用する。
		glyph: function (element) {
			const glyph = element.ywebGlyph;
			if (!glyph) return;
			YWebText.glyphNode(glyph, glyph.textContent, Number(element.dataset.ywebGlyphTop), Number(element.dataset.ywebGlyphBottom), Number(element.dataset.ywebFontAscent), element.dataset.ywebWrap === '1' || element.dataset.ywebDecorated === '1');
		},
		// 四隅へ一致する射影変換をCSSの列優先matrix3dへ組み立てる。
		perspective: function (width, height, x0, y0, x1, y1, x2, y2, x3, y3) {
			const dx1 = x1 - x3;
			const dx2 = x2 - x3;
			const dx3 = x0 - x1 - x2 + x3;
			const dy1 = y1 - y3;
			const dy2 = y2 - y3;
			const dy3 = y0 - y1 - y2 + y3;
			const divisor = dx1 * dy2 - dx2 * dy1;
			const gx = divisor ? (dx3 * dy2 - dx2 * dy3) / divisor : 0;
			const gy = divisor ? (dx1 * dy3 - dx3 * dy1) / divisor : 0;
			return [
				(x1 - x0 + gx * x1) / width, (y1 - y0 + gx * y1) / width, 0, gx / width,
				(x2 - x0 + gy * x2) / height, (y2 - y0 + gy * y2) / height, 0, gy / height,
				0, 0, 1, 0, x0, y0, 0, 1,
			];
		},
		// 二つの列優先4x4行列を合成する。
		multiply: function (left, right) {
			const result = new Array(16).fill(0);
			for (let column = 0; column < 4; column++) {
				for (let row = 0; row < 4; row++) {
					for (let index = 0; index < 4; index++) result[column * 4 + row] += left[index * 4 + row] * right[column * 4 + index];
				}
			}
			return result;
		},
		// Browser fontの実幅をGodotが確定した項目幅へ折返さず収める。
		fit: function (element) {
			const width = Number(element.dataset.ywebContentWidth) || Number.parseFloat(element.style.width);
			const natural = element.ywebGlyph?.scrollWidth || element.scrollWidth;
			const scale = natural > width && natural > 0 ? width / natural : 1;
			element.dataset.ywebTextScale = String(scale);
			YWebText.place(element);
		},
		// 実際に指定したWeb fontの読込後へ幅補正を更新する。
		loadFont: function (element) {
			const font = getComputedStyle(element).font;
			const key = `${font}\n${element.textContent}`;
			element.dataset.ywebFontRequest = key;
			const done = () => {
				if (!element.isConnected || element.dataset.ywebFontRequest !== key) return;
				YWebText.glyph(element);
				YWebText.fit(element);
			};
			document.fonts.load(font, element.textContent).then(done, done);
		},
		// Godotの線形色をCSSの8bit色へ変換する。
		color: function (red, green, blue, alpha) {
			return `rgba(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)},${alpha})`;
		},
		// Godot ObjectID由来の識別値を、全描画DOMの安定したHTML idへ反映する。
		identify: function (element, uid) {
			element.id = `yweb-${uid.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
			element.dataset.ywebUid = uid;
		},
		// Nodeの祖先にある全ScrollContainerのBrowser移動量を画面座標へ変換する。
		scrollOffset: function (uid) {
			let x = 0;
			let y = 0;
			const node = uid?.split('-', 1)[0];
			for (const owner of YWebText.scrollMembers.get(node) || []) {
				const scroll = YWebText.scrolls.get(owner);
				if (!scroll) continue;
				x += scroll.matrix[0] * scroll.element.scrollLeft + scroll.matrix[2] * scroll.element.scrollTop;
				y += scroll.matrix[1] * scroll.element.scrollLeft + scroll.matrix[3] * scroll.element.scrollTop;
			}
			return [x, y];
		},
		// Godotの確定行列へBrowserスクロール量を合成し、Godot状態を書き換えず表示を動かす。
		scrollMatrix: function (uid, raw) {
			const matrix = String(raw || '').split(',').map(Number);
			if (matrix.length !== 6 || matrix.some((value) => !Number.isFinite(value))) return raw;
			const [x, y] = YWebText.scrollOffset(uid);
			matrix[4] -= x;
			matrix[5] -= y;
			return matrix.join(',');
		},
		// Browserが保持するスクロール量を、該当Nodeの既存DOMへまとめて反映する。
		applyScroll: function (owner) {
			const nodes = [...(owner ? YWebText.scrollOwners.get(owner) || [] : YWebText.scrollMembers.keys())];
			for (const uid of nodes) {
				const scroll = YWebText.scrolls.get(uid);
				if (!scroll) continue;
				scroll.matrix = YWebText.scrollMatrix(uid, scroll.base).split(',').map(Number);
				scroll.element.style.transform = `matrix(${scroll.matrix})`;
				YWebText.clip(scroll.element, uid, ...scroll.matrix);
			}
			for (const node of nodes) {
				for (const uid of YWebText.nodeOwners.get(node) || []) {
					const element = YWebText.elements.get(uid);
					const raw = element?.dataset.ywebTransform;
					if (!element || !raw || element.dataset.ywebProjected) continue;
					const matrix = YWebText.scrollMatrix(uid, raw);
					const scale = element.dataset.ywebTextScale;
					element.style.transform = `matrix(${matrix})${scale ? ` scaleX(${scale})` : ''}`;
					const values = matrix.split(',').map(Number);
					YWebText.clip(element, uid, ...values);
					YWebText.placeCodePart(element, element.ywebBar);
					YWebText.placeCodePart(element, element.ywebMinimap);
				}
			}
		},
		// Wheel位置にある最も内側のScrollContainerをBrowser側でスクロールする。
		wheel: function (event) {
			const root = YWebText.root;
			if (!root?.isConnected) return;
			const box = root.getBoundingClientRect();
			const x = (event.clientX - box.left) * root.offsetWidth / box.width;
			const y = (event.clientY - box.top) * root.offsetHeight / box.height;
			const scaleX = root.offsetWidth / box.width;
			const scaleY = root.offsetHeight / box.height;
			const deltaX = event.deltaX * scaleX;
			const deltaY = event.deltaY * scaleY;
			const front = document.elementsFromPoint(event.clientX, event.clientY).find((element) => element !== root && root.contains(element) && getComputedStyle(element).pointerEvents !== 'none');
			const scrolls = [...YWebText.scrolls.values()].reverse();
			const scroll = scrolls.find((item) => {
				const [xx, xy, yx, yy, atX, atY] = item.matrix;
				const determinant = xx * yy - xy * yx;
				if (Math.abs(determinant) < 0.000001) return false;
				const localX = ((x - atX) * yy - (y - atY) * yx) / determinant;
				const localY = ((y - atY) * xx - (x - atX) * xy) / determinant;
				const area = YWebText.clipArea(item.uid);
				const visible = !area || x >= area[0] && y >= area[1] && x < area[2] && y < area[3];
				const frontUid = front?.closest('[data-yweb-uid]')?.dataset.ywebUid?.split('-', 1)[0];
				const reachable = !front || item.element.contains(front) || YWebText.scrollOwners.get(item.uid)?.has(frontUid);
				const hit = visible && reachable && localX >= 0 && localY >= 0 && localX < item.width && localY < item.height;
				const canX = deltaX < 0 ? item.element.scrollLeft > 0 : deltaX > 0 && item.element.scrollLeft < item.element.scrollWidth - item.element.clientWidth;
				const canY = deltaY < 0 ? item.element.scrollTop > 0 : deltaY > 0 && item.element.scrollTop < item.element.scrollHeight - item.element.clientHeight;
				return hit && (canX || canY);
			});
			if (!scroll) return;
			if (event.target === scroll.element || scroll.element.contains(event.target)) return;
			const before = `${scroll.element.scrollLeft},${scroll.element.scrollTop}`;
			scroll.element.scrollBy(deltaX, deltaY);
			if (`${scroll.element.scrollLeft},${scroll.element.scrollTop}` !== before) event.preventDefault();
		},
		// 画像の各色をGodotのmodulateと同じ比率で掛け、動的変更は同じfilterへ上書きする。
		tint: function (element, red, green, blue) {
			if (Math.abs(red - 1) < 0.0001 && Math.abs(green - 1) < 0.0001 && Math.abs(blue - 1) < 0.0001) return 'none';
			const values = [red, green, blue].map((value) => Math.round(value * 10000) / 10000);
			const key = values.join(',');
			if (!element.ywebTint) {
				const ns = 'http://www.w3.org/2000/svg';
				const svg = document.createElementNS(ns, 'svg');
				const filter = document.createElementNS(ns, 'filter');
				const matrix = document.createElementNS(ns, 'feColorMatrix');
				const id = `yweb-tint-${++YWebText.tintIndex}`;
				svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
				filter.id = id;
				filter.setAttribute('color-interpolation-filters', 'sRGB');
				matrix.setAttribute('type', 'matrix');
				filter.appendChild(matrix);
				svg.appendChild(filter);
				document.body.appendChild(svg);
				element.ywebTint = { svg, matrix, id, key: '' };
			}
			if (element.ywebTint.key !== key) {
				element.ywebTint.key = key;
				element.ywebTint.matrix.setAttribute('values', `${values[0]} 0 0 0 0 0 ${values[1]} 0 0 0 0 0 ${values[2]} 0 0 0 0 0 1 0`);
			}
			return `url("#${element.ywebTint.id}")`;
		},
		// 画像要素と一対の色filterを同じ時機に回収する。
		drop: function (element) {
			for (const image of [element, ...element.querySelectorAll('img')]) image.ywebTint?.svg.remove();
			element.ywebBar?.remove();
			element.ywebMinimap?.remove();
			element.remove();
		},
		// 親clipをBrowserスクロール後の画面矩形へまとめ、表示とhit判定で共有する。
		clipArea: function (uid) {
			const owner = uid.split('-', 1)[0];
			const areas = YWebText.clips.get(owner);
			if (!areas?.length) return null;
			let area;
			for (const entry of areas) {
				const [moveX, moveY] = YWebText.scrollOffset(entry.owner);
				const moved = [entry.area[0] - moveX, entry.area[1] - moveY, entry.area[2] - moveX, entry.area[3] - moveY];
				area = area ? [Math.max(area[0], moved[0]), Math.max(area[1], moved[1]), Math.min(area[2], moved[2]), Math.min(area[3], moved[3])] : moved;
			}
			return area;
		},
		// 画面座標のclip矩形を要素local座標へ戻し、階層なしの平坦DOMへ適用する。
		clip: function (element, uid, xx, xy, yx, yy, x, y) {
			const area = YWebText.clipArea(uid);
			if (!area) {
				element.style.clipPath = 'none';
				return;
			}
			const determinant = xx * yy - xy * yx;
			if (Math.abs(determinant) < 0.000001 || area[2] <= area[0] || area[3] <= area[1]) {
				element.style.clipPath = 'inset(100%)';
				return;
			}
			const local = (px, py) => [((px - x) * yy - (py - y) * yx) / determinant, ((py - y) * xx - (px - x) * xy) / determinant];
			const points = [local(area[0], area[1]), local(area[2], area[1]), local(area[2], area[3]), local(area[0], area[3])];
			element.style.clipPath = `polygon(${points.map(([px, py]) => `${px}px ${py}px`).join(',')})`;
		},
		// DOM IDをNodeへ結び、描画要素は再描画用の接頭辞にも結ぶ。
		trackDraw: function (uid) {
			const node = uid.split('-', 1)[0];
			let owned = YWebText.nodeOwners.get(node);
			if (!owned) {
				owned = new Set();
				YWebText.nodeOwners.set(node, owned);
			}
			owned.add(uid);
			const at = uid.indexOf('-d');
			if (at < 0) return;
			const owner = uid.slice(0, at + 2);
			let ids = YWebText.drawOwners.get(owner);
			if (!ids) {
				ids = new Set();
				YWebText.drawOwners.set(owner, ids);
			}
			ids.add(uid);
			YWebText.drawn.add(uid);
			const animation = YWebText.activeAnimations.get(owner.slice(0, -2));
			if (animation) YWebText.elementAnimations.set(uid, animation);
			else YWebText.elementAnimations.delete(uid);
		},
		// 回収した描画DOM IDを所有者の集合から外す。
		forgetDraw: function (uid) {
			const node = uid.split('-', 1)[0];
			const owned = YWebText.nodeOwners.get(node);
			owned?.delete(uid);
			if (owned?.size === 0) YWebText.nodeOwners.delete(node);
			YWebText.elementAnimations.delete(uid);
			if (!YWebText.drawn.delete(uid)) return;
			const at = uid.indexOf('-d');
			const owner = uid.slice(0, at + 2);
			const ids = YWebText.drawOwners.get(owner);
			ids?.delete(uid);
			if (ids?.size === 0) YWebText.drawOwners.delete(owner);
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
			if (!YWebText.event) return;
			const value = 'value' in element ? element.value : '';
			const start = kind === 7 ? Math.round(element.scrollTop) : YWebText.index(value, element.selectionStart || 0);
			const end = kind === 7 ? Math.round(element.scrollLeft) : YWebText.index(value, element.selectionEnd || 0);
			const state = `${kind}:${value}:${start}:${end}`;
			if (element.dataset.ywebSent === state) return;
			element.dataset.ywebSent = state;
			const uid = GodotRuntime.allocString(element.dataset.ywebText);
			const text = GodotRuntime.allocString(value);
			YWebText.event(uid, kind, text, start, end);
			GodotRuntime.free(text);
			GodotRuntime.free(uid);
		},
		// LineEditの上限をBrowserのUTF-16数でなくGodotと同じUnicode文字数で適用する。
		limit: function (element) {
			const max = Number(element.dataset.ywebMaxLength || 0);
			const chars = Array.from(element.value);
			if (!max || chars.length <= max) return;
			const start = Math.min(YWebText.index(element.value, element.selectionStart || 0), max);
			const end = Math.min(YWebText.index(element.value, element.selectionEnd || 0), max);
			element.value = chars.slice(0, max).join('');
			element.setSelectionRange(YWebText.offset(element.value, start), YWebText.offset(element.value, end));
		},
		// Button系のnative clickをGodotの標準Button状態遷移へ渡す。
		activate: function (element) {
			if (!YWebText.event || element.disabled || element.getAttribute('aria-disabled') === 'true') return;
			const uid = GodotRuntime.allocString(element.dataset.ywebText);
			const text = GodotRuntime.allocString('');
			YWebText.event(uid, 6, text, 0, 0);
			GodotRuntime.free(text);
			GodotRuntime.free(uid);
		},
		// Godotの表示順で意味DOMへfocusを送り、Canvasへの途中離脱を防ぐ。
		tab: function (element, event) {
			if (event.key !== 'Tab') return false;
			const items = [...YWebText.getRoot().querySelectorAll('[data-yweb-text]')]
				.filter((item) => item.tabIndex >= 0 && !item.disabled && item.getAttribute('aria-disabled') !== 'true' && getComputedStyle(item).display !== 'none')
				.sort((left, right) => {
					const a = left.getBoundingClientRect();
					const b = right.getBoundingClientRect();
					return Math.abs(a.top - b.top) > 1 ? a.top - b.top : a.left - b.left;
				});
			const index = items.indexOf(element);
			const next = items[index + (event.shiftKey ? -1 : 1)];
			if (!next) return false;
			event.preventDefault();
			event.stopPropagation();
			// Godotの同じkey処理が終わった後、旧Controlのreleaseを挟まず次へ直接切り替える。
			element.dataset.ywebTabbing = 'true';
			requestAnimationFrame(() => {
				next.focus({ preventScroll: true });
				requestAnimationFrame(() => {
					if (document.activeElement !== next) next.focus({ preventScroll: true });
				});
			});
			return true;
		},
		// inputとtextareaへIME、選択、focusの双方向境界を一度結ぶ。
		bindInput: function (element) {
			for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) {
				element.addEventListener(name, (event) => event.stopPropagation());
			}
			element.addEventListener('focus', () => {
				delete element.dataset.ywebBlurPending;
				element.dataset.ywebFocusPending = 'true';
				YWebText.send(element, 3);
			});
			element.addEventListener('blur', () => {
				if (element.dataset.ywebTabbing) {
					delete element.dataset.ywebTabbing;
					return;
				}
				delete element.dataset.ywebFocusPending;
				element.dataset.ywebBlurPending = 'true';
				YWebText.send(element, 4);
			});
			element.addEventListener('compositionstart', () => {
				element.dataset.ywebComposing = 'true';
				delete element.dataset.ywebCompositionPending;
				if (element.dataset.ywebCodeInput) {
					element.style.webkitTextFillColor = 'var(--yweb-code-color)';
					element.ywebOwner.ywebLayer.style.visibility = 'hidden';
				}
			});
			element.addEventListener('compositionend', () => {
				delete element.dataset.ywebComposing;
				element.dataset.ywebCompositionPending = 'true';
				// Chrome系のinput-before-endとFirefox系のinput-after-endを同じ確定一回へ畳む。
				requestAnimationFrame(() => {
					if (!element.dataset.ywebCompositionPending) return;
					delete element.dataset.ywebCompositionPending;
					YWebText.limit(element);
					YWebText.send(element, 1);
					if (element.dataset.ywebCodeInput) {
						element.style.webkitTextFillColor = 'transparent';
						element.ywebOwner.ywebLayer.style.visibility = 'visible';
					}
				});
			});
			element.addEventListener('input', () => {
				if (!element.dataset.ywebComposing) {
					delete element.dataset.ywebCompositionPending;
					YWebText.limit(element);
					YWebText.send(element, 1);
					if (element.dataset.ywebCodeInput) {
						element.style.webkitTextFillColor = 'transparent';
						element.ywebOwner.ywebLayer.style.visibility = 'visible';
					}
				}
			});
			element.addEventListener('scroll', () => {
				YWebText.codeScroll(element);
				YWebText.send(element, 7);
			});
			element.addEventListener('select', () => YWebText.send(element, 2));
			element.addEventListener('keyup', () => YWebText.send(element, 2));
			element.addEventListener('keydown', (event) => {
				if (element.dataset.ywebCodeInput && event.key === 'Tab' && !event.isComposing) {
					event.preventDefault();
					event.stopPropagation();
					const indent = element.dataset.ywebIndent || '\t';
					element.setRangeText(indent, element.selectionStart, element.selectionEnd, 'end');
					element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: indent }));
					return;
				}
				if (YWebText.tab(element, event)) return;
				event.stopPropagation();
				if (element.tagName === 'INPUT' && event.key === 'Enter' && !event.isComposing) {
					event.preventDefault();
					YWebText.send(element, 5);
			}
			});
		},
		// Button系へkeyboard focusとnative keyboard clickを結ぶ。
		bindAction: function (element) {
			// DOM所有Buttonのhoverを標準Godot signalへ一本化する。
			element.addEventListener('pointermove', (event) => event.stopPropagation());
			element.addEventListener('pointerenter', () => {
				element.dataset.ywebDomHover = 'true';
				YWebText.send(element, 8);
			});
			element.addEventListener('pointerleave', () => {
				if (!element.dataset.ywebDomHover) return;
				delete element.dataset.ywebDomHover;
				YWebText.send(element, 9);
			});
			element.addEventListener('focus', () => {
				delete element.dataset.ywebBlurPending;
				element.dataset.ywebFocusPending = 'true';
				YWebText.send(element, 3);
			});
			element.addEventListener('blur', () => {
				if (element.dataset.ywebTabbing) {
					delete element.dataset.ywebTabbing;
					return;
				}
				delete element.dataset.ywebFocusPending;
				element.dataset.ywebBlurPending = 'true';
				YWebText.send(element, 4);
			});
			element.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				YWebText.activate(element);
			});
			element.addEventListener('keydown', (event) => { YWebText.tab(element, event); });
		},
		// Control種別に合う意味要素を既定装飾なしで作る。
		create: function (uid, kind) {
			const tag = YWebText.tags[kind] || 'span';
			const element = document.createElement(tag);
			YWebText.identify(element, uid);
			element.dataset.ywebText = uid;
			element.style.cssText = 'position:absolute;box-sizing:border-box;transform-origin:0 0;margin:0;padding:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;border-radius:0';
			if (kind === 6) {
				const layer = document.createElement('pre');
				layer.dataset.ywebCodeLayer = uid;
				layer.setAttribute('aria-hidden', 'true');
				layer.style.cssText = 'position:absolute;inset:0;margin:0;padding:0;overflow:hidden;pointer-events:none;font:inherit;line-height:inherit';
				const input = document.createElement('textarea');
				YWebText.identify(input, `${uid}-input`);
				input.dataset.ywebText = uid;
				input.dataset.ywebCodeInput = uid;
				input.autocomplete = 'off';
				input.autocapitalize = 'off';
				input.spellcheck = false;
				input.wrap = 'off';
				input.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;margin:0;padding:0;border:0;outline:0;background:transparent;font:inherit;line-height:inherit;white-space:pre;overflow:auto;resize:none;appearance:none;pointer-events:auto;user-select:text';
				input.ywebOwner = element;
				element.append(layer, input);
				element.ywebLayer = layer;
				element.ywebInput = input;
				element.ywebRows = new Map();
				element.ywebGuides = [];
				YWebText.bindInput(input);
			}
			if (tag === 'button') element.type = 'button';
			if (kind === 6) {
				element.style.pointerEvents = 'none';
				element.style.userSelect = 'text';
				element.style.display = 'block';
			} else if (tag === 'input' || tag === 'textarea') {
				element.style.pointerEvents = 'auto';
				element.style.userSelect = 'text';
				element.style.appearance = 'none';
				element.style.resize = 'none';
				YWebText.bindInput(element);
			} else {
				element.style.pointerEvents = tag === 'button' || tag === 'a' ? 'auto' : 'none';
				element.style.userSelect = 'text';
				element.style.display = 'flex';
				const glyph = document.createElement('span');
				glyph.dataset.ywebGlyph = uid;
				glyph.style.cssText = 'display:block;width:100%;min-width:0;transform-origin:0 0;pointer-events:none';
				element.appendChild(glyph);
				element.ywebGlyph = glyph;
				if (tag === 'button' || tag === 'a') YWebText.bindAction(element);
			}
			YWebText.getRoot().appendChild(element);
			YWebText.elements.set(uid, element);
			return element;
		},
	},
	yweb_box_sync__sig: 'vp' + 'f'.repeat(8) + 'i' + 'f'.repeat(16),
	// Controlの面と枠を、文字と同じ座標系の箱としてDOMへ写す。
	// Canvasが無いDOM onlyでの見た目はこの箱が担うため、描画は全てCSSで指定する。
	yweb_box_sync: function (pUid, xx, xy, yx, yy, x, y, width, height, z, red, green, blue, alpha, left, top, right, bottom, borderRed, borderGreen, borderBlue, borderAlpha, topLeft, topRight, bottomRight, bottomLeft) {
		const uid = GodotRuntime.parseString(pUid);
		YWebText.seen.add(uid);
		YWebText.trackDraw(uid);
		YWebText.hideCanvas();
		let element = YWebText.elements.get(uid);
		if (!element) {
			element = document.createElement('div');
			YWebText.identify(element, uid);
			element.dataset.ywebBox = uid;
			element.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;box-sizing:border-box;pointer-events:none';
			YWebText.getRoot().appendChild(element);
			YWebText.elements.set(uid, element);
		}
		const style = [
			`width:${width}px`, `height:${height}px`, `z-index:${z}`,
			`background-color:${YWebText.color(red, green, blue, alpha)}`,
			`border-style:solid`,
			`border-width:${top}px ${right}px ${bottom}px ${left}px`,
			`border-color:${YWebText.color(borderRed, borderGreen, borderBlue, borderAlpha)}`,
			`border-radius:${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`,
		].join(';');
		if (element.dataset.ywebStyle !== style) {
			element.dataset.ywebStyle = style;
			element.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;box-sizing:border-box;pointer-events:none;${style}`;
			delete element.dataset.ywebTransform;
		}
		const transform = [xx, xy, yx, yy, x, y].join(',');
		if (element.dataset.ywebTransform !== transform) {
			element.dataset.ywebTransform = transform;
			element.style.transform = `matrix(${transform})`;
		}
		YWebText.clip(element, uid, xx, xy, yx, yy, x, y);
	},
	yweb_image_data__sig: 'vpp',
	// 画像の中身を識別値へ一度覚える。以後は同じ識別値で参照する。
	yweb_image_data: function (pKey, pData) {
		YWebText.images.set(GodotRuntime.parseString(pKey), GodotRuntime.parseString(pData));
	},
	yweb_clip_sync__sig: 'vppffffi',
	// CanvasItemとclip親を結び、Browserスクロール後に全範囲を交差できる形で保存する。
	yweb_clip_sync: function (pUid, pOwner, left, top, right, bottom, enabled) {
		const uid = GodotRuntime.parseString(pUid);
		const owner = GodotRuntime.parseString(pOwner);
		if (!enabled) {
			YWebText.clips.delete(uid);
			return;
		}
		let areas = YWebText.clips.get(uid);
		if (!areas) {
			areas = [];
			YWebText.clips.set(uid, areas);
		}
		areas.push({ owner, area: [left, top, right, bottom] });
	},
	yweb_scroll_sync__sig: 'vp' + 'f'.repeat(10),
	// ScrollContainerの範囲と内容量を受け、実際のスクロール量はBrowser要素へ保持する。
	yweb_scroll_sync: function (pUid, xx, xy, yx, yy, x, y, width, height, maxX, maxY) {
		const uid = GodotRuntime.parseString(pUid);
		YWebText.scrollSeen.add(uid);
		let scroll = YWebText.scrolls.get(uid);
		if (!scroll) {
			const element = document.createElement('div');
			YWebText.identify(element, `${uid}-scroll`);
			element.dataset.ywebScroll = uid;
			element.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;overflow:scroll;scrollbar-gutter:stable;pointer-events:auto;background:transparent';
			const content = document.createElement('div');
			content.setAttribute('aria-hidden', 'true');
			element.appendChild(content);
			YWebText.getRoot().appendChild(element);
			element.addEventListener('scroll', () => YWebText.applyScroll(uid), { passive: true });
			scroll = { uid, element, content, base: '', matrix: [], width: 0, height: 0 };
			YWebText.scrolls.set(uid, scroll);
		}
		scroll.base = [xx, xy, yx, yy, x, y].join(',');
		scroll.matrix = YWebText.scrollMatrix(uid, scroll.base).split(',').map(Number);
		scroll.width = width;
		scroll.height = height;
		scroll.element.style.width = `${width}px`;
		scroll.element.style.height = `${height}px`;
		scroll.element.style.transform = `matrix(${scroll.matrix})`;
		YWebText.clip(scroll.element, uid, ...scroll.matrix);
		scroll.content.style.width = `${scroll.element.clientWidth + maxX}px`;
		scroll.content.style.height = `${scroll.element.clientHeight + maxY}px`;
		if (scroll.element.scrollLeft > maxX) scroll.element.scrollLeft = maxX;
		if (scroll.element.scrollTop > maxY) scroll.element.scrollTop = maxY;
	},
	yweb_scroll_member__sig: 'vpp',
	// Nodeを祖先ScrollContainerへ結び、平坦DOMでもBrowser移動量を共有する。
	yweb_scroll_member: function (pUid, pOwner) {
		const uid = GodotRuntime.parseString(pUid);
		const owner = GodotRuntime.parseString(pOwner);
		let owners = YWebText.scrollMembers.get(uid);
		if (!owners) {
			owners = new Set();
			YWebText.scrollMembers.set(uid, owners);
		}
		owners.add(owner);
		let members = YWebText.scrollOwners.get(owner);
		if (!members) {
			members = new Set();
			YWebText.scrollOwners.set(owner, members);
		}
		members.add(uid);
	},
	yweb_animation_sync__sig: 'vpffffi',
	// CanvasItemの後続描画命令へanimation sliceを付け、終了時に解除する。
	yweb_animation_sync: function (pUid, length, begin, end, offset, enabled) {
		const uid = GodotRuntime.parseString(pUid);
		if (enabled) YWebText.activeAnimations.set(uid, { length, begin, end, offset });
		else YWebText.activeAnimations.delete(uid);
	},
	yweb_image_sync__sig: 'vpp' + 'f'.repeat(8) + 'i' + 'f'.repeat(4),
	// 画像を、箱や文字と同じ座標系と重なり順でDOMへ置く。
	yweb_image_sync: function (pUid, pKey, xx, xy, yx, yy, x, y, width, height, z, red, green, blue, alpha) {
		const uid = GodotRuntime.parseString(pUid);
		const key = GodotRuntime.parseString(pKey);
		YWebText.seen.add(uid);
		YWebText.trackDraw(uid);
		YWebText.hideCanvas();
		let element = YWebText.elements.get(uid);
		if (!element) {
			element = document.createElement('img');
			YWebText.identify(element, uid);
			element.dataset.ywebImage = uid;
			element.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none';
			YWebText.getRoot().appendChild(element);
			YWebText.elements.set(uid, element);
		}
		const source = YWebText.images.get(key);
		if (source && element.dataset.ywebImageKey !== key) {
			element.dataset.ywebImageKey = key;
			element.src = source;
		}
		const style = `width:${width}px;height:${height}px;z-index:${z};opacity:${alpha};filter:${YWebText.tint(element, red, green, blue)}`;
		if (element.dataset.ywebStyle !== style) {
			element.dataset.ywebStyle = style;
			element.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;${style}`;
			delete element.dataset.ywebTransform;
		}
		const transform = [xx, xy, yx, yy, x, y].join(',');
		if (element.dataset.ywebTransform !== transform) {
			element.dataset.ywebTransform = transform;
			element.style.transform = `matrix(${transform})`;
		}
		YWebText.clip(element, uid, xx, xy, yx, yy, x, y);
	},
	yweb_image_region_sync__sig: 'vpp' + 'f'.repeat(14) + 'i' + 'f'.repeat(4),
	// 親の切り抜き枠と子画像の移動で、atlas内の指定領域を表示する。
	yweb_image_region_sync: function (pUid, pKey, xx, xy, yx, yy, x, y, width, height, imageWidth, imageHeight, srcX, srcY, srcWidth, srcHeight, z, red, green, blue, alpha) {
		const uid = GodotRuntime.parseString(pUid);
		const key = GodotRuntime.parseString(pKey);
		YWebText.seen.add(uid);
		YWebText.trackDraw(uid);
		YWebText.hideCanvas();
		let element = YWebText.elements.get(uid);
		if (!element) {
			element = document.createElement('div');
			YWebText.identify(element, uid);
			element.dataset.ywebImageRegion = uid;
			const image = document.createElement('img');
			YWebText.identify(image, `${uid}-source`);
			image.dataset.ywebRegionImage = uid;
			image.draggable = false;
			element.appendChild(image);
			YWebText.getRoot().appendChild(element);
			YWebText.elements.set(uid, element);
		}
		const image = element.firstElementChild;
		const source = YWebText.images.get(key);
		if (source && image.dataset.ywebImageKey !== key) {
			image.dataset.ywebImageKey = key;
			image.src = source;
		}
		const regionWidth = Math.abs(srcWidth);
		const regionHeight = Math.abs(srcHeight);
		const scaleX = width / regionWidth;
		const scaleY = height / regionHeight;
		const flipX = srcWidth < 0;
		const flipY = srcHeight < 0;
		element.dataset.ywebSource = [srcX, srcY, srcWidth, srcHeight].join(',');
		const style = [
			'position:absolute', 'left:0', 'top:0', 'transform-origin:0 0', 'overflow:hidden',
			`width:${width}px`, `height:${height}px`, `z-index:${z}`, `opacity:${alpha}`,
		].join(';');
		if (element.dataset.ywebStyle !== style) {
			element.dataset.ywebStyle = style;
			element.style.cssText = style;
			delete element.dataset.ywebTransform;
		}
		const imageStyle = [
			'position:absolute', 'transform-origin:0 0', 'display:block', 'max-width:none', 'pointer-events:none',
			`left:${(flipX ? srcX + regionWidth : -srcX) * scaleX}px`,
			`top:${(flipY ? srcY + regionHeight : -srcY) * scaleY}px`,
			`width:${imageWidth * scaleX}px`, `height:${imageHeight * scaleY}px`,
			`transform:scale(${flipX ? -1 : 1},${flipY ? -1 : 1})`, `filter:${YWebText.tint(image, red, green, blue)}`,
		].join(';');
		if (image.dataset.ywebStyle !== imageStyle) {
			image.dataset.ywebStyle = imageStyle;
			image.style.cssText = imageStyle;
		}
		const transform = [xx, xy, yx, yy, x, y].join(',');
		if (element.dataset.ywebTransform !== transform) {
			element.dataset.ywebTransform = transform;
			element.style.transform = `matrix(${transform})`;
		}
		YWebText.clip(element, uid, xx, xy, yx, yy, x, y);
	},
	yweb_nine_patch_sync__sig: 'vpp' + 'f'.repeat(12) + 'i'.repeat(4) + 'f'.repeat(4),
	// 四隅を原寸で保ち、辺と中央をGodotの軸規則で伸ばす九分割画像を作る。
	yweb_nine_patch_sync: function (pUid, pKey, xx, xy, yx, yy, x, y, width, height, left, top, right, bottom, z, horizontal, vertical, center, red, green, blue, alpha) {
		const uid = GodotRuntime.parseString(pUid);
		const key = GodotRuntime.parseString(pKey);
		YWebText.seen.add(uid);
		YWebText.trackDraw(uid);
		YWebText.hideCanvas();
		let element = YWebText.elements.get(uid);
		if (!element) {
			element = document.createElement('div');
			YWebText.identify(element, uid);
			element.dataset.ywebNinePatch = uid;
			YWebText.getRoot().appendChild(element);
			YWebText.elements.set(uid, element);
		}
		const source = YWebText.images.get(key);
		const repeat = ['stretch', 'repeat', 'round'];
		const slices = `${top} ${right} ${bottom} ${left}`;
		const style = [width, height, left, top, right, bottom, z, horizontal, vertical, center, key, red, green, blue, alpha].join(',');
		if (source && element.dataset.ywebStyle !== style) {
			element.dataset.ywebStyle = style;
			element.dataset.ywebImageKey = key;
			element.style.cssText = `position:absolute;left:0;top:0;box-sizing:border-box;transform-origin:0 0;pointer-events:none;width:${width}px;height:${height}px;z-index:${z};opacity:${alpha};border-style:solid;border-width:${top}px ${right}px ${bottom}px ${left}px`;
			element.style.borderImageSource = `url("${source}")`;
			element.style.borderImageSlice = `${slices}${center ? ' fill' : ''}`;
			element.style.borderImageWidth = `${top}px ${right}px ${bottom}px ${left}px`;
			element.style.borderImageRepeat = `${repeat[horizontal] || 'stretch'} ${repeat[vertical] || 'stretch'}`;
			element.style.filter = YWebText.tint(element, red, green, blue);
			delete element.dataset.ywebTransform;
		}
		const transform = [xx, xy, yx, yy, x, y].join(',');
		if (element.dataset.ywebTransform !== transform) {
			element.dataset.ywebTransform = transform;
			element.style.transform = `matrix(${transform})`;
		}
		YWebText.clip(element, uid, xx, xy, yx, yy, x, y);
	},
	yweb_polygon_sync__sig: 'vpp' + 'f'.repeat(8) + 'i' + 'f'.repeat(4),
	// 外側で親clip、内側で点列を切り抜き、二つの範囲を同時に守る。
	yweb_polygon_sync: function (pUid, pPoints, xx, xy, yx, yy, x, y, width, height, z, red, green, blue, alpha) {
		const uid = GodotRuntime.parseString(pUid);
		const points = GodotRuntime.parseString(pPoints);
		YWebText.seen.add(uid);
		YWebText.trackDraw(uid);
		YWebText.hideCanvas();
		let element = YWebText.elements.get(uid);
		if (!element) {
			element = document.createElement('div');
			YWebText.identify(element, uid);
			element.dataset.ywebPolygon = uid;
			const shape = document.createElement('div');
			shape.style.cssText = 'position:absolute;inset:0';
			element.appendChild(shape);
			YWebText.getRoot().appendChild(element);
			YWebText.elements.set(uid, element);
		}
		const style = `position:absolute;left:0;top:0;transform-origin:0 0;width:${width}px;height:${height}px;z-index:${z};pointer-events:none`;
		if (element.dataset.ywebStyle !== style) {
			element.dataset.ywebStyle = style;
			element.style.cssText = style;
			delete element.dataset.ywebTransform;
		}
		const shape = element.firstElementChild;
		shape.style.background = YWebText.color(red, green, blue, alpha);
		shape.style.clipPath = `polygon(${points})`;
		const transform = [xx, xy, yx, yy, x, y].join(',');
		if (element.dataset.ywebTransform !== transform) {
			element.dataset.ywebTransform = transform;
			element.style.transform = `matrix(${transform})`;
		}
		YWebText.clip(element, uid, xx, xy, yx, yy, x, y);
	},
	yweb_gradient_sync__sig: 'vp' + 'i' + 'f'.repeat(8) + 'i' + 'f'.repeat(4),
	// ColorPickerの色面を、Godot内部Controlの確定矩形へCSS gradientで置く。
	yweb_gradient_sync: function (pUid, kind, xx, xy, yx, yy, x, y, width, height, z, red, green, blue, alpha) {
		const uid = GodotRuntime.parseString(pUid);
		YWebText.seen.add(uid);
		YWebText.trackDraw(uid);
		YWebText.hideCanvas();
		let element = YWebText.elements.get(uid);
		if (!element) {
			element = document.createElement('div');
			YWebText.identify(element, uid);
			element.dataset.ywebGradient = uid;
			YWebText.getRoot().appendChild(element);
			YWebText.elements.set(uid, element);
		}
		const hue = YWebText.color(red, green, blue, alpha);
		const background = kind === 0
			? `linear-gradient(to bottom,transparent,#000),linear-gradient(to right,#fff,${hue})`
			: 'linear-gradient(to bottom,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';
		const style = `position:absolute;left:0;top:0;transform-origin:0 0;width:${width}px;height:${height}px;z-index:${z};background:${background};pointer-events:none`;
		if (element.dataset.ywebStyle !== style) {
			element.dataset.ywebStyle = style;
			element.style.cssText = style;
			delete element.dataset.ywebTransform;
		}
		const transform = [xx, xy, yx, yy, x, y].join(',');
		if (element.dataset.ywebTransform !== transform) {
			element.dataset.ywebTransform = transform;
			element.style.transform = `matrix(${transform})`;
		}
		YWebText.clip(element, uid, xx, xy, yx, yy, x, y);
	},
	yweb_triangle_sync__sig: 'vppp' + 'f'.repeat(6) + 'i' + 'f'.repeat(4),
	// Godotが投影したMeshを粒子単位でまとめ、半透明instanceの重なりを保つ。
	yweb_triangle_sync: function (pUid, pType, pGroup, x0, y0, x1, y1, x2, y2, z, red, green, blue, alpha) {
		const uid = GodotRuntime.parseString(pUid);
		const type = GodotRuntime.parseString(pType);
		const group = GodotRuntime.parseString(pGroup);
		YWebText.hideCanvas();
		const owner = uid.slice(0, uid.lastIndexOf('-mesh'));
		const color = YWebText.color(red, green, blue, alpha);
		const key = `${owner}-mesh3d-${alpha < 0.999 ? group : ''}-${color}`;
		const mesh = YWebText.meshes.get(key) || { type, color, z, count: 0, path: '' };
		// 同じ向きのsubpathへ揃え、一枚のSVG塗りで内部の継ぎ目を作らない。
		if ((x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0) < 0) {
			[x1, x2] = [x2, x1];
			[y1, y2] = [y2, y1];
		}
		mesh.path += `M${x0} ${y0}L${x1} ${y1}L${x2} ${y2}Z`;
		mesh.z = Math.max(mesh.z, z);
		mesh.count++;
		YWebText.meshes.set(key, mesh);
	},
	yweb_plane_sync__sig: 'vpppp' + 'f'.repeat(10) + 'ii' + 'f'.repeat(5),
	// Godotが投影した3D平面を、画像または文字のmatrix3dとして置く。
	yweb_plane_sync: function (pUid, pType, pKey, pText, x0, y0, x1, y1, x2, y2, x3, y3, width, height, z, kind, red, green, blue, alpha, fontSize) {
		const uid = GodotRuntime.parseString(pUid);
		const type = GodotRuntime.parseString(pType);
		const key = GodotRuntime.parseString(pKey);
		const value = GodotRuntime.parseString(pText);
		YWebText.seen.add(uid);
		YWebText.hideCanvas();
		let element = YWebText.elements.get(uid);
		const tag = kind ? 'div' : 'img';
		if (!element || element.tagName.toLowerCase() !== tag) {
			if (element) YWebText.drop(element);
			element = document.createElement(tag);
			YWebText.identify(element, uid);
			element.dataset.ywebPlane3d = uid;
			YWebText.getRoot().appendChild(element);
			YWebText.elements.set(uid, element);
		}
		if (element.dataset.ywebNode3d !== type) element.dataset.ywebNode3d = type;
		if (kind) element.textContent = value;
		else {
			const source = YWebText.images.get(key);
			if (source && element.dataset.ywebImageKey !== key) {
				element.dataset.ywebImageKey = key;
				element.src = source;
			}
		}
		const style = [
			'position:absolute', 'left:0', 'top:0', 'transform-origin:0 0', 'margin:0', 'padding:0',
			`width:${width}px`, `height:${height}px`, `z-index:${z}`, `opacity:${alpha}`,
			`color:${YWebText.color(red, green, blue, 1)}`, `font-size:${fontSize}px`, `font-family:${globalThis.YWEB_FONT_MAP?.[key]?.family || 'sans-serif'}`, `line-height:${height}px`, 'white-space:pre',
		].join(';');
		if (element.dataset.ywebStyle !== style) {
			element.dataset.ywebStyle = style;
			element.style.cssText = style;
			delete element.dataset.ywebTransform;
		}
		const transform = YWebText.perspective(width, height, x0, y0, x1, y1, x2, y2, x3, y3).join(',');
		if (element.dataset.ywebTransform !== transform) {
			element.dataset.ywebTransform = transform;
			element.style.transform = `matrix3d(${transform})`;
		}
	},
	yweb_project_sync__sig: 'vp' + 'f'.repeat(10) + 'i',
	// SubViewport内の平坦DOMをSprite3Dと同じ四隅へ射影し、入力判定もBrowserへ任せる。
	yweb_project_sync: function (pOwner, width, height, x0, y0, x1, y1, x2, y2, x3, y3, z) {
		const owner = GodotRuntime.parseString(pOwner);
		const plane = YWebText.perspective(width, height, x0, y0, x1, y1, x2, y2, x3, y3);
		for (const uid of YWebText.nodeOwners.get(owner) || []) {
			const element = YWebText.elements.get(uid);
			if (!element) continue;
			const raw = element.dataset.ywebMatrix || element.dataset.ywebTransform;
			const values = raw?.split(',').map(Number);
			if (values?.length !== 6 || values.some((value) => !Number.isFinite(value))) continue;
			const scale = Number(element.dataset.ywebTextScale || 1);
			const [a, b, c, d, e, f] = values;
			const local = [a * scale, b * scale, 0, 0, c, d, 0, 0, 0, 0, 1, 0, e, f, 0, 1];
			element.style.transform = `matrix3d(${YWebText.multiply(plane, local).join(',')})`;
			if (!element.dataset.ywebProjected) element.dataset.ywebProjectZ = element.style.zIndex;
			element.style.zIndex = String(z + Math.abs(Number(element.style.zIndex) || 0) % 100);
			element.dataset.ywebProjected = '1';
			YWebText.projected.add(uid);
		}
	},
	yweb_text_set_event_cb__sig: 'vp',
	// Browser入力を受けるC++ callbackを登録する。
	yweb_text_set_event_cb: function (callback) {
		YWebText.event = GodotRuntime.get_func(callback);
	},
	yweb_text_prefer_dom__sig: 'i',
	// Canvas Theme fontを避ける既定方針をC++所有判定へ返す。
	yweb_text_prefer_dom: function () {
		return globalThis.YWEB_TEXT_CONFIG?.avoidCanvasThemeFont === false ? 0 : 1;
	},
	yweb_site_set_event_cb__sig: 'vp',
	// Browser route通知をGodot scene切替callbackへ結ぶ。
	yweb_site_set_event_cb: function (callback) {
		YWebText.siteEvent = GodotRuntime.get_func(callback);
		YWebText.siteCallback = (path) => {
			const value = GodotRuntime.allocString(path);
			YWebText.siteEvent(value);
			GodotRuntime.free(value);
		};
		globalThis.YWebSite?.bind(YWebText.siteCallback);
	},
	yweb_site_scene__sig: 'vi',
	// Godot current sceneのresource pathをBrowser titleとURLへ通知する。
	yweb_site_scene: function (pPath) {
		globalThis.YWebSite?.scene(GodotRuntime.parseString(pPath));
	},
	yweb_text_begin__sig: 'v',
	// 一frameの文字同期前にroot寸法を更新する。
	yweb_text_begin: function () {
		YWebText.resizeRoot();
		// 前frameの射影を2D確定行列へ戻し、今frameに存在する3D面を改めて適用する。
		for (const uid of YWebText.projected) {
			const element = YWebText.elements.get(uid);
			if (!element) continue;
			if (element.dataset.ywebMatrix) YWebText.place(element);
			else if (element.dataset.ywebTransform) element.style.transform = `matrix(${element.dataset.ywebTransform})`;
			element.style.zIndex = element.dataset.ywebProjectZ || '';
			delete element.dataset.ywebProjectZ;
			delete element.dataset.ywebProjected;
		}
		YWebText.projected.clear();
		YWebText.seen.clear();
		YWebText.meshes.clear();
		YWebText.clips.clear();
		YWebText.scrollMembers.clear();
		YWebText.scrollOwners.clear();
		YWebText.scrollSeen.clear();
	},
	yweb_text_sync__sig: 'viiii' + 'f'.repeat(8) + 'i'.repeat(8) + 'f'.repeat(28),
	// 一つのControl状態をObjectID対応の意味要素へ反映する。
	yweb_text_sync: function (pUid, pText, pAux, pFont, xx, xy, yx, yy, x, y, width, height, flags, z, horizontal, vertical, kind, maxLength, selectionStart, selectionEnd, red, green, blue, alpha, fontSize, lineSpacing, outlineRed, outlineGreen, outlineBlue, outlineAlpha, outlineSize, shadowRed, shadowGreen, shadowBlue, shadowAlpha, shadowX, shadowY, underlineOffset, underlineThickness, placeholderRed, placeholderGreen, placeholderBlue, placeholderAlpha, fontAscent, glyphTop, glyphBottom, scrollX, scrollY) {
		const uid = GodotRuntime.parseString(pUid);
		YWebText.seen.add(uid);
		YWebText.trackDraw(uid);
		const text = pText ? GodotRuntime.parseString(pText) : null;
		const aux = GodotRuntime.parseString(pAux);
		const font = GodotRuntime.parseString(pFont);
		const tag = YWebText.tags[kind] || 'span';
		let element = YWebText.elements.get(uid);
		if (!element || element.tagName.toLowerCase() !== tag) {
			if (element) YWebText.drop(element);
			element = YWebText.create(uid, kind);
		}
		const type = YWebText.kinds[kind] || 'Control';
		if (element.dataset.ywebKind !== type) element.dataset.ywebKind = type;
		const form = YWebText.form(element);
		if (form !== element && form.dataset.ywebKind !== type) form.dataset.ywebKind = type;
		const transform = [xx, xy, yx, yy, x, y].join(',');
		if (element.dataset.ywebTransform !== transform) {
			element.dataset.ywebTransform = transform;
			element.dataset.ywebMatrix = transform;
			YWebText.place(element);
		}
		YWebText.clip(element, uid, ...YWebText.scrollMatrix(uid, transform).split(',').map(Number));
		YWebText.placeCodePart(element, element.ywebBar);
		YWebText.placeCodePart(element, element.ywebMinimap);
		let textChanged = false;
		if (form.tagName === 'INPUT' || form.tagName === 'TEXTAREA') {
			const value = text === null ? form.value : text;
			form.tabIndex = flags & 1024 ? 0 : -1;
			if (text !== null && !form.dataset.ywebComposing && form.value !== text) {
				form.value = value;
				delete form.dataset.ywebSent;
			}
			form.placeholder = aux;
			form.readOnly = !(flags & 32);
			if (form.tagName === 'INPUT') form.type = flags & 128 ? 'password' : 'text';
			form.dataset.ywebMaxLength = String(maxLength);
			if (maxLength > 0) form.maxLength = maxLength * 2; else form.removeAttribute('maxlength');
			form.wrap = flags & 8 ? 'soft' : 'off';
			if (!form.dataset.ywebComposing) {
				const start = YWebText.offset(value, selectionStart);
				const end = YWebText.offset(value, selectionEnd);
				if (form.selectionStart !== start || form.selectionEnd !== end) form.setSelectionRange(start, end);
			}
			if (flags & 64 && !form.dataset.ywebBlurPending) {
				delete form.dataset.ywebFocusPending;
				if (document.activeElement !== form) form.focus({ preventScroll: true });
			} else if (!(flags & 64)) {
				delete form.dataset.ywebBlurPending;
				if (document.activeElement === form && !form.dataset.ywebFocusPending) form.blur();
			}
		} else {
			const content = element.ywebGlyph || element;
			if (text !== null && content.textContent !== text) {
				content.textContent = text;
				textChanged = true;
			}
			if (tag === 'button') element.disabled = !!(flags & 256);
			if (tag === 'a') {
				if (aux) element.href = aux; else element.removeAttribute('href');
			}
			if (flags & 256) element.setAttribute('aria-disabled', 'true'); else element.removeAttribute('aria-disabled');
			element.tabIndex = flags & 1024 && !(flags & 256) ? 0 : -1;
			element.style.pointerEvents = flags & 2048 ? 'auto' : 'none';
			if (flags & 64 && !YWebText.mouseDown && !element.dataset.ywebBlurPending) {
				delete element.dataset.ywebFocusPending;
				if (document.activeElement !== element) element.focus({ preventScroll: true });
			} else if (!(flags & 64)) {
				delete element.dataset.ywebBlurPending;
				if (document.activeElement === element && !element.dataset.ywebFocusPending) element.blur();
			}
		}
		if (form.tagName === 'TEXTAREA') {
			if (Math.abs(form.scrollLeft - scrollX) > 0.5) form.scrollLeft = scrollX;
			if (Math.abs(form.scrollTop - scrollY) > 0.5) form.scrollTop = scrollY;
			YWebText.codeScroll(form);
		}
		const appearance = [width, height, flags, z, horizontal, vertical, font, red, green, blue, alpha, fontSize, lineSpacing, outlineRed, outlineGreen, outlineBlue, outlineAlpha, outlineSize, shadowRed, shadowGreen, shadowBlue, shadowAlpha, shadowX, shadowY, underlineOffset, underlineThickness, placeholderRed, placeholderGreen, placeholderBlue, placeholderAlpha, fontAscent, glyphTop, glyphBottom].join(',');
		if (element.dataset.ywebAppearance === appearance && !textChanged) return;
		element.dataset.ywebAppearance = appearance;
		element.dataset.ywebFontAscent = String(fontAscent);
		element.dataset.ywebGlyphTop = String(glyphTop);
		element.dataset.ywebGlyphBottom = String(glyphBottom);
		element.dataset.ywebWrap = flags & 8 ? '1' : '0';
		element.dataset.ywebDecorated = outlineSize > 0 || shadowAlpha > 0 || flags & 16 ? '1' : '0';
		element.style.display = flags & 1 ? (form !== element || tag === 'input' || tag === 'textarea' || kind === 5 ? 'block' : 'flex') : 'none';
		element.style.width = `${width}px`;
		element.style.height = `${height}px`;
		element.style.zIndex = String(z);
		element.style.direction = flags & 2 ? 'rtl' : 'ltr';
		element.style.overflow = form !== element ? 'hidden' : tag === 'textarea' ? 'auto' : flags & 4 ? 'hidden' : 'visible';
		element.style.whiteSpace = form !== element ? 'normal' : flags & 8 ? 'pre-wrap' : 'pre';
		element.style.overflowWrap = flags & 8 ? 'anywhere' : 'normal';
		element.style.justifyContent = ['flex-start', 'center', 'flex-end', 'space-between'][horizontal] || 'flex-start';
		element.style.alignItems = ['flex-start', 'center', 'flex-end', 'stretch'][vertical] || 'flex-start';
		element.style.textAlign = ['left', 'center', 'right', 'justify'][horizontal] || 'left';
		element.style.color = YWebText.color(red, green, blue, alpha);
		element.style.setProperty('--yweb-placeholder', YWebText.color(placeholderRed, placeholderGreen, placeholderBlue, placeholderAlpha));
		element.style.fontFamily = globalThis.YWEB_FONT_MAP?.[font]?.family || 'sans-serif';
		element.style.fontSize = `${fontSize}px`;
		// 文字はGodotが確定した行の高さを行ボックスへ使い、Browser fontの行送りではみ出させない。
		// ButtonとLinkButtonはGodotがline_spacingを渡さないので、そのままだと行ボックスが
		// 文字寸法ちょうどまで縮み、Godotより字が上へ寄る。書体本来の行送りを下限にして揃える。
		const spaced = fontSize + lineSpacing;
		const single = kind === 1 || kind === 2 ? Math.max(spaced, YWebText.naturalLine(element, fontSize)) : spaced;
		element.style.lineHeight = `${kind === 5 ? height : single}px`;
		element.style.webkitTextStroke = outlineSize > 0 && outlineAlpha > 0 ? `${outlineSize}px ${YWebText.color(outlineRed, outlineGreen, outlineBlue, outlineAlpha)}` : '0 transparent';
		element.style.textShadow = shadowAlpha > 0 ? `${shadowX}px ${shadowY}px 0 ${YWebText.color(shadowRed, shadowGreen, shadowBlue, shadowAlpha)}` : 'none';
		element.style.textDecorationLine = flags & 16 ? 'underline' : 'none';
		element.style.textUnderlineOffset = flags & 16 ? `${underlineOffset}px` : 'auto';
		element.style.textDecorationThickness = flags & 16 ? `${underlineThickness}px` : 'auto';
		YWebText.glyph(element);
		if (kind === 5) YWebText.fit(element);
		if (element.ywebGlyph) YWebText.loadFont(element);
	},
	yweb_action_sync__sig: 'vi' + 'f'.repeat(12),
	// Button全体を意味DOMの操作域にし、文字をThemeのcontent領域へ収める。
	yweb_action_sync: function (pUid, xx, xy, yx, yy, x, y, width, height, left, top, right, bottom) {
		const uid = GodotRuntime.parseString(pUid);
		const element = YWebText.elements.get(uid);
		if (!element?.ywebGlyph) return;
		const transform = [xx, xy, yx, yy, x, y].join(',');
		element.dataset.ywebTransform = transform;
		element.dataset.ywebMatrix = transform;
		element.dataset.ywebContentWidth = String(Math.max(0, width - left - right));
		element.style.width = `${width}px`;
		element.style.height = `${height}px`;
		element.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
		YWebText.place(element);
		YWebText.clip(element, uid, ...YWebText.scrollMatrix(uid, transform).split(',').map(Number));
	},
	yweb_code_sync__sig: 'vpp',
	// CodeEditの構文色と行補助を、本文入力とは独立した背面DOMへ同期する。
	yweb_code_sync: function (pUid, pState) {
		const uid = GodotRuntime.parseString(pUid);
		const element = YWebText.elements.get(uid);
		if (element) YWebText.code(element, GodotRuntime.parseString(pState));
	},
	yweb_text_remove__sig: 'vi',
	// 解放済みControlの意味要素とObjectID対応を回収する。
	yweb_text_remove: function (pUid) {
		const uid = GodotRuntime.parseString(pUid);
		const element = YWebText.elements.get(uid);
		if (element) YWebText.drop(element);
		YWebText.elements.delete(uid);
		YWebText.forgetDraw(uid);
	},
	yweb_text_end__sig: 'v',
	// 今frameで使われなかった複数項目と解放済み要素を回収する。
	yweb_text_end: function () {
		// 同色の三角形群を一枚のSVG pathへ確定し、内部edgeの隙間を避ける。
		for (const [uid, mesh] of YWebText.meshes) {
			YWebText.seen.add(uid);
			let element = YWebText.elements.get(uid);
			if (!element) {
				element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
				YWebText.identify(element, uid);
				element.dataset.ywebTriangle3d = uid;
				const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				YWebText.identify(path, `${uid}-path`);
				element.appendChild(path);
				YWebText.getRoot().appendChild(element);
				YWebText.elements.set(uid, element);
			}
			element.dataset.ywebNode3d = mesh.type;
			element.dataset.ywebTriangleCount = String(mesh.count);
			const style = `position:absolute;left:0;top:0;width:100%;height:100%;z-index:${mesh.z};overflow:visible;pointer-events:none`;
			if (element.dataset.ywebStyle !== style) {
				element.dataset.ywebStyle = style;
				element.style.cssText = style;
			}
			const path = element.firstElementChild;
			if (path.getAttribute('d') !== mesh.path) path.setAttribute('d', mesh.path);
			if (path.getAttribute('fill') !== mesh.color) path.setAttribute('fill', mesh.color);
			path.setAttribute('fill-rule', 'nonzero');
		}
		for (const [uid, element] of YWebText.elements) {
			const animation = YWebText.elementAnimations.get(uid);
			if (animation && animation.length > 0) {
				const time = (performance.now() / 1000 + animation.offset) % animation.length;
				const visible = animation.begin <= animation.end ? time >= animation.begin && time < animation.end : time >= animation.begin || time < animation.end;
				element.style.visibility = visible ? 'visible' : 'hidden';
			} else element.style.visibility = 'visible';
			if (YWebText.seen.has(uid)) continue;
			YWebText.drop(element);
			YWebText.elements.delete(uid);
			YWebText.forgetDraw(uid);
		}
		YWebText.applyScroll();
		for (const [uid, scroll] of YWebText.scrolls) {
			if (YWebText.scrollSeen.has(uid)) continue;
			scroll.element.remove();
			YWebText.scrolls.delete(uid);
		}
	},
	yweb_draw_reset__sig: 'vp',
	// 一つのnodeが描き直す直前に、前回その描画で作った要素を捨てる。
	// 描画は毎frameとは限らないため、捨てる時機をここに固定する。
	yweb_draw_reset: function (pPrefix) {
		const prefix = GodotRuntime.parseString(pPrefix);
		if (prefix === '') {
			YWebText.images.clear();
			for (const uid of YWebText.drawn) {
				const element = YWebText.elements.get(uid);
				if (element) YWebText.drop(element);
			}
			YWebText.drawn.clear();
			YWebText.drawOwners.clear();
			YWebText.activeAnimations.clear();
			YWebText.elementAnimations.clear();
			return;
		}
		for (const uid of [...(YWebText.drawOwners.get(prefix) || [])]) {
			const element = YWebText.elements.get(uid);
			if (element) YWebText.drop(element);
			YWebText.elements.delete(uid);
			YWebText.forgetDraw(uid);
		}
		YWebText.drawOwners.delete(prefix);
	},
	yweb_draw_touch__sig: 'vp',
	// 現在もSceneにあるCanvasItemの描画要素へ生存印を付ける。
	yweb_draw_touch: function (pPrefix) {
		const prefix = GodotRuntime.parseString(pPrefix);
		for (const uid of YWebText.drawOwners.get(prefix) || []) YWebText.seen.add(uid);
	},
};

autoAddDeps(YWebText, '$YWebText');
mergeInto(LibraryManager.library, YWebText);
