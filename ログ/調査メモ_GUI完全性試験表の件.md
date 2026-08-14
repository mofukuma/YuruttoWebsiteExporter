# 調査メモ GUI完全性試験表の件

Godot 4.7.1のGUI登録全件を対象にした、DOM/CSS変換の完了判定表。
CSS自動配置を使わず、本家Godotの計算結果を正本とする。
調査日: 2026-08-12

## 結論

完全に実証済みのclassはまだ0件。

- 実証済: 0件
- 未実証: 45件
- 排除: 33件
- 登録照合: 78件

高価値GUI群には最小縦切りの部分証拠あり。親子平行移動・回転・0.5/2倍scale、native操作、IME確定、Unicode選択、値、exact Container 12型の2子配置、font色・size、RTL、z-index、安定時DOM無変更、自動HTML生成を確認。ただし、負scale、Theme全属性、class固有の全操作まで通っていないため未実証。

## 所有区分

GUI登録78件を描画要素の所有関係で固定。抽象型とResourceも派生先の契約として残す。

| 区分 | 対象 |
|---|---|
| 直接DOM | `Control`、`Button`、`Label`、`HScrollBar`、`VScrollBar`、`ProgressBar`、`HSlider`、`VSlider`、`CheckBox`、`CheckButton`、`LinkButton`、`Panel`、`TextureRect`、`ColorRect`、`NinePatchRect`、`ReferenceRect`、`TabBar`、`HSeparator`、`VSeparator`、`TextureButton`、`TextureProgressBar`、`ItemList`、`LineEdit`、`VideoStreamPlayer`、`TextEdit`、`CodeEdit`、`Tree`、`MenuBar`、`MenuButton`、`OptionButton`、`SpinBox`、`ColorPicker`、`ColorPickerButton`、`RichTextLabel`、`VirtualJoystick` |
| 配置DOM | `Container`、`AspectRatioContainer`、`BoxContainer`、`HBoxContainer`、`VBoxContainer`、`GridContainer`、`CenterContainer`、`PanelContainer`、`FlowContainer`、`HFlowContainer`、`VFlowContainer`、`MarginContainer`、`ScrollContainer` |
| 複合DOM | `Popup`、`PopupPanel`、`TabContainer`、`AcceptDialog`、`ConfirmationDialog`、`FileDialog`、`PopupMenu`、`SubViewportContainer`、`SplitContainer`、`HSplitContainer`、`VSplitContainer`、`GraphElement`、`GraphNode`、`GraphFrame`、`GraphEdit`、`FoldableContainer` |
| 内部状態 | `BaseButton`、`Range`、`ScrollBar`、`Slider`、`ButtonGroup`、`Separator`、`VideoStreamPlayback`、`VideoStream`、`SyntaxHighlighter`、`CodeHighlighter`、`TreeItem`、`RichTextEffect`、`CharFXTransform`、`FoldableGroup` |

全ControlはGodot階層どおりの透明wrapperを持つ。位置は親相対`Transform2D`。Label、Button文字、入力、選択肢などSEO・入力意味だけDOMが所有。Button枠、Panel、Theme、scrollbar、list、clipなどの表示はGodot Canvas 2Dが所有。複合DOMは意味要素と操作だけを戻し、chromeを描かない。内部状態は単独DOMを作らず、所有Controlの状態と操作で比較する。

Themeは同じControl treeへ3種を実行時適用。font size/color、`StyleBoxFlat`の背景、四辺border、四隅radius、四辺content margin、shadow、Container separation/marginsをGodot Canvas命令で描く。iconとtextureもCanvas画像経路。DOMは文字色・寸法だけを同期し、chromeをCSSで再描画しない。未対応StyleBox派生は値の警告と決定的fallback。

## 固定するDOMモデル

Godotが配置を計算。browserは配置を再計算しない。

```text
viewport root
└─ Control DOM: position:absolute; left/top=0; width/height=Godot size
   transform = Godot parent-relative Transform2D
   └─ child Control DOM: left/top=0; width/height=Godot size
      transform = Godot parent-relative Transform2D
```

