# Popup描画をDOMへ移す調査

PopupMenuとPopupPanelをGodotのThemeどおりに表示し、ブラウザ入力も標準signalへ戻せる構成を確認しよう。

## 根拠

- [Godot 4.7 PopupMenu](https://docs.godotengine.org/en/4.7/classes/class_popupmenu.html) には、通常項目、無効項目、check、radio、separator、submenu、shortcutと対応するTheme項目が定義されているよ。
- [Godot 4.7 PopupPanel](https://docs.godotengine.org/en/4.7/classes/class_popuppanel.html) は `panel` StyleBoxを持ち、透明Window上へ描く設計だよ。
- [Godot本体のPopupMenu描画](https://github.com/godotengine/godot/blob/master/scene/gui/popup_menu.cpp) は、内蔵`PopupMenuItems`の実寸計算後にStyleBox、Texture、TextLineを同じCanvasItemへ描いているよ。

## 採用方針

項目高さや横余白をエクスポーターで再計算すると、Theme変更、RTL、画像寸法、separator、submenuでずれる。内蔵`PopupMenuItems`の描画を一度DOMへ取得し、以後はGodotが再描画を要求した時に更新するよ。

PopupPanelは内蔵Panelの実矩形とStyleBoxFlatを使う。閉じたWindowは子Controlの走査を止め、非表示後のDOM残留を防ぐよ。

ブラウザ入力は各項目文字の中心間を行境界にする。hoverと選択は項目番号としてPopupMenuへ返し、無効項目、separator、submenuの判断はGodot本体へ集約するよ。

## 検証観点

- 通常、無効、見出しseparator、check、画像、submenu矢印の順序と寸法
- PopupPanelの半透明背景、枠色、角丸、位置、表示範囲
- hover Themeの再描画、無効項目の選択拒否、`id_pressed`の往復
- 閉じたPopupMenuとPopupPanelのDOM不在

## 検証結果

800×600の同一画面から外枠を含む領域を切り出し、8bit RGBのRMSEを測ったよ。PopupMenuは8.8676、PopupPanelは9.5365で、上限10を満たしたよ。
