# ARIA項目連番の件

## 対象

GodotのItemList選択値が`1`に対し、2番目のDOM optionが`aria-selected=false`になる状態。

## 実測

- GodotからDOMへ送った選択連番: 1
- option数: 2
- 2番目のoption: `aria-selected=false`
- ItemListのDOM直下: 意味optionとGodot内部Controlの両方
- 選択反映の連番: `element.children`全件の連番

## 根拠

- `Element.children`は対象要素のすべての直下要素を順序付きで返す。
  - https://developer.mozilla.org/en-US/docs/Web/API/Element/children
- listboxの選択状態は`role=option`の要素ごとに`aria-selected`で表す。
  - https://www.w3.org/WAI/ARIA/apg/patterns/listbox/

## 方針

Godot内部Controlの`data-gdweb-handle`を持たない意味項目だけを抽出。その中の連番とGodot選択値を照合する。
