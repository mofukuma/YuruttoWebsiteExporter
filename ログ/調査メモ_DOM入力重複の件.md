# DOM入力重複の件

## 対象

HTMLのButtonを1回操作したとき、Godotの`pressed`が3回発生する状態。

## 実測

- DOM要素のclick登録数: 1
- 操作前のGodot側回数: 0
- 1回操作後のGodot側回数: 3
- DOMのButtonはGodot Canvasと同じ親要素内に配置
- DOMのclickはC++の`gdweb_click()`へ直接送信

## 根拠

- DOMのUI eventは親要素へ伝播する。`stopPropagation()`は捕捉とバブリングのそれ以上の伝播を止める。
  - https://developer.mozilla.org/en-US/docs/Web/API/Event/stopPropagation
- Godotの入力はDisplayServerからViewportへ渡り、GUIの`_gui_input()`から状態機械へ入る。
  - https://docs.godotengine.org/en/latest/tutorials/inputs/inputevent.html
- Godot WebのBaseButton直接操作とBrowser入力の両方が同じButton状態機械へ到達すると、1回のUI操作が重複する。

## 方針

HTMLが所有するButton、入力欄、選択要素のpointer、mouse、touch、clickをDOM要素で停止。Buttonは直接コールバックのみ使用。Canvas所有のControlだけ座標入力をCanvasへ送信。
