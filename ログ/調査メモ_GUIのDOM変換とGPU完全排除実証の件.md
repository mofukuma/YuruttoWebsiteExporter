# 調査メモ GUIのDOM変換とGPU完全排除実証の件

GodotのGUIをCanvas 2Dへ描かず、DOMとCSSへ直接変換できるかの確認。
Shader、WebGL、OpenGL、WebGPUを限定runtimeから外せるかの実ビルド試験。
調査日: 2026-08-12

## 結論

最小縦切りは成立。

- Node2Dの矩形はCanvas 2D
- Control、Label、ButtonはDOM/CSS
- DOMのButton clickとTab+Enterから本家GDScriptの`pressed` signalへ到達
- Canvas contextは`2d`だけ
- `--disable-gpu`付きChromiumでも動作
- `Shader` class、shader resource形式、公開shader APIはruntimeから不在
- WebGL用JS、GL patch、renderer_rd、RenderingDevice本体、SPIR-V、shader parser・compilerをビルド対象外
- `gdweb_2d=yes`と`opengl3=yes`または`vulkan=yes`の併用はbuild error

採用GUIの基本経路は成立。実OSのIME、LineEditのpassword・undo、各Containerの複数子は未実証。Themeのborder・corner・padding等は警告と固定fallbackへ分類。VBoxContainerとLabelは本家TextServerFallbackで最小高さを実証。先行HTMLとの同一要素接続と専用書き出し器の自動生成も実証。最終実証版WasmはBrotli後2,501,444 B。初期表示速度は最終hashの別紙を正本とする。

## GUIをCanvasから分ける理由

Canvasへ描いたButtonは画素。ブラウザーから見るとButtonではない。focus、Tab、Space・Enter操作、disabled、選択、検索、読み上げ名、IMEを独自実装する必要が生じる。

