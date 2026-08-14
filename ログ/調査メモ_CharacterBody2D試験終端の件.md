# CharacterBody2D試験終端の調査メモ

## 対象

重力加速で床へ到達するまで待つ正常試験。

## 公式仕様

- [Using CharacterBody2D/3D](https://docs.godotengine.org/en/stable/tutorials/physics/using_character_body_2d.html)

`move_and_collide()`は指定移動中の最初の衝突で停止し、`KinematicCollision2D`を返す。時間積分を合格条件にせず、物理frame直前へ配置したBodyを一回の固定移動で衝突させる。

## 適用

- 重力と経過時間への依存を除去
- 衝突法線、Area重なり、RayCastを同じ終端で確認
- 0.5秒以内の条件待ちを維持
