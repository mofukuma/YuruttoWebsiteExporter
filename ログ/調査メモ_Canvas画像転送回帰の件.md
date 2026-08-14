# 調査メモ Canvas画像転送回帰の件

Canvas 2D画像登録後に画面全体が透明化した原因を切り分けるための調査。
調査日: 2026-08-14

## 確認事項

- `OffscreenCanvas.getContext("2d")`は2D描画contextを返す標準経路
- `putImageData()`は`ImageData`の画素を同期的にbitmapへ配置
- `drawImage()`は`OffscreenCanvas`を画像源として利用可能
- `putImageData()`は変換行列の影響を受けない
- Emscripten JavaScript libraryの関数signatureは引数個数とpointer型の一致が必須

## 判断

画像作成API自体は採用可能。Canvas全消去は画像rasterの非対応ではなく、JavaScript例外、Wasm境界signature、frame順のいずれかとして実測errorを先に確認する。

## 参照

- https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/getContext
- https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData
- https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvasRenderingContext2D
- https://emscripten.org/docs/tools_reference/settings_reference.html
