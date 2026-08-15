# DOM入力とWeb圧縮の調査

## 目的

Godotを配置と状態の正本に保ちながら、Browser標準の意味要素とIME入力を使う構成。WebAssemblyの初回転送量を確実に削減する配布境界。

## 根拠

- [Godot Web export](https://docs.godotengine.org/en/latest/tutorials/export/exporting_for_web.html): WebAssemblyはgzipで約四分の一になり、対応serverではBrotli事前圧縮を推奨。
- [Godot LineEdit](https://docs.godotengine.org/en/4.5/classes/class_lineedit.html): `text_changed`、`text_submitted`、caret、selection、editable、secret、max lengthを公開状態として保持。
- [MDN CompositionEvent](https://developer.mozilla.org/en-US/docs/Web/API/CompositionEvent): IME変換は`compositionstart`から`compositionend`までを一つの確定単位として通知。
- [MDN maxlength](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/maxlength): HTMLの上限はUTF-16 code unit数。GodotのUnicode文字数上限とは直接対応しない。
- [W3C UI Events](https://www.w3.org/TR/uievents/): `compositionend`は文字変換session完了後に発火。

## 設計

- `Label`は`span`、`LinkButton`は`a`、`Button`は`button`、`LineEdit`は`input`、`TextEdit`は`textarea`。
- ObjectIDをDOM IDへ使用。Godotの画面transform、文字矩形、Theme、表示状態を毎frame追従。
- Button系の背景、icon、物理、2D描画、pointer入力はCanvas所有。意味要素は文字だけを所有。
- 入力ControlだけDOM pointer入力を所有。入力値、caret、selection、focus、scrollをGodotへ同期。
- `max_length`はUTF-16数へ直変換せず、Godotと同じUnicode文字数で制限。
- TextEditのscrollbarはDOMだけを表示し、位置をGodotのscroll状態と双方向同期。
- IME変換中はGodotへ未確定文字を送らず、`compositionend`で一回確定。通常入力は`input` eventごとに反映。
- Web font不在時はBrowser標準fontでDOMを維持。親clip、Material、複雑なTextEdit表示はCanvasへ戻す境界。

## 圧縮境界

- exporter後処理で`.wasm.br`と`.js.br`を必ず生成。元fileは非対応client用に保持。
- 配信serverは元URLへの要求に圧縮fileを返し、`Content-Encoding: br`、元の`Content-Type`、`Vary: Accept-Encoding`を付与。
- 公開URL検査でWASM応答が`Content-Encoding: br`でなければ配布失敗。
- `.pck`と`.woff2`は既に圧縮性が低いため事前圧縮対象外。

## 完了条件

- 各Controlが対応tag一個へ同期され、ObjectIDが不変。
- 日本語IME確定、絵文字、改行、選択、programmatic更新が双方向一致。
- ButtonとLinkButtonのCanvas入力、Theme、回転、物理追従が維持。
- Web書き出しにBrotli成果物とmanifestが必ず存在。
- 圧縮対応serverと未対応serverをheader検査で判別。
