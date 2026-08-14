# Theoraフレーム同期

## 現象

`video middle`または`video end`の状態到達後、現在画素だけを1秒待つ試験が不定位置で失敗。状態到達箇所は実行ごとに変わらず、画素の保持時刻だけが変動。

## 公式情報

- [VideoStreamPlayer](https://docs.godotengine.org/en/4.5/classes/class_videostreamplayer.html): Web上の動画再生は最適化不足で遅く、停止位置と現在フレームは同時更新とは限らない。
- [Godot issue 92050](https://github.com/godotengine/godot/issues/92050): Theoraの停止時フレーム保持は版によって変わり、再生終了時の表示を状態判定へ使えない。
- [Godot issue 31083](https://github.com/godotengine/godot/issues/31083): 描画完了の観測には`frame_post_draw`が基準。

## 試験設計

Browserの`requestAnimationFrame`で動画領域を再生中だけ連続観測。赤、緑、青の最初の実画素を保持し、Godotの開始、中間、終了状態と組にして検証。青画素の観測を条件にGodotを一時停止し、再開後の`finished` signalを別に検証。`stream_position`と表示時刻の一致、終了後の画素保持は要求しない。

各状態の条件待ちは0.5秒。固定sleepなし。
