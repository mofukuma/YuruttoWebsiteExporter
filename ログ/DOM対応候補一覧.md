# DOM対応候補一覧

既存の共通描画経路を広げられるNodeと、別の情報取得が必要なNodeを分けたよ。見た目を一部出せる状態と、機能ごとのfixtureで一致を確認した状態は混ぜない。

## 共通経路ですぐ広げる候補

| 対象 | 使えるGodot情報 | 残る作業 |
|---|---|---|
| HScrollBar / VScrollBar | Range値、page、Theme、確定grabber矩形 | 操作状態ごとの画面一致確認 |
| HSeparator / VSeparator | separator StyleBox | Theme別の画面一致確認 |
| PanelContainer / MarginContainer | Themeと子の確定矩形 | panel面とclip確認 |
| ReferenceRect | border color、width | 四辺の線へ共通化 |
| ScrollContainer | 内部ScrollBarとclip矩形 | 子DOMの切り抜き連携 |
| SplitContainer | 内部draggerのiconと矩形 | 状態別icon同期 |
| CPUParticles2D / 3D | 生存粒子のtransform、color、mesh/texture | 色・位置・時間変化の画面一致確認 |

## Themeと画像処理を広げる候補

| 対象 | 足りない表現 |
|---|---|
| CheckBox / CheckButton / OptionButton | 状態別icon、radio/check印、矢印 |
| TextureRect | stretch、keep aspect、tile、flip |
| NinePatchRect | patch margin、tile、軸stretch mode |
| TextureProgressBar | 縦、逆向き、放射fill、nine-patch |
| ItemList / Tree | cellごとの背景、icon、選択・hover状態 |
| TabBar / MenuBar | iconと閉じるbutton。背景、選択・hover状態は共通StyleBox経路で確認済み |
| ColorPicker系 | checker、cursor、preset、内部button icon |
| GraphEdit系 | 接続線、port、grid、選択状態 |

## データ展開が必要な候補

| 対象 | 必要な処理 |
|---|---|
| TileMapLayer | TileSetのatlas、region、flip、terrainをセルごとに展開 |
| MeshInstance2D / MultiMeshInstance2D | surface、texture、instance transform/colorを展開 |
| GPUParticles2D / 3D | 標準ParticleProcessMaterialをDOM用CPU simulationへ写す |
| SubViewport | 子の最終画像をDOMへ転送するか、子DOMのclipと座標を再構成 |
| VideoStreamPlayer | Browser video要素へ再生位置・音量・loopを同期 |

## 完全一致に別方式が要る候補

- ShaderMaterialの任意shader、GPU粒子の独自shader、粒子trail・衝突・sub-emitter。
- 3Dのlight、shadow、fog、reflection、screen-space effect、post process。
- CanvasGroupのbackbuffer合成と任意blend mode。

これらはCSSやSVGの固定機能へ一般変換できない。対応率では未対応として残し、必要な画面はGodotの基準画像転送かWebGL相当の別描画器で扱う。
