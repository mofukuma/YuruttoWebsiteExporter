# AAインベーダーゲームの調査

## 目的

スマートフォン画面でAA文字とCanvas射撃を組み合わせる固定画面型シューティングゲーム。

## 公式根拠

- [TAITO SPACE INVADERS EXTREME Basic rules](https://taito.co.jp/en/steam/sie/help): Cannonで侵入する敵を倒し、waveを全滅すると次wave。敵、敵弾との接触または最下部への侵入でlifeを失い、全life喪失でgame over。
- [MDN font-family](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-family): `sans-serif`は取得可能な書体をBrowserとOSが選択するgeneric family。

## 判断

- 390×844を基準にし、Adaptive CanvasとDOM文字を同じ表示領域へ固定。
- 自機は`(´・ω・`)`。敵は独自AAで構成し、既存画像素材を使わない。
- 5行8列、左右往復、端で反転と下降、全滅後の次wave、score、3 life、敵弾、侵入判定を実装。
- Player弾は同時一発。敵は残存列の最下段から射撃。防壁は被弾ごとに損耗。
- 左、射撃、右の画面Buttonとkeyboardを同じ入力状態へ接続。
- AA、score、life、状態をDOM、背景、弾、防壁をCanvasへ分担。
- Playwrightを390×844で動かし、DOM収容、画面Button移動、命中得点、敵下降、敵弾、防壁損耗を実測。
