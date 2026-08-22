# DOM全Node描画の調査メモ

## 目的

Godot 4.7.1の全Nodeを漏れなく仕分け、画面を描くNodeをDOM onlyで再現しよう。

## 公式仕様

- `ClassDB.get_class_list()`はエンジンが持つ全classを返し、`can_instantiate()`と親class判定で全Nodeを機械的に仕分けられる。
  - https://docs.godotengine.org/en/4.7/classes/class_classdb.html
- `CanvasItem`は2D描画の共通親で、`get_global_transform_with_canvas()`がlocal座標からViewport座標までの変換を返す。`_draw()`の描画命令もここへ集まる。
  - https://docs.godotengine.org/en/4.7/classes/class_canvasitem.html
- `Control.get_global_rect()`は回転やskewを含む場合に寸法として不十分なため、矩形と変換行列を分けてDOM styleへ渡す必要がある。
  - https://docs.godotengine.org/en/stable/classes/class_control.html
- `Projection`はCamera3Dの4×4投影行列に使われる。3D位置はGodot側で画面へ投影し、DOM側では`matrix3d()`へ変換して置く。
  - https://docs.godotengine.org/en/stable/classes/class_projection.html

## 着手時の実測

- 実体化できるNodeは240種。内訳はControl 60、Node2D 47、Node3D 108、その他25。
- 既存棚卸しは文字Control 26種を分母にしており、対応18種で69.2%。Node2D、Node3D、その他Nodeの描画責務は一覧化していない。
- `CanvasItem`の描画関数32種に対し、DOM同期へ接続済みの主処理は矩形、円、線、画像、文字、座標変換の7系統。
- 現行画面の8bit換算RMSEはmain 4.51、widgets 4.92、motion 2.85、physics 0.08。目標1.0以下へ届く画面はphysicsのみ。

## 判定方法

- 棚卸し率は、ClassDBから得た全Nodeのうち、描画責務、DOM方針、検査fixtureが記録済みの割合とする。
- 描画対応率は、標準状態または代表設定で画面を描くNodeのうち、DOM要素の実在とstyle値を自動検査できる割合とする。
- 画面一致はRGB各channelを0〜255としてRMSEを計算し、各画面1.0以下を合格とする。平均で悪い画面を隠さない。
- 階層のDOM再現は判定に含めない。Godotが返す画面変換、描画矩形、色、画像、文字、重なり順を各DOM要素へ直接指定する。

## 実装方針

- 全Nodeの分類を一つのデータへ集約し、Markdownと検査JSONを同じ正本から生成する。
- `_draw()`はCanvasItemの全公開描画関数を棚卸しし、線列、楕円、画像領域、StyleBox、polygon、複数行文字を共通DOM命令へ寄せる。
- 標準ControlはGodotのThemeと確定矩形を読み、面、枠、画像、文字を平坦なDOMへ送る。
- Node3DはCamera3Dから画面位置と奥行きを得て、`matrix3d()`、表示範囲、重なり順をDOM styleへ渡す。
- 一画面へ詰め込まず、Control、Node2D、描画命令、3D投影の主機能単位でfixtureを構成し、一回のBrowser起動でまとめて検査する。

## 3D最小構成の確認

Godot 4.7.1のCSG実装では、`set_autosmooth()`など4関数の定義が`PHYSICS_3D_DISABLED`条件内にある一方、ClassDBへの登録は条件外にある。3D物理を外してCSGを残す構成はリンク不能になるため、DOM版も3D物理を有効にし、物理で決まるNode位置をGodot側の正本として使う。GridMapも同じ構成で成立するよ。

## 実装後の実測

- 全240種を重複なく分類し、DOM版で利用する224種を224/224生成できた。
- 描画Nodeは31/81、`_draw()`命令は26/32、描画関係fixtureは31/156。生成成功を描画成功へ混ぜていない。
- 3Dは三点のアフィン近似をやめ、四隅のCamera投影から射影変換を解いて`matrix3d()`へ渡した。共通Web fontもLabel3Dへ反映し、3D画面のRMSEは10.26から2.58へ縮んだ。
- 7画面のRMSEはmain 4.51、widgets 4.92、motion 2.85、physics 0.08、omochi 22.98、draw_all 9.40、plane_3d 2.58。1.0以下はphysicsで、残る文字の輪郭と物理fixtureの位置差は未達として一覧と検査結果へ残す。
