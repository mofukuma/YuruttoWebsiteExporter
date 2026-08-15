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

`gdweb_text_sync.cpp`とBrowser bridgeが扱う種類は次の5種。

- Label
- Button派生
- LinkButton
- LineEdit
- 装飾なしTextEdit

条件外のwrap、文字省略、複数caret、gutter、構文色、Material、visible character制御はCanvasへ戻る。`gdweb_dom_text` metadataのない標準ControlもCanvas所有。

## 残存描画

RichTextLabelとBBCodeだけではない。Godot 4.7.1 sourceの`TextParagraph`、`TextLine`、`font_draw_glyph*`経路から次を確認。

| 種類 | 残る文字 |
|---|---|
| RichTextLabel | plain text、BBCode、`push_*()`、画像、表、list、文字効果 |
| TextEdit派生 | CodeEdit、wrap、複数caret、gutter、minimap、構文色 |
| 選択Control | PopupMenu、MenuBar、TabBar、ItemList、Tree |
| 表示Control | FoldableContainer title、ProgressBar percentage、tooltip |
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
- 対応ControlでCanvas fallbackを禁止。
- 直接文字描画APIをexport時に拒否。
- glyph atlas取得とtexture直接描画による迂回を拒否。
- 動的呼出しとGDExtension経路をruntime guardで停止し、違反数を記録。
- 文字以外の2D、物理、Shader、icon、背景はCanvasを維持。
- RichTextLabel内部の画像、表、罫線、文字背景はDOM内容の一部としてCanvas描画を止める。
- 文字整形と寸法計算はDOM移行完了までGodot側に残し、glyph rasterだけを先に停止。

## 方式

RichTextLabelのraw BBCodeをJavaScriptでparseすると、Godot parser、`push_*()`、翻訳後textの三状態が分岐する。Godotが構築した内部Item木を一つの正本にし、型付き命令列としてBrowserへ送信。Browserは`createElement()`と`textContent`だけで安全なDOMを構築。

内容とThemeは世代番号が変わった時だけ更新。位置、回転、拡縮は既存ObjectIDを使い、毎frame一括transform同期。安定後のDOM再構築0回を性能条件とする。