[HTML Standardのbutton](https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element)はactivation behaviorを持つ。[HTML Standardのinteraction](https://html.spec.whatwg.org/multipage/interaction.html#activation)は、利用者がkeyboard、voice、mouseなどでactivation behaviorを起動できるようuser agentへ求める。[WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/#rule3)も、可能ならHTMLのnative技法を優先する規則。

したがってGUI変換の入力はCanvas命令ではなくSceneTreeのControl。対応例。

| Godot | HTML | browserへ任せる意味 |
|---|---|---|
| Label | `span`、`p` | 選択、検索、文章 |
| Button | `button type="button"` | activation、focus、keyboard、disabled |
| LinkButton | `a href` | link操作、URL、訪問 |
| LineEdit | `input` | 入力、選択、IME |
| TextEdit | 初期版では排除 | 将来候補は`textarea`。高度GUI無効時にClassDB不在 |
| CheckBox | `input type="checkbox"` + `label` | checked、名前、keyboard |
| Panel、ColorRect | `div` | 構造とCSS装飾 |
| TextureRect | `img`またはCSS背景 | 代替文の有無を用途別に固定 |

`div role="button"`への一律変換は不採用。native buttonで得られるkeyboard behaviorまで手書きする必要があるため。

## CSS変換の境界

[CSS Transforms Level 1](https://www.w3.org/TR/css-transforms-1/)は2D変換を3×2行列で定義。Godotの全体`Transform2D`を次へ対応可能。

```text
x.x, x.y, y.x, y.y, origin.x, origin.y
  ↓
matrix(a, b, c, d, e, f)
```

全要素を`transform-origin: 0 0`。Control親子をDOM親子へ対応し、本家が計算した親Control相対の変換と寸法をabsolute配置へ反映。Flexbox、Grid、通常flow、intrinsic sizeによる位置決定なし。

[CSS Positioned Layout](https://www.w3.org/TR/css-position-3/#absolute-positioning-containing-block)では、absolute要素のcontaining blockを祖先から決定。[CSS Transforms](https://www.w3.org/TR/css-transforms-1/#transform-rendering)ではtransformが子孫のcontaining blockとstacking contextを作る。Control親子とDOM親子を一致させ、各子へ親相対行列だけを渡す方式が仕様上の合成単位と一致。

ただし、CSS `transform`はlayout結果そのものを置換しない。`transform`指定はstacking contextと子孫のcontaining blockも作る。z順、clip、fixed要素をGodotと同じ意味にする試験が必要。GPU層化も仕様保証ではない。

ContainerからFlexbox・Gridへの直接変換は不採用。GodotとCSSには最小寸法、余白配分、丸め、RTL、font測定の差がある。位置と寸法はGodotだけが決定。ブラウザーは渡されたbox内の文字glyph、改行、選択、検索、読み上げ、IMEだけを所有。

### 文字metricsとContainer実証

TextServerなしの限定buildでは、VBoxContainer内Labelの最小高さは0 px。これではGodotが決める配置に文字の高さが入らない。

`TextServerFallback`、FreeType、MSDFGenだけを追加した同一source差分をbuild。Playwright Chromium 145、`--disable-gpu`で同一シーンを実行。

| 観測 | TextServerなし | fallbackあり |
|---|---:|---:|
| Label最小高さ | 0 px | 15 px |
| Label実配置高さ | 0 px | 15 px |
| VBoxContainer最小高さ | 14 px | 29 px |
| DOM Label | `SPAN`、文字あり | `SPAN`、文字あり |
| DOM Label高さ | 0 px | 15 px |

文字内容は両方ともDOMの`SPAN`。Canvas文字描画へ戻さず、Godotがfont metricsでboxの高さを決め、DOM/CSSがその位置と寸法に従う境界が成立。

Wasmは11,970,757 Bから12,645,971 B、Brotli q11は2,263,186 Bから2,497,851 B。Brotli差分234,665 B、10.37%。配置の正しさに必要なため当面の製品候補。glyph rasterとMSDF生成を外したmetrics専用版は未実証。

検索対象の文章は書き出し時に静的HTMLへ先行生成し、Wasmが同じ要素へ接続する。[GoogleのJavaScript SEO資料](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=ja)では、初期HTMLに実内容がない場合、Googleが内容を見るにはJavaScript実行が必要。重要文章をWasm起動後だけに生成しない方針。

## 画面外GUIのブラウザー仕様

[CSS Containment Level 2](https://www.w3.org/TR/css-contain-2/#content-visibility)では、`content-visibility:auto`の対象が利用者に関係しない場合、user agentが内容をskip可能。layout、style、paint containmentが有効となり、できるだけlayout・rendering作業を避ける規定。on-screen判定にはviewport周辺のuser-agent定義marginも含む。

gdweb側でIntersectionObserverや座標比較を重ねない。ページや場面の区画rootへ次だけを指定し、画面外の判断をブラウザーへ渡す。

```css
.gdweb-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 720px;
}
```

注意点。

- `content-visibility:auto`は個々のControlではなく、十分な大きさの区画へ適用
- skipped中も検索、Tab、focusなどuser-agent機能から利用可能
- `contentvisibilityautostatechanged`を意味上必要なDOM更新の永久停止に使わない
- skipped subtreeの寸法を毎frame読む処理なし
- Canvas項目は本家`RendererCanvasCull`の既存選別だけ。gdweb独自可視判定なし
- Canvas bitmap外のclip、画面外Canvasのpaint・rasterはブラウザーへ委譲

## 入力とIME

[HTML Standardのsequential focus navigation](https://html.spec.whatwg.org/multipage/interaction.html#sequential-focus-navigation)がTab移動順を定義。gdweb独自のTabカーソルは作らず、native要素のDOM順、`tabindex`、disabled、hiddenへ変換。Godotのfocus neighborとDOM順が衝突する場合は書き出しエラーとし、ブラウザーのTab処理を横取りしない方針。

[UI Events](https://www.w3.org/TR/uievents/)は`beforeinput`、`input`、`compositionstart`、`compositionupdate`、`compositionend`を定義。`InputEvent.isComposing`も定義。KeyboardEventだけではIME状態を判定できない。

LineEdit変換の試験条件。

- focus中のDOM `value`をWasmから毎frame上書きしない
- `input`で現在値と選択範囲をGodotへ通知
- composition中は確定文字列としてsignalを出さない
- `compositionend`後に確定値を同期
- Godot側の外部更新はfocus、composition、selectionを壊さない時だけDOMへ反映
- 日本語IME、絵文字、結合文字、貼付け、undo、passwordを個別試験

Buttonの部分試験を実証済み。要素identityを保持したままclickを整数event列へ入れ、次frameにObjectIDを解決。本家`BaseButton`のpress/release状態機械へ通す。TabとEnter、disabled、toggle、ButtonGroup排他、`button_down/up`、GDScript `_pressed()`を確認。

LineEditはsynthetic compositionで確定前signal 0回、確定後`text_changed` 1回を確認。`日本😀`のDOM UTF-16選択`2..4`をGodot文字位置`2..3`へ変換。実OSの日本語IME候補操作は未実証。

## 限定Godotのソース境界

対象はGodot 4.7.1 stable、commit `a13da4feb8d8aefc283c3763d33a2f170a18d541`。同期先は`.tmp/godot-source/`。Emscripten 4.0.11。

専用option `gdweb_2d=yes`の役割。

- `opengl3`または`vulkan`が有効ならSConsを終了
- `GDWEB_2D_ENABLED`をC++へ定義
- WebGL機能検査をloaderから除外
- `library_godot_webgl2.js`とGL patchを除外
- Emscripten `$GL`依存、context lost処理を除外
- DisplayServerのrenderer名を`dummy`だけへ固定
- `renderer_rd`をSCsubから除外
- RenderingDevice、SPIR-V、shader parser、compiler、preprocessorをソース一覧から除外
- Shader、ShaderMaterial、CanvasItemMaterialとshader resource formatをclass一覧から除外
- RenderingServerとCanvasItemのshader method bindingを除外
- 共通viewportが要求する能力照会だけ、常に未対応を返す最小RenderingDevice実装

`opengl3=no`だけでは不十分。本家Web JavaScript側の起動前WebGL検査とGL libraryが残るため、C++、SCons、JavaScriptの三層で除外が必要。

## 物理除外試験で判明した依存

| 試験 | 結果 | 判断 |
|---|---|---|
| `renderer_rd`だけ除外 | SPIR-V reflect参照でlink失敗 | RenderingDevice一式も同時に除外 |
| RenderingDevice一式を除外 | 共通viewportとEngineから参照 | 能力照会だけの最小空実装 |
| Shader resourceを除外 | ColorPicker、GraphEdit、CPU粒子から参照 | 高度GUIと粒子を許可表から除外 |
| shader compiler一式を除外 | 最小Control、Label、Buttonでbuild成功 | 初期GUIにcompiler不要 |

依存を推測で残さず、link errorを根拠に最小境界を決定。

## 実ビルド

主要引数。

```sh
scons platform=web target=template_release \
  gdweb_2d=yes build_profile=gdweb.build \
  optimize=size_extra lto=none debug_symbols=no threads=no \
  opengl3=no vulkan=no javascript_eval=no dlink_enabled=no \
  disable_3d=yes disable_advanced_gui=yes \
  disable_physics_2d=yes disable_physics_3d=yes \
  disable_navigation_2d=yes disable_navigation_3d=yes disable_xr=yes \
  modules_enabled_by_default=no module_gdscript_enabled=yes \
  wasm_simd=no initial_memory=16
```

成果物。

| 対象 | raw | gzip -9 | Brotli q11 |
|---|---:|---:|---:|
| Wasm | 11,971,171 B | 3,334,833 B | 2,261,988 B |
| JavaScript | 193,844 B | 50,278 B | 44,365 B |

初期Canvas縦切りの非LTO版はWasm 13,447,165 B、Brotli 2,531,044 B。親子DOMとSEO接続を含む最新版は、shader・GPU系の物理除外によりBrotli後269,056 B減少。

文字metrics、RGBA画像、z-index、font同期を含む最終実証版はWasm 12,655,030 B、Brotli 2,501,444 B。安全なLink URI fallbackを含む生成JavaScriptは202,699 B、Brotli 46,305 B。fontは64,100 B。

## Chromium実行試験

Playwright Chromium 145、headless、`--disable-gpu`。Canvasの`getContext`を起動前にhookし、生成されたcontext種別を全記録。

確認値。

| 観測 | 結果 |
|---|---|
| context種別 | `2d`, `2d`だけ |
| Node2D矩形 | Canvas内の緑画素を確認 |
| 線・多角形・円 | Canvas内の赤線、青三角形、黄円の画素を確認 |
| RGBA画像 | `ImageTexture`を初回だけ`ImageData`へ登録し、桃色画素を確認 |
| 画面外Node2D矩形 | Canvas命令束に未収録、対象画素は透明 |
| DOM要素 | `div` 2件、Button 4件、Label 2件。合計8件 |
| 親子座標 | 親`8,6`と子`170,20`から表示座標`178,26`。誤差0px |
| ページ配置追従 | CanvasとDOMの共通wrapperを15px移動し、両方が再読取なしで`26→41px`へ追従 |
| Button CSS | `matrix(1, 0, 0, 1, 170, 20)` |
| Button activation | pointer clickとTab+Enterで`GDWEB_BUTTON`をGDScriptから出力 |
| Button契約 | disabled不発火、toggle、ButtonGroup排他、`button_down/up`、GDScript `_pressed()`を確認 |
| Label | `clicked in GDScript`へ更新 |
| Label選択 | 選択文字列`clicked in GDScript`を確認 |
| focus | activation後の`document.activeElement`は`BUTTON` |
| SEO先行HTML | Wasm遮断時も本文あり。起動後は同じ要素8件へ接続 |
| DOM安定性 | 安定1秒間の要素・Text node追加0、削除0、属性変更0 |
| clip | `false`を`overflow:visible`、`true`を`hidden`へ同期。親外の子をhit testから除外 |
| native GUI | LineEdit、CheckBox、CheckButton、LinkButton、HSlider、VSlider、ProgressBar |
| IMEと選択 | 確定前signal 0、確定後1。`日本😀`をGodotへ反映。選択`2..4`→`2..3` |
| Tab順 | Input、Check、Switch、Link、Slider |
| 値 | Slider 25→30、Progress `aria-valuenow=30` |
| CSS装飾 | Panel背景とColorRectの色・alpha |
| Container | 12種が`div`、`display`空、Godot親相対matrix。CSS Flex/Gridなし |
| Canvas accessibility | `aria-hidden=true` |
| Shader class | `ClassDB.class_exists("Shader") == false` |
| ShaderMaterial class | `ClassDB.class_exists("ShaderMaterial") == false` |
| CanvasItemMaterial class | `ClassDB.class_exists("CanvasItemMaterial") == false` |
| `.gdshader` loader | `No loader found`、戻り値null |
| shader server API | `RenderingServer.has_method("shader_create") == false` |
| shader item API | `CanvasItem.has_method("set_instance_shader_parameter") == false` |

生成JavaScriptに`webgl`、`webgl2`、`opengl`文字列なし。Wasm importは159件で、release minifyによりmodule名とfield名は短縮。import実体を提供する生成JavaScript側にWebGL/OpenGL関数なし。実行時hookでも2D以外のcontext要求なし。

Wasmの単純文字列走査では`shader`を55件検出。内訳は埋込み著作権一覧のrenderer_rdファイル名、RenderingServer基底interface、Dummy MaterialStorageの空実装、診断文。Shader class、loader、compiler実装、公開APIの存在とは区別が必要。基底interface名までゼロにするにはRenderingServer契約を広く分岐する追加試験が必要。

Wasmの`OpenGL`相当文字列は著作権一覧中の説明文1件だけ。生成JSと実行経路にはなし。

試験用PCKへglobal script cacheを収録し、起動時エラーを解消。画素検査もCanvas全体の一回取得へ集約。通常Editor、場面実行、書き出し、Chromium、GUI統合試験は終了code 0、ERROR・crash 0。

## 実証実装の限界

- Control探索は毎frameのSceneTree全走査
- 全propertyを毎frameでWasm境界へ送信。JS側の同値DOM書込は除去済みだが、dirty集合と一括転送なし
- 実行時ObjectID下位32bitを仮handleに使用
- DOM所有Controlをvisibility layer 0へ変更する試験方式
- ButtonのEnterとSpace、CheckBox・CheckButtonのSpace、LinkButtonのEnter、複数要素のTab順を実証済み。画面遷移後のfocus復元は未実証
- LineEditの実OS IME、password、undo、Theme全属性は未実証。font色・size、RTL、z-indexは実証済み
- 回転・負scale下のclipは未実証
- Control独自`_draw`の拒否処理なし
- 静的先行HTMLは専用書き出し器から自動生成し、node pathでruntime DOMへ接続済み。安定ID衝突の専用検査は未実証

製品実装は公開visibility layerを変更しない。書き出し時にDOM所有RIDを固定し、Canvas描画器の入口で除外。安定ID、差分bitset、一括Wasm境界を使用。

## 次の実証順

1. LineEditの実OS日本語IME、password、undo、画面遷移後のfocus復元
2. Controlの回転、負scale、pivot、回転下clip
3. Grid、Flow、Aspectの複数子、余り、丸め、RTL
4. 対応Theme属性の拡張。未対応値は処理経路付き警告を維持
5. 差分命令列とSceneTree全走査廃止
6. 安定ID衝突検査
7. RenderingServer基底に残るshader空interfaceの追加削減

各項目は本家native版との値比較、Playwright操作、accessibility snapshot、trace、成果物容量をそろえてから許可表へ追加。
