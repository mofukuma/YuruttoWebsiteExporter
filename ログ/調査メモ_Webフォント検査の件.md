# Webフォント検査

## 現象

CSSOMの規則列挙からURLを抜く検査が2回不安定化。配布file応答と画面の`font-family`適用は正常。

## 根拠

- [CSS Font Loading Module Level 3](https://www.w3.org/TR/css-font-loading/): CSS font faceをscriptから読込、状態確認する標準interface。
- [FontFaceSet.load](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load): 指定fontの読込完了時にFontFace配列を返し、失敗時はreject。
- [FontFaceSet.check](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check): 指定文字をfont swapなしで描画できる状態を確認。

## 対応

Exporterが固定生成する`index.font.woff2`のHTTP 200、同fileを指定した独立`FontFace.load()`後の`loaded`状態を一括確認。出力CSSのGDWeb指定と実要素の`font-family`は別の静的・画面検査で照合。CSSOMの列挙順やfont matchingへ依存しない検査。
