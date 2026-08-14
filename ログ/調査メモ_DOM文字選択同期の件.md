# DOM文字選択同期

## 現象

`setSelectionRange()`直後に手動`select`イベントを送る試験が、Godot側の選択値更新前に検査ボタンへ進む場合あり。

## 仕様

[HTML Living Standard](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html)では、選択範囲が変わった場合、利用者操作のタスクとして`select`イベントをキューへ積む。`setSelectionRange()`の呼び出し完了とイベント処理完了は同時ではない。

## 試験設計

選択範囲の設定後、gdwebが実利用で選択値を送る`keyup`経路を直接通す。Godotが公開する`selection:copy`到達後、その確定値を検査。ボタンへのフォーカス移動で消える現在選択は判定に使わない。非同期の`select`イベントと固定sleepへ非依存。
