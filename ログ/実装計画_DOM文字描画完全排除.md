# DOM文字描画完全排除 実装計画

## 目的

Godot 4.7.1 minimum Web exportの文字をすべてDOMへ移し、Canvas font rendererを無効化。2D描画、物理、Shader、icon、背景は標準Canvasを維持。

## 完了条件

- 標準2D画面のCanvas glyph描画0件。
- RichTextLabelのplain text、BBCode、`push_*()`を同じDOM経路で表示。
- TextEditとCodeEditでBrowser IME、選択、caret、scroll、undoを利用可能。
- Godot標準の文字を持つControlを意味に合うHTML要素へ変換。
- 直接文字描画APIを検出し、理由とscene、script、行をwarning表示。
- 条件外を黙ってCanvasへ戻す処理0件。
- Canvas所有領域の画素は標準版と完全一致。

## 設計原則

- SceneTreeとControl propertyを状態の正本にする。
- BBCodeはGodot内部parserを一度だけ使用する。
- DOMへHTML文字列を渡さず、型付き命令と`textContent`で構築する。
- DOM IDは`ObjectID`、子要素IDはItem indexから生成する。
- 内容、Theme、配置を別のdirty世代として管理する。
- 毎frame処理は可視要素のtransform一括送信だけにする。
- Browser入力をGodot signalとpropertyへ戻し、Godot APIの見え方を維持する。
- DOMだけで再現できない機能はwarning後にBrowser標準表示へ代替。設定によりGodot標準fontのCanvas表示も選択可能。

## HTML対応

### 入力

| Godot | HTML | 補助要素 |
|---|---|---|
| LineEdit | `input` | clear iconは`button` |
| TextEdit | `textarea` | scroll、selection、IMEを双方向同期 |
| CodeEdit | `textarea` | 背面`pre > code > span`へ構文色、caret、行装飾 |

`textarea`はplain text専用。装飾spanを内部へ入れない。CodeEditでは同じ文字列を背面`pre`へ複製し、textareaのglyph色を透明、caretと選択を前面表示。両層のfont、行高、tab幅、scrollを一致させる。

primary caret一組だけをtextareaのnative selectionへ対応。残りのcaretとselectionは`aria-hidden` overlayへ描画。通常の`beforeinput`はBrowser変更を止め、input typeとdataをGodotへ渡して全caretへ一括適用。IME変換中はprimary textareaをnative動作させ、composition確定差分をGodotの全caretへ一つの複合編集として適用する。

undoとredoの正本はGodot。`historyUndo`と`historyRedo`を止めてGodot commandを呼び、結果をtextareaとoverlayへ反映。BrowserとGodotへ二重履歴を作らない。

### RichTextLabel

| Godot item | HTML |
|---|---|
| frame、paragraph、newline | `div`、`p`、`br` |
| bold、italics、mono | `strong`、`em`、`code` |
| font、size、color、outline、background | `span`＋CSS custom property |
| underline、strikethrough | `span`＋text decoration |
| URL | `a href` |
| 任意meta | `span role="link" tabindex="0"` |
| hint | `span title` |
| list | `ul`、`ol`、`li` |
| table | `table`、`tbody`、`tr`、`td` |
| image | `img` |
| horizontal rule | `hr` |
| dropcap | 専用`span` |
| language、direction | `lang`、`dir`属性 |
| fade、shake、wave、tornado、rainbow、pulse | 効果範囲だけgrapheme単位`span` |
| custom effect | Godot評価結果をgrapheme style、変形、置換文字batchへ同期 |

画像はexport済みasset URLへ変換。region指定はexport時に切り出した画像を使用。alt、tooltip、色、寸法、inline alignmentを属性とCSSへ反映。

runtimeのImageTextureとAtlasTextureは`changed`世代ごとに画像dataを一回だけBrowser Blobへ転送し、ObjectIDとitem indexでcache。`update_image()`は対象itemだけを更新し、削除時にBlob URLを破棄。ViewportTexture、AnimatedTexture、毎frame変化するTextureはreadbackを繰り返さずexport検査またはruntime errorで拒否。

画像data転送時にBrowser bridgeがopaque image tokenを発行。DOM tree命令はURLでなくtokenだけを参照し、JavaScript内部mapでBlob URLへ解決する。BBCode、設定、scriptから渡された`blob:`と偽tokenは拒否。

