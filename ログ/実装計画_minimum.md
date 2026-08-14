# gdweb minimum 実装計画

## 1. 目的

Godot 4.7.1の標準Web描画を維持し、明示指定した前面`Label`の文字だけをHTMLへ重ねる最小構成。

## 2. 所有境界

| 対象 | 所有先 |
|---|---|
| 指定`Label`の文字列、位置、寸法、font size、色、縁、影、整列 | DOM |
| `Label`の背景、focus枠 | Canvas |
| Button、入力欄、一覧、RichText、独自`draw_string()` | Canvas |
| Sprite、図形、TileMap、動画、SubViewport、2D物理、2D Navigation | Canvas・Godot |
| 2D Material、CanvasItem Shader | Godot標準Web renderer |
| 3D Node、3D Resource | 書き出し時に拒否 |

Godotを配置と状態の正本とする。CSS flow、Flexbox、Gridで画面配置を再計算しない。

## 3. LabelのDOM条件

- `gdweb_dom_text`を指定した`Label`だけを検出
- `get_screen_transform()`と`get_size()`をCSSへ反映
- `LabelSettings`をThemeより優先
- font size、font color、outline、shadow、line spacingを反映
- horizontal alignment、vertical alignment、RTL、clip、autowrapを反映
- DOM要素は操作を受けず、Godot入力をCanvasへ通す
- Canvas側は対象Labelのglyphだけを抑止
- Label背景とfocus枠は抑止しない
- 親clip、Material、文字省略、複合outline・shadow、独自fontはCanvas表示へ戻す

Canvas項目との途中z合成は行わない。DOM化LabelはCanvasより前面の画面UIに限定。条件外LabelはCanvas表示へ戻し、一度だけ警告。

## 4. 実装単位

### M1 標準Web基準

- Godot 4.7.1公式sourceを固定入力に使用
- WebGLとGodot標準Canvas rendererを維持
- `disable_3d=yes`で3D scene rendererだけを除外
- Shader compilerは2D CanvasItem互換のため維持

### M2 文字同期

- dirtyになったLabelだけをObjectID集合へ登録
- 一frame一回の同期
- DOM rootはCanvas表示矩形へ一致
- Labelはroot直下へ絶対配置
- 削除済みObjectIDをDOMから回収

### M3 書き出し検査

- sceneとresourceの3D型を拒否
- DOM非対応Label設定を警告
- Web fontを出力へ同梱
- 秘密値をHTMLへ出力しない

### M4 比較試験

- 標準Godot Webとminimum版を同一sceneで比較
- Label矩形差1 CSS px未満
- font size、色、縁、影、整列の一致
- Canvas非文字画素の差0
- Button、入力、Sprite、図形、2D ShaderのCanvas所有を確認
- DPR 1と2、desktopとmobileで親領域超過0 px
- font読込後にスクリーンショット保存

## 5. 完了条件

- DOM要素は指定Label数と同数
- Label以外のControl DOM化0件
- Canvasは標準Web renderer
- 3D書き出し失敗
- Browser error、残留process、秘密値混入0件
- 初期表示、初回Canvas、転送量を標準版と比較