固定規則。

- DOM階層をSceneTreeのControl親子関係と一致
- 各要素の位置はGodotの親相対`Transform2D`を`matrix(a,b,c,d,e,f)`として同期
- 寸法はGodotのlocal矩形から`width`、`height`だけを同期。`left`、`top`は常に0
- `transform-origin: 0 0`
- 全体変換を子へ再設定しない。親子CSS transformによる合成だけを使用
- viewport rootだけでGodot座標からCSS pxへ拡縮
- `display:flex`、`display:grid`、table layout、通常flow、intrinsic sizeによる自動配置を不使用
- browserの文字layoutとrasterは、Godotが決めた固定矩形の内部だけ
- browserの文字測定値を初期版のGodot配置へ還流しない
- `clip_contents`を`overflow`または`clip-path`へ同期
- z順をGodotの描画順とz値から同期
- RTLは文字方向と意味へ同期。配置矩形はGodotの計算結果を維持
- DOM要素のidentityを先行HTMLから実行中まで維持

## 判定記号

| 記号 | 意味 |
|---|---|
| `○` | 本家値比較、Playwright操作、accessibility確認まで合格 |
| `△` | 最小経路だけ実証。class合格には不足 |
| `×` | 必須だが未実証 |
| `—` | class責務外 |
| `排` | 限定runtimeから物理排除 |

class状態は次の三択。

- `実証済`: 適用される全項目が`○`
- `未実証`: `×`または`△`が一つ以上
- `排除`: ClassDB、link成果物、export許可表から不在

## 試験軸

| 軸 | 必須確認 |
|---|---|
| P 配置 | local矩形、親子transform、pivot、回転、負scale、viewport拡縮、丸め |
| T 文字 | Unicode、改行、wrap、ellipsis、font、字間、行間、raster |
| S 状態 | visible、disabled、値、選択状態、opacity、実行時更新、再接続 |
| E native event | pointer、keyboard、change、click、signal一回化、伝播、mouse filter |
| F focus/Tab | Tab順、focus neighbor、focus復元、非表示・無効時の移動 |
| I IME | composition開始・更新・確定・取消、確定前signal抑止 |
| R selection | caret、範囲、copy、paste、undo、password、結合文字 |
| C clip/z | clip、scroll、重なり、stacking context、DOM順、hit test |
| H theme/RTL | Theme継承、override、StyleBox、font、locale、RTL |
| O SEO先行HTML | semantic要素、安定ID、初期本文、同一要素接続、重複なし |

## 全class検証matrix

`固有試験`は共通軸に加える最小のclass別条件。

