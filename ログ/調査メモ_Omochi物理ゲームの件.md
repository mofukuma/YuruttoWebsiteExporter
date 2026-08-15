# Omochi物理ゲームの調査

## 目的

意味DOMの文字をGodot標準2D物理へ追従させ、マウス操作する捕獲ゲームの構成。

## 公式根拠

- [RigidBody2D](https://docs.godotengine.org/en/stable/classes/class_rigidbody2d.html): 重力、回転、反発、衝突による落下物を物理simulationが更新。
- [AnimatableBody2D](https://docs.godotengine.org/en/stable/classes/class_animatablebody2d.html): codeで動かす物理body。移動量から速度を算出し、接触するbodyへ作用。
- [Area2D](https://docs.godotengine.org/en/stable/classes/class_area2d.html): `CollisionShape2D`で領域を定義し、`body_entered`で物理bodyの進入を検出。
- [Using Area2D](https://docs.godotengine.org/en/stable/tutorials/physics/using_area_2d.html): 収集対象の捕獲は`body_entered` signalで判定する標準構成。

## 設計

- Omochiは`RigidBody2D`と半径31の`CircleShape2D`。子の`Button`文字だけをDOMへ同期。
- Godou-sanは`AnimatableBody2D`の三面捕獲機。子の`LinkButton`文字だけをDOMへ同期。
- マウス座標はGodotが取得し、捕獲機をphysics frameで移動。
- 坂、丸ピン、壁、捕獲機、Button背景はCanvas所有。
- 捕獲領域は`Area2D.body_entered`でOmochiだけを得点化。
- Omochiは30物理frameごとに追加し、各Buttonを固有ObjectIDで追跡。
- 100物理frameで共有Themeの色と文字サイズを変更し、既存DOM IDのまま日本語へ更新。

## 完了条件

- Godou-sanの同一DOM IDが左右500 px以上追従。
- Godou-sanのCanvas経由clickがLinkButtonへ到達。
- Omochiが180 px以上落下し、坂またはピンへの物理接触を1件以上記録。
- 捕獲で得点1と状態表示。
- 100物理frame後に「ゴドウさん」「おもち」、色、文字サイズが同一DOMへ反映。
- 1200物理frame後に40個以上を投下し、投下数とDOM数が一致。
- `LinkButton`は`a`、Omochi `Button`は`button`。
