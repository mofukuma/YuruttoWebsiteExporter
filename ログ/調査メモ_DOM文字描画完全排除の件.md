# DOM文字描画完全排除の調査

## 目的

Godot 4.7.1 Web exportでCanvasへの文字glyph描画を0件にし、文字表示、入力、装飾、操作をBrowser DOMへ集約するための境界整理。

## 公式根拠

- [Godot 4.7 RichTextLabel](https://docs.godotengine.org/en/4.7/classes/class_richtextlabel.html): RichTextLabelはfont、画像、整形を内部tag stackとして管理。`text`、BBCode、`push_*()`の三経路が存在。
- [Godot 4.7 BBCode](https://docs.godotengine.org/en/4.7/tutorials/ui/bbcode_in_richtextlabel.html): URL、画像、表、list、文字効果、方向制御を含むtag仕様。
- [Godot 4.7 CanvasItem](https://docs.godotengine.org/en/4.7/classes/class_canvasitem.html): `draw_string()`と`draw_multiline_string()`は任意CanvasItemから直接文字を描画可能。
- [Godot 4.7 TextEdit](https://docs.godotengine.org/en/4.7/classes/class_textedit.html): 複数caret、選択、wrap、gutter、IME、scrollを持つ複数行入力Control。
- [HTML textarea](https://html.spec.whatwg.org/multipage/form-elements.html#the-textarea-element): `textarea`の内容modelはtext。子要素による装飾表示は不可。
- [HTML text control selection](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#textFieldSelection): inputとtextareaが公開する選択範囲は一組。複数caretは補助DOMが必要。
- [Godot CharFXTransform](https://docs.godotengine.org/en/4.7/classes/class_charfxtransform.html): custom RichTextEffectはoffset、color、transformだけでなくglyph indexも変更可能。
- [Resize Observer](https://www.w3.org/TR/resize-observer/): CSS transformでは観測通知が発生しない。回転、拡縮、物理移動のhit判定へ使用不可。
- [CSSOM View](https://www.w3.org/TR/cssom-view-1/): `getBoundingClientRect()`は要素のclient rectを囲む軸平行矩形。回転要素の正確な形状判定には使用不可。
- [CSS Transforms](https://www.w3.org/TR/css-transforms-1/): transformとtransform originを含む座標変換。pointer座標を逆行列でlocal座標へ戻す必要。

## 現在の所有範囲

`gdweb_text_sync.cpp`とBrowser bridgeが扱う種類。

- Label
- Button派生
- LinkButton
- LineEdit
- TextEdit
- MenuBar、TabBar、ItemList、Tree、FoldableContainer、ProgressBarの文字項目

## 標準フォーム先行実装の判断

- [Godot LineEdit](https://docs.godotengine.org/en/stable/classes/class_lineedit.html): `text_changed`は入力変更時の通知。`text` propertyの直接変更では通知しない。
- [Playwright input](https://playwright.dev/docs/input): `fill()`はfocus後に値を設定し、`input` eventを発生。
- Browserの`input`と`textarea`を入力面として維持し、確定値、選択、focus、scrollをGodotへ戻す構成。
- LineEditの空文字反映でも`text_changed`を一回発生させる必要。変更前の値を消去前に保持する境界。
- TabBar、ItemList、Tree、FoldableContainer、ProgressBar、MenuBarは`TextLine`と`TextParagraph`の確定描画位置を共通収集。
- Control背景、icon、focus枠、pointer処理はCanvas継続。文字のCanvas描画だけを収集成功時に省略。
- PopupMenuはWindow派生。Control共通収集の対象外とし、次の意味要素化段階までGodot標準Canvas表示。
- CodeEdit、RichTextLabel、BBCodeも後続段階。現在のフォーム実装を塞がない境界。
- Web font対応がないTheme fontはBrowser標準`sans-serif`へ代替。書き出し停止なし。

複合装飾はwarning後にBrowser標準表示へ代替。`gdweb/font/avoid_canvas_theme_font=false`なら再現不能な項目をCanvasへ退避。`gdweb_dom_text=false`は個別の明示Canvas指定。

## 残存描画

RichTextLabelとBBCodeだけではない。Godot 4.7.1 sourceの`TextParagraph`、`TextLine`、`font_draw_glyph*`経路から次を確認。

| 種類 | 残る文字 |
|---|---|
| RichTextLabel | plain text、BBCode、`push_*()`、画像、表、list、文字効果 |
| TextEdit派生 | CodeEdit、複数caret、gutter、minimap、構文色 |
| 選択Control | PopupMenuの項目意味要素 |
| 表示Control | tooltip |
| Window | embedded Window title |
| 複合Control | OptionButtonのpopup、SpinBox、ColorPicker内の子Control |
| CodeEdit補助表示 | code hint、completion popup、行番号、構文色 |
| 条件外状態 | LabelとButtonのwrap、省略、visible character、複合装飾 |
| 直接描画 | `CanvasItem.draw_string*()`、`Font.draw_*()`、`TextLine.draw*()`、`TextParagraph.draw*()` |
| 低水準描画 | TextServer、glyph atlas RID、RenderingServer、GDExtensionからのglyph描画 |

3Dはminimum exportで拒否済み。Label3D、TextMeshは対象外。

## HTML要素の判断

RichTextLabelを`textarea`にすると、BBCode由来の`span`、link、画像、表を子要素として表示できない。役割を分離。

- TextEdit: `textarea`
- CodeEditと構文色TextEdit: IMEとcaretを受ける`textarea`、装飾を表示する背面`pre > code > span`
- RichTextLabel: 読取用`div`をrootとした意味tag

textareaのnative selectionは一組だけ。primary caretをtextareaへ割り当て、残りのcaretとselectionは補助overlayへ表示。編集commandはGodotへ渡し、全caretへ一括適用する必要がある。
- BBCode parser: Browser側へ再実装せず、Godot内部tag stackを正規化

## 完全排除の定義

- Canvasへの`font_draw_glyph`と`font_draw_glyph_outline`呼出し0件。
- 対応Controlの黙示Canvas fallbackを禁止し、warningと代替方式を明示。
- 直接文字描画APIをexport時に拒否。
- glyph atlas取得とtexture直接描画による迂回を拒否。
- 動的呼出しとGDExtension経路をruntime guardで停止し、違反数を記録。
- 文字以外の2D、物理、Shader、icon、背景はCanvasを維持。
- RichTextLabel内部の画像、表、罫線、文字背景はDOM内容の一部としてCanvas描画を止める。
- 文字整形と寸法計算はDOM移行完了までGodot側に残し、glyph rasterだけを先に停止。

## 方式

RichTextLabelのraw BBCodeをJavaScriptでparseすると、Godot parser、`push_*()`、翻訳後textの三状態が分岐する。Godotが構築した内部Item木を一つの正本にし、型付き命令列としてBrowserへ送信。Browserは`createElement()`と`textContent`だけで安全なDOMを構築。

内容とThemeは世代番号が変わった時だけ更新。位置、回転、拡縮は既存ObjectIDを使い、毎frame一括transform同期。安定後のDOM再構築0回を性能条件とする。
