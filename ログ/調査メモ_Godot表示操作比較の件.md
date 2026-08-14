# Godot表示操作比較の件

## 結論

同じ500×280画面、同じ初期状態、同じ操作後状態で、Godot標準描画とgdwebの実書き出し表示を比較。平均絶対画素誤差は操作前0.818355%、操作後0.982486%。両方とも合格条件1%未満。

操作後の公開状態7項目は完全一致。

## 比較結果

| 時点 | 正規化MAE | 誤差率 | 判定 |
|---|---:|---:|---|
| 操作前 | 0.00818355 | 0.818355% | 合格 |
| 操作後 | 0.00982486 | 0.982486% | 合格 |

比較は画像を拡大縮小せず、同じviewportの全画素をImageMagick `compare -metric MAE`で算出。自動判定は`.tmp/gdweb/parity/compare.cjs`。

## 操作結果

Button押下、LineEdit入力、CheckBox解除、CheckButton有効化、HSliderのArrowRight操作を両方へ適用。

```json
{
  "caret": 6,
  "check": false,
  "input": "parity",
  "label": "export click",
  "progress": 36,
  "slider": 36,
  "switch": true
}
```

Godot標準側とWeb側の値は全件一致。Web側は実DOMへPlaywrightで入力し、Godot signalと状態へ戻った結果を採用。IMEのcomposition、絵文字を含むselection index、Tab順はGUI統合試験で別途合格。

## 証拠

- `.tmp/gdweb/parity/native/frame00000002.png`
- `.tmp/gdweb/parity/web.png`
- `.tmp/gdweb/parity/native-after/frame00000001.png`
- `.tmp/gdweb/parity/web-after.png`
- `.tmp/gdweb/parity/state.json`
- `.tmp/gdweb/parity/result.json`

DOM文字のglyph rasterizeとCanvasの端のanti-aliasは実装系が異なるため、画素完全一致は求めない。z-indexとGodot計算矩形の同期を使い、全画面誤差1%未満を合格条件とする。