### RichTextLabelの視覚所有

| 部分 | 所有 |
|---|---|
| Control外枠、focus StyleBox | Canvas |
| scrollbar外形とpointer hit | Canvas |
| text、outline、shadow、装飾 | DOM |
| 選択、meta hover、文字背景 | DOM |
| list marker、table、cell背景、罫線、hr | DOM |
| inline image、dropcap、文字効果 | DOM |

RichTextLabelの内容描画分岐をDOM-only時に止め、外枠だけをCanvasへ残す。DOM側の画像、表、罫線とCanvas側の同一内容を同時表示しない。DOM native scrollbarはCSSで隠し、wheelとtouch scroll値をCanvas scrollbarへ戻す。内容clipとscroll位置はDOM、scrollbar外形とdrag入力はCanvasを正本にする。

### その他の標準Control

| Godot | HTML |
|---|---|
| MenuBar | `nav`＋`button` |
| PopupMenu | `ul role="menu"`＋`button role="menuitem"` |
| TabBar | `div role="tablist"`＋`button role="tab"` |
| ItemList | `ul role="listbox"`＋`li role="option"` |
| Tree | `ul role="tree"`＋`li role="treeitem"` |
| FoldableContainer | `details`＋`summary` |
| ProgressBar | `progress`＋`output` |
| tooltip | `div role="tooltip"` |

OptionButton、SpinBox、ColorPickerは内部Button、PopupMenu、LineEditを同じadapterへ渡す。Button派生、wrap、省略、Label visible characterもDOM CSSと部分textで処理し、既存fallback条件を削除。

embedded Window titleは`div role="dialog"`とtitle `span`へ対応。CodeEditのcode hintは`div role="status"`、completion popupは`ul role="listbox"`と`li role="option"`へ対応。Canvas側の枠、背景、icon、入力判定は維持。

## Godot側

### DOM protocol

現在の一要素一関数を次の三系統へ整理。

- `gdweb_dom_tree_begin(ObjectID, generation)`
- `gdweb_dom_node(parent, item, kind, text, attributes, style)`
- `gdweb_dom_tree_end(ObjectID)`

RichTextLabel内部Item木を走査し、文字、構造、style、event用metaを型付き命令へ変換。`text`、BBCode、`push_*()`の入口差を消す。Item indexを`gdweb-text-<ObjectID>-<index>`へ対応。

配置は全Control共通の固定長bufferへ詰め、一回のJavaScript callで送信。内容世代が同じ場合はtree命令を送らない。Theme世代だけが変わった場合はstyle差分だけを送る。

### event bridge

- `a`とmetaから`meta_clicked`、`meta_hover_started`、`meta_hover_ended`を通知。
- Browser selectionからRichTextLabelの選択範囲をUnicode文字位置で更新。
- native scrollをGodot scrollbarへ戻す。
- menu、tab、tree、listのclick、keyboard、focusを標準Control入力へ渡す。
- textareaの`beforeinput`、`input`、composition、selection、scroll、focusを既存bridgeへ統合。
- primary caretの入力commandをGodotの全caretへ一括適用。
- `historyUndo`と`historyRedo`をGodot undo stackへ接続。

mouse eventの入口はCanvas所有を維持。RichTextLabelだけはCanvas pointer handlerから同じ画面座標をDOM hit resolverへ渡し、現在のitem tokenと文字位置を取得。tokenからmeta、link、画像tooltip、選択をGodotへ通知する。Godot側の別fontで組版した座標へ再判定しない。

座標付きhit mapをcacheしない。pointer発生時だけ`getBoundingClientRect()`で候補を粗く絞り、interactive itemの現在の`DOMQuad`へpoint-in-polygon判定。重なりはDOM paint順で一件に決定する。`DOMQuad`を取得できないBrowserはcomputed transformとtransform originの累積`DOMMatrix`を逆変換し、local border boxで判定する。

文字位置はpointerをparagraphとeffect spanの累積逆行列でlocal座標へ戻し、local Range位置を二分探索。最新CSS transform、effect span transform、scrollを反映する。pointer moveでtoken変化時だけhover signalを送信。drag中は現在のRangeからGodot Unicode位置を更新。外部linkは許可済みhrefを持つtokenだけをGodotの`meta_clicked`へ渡す。

