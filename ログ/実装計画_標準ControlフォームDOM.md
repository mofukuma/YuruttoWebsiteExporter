# 標準ControlフォームDOM 実装計画

## 目的

LineEditとTextEditをBrowser native formへ変換し、IME入力を常用可能にする。標準Controlの文字だけを共通DOMへ移し、非文字Canvasを維持。

## 所有境界

| 対象 | DOM | Canvas |
|---|---|---|
| LineEdit | `input`、文字、選択、IME、caret | StyleBox、focus枠、clear/right icon、pointer |
| TextEdit | `textarea`、文字、選択、IME、scroll | StyleBox、focus枠 |
| Button派生 | `button`の文字 | 背景、icon、pointer |
| LinkButton | `a`の文字とURI | focus枠、pointer |
| 複数項目Control | 各文字`span` | 背景、選択面、罫線、icon、pointer |

## 方針

- metadataなしの標準文字Controlを既定DOM対象。
- `gdweb/font/avoid_canvas_theme_font`を既定有効。
- 対応しない装飾は一度だけwarningし、Browser標準表示へ代替。
- option無効時は再現不能な装飾だけGodot Canvas Theme fontへ退避。
- `gdweb_dom_text=false`を明示Canvas指定として使用。
- export errorとCanvas全体停止は不採用。
- CodeEdit、RichTextLabel、BBCode、PopupMenu意味要素化は後続範囲。

## 実装

1. LineEditとTextEditを毎frameの値、選択、focus、scroll同期へ登録。
2. LineEditのclear/right icon幅をDOM入力矩形から除外。
3. TextLineとTextParagraphの文字、位置、font寸法、色を描画直前に収集。
4. TabBar、ItemList、Tree、FoldableContainer、ProgressBar、MenuBarのCanvasItemを所有Controlへ対応。
5. 収集成功時だけglyph描画を省略。収集外のCanvas描画は標準処理を続行。
6. 一Control内のDOM IDを`ObjectID-index`で固定し、再描画単位で不要項目を回収。

## 一括試験

- metadataなしLineEditとTextEditの実tag、IME composition、Unicode、改行、選択位置。
- 空文字入力と`text_changed`、clear iconのCanvas実click。
- textarea wrapとscroll。
- TabBar、ItemList、Tree、FoldableContainer、ProgressBar、MenuBarの日本語表示。
- Theme変更後も同一DOM ID、font size、色を更新。
- ButtonとOptionButtonのCanvas pointer操作。
- 390×844、DPR 3、WebGL2、Canvas表示領域維持。
- Web fontなしでDOM維持、Browser標準font使用。
- 既存Text Lab、minimum site、Web font、圧縮、license回帰。
