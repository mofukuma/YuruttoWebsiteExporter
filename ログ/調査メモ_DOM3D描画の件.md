# DOMによる3D描画の調査メモ

## 何のための調査か

Godotの3D描画NodeをDOMへ広げるため、実際にMeshをHTML要素で描く仕組みとBrowserの制約を確認したよ。詳細な取得物と参照箇所は`tmp/DOM_3D描画_Web調査.md`へ置いた。

## 結論

PolyCSSはpolygonをHTML要素へ分け、矩形、三角形、画像atlasを選び、`matrix3d`へ配置している。この方法はMeshをDOMへ写せる実証になる。一方、MDNが示す通り`clip-path`や半透明などは`preserve-3d`の子を平面化しうる。

このprojectではGodotのCamera投影を正本にできる。平面Nodeは四隅から`matrix3d`を作り、任意Meshは投影済み三角形を平坦DOMへ深度順に置こう。CSS独自のCamera計算や深いDOM階層を持たないため、Godot側の位置と描画範囲を直接反映できるよ。

## 参照先

- PolyCSS: https://github.com/layoutit/polycss
- Three.js CSS3DRenderer: https://threejs.org/docs/#examples/en/renderers/CSS3DRenderer
- WebKit CSS 3D Transforms: https://webkit.org/blog-files/3d-transforms/transform-style.html
- MDN `transform-style`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style

## 実測

描画する3D Nodeは17型を分母にし、FogVolumeを除く16型へDOM経路と一括fixtureを用意した。対応率は94.1%だよ。ImporterMeshInstance3Dはimport工程用、RootMotionViewはeditor表示用なので、書き出した実行画面の描画分母から外している。

16型画面ではNodeと色が同じ三角形を一枚のSVG pathへまとめ、面の内部に出ていた継ぎ目を消した。Godot基準を4x MSAAで撮った結果はRGB 0..255のRMSE 2.4741で、1以下の目標には届いていない。残差は平面文字、Decal、粒子と外周の画素化へ集中しているよ。