内容世代はtokenとtext node registryだけを更新。ResizeObserverはminimum sizeへだけ使い、hit位置の更新条件にしない。毎frameの全item矩形計測を禁止し、pointer eventがないframeのhit計算0回を性能条件にする。

### DOM寸法

Fontがない場合はBrowser標準`sans-serif`。同path Web fontがある場合だけ使用。`ResizeObserver`で実寸を取得し、minimum sizeが必要なControlへframe終端で返す。0.5px未満の差を無視し、同一frameの再計算を一回へ制限。

## Canvas font停止

`gdweb_dom_only=yes`をminimum runtimeの必須build optionにする。

- Web用`font_draw_glyph()`と`font_draw_glyph_outline()`を描画しないguardへ変更。
- guard到達時はObjectIDまたはcanvas RID、呼出回数、最初のstack分類を保存。
- glyph texture RID、index、size、UVのscript bindingを違反stubへ置換。
- stubは違反counterを加算し、invalid RIDまたは空値を返して描画を停止。
- Browser試験から違反数を取得可能にする。
- standard runtimeは変更しない。
- TextServerの文字分割、BiDi、Godot property計算は初期段階で維持。

DOM adapter完成後にCanvas glyph texture生成依存をbuild graphから外す。WASM raw、Brotli容量を前後比較し、削除できない整形依存は描画機能と分離。

## Export境界

scene、resource、scriptを標準Godot headlessで走査。次を検出したらminimum exportを非0終了。

- `CanvasItem.draw_string*()`と`draw_multiline_string*()`
- `Font.draw_string*()`と`draw_char*()`
- `TextLine.draw*()`と`TextParagraph.draw*()`
- TextServer、RenderingServerのglyph直接描画
- `font_get_glyph_texture_rid`、index、size、UVとCanvas texture描画の組合せ
- 未監査GDExtensionからのCanvas文字描画

GDScriptの直接呼出し、`call()`、Callable、preload済みscriptも検査。静的に判断できないGDExtensionはwarning後にGodot標準fontのCanvas表示へ退避。

DOM-only buildではglyph atlas取得methodのscript bindingを同名stubへ差し替える。TextServer内部の整形用呼出しと外部描画用呼出しを分離し、外部取得は非0違反として停止。画像としてあらかじめ焼き込まれた文字textureはfont rendererではなく画像assetとして扱う。

## 安全性

- tag名、属性、CSS propertyを固定allowlist化。
- 文字は必ず`textContent`へ設定。
- `href`は`https`、`http`、`mailto`、`tel`、site内部routeだけを許可。
- `javascript:`、event属性、raw style、raw HTMLを拒否。
- 静的画像URLはexport manifest内だけを許可。
- runtime画像はBrowser bridgeが発行したopaque tokenだけを許可。
- BBCodeと設定由来の`blob:`、未知tokenを拒否。
- arbitrary metaはDOM datasetへJSON化せず、Godot側tokenで参照。

## 実装単位

### M1 文字描画棚卸しgate

- 4.7.1標準Control fixture
- embedded Window title fixture
- CodeEdit code hintとcompletion popup fixture
- 直接描画API fixture
- glyph atlas RID迂回fixture
- Canvas glyph呼出しcounter
- warningと代替方式の表示形式

### M2 共通DOM protocol

- tree命令
- dirty世代
- transform batch
- event batch
- ObjectID解放と子要素cleanup

### M3 RichTextLabel

- 内部Item木serializer
- 意味tag生成
- ThemeとWeb font
- selection、scroll、meta event
- 画像、表、list、dropcap
- RichText内容のCanvas描画抑止
- runtime Textureの世代cacheとBlob解放
- built-in effectとcustom effect

### M4 TextEditとCodeEdit

- textareaのwrap、複数caret、IME
- pre/code/span装飾層
- gutter、行番号、折り畳み、minimap
- syntax highlighter差分更新
- native undoとGodot undo状態同期
- primary caretと補助caret overlay
- code hintとcompletion popup

### M5 標準Control