| # | Class | 状態 | P | T | S | E | F | I | R | C | H | O | 固有試験 |
|---:|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `Control` | 未実証 | △ | — | × | △ | △ | — | — | △ | × | △ | nested local変換、anchor、offset、pivot、mouse_filter |
| 2 | `BaseButton` | 未実証 | × | × | △ | △ | △ | — | — | × | × | × | 抽象契約を全Button派生で共通確認 |
| 3 | `Button` | 未実証 | △ | △ | △ | ○ | △ | — | — | △ | △ | △ | click、Enter、Space、disabled、toggle、shortcut |
| 4 | `Label` | 未実証 | △ | △ | △ | — | — | — | △ | △ | △ | △ | wrap、ellipsis、selection、可読順 |
| 5 | `Range` | 未実証 | — | — | △ | △ | △ | — | — | — | — | — | min/max/step/ratio/shareを派生classで確認 |
| 6 | `ScrollBar` | 未実証 | × | — | × | × | × | — | — | × | × | × | 抽象契約、drag、wheel、page、方向 |
| 7 | `HScrollBar` | 未実証 | × | — | × | × | × | — | — | × | × | × | 横scroll、RTL、端値 |
| 8 | `VScrollBar` | 未実証 | × | — | × | × | × | — | — | × | × | × | 縦scroll、端値、入れ子scroll |
| 9 | `ProgressBar` | 未実証 | △ | △ | △ | — | — | — | — | × | × | × | value表示、比率、読み上げ値 |
| 10 | `Slider` | 未実証 | △ | — | △ | △ | △ | — | — | × | × | × | 抽象契約、drag、矢印、Home/End |
| 11 | `HSlider` | 未実証 | △ | — | △ | △ | △ | — | — | × | × | × | 横操作、RTL、tick、step |
| 12 | `VSlider` | 未実証 | △ | — | △ | △ | △ | — | — | × | × | × | 縦操作、tick、step |
| 13 | `Popup` | 未実証 | × | — | × | × | × | — | — | × | × | × | open/close、外側操作、focus復元 |
| 14 | `PopupPanel` | 未実証 | × | — | × | × | × | — | — | × | × | × | panel装飾、popup積層、clip |
| 15 | `CheckBox` | 未実証 | △ | △ | △ | △ | △ | — | — | × | × | × | native checkbox、label、Space、checked |
| 16 | `CheckButton` | 未実証 | △ | △ | △ | △ | △ | — | — | × | × | × | switch意味、Space、pressed |
| 17 | `LinkButton` | 未実証 | △ | △ | △ | △ | △ | — | — | × | × | × | native link、href方針、Enter、訪問 |
| 18 | `Panel` | 未実証 | △ | — | △ | — | — | — | — | △ | △ | △ | StyleBox、透過、子の重なり |
| 19 | `ButtonGroup` | 未実証 | — | — | △ | △ | — | — | — | — | — | — | DOMを持たずradio排他とsignalだけ同期 |
| 20 | `Container` | 未実証 | ○ | — | △ | — | — | — | — | △ | × | × | Godot計算済み子矩形のみ使用 |
| 21 | `TextureRect` | 未実証 | × | — | × | — | — | — | — | × | × | × | stretch、aspect、tile、用途別alt |
| 22 | `ColorRect` | 未実証 | △ | — | △ | — | — | — | — | △ | — | △ | 色、alpha、重なり |
| 23 | `NinePatchRect` | 未実証 | × | — | × | — | — | — | — | × | × | × | 9-slice境界、tile、corner保持 |
| 24 | `ReferenceRect` | 未実証 | × | — | × | — | — | — | — | × | × | × | editor/debug表示方針、export時状態 |
| 25 | `AspectRatioContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | × | × | Godot比率計算、丸め、stretch mode |
| 26 | `TabContainer` | 未実証 | × | × | × | × | × | — | — | × | × | × | tab/panel関係、選択、非表示page |
| 27 | `TabBar` | 未実証 | × | × | × | × | × | — | — | × | × | × | 矢印操作、overflow、reorder、RTL |
| 28 | `Separator` | 未実証 | × | — | × | — | — | — | — | × | × | × | 抽象契約、orientation |
| 29 | `HSeparator` | 未実証 | × | — | × | — | — | — | — | × | × | × | 横線、Theme厚さ |
| 30 | `VSeparator` | 未実証 | × | — | × | — | — | — | — | × | × | × | 縦線、Theme厚さ |
| 31 | `TextureButton` | 未実証 | × | — | × | × | × | — | — | × | × | × | alpha hit、各状態texture、native button意味 |
| 32 | `BoxContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | × | × | Godot子矩形、stretch、separation |
| 33 | `HBoxContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | △ | × | 横配置、RTL、余りと丸め |
| 34 | `VBoxContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | × | × | 縦配置、余りと丸め |
| 35 | `GridContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | △ | × | Godot列計算、spanなし、RTL |
| 36 | `CenterContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | × | × | 中央位置、top_left、奇数pixel |
| 37 | `ScrollContainer` | 未実証 | × | — | × | × | × | — | — | × | × | × | scroll位置同期、wheel、focus reveal、clip |
| 38 | `PanelContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | × | × | StyleBox余白とGodot子矩形 |
| 39 | `FlowContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | × | × | Godot折返し結果だけ同期 |
| 40 | `HFlowContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | △ | × | 横flow、行余り、RTL |
| 41 | `VFlowContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | × | × | 縦flow、列余り、RTL |
| 42 | `MarginContainer` | 未実証 | ○ | — | △ | — | — | — | — | △ | △ | × | Theme marginとGodot子矩形 |
| 43 | `TextureProgressBar` | 未実証 | × | — | × | — | — | — | — | × | × | × | fill mode、9-slice、読み上げ値 |
| 44 | `ItemList` | 未実証 | × | × | × | × | × | — | × | × | × | × | listbox意味、単一・複数選択、検索、scroll |
| 45 | `LineEdit` | 未実証 | △ | △ | △ | △ | △ | △ | △ | × | × | × | input identity、IME、caret、undo、password |
| 46 | `VideoStreamPlayer` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | video非対応。ClassDB不在を確認 |
| 47 | `VideoStreamPlayback` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | video非対応。ClassDB不在を確認 |
| 48 | `VideoStream` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | video非対応。ClassDB不在を確認 |
| 49 | `AcceptDialog` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 50 | `ConfirmationDialog` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 51 | `FileDialog` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 52 | `PopupMenu` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 53 | `Tree` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 54 | `TextEdit` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 55 | `CodeEdit` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 56 | `SyntaxHighlighter` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 57 | `CodeHighlighter` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 58 | `TreeItem` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 59 | `MenuBar` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 60 | `MenuButton` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 61 | `OptionButton` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 62 | `SpinBox` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 63 | `ColorPicker` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 64 | `ColorPickerButton` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 65 | `RichTextLabel` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 66 | `RichTextEffect` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 67 | `CharFXTransform` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 68 | `SubViewportContainer` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | viewport texture非対応も確認 |
| 69 | `SplitContainer` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 70 | `HSplitContainer` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 71 | `VSplitContainer` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 72 | `GraphElement` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 73 | `GraphNode` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 74 | `GraphFrame` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 75 | `GraphEdit` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 76 | `FoldableGroup` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 77 | `FoldableContainer` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |
| 78 | `VirtualJoystick` | 排除 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | 排 | advanced GUI gateを確認 |

