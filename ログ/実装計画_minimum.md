# gdweb minimum 実装計画

## 1. 目的

Godot 4.7.1の標準Web描画を維持し、明示指定した前面`Label`、`Button`、`LinkButton`の文字glyphだけをHTMLへ重ねる最小構成。

## 2. 所有境界

| 対象 | 所有先 |
|---|---|
| 指定`Label`、`Button`、`LinkButton`の文字矩形、font size、色、縁、影、整列 | DOM |
| Controlの背景、icon、focus枠、underline以外の装飾、入力 | Canvas |
| LineEdit、OptionButton、一覧、RichText、独自`draw_string()` | Canvas |
| Sprite、図形、TileMap、動画、SubViewport、2D物理、2D Navigation | Canvas・Godot |
| 2D Material、CanvasItem Shader | Godot標準Web renderer |
| 3D Node、3D Resource | 書き出し時に拒否 |

Godotを配置と状態の正本とする。CSS flow、Flexbox、Gridで画面配置を再計算しない。

## 3. 文字DOM条件

- `gdweb_dom_text`を指定した三種のControlだけを検出
- ObjectIDの十進値をDOM IDと同期表のkeyへ使用
- `get_screen_transform()`と描画直前に確定した文字矩形を毎frame反映
- 継承ThemeとControl単体overrideのfont size、色、縁、影、行間を反映
- horizontal alignment、vertical alignment、RTL、clip、autowrapを反映
- DOM要素は操作を受けず、Godot入力をCanvasへ通す
- Canvas側は対象Controlのglyphだけを抑止
- Button背景、icon、focus枠は抑止しない
- LinkButtonのunderlineはDOM文字装飾へ反映
- 親clip、Material、文字省略、複合outline・shadow、独自fontはCanvas表示へ戻す
- DOM rootはCanvas矩形と同じ大きさで切り抜く

Canvas項目との途中z合成は行わない。DOM文字はCanvasより前面の画面UIに限定。条件外ControlはCanvas表示へ戻し、一度だけ警告。

## 4. 実装単位

### M1 標準Web基準

- Godot 4.7.1公式sourceを固定入力に使用
- WebGLとGodot標準Canvas rendererを維持
- `disable_3d=yes`で3D scene rendererだけを除外
- Shader compilerは2D CanvasItem互換のため維持

### M2 文字同期

- dirtyになったControlをObjectID集合へ登録
- 親Node2D、物理、animationの変化を拾うため登録対象を一frame一回同期
- DOM rootはCanvas表示矩形へ一致
- 文字spanはroot直下へ絶対配置
- transformと外観を別々に差分更新
- 削除済みObjectIDをDOMから回収

### M3 書き出し検査

- sceneとresourceの3D型を拒否
- 読み込めないbinary scene・resourceを拒否
- DOM非対応Control設定を警告
- Web fontを出力へ同梱
- 秘密値をHTMLへ出力しない

### M4 比較試験

- 標準Godot Webとminimum版を同一sceneで比較
- Godot描画hookの文字矩形とDOM位置の差1 CSS px未満
- Themeのfont size、色、縁、影、整列を期待値と比較
- 固定sceneの文字mask外画像差0
- Button、LinkButton入力、icon、TextureRect、図形、2D Shader画素のCanvas所有を確認
- DPR 1と2、desktopとmobileで親領域超過0 px
- font読込後にスクリーンショット保存
- Theme切替、回転、拡縮、動的生成・削除を確認
- RigidBody2D配下ButtonとLabelシューティングを連続位置で確認
- 100件超の毎frame同期を標準Canvasと交互順三回で比較

## 5. 完了条件

- DOM要素は対応条件を満たす指定Control数と同数
- DOM要素は文字spanだけ。操作要素0件
- ObjectID、DOM ID、動的寿命が一対一
- Canvasは標準Web renderer
- 3D書き出し失敗
- Browser error、残留process、秘密値混入0件
- 初期表示、初回Canvas、転送量を標準版と比較