- menu、popup、tab、list、tree
- foldable、progress、tooltip
- embedded Window title
- 複合Control
- LabelとButtonのBrowser標準代替

### M6 Canvas font停止

- DOM-only build option必須化
- glyph renderer guard
- raster依存削減
- template再build
- exporter strict mode固定

### M7 一括検査

- 機能、画面、速度、容量、load、security、accessibility
- standard Canvasとの非文字画素比較
- desktop、smartphone、DPR 1/2/3
- 残留DOM、listener、process 0

## 試験

### Rich text lab

Godot 4.7公式BBCode表の全tagを一sceneへ配置。同じ内容をBBCodeと`push_*()`の二方式で生成。

- DOM `textContent`と`get_parsed_text()`完全一致
- semantic tag、属性、computed style
- URLと任意meta signal
- list、table、image、alt、hint
- selection、copy、scroll
- 100frameごとのTheme、text、font、effect変更
- 回転、拡縮、物理親への追従
- 不正BBCodeとHTML注入文字列

### Input lab

- 日本語IMEのcomposition開始、更新、確定
- emojiを含むUnicode上限
- TextEdit wrap、縦横scroll、selection
- CodeEdit構文色、tab、gutter、複数caret、undo
- 3 caretで入力、削除、undo、redo後のtextと位置
- code hintとcompletionの表示、選択、確定
- smartphone viewportのtouch focusとsoft keyboard想定resize

### Standard Control lab

対象Controlを各一個と動的生成一個ずつ配置。mouse、keyboard、focus、Theme変更、追加、削除を検査。全表示文字がDOMで、Canvas glyph counterが0であることをassert。

### 描画境界

- 直接描画APIを一種ずつ持つfixtureがexport非0終了。
- glyph atlas RIDをCanvas textureとして描く迂回fixtureを先に再現し、strict buildでexport非0終了。
- 動的`call()`とGDExtension相当経路をruntime guardが検出。
- Canvas所有領域のexact diff 0。
- DOMを非表示にしたCanvasでRichText内部の画像、表、罫線、glyphが0画素。
- image一件、table一件を表示し、DOMとCanvasの二重画素0。
- 異なるTheme fontをBrowser`sans-serif`へfallbackし、隣接link二件、画像一件、scroll後を実座標click。対応tokenとsignalを完全一致。
- 120frame移動、回転、拡縮した隣接linkを現位置で一件clickし、旧位置は0件。effect span上のdrag文字位置を一致。
- 45度回転したlinkの外接矩形角は0件、隣接linkの外接矩形重複点はDOMQuad上の正しいtoken一件。
- runtime画像を生成一回、更新一回。旧Blob URL、item削除後の現URL、ObjectID解放後の全URLがrevoke済み。
- 偽image tokenとBBCode内`blob:`を拒否。
- WebGL2、2D Shader、物理、icon、textureを維持。
- 3D fixtureは従来どおり拒否。

### 速度とload

- 1000静的spanで安定後120frameのDOM再構築0回。
- transform更新はframeごと一括call一回。
- built-in effect 200 graphemeを含むsceneでframe中央値を記録。
- standardとDOM-onlyを順序交替で各3回、中央値比較。
- preview、ready、WASM raw、Brotli、peak memoryを記録。
- DOM-onlyのframe中央値を同scene standard比1.15以内。
- 現minimumからpreview、ready中央値を10%以上悪化させない。

### RichTextEffect境界

- offset、color、transform、visible、font、font size、glyph indexを効果batchへ含める。
- `font_get_char_from_glyph_index(font, size, glyph)`で一文字へ戻せるglyph置換はDOM textを更新。
- 0文字、複数glyph、font依存で一意に戻せない置換はwarning後に元文字または代替文字を表示。
- glyph置換を行うcustom effect一件を2 font sizeで動かし、可逆置換と代替文字の表示を検査。

## 成果物

- `build/overlay`のDOM tree、event、Canvas guard
- `addons/gdweb_site/check_project.cjs`とGodot型走査の文字描画gate
- `examples/rich_text_lab`
- `tests/rich_text_lab.cjs`
- `tests/input_dom_full.cjs`
- `tests/control_dom_full.cjs`
- `tests/canvas_font_guard.cjs`
- `tmp/dom-only/`以下の比較JSONとスクリーンショット