## 高価値GUI群の最小実証

fixtureは`.tmp/gdweb/gui-proof/`。Playwright Chromium 145、`--disable-gpu`。

| 対象 | 確認値 |
|---|---|
| LineEdit | native `input`、IME確定前signal 0回、確定後`GUI_TEXT=日本😀` 1回 |
| Unicode selection | DOM UTF-16 `2..4`をGodot文字位置`2..3`へ変換 |
| CheckBox | native checkbox、checked、`toggled=true` |
| CheckButton | native checkbox + `role=switch`、checked、`toggled=true` |
| LinkButton | native `a`、`href`、Godot `pressed` |
| HSlider | native range、`10..90`、step 5、ArrowRightで25→30 |
| VSlider | `writing-mode:vertical-lr`と`direction:rtl`。Godotと同じ上側max |
| ProgressBar | Godot値30をnative progressの比率20/80と`aria-valuenow=30`へ反映 |
| Panel | default StyleBoxFlat背景を`rgba(26, 26, 26, 0.6)`へ反映 |
| ColorRect | Godot色とalphaを`rgba(51, 102, 204, 0.75)`へ反映 |
| Container群 | 全対象が`div`、`display`空、Godot親相対matrix。Flex/Grid不使用 |
| Tab順 | Input、Check、Switch、Link、Slider |
| 安定時DOM | 1秒間の追加0、削除0、属性変更0、Text node変更0 |

Containerの完全合格を保留する根拠。

- 限定runtimeの文字minimum sizeが0。VBoxとMargin配下Labelの高さも0
- browser文字測定値をGodotへ戻す契約なし
- Aspectの他stretch mode、Flowの複数行折返し、Gridの3列以上は未実証
- Panelは背景色だけ。border、corner、paddingは未実証

N10でexact 12型を各2子、親303×139で比較。Godot local矩形、DOM matrix、DOM順、minimum sizeが一致。HBox、Grid、HFlowのRTL、Marginの四辺差、Aspect 1.7も一致。黒背景PNGの正規化MAE `0.0000709071`。

