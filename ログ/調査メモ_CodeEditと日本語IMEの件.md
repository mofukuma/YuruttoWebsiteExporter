# CodeEditと日本語IMEの調査メモ

## 目的

CodeEditの編集機能をBrowser標準入力へ接続し、Canvasを使わない画面でも構文色、行番号、選択、caret、scroll、日本語変換を同じControlとして扱えるようにする。

## 確認した仕様

- [Godot 4.7 SyntaxHighlighter](https://docs.godotengine.org/en/4.7/classes/class_syntaxhighlighter.html) は行ごとに、色が変わる列とColorを返す。DOM側ではこの区間を`pre > code > span`へ変換できる。
- [Godot CodeEdit](https://docs.godotengine.org/en/4.7/classes/class_codeedit.html) はTextEditへ行番号、折り畳み、補完、indent管理を加えたControl。本文とprimary caretは既存TextEdit bridgeを共有できる。
- [UI Events](https://www.w3.org/TR/uievents/) ではIMEを`compositionstart`、複数回の`compositionupdate`、`compositionend`で表す。確定値は1文字とは限らず、日本語文章や絵文字をまとめて受け取る。
- [Input Events Level 2](https://www.w3.org/TR/input-events-2/) では変換中を`insertCompositionText`、貼り付けを`insertFromPaste`として扱う。どちらもkey列ではなく、更新後の入力値を正本にする必要がある。
- UI Eventsの実装メモでは、Chrome系は最終`input`を`compositionend`より前、Firefox系は後へ送る場合がある。両方を1回へ畳む必要がある。

## 採用する境界

- 前面の`textarea`がfocus、IME、primary caret、selection、undo、clipboardを担当する。
- 背面の`pre > code > span`が構文色、行番号、現在行、折り畳み印を担当する。
- `textarea`の文字色を透明にし、caret色とselection背景はThemeから設定する。
- IME変換中はGodotへ送らない。`compositionend`と直後の`input`を次の描画時機までまとめ、確定全文を1回送る。
- 表示行と前後数行を同期し、大きな文書で全行分のDOMを常設しない。
- custom vertex描画やminimap、補完popupは本文編集と分離し、検証できた機能を対応として数える。

## 検査条件

- 構文色、行番号、現在行、tab幅、scroll追従をDOM構造と位置で検査する。
- 通常入力、貼り付け相当、日本語IME確定、改行をBrowserから送り、Godotの本文と`text_changed`回数を検査する。
- composition中はGodot本文が変わらず、確定時に文章全体が1回反映されることを検査する。
- 同じObjectIDのDOM参照が入力、scroll、Theme変更で維持されることを検査する。