## 共通試験fixture

各対応classを同じfixtureへ置く。

```text
root Control
├─ rotated parent Control
│  ├─ clipped parent Control
│  │  └─ 対象class
│  └─ z競合する兄弟Control
└─ focus順を検査する前後のnative要素
```

配置値をGodot側からJSON採取。DOMの`getBoundingClientRect()`、computed transform、hit位置と比較する。許容差はroot拡縮後1 CSS px未満。整数丸め規則はclass別に本家結果へ一致。

## 操作試験

Playwrightで実利用経路を操作。

- pointer、touch相当、keyboardを別々に実行
- `Tab`、`Shift+Tab`、focus neighborを確認
- `Enter`と`Space`をnative要素へ送信
- disabled、hidden、親削除、SceneTree再追加を確認
- signal回数と順序をGodot native版の記録と比較
- event bubbling、capture、mouse_filterの衝突を確認
- focus中に毎frame DOMを再生成しないことをMutationObserverで確認

## 文字、IME、selection試験

browserが受け持つのは固定矩形内の文字だけ。

- 日本語、英語、絵文字、結合文字、双方向文字
- font load前後、fallback、wrap、ellipsis
- composition開始、更新、確定、取消
- caretと選択範囲を保った外部値更新
- copy、paste、cut、undo、redo
- password値を先行HTMLとログへ出さない
- 選択文字とaccessibility treeの名前を確認

## clip、z、Theme、RTL試験

- 回転した親のclipはN08の製品runtimeで比較済み
- 負scale下のhit test
- 兄弟、親子、popupのz順
- CSS transformが作るstacking contextの影響
- ScrollContainerのclipとscroll位置
- Theme owner、継承、個別override、実行時差替え
- StyleBoxのborder、corner、padding
- RTLで文字方向だけをbrowserへ渡し、配置はGodot値を維持

## SEO先行HTML試験

書き出し時HTMLとruntime DOMは同一要素。

- scene由来の安定IDで接続
- 初期HTMLにLabel、Button、LinkButton、画像の意味を出力
- 起動後に要素を複製せずpropertyとeventだけ接続
- hydration前後でDOM順、本文、URL、accessible nameを維持
- Canvasを`aria-hidden=true`
- 非表示sceneを検索向けに偽装しない
- 入力値とpasswordを先行HTMLへ出力しない

## 排除試験

`排除`は未実装の別名にしない。三層で不在を確認。

1. `ClassDB.class_exists()`がfalse
2. 対象sourceとsymbolがWasmへlinkされない
3. `.tscn`またはGDScript参照をexport検査で失敗

高度GUIを登録する専用buildでは、GraphEditとColorPickerの内部shader補助を除外。Shader classを再登録せず、DOM/CSS固有経路へ置換する。SubViewportContainerはGPU textureを使わず、2D Canvasだけを子表示面とする。

## 登録件数の照合

根拠は`.tmp/godot-source/scene/register_scene_types.cpp`のGUI登録範囲。

| 区分 | 件数 |
|---|---:|
| `#ifndef ADVANCED_GUI_DISABLED`より前 | 48 |
| advanced GUI block | 30 |
| 登録総数 | 78 |
| 直接DOM | 35 |
| 配置DOM | 13 |
| 複合DOM | 16 |
| 内部状態 | 14 |
| 状態総数 | 35 + 13 + 16 + 14 = 78 |

部分証拠はmatrixの`△`。全軸合格は0件。

CIで登録macroからclass名を抽出し、この表と完全一致を検査。追加、削除、条件移動のどれも件数だけでなく名前差分で失敗させる。

## 完了条件

- GUI登録78件の適用セルが全て`○`
- CSS自動配置の使用が生成CSSと実行時styleに0件
- nested local矩形とlocal transformの本家値比較へ合格
- 本家native版とのsignal、focus、選択、scroll状態比較へ合格
- SEO先行HTMLとruntime要素のidentity維持へ合格

一つでも未達ならGUI完全対応と呼ばない。
