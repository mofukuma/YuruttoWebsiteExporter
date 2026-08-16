# 配布runtimeビルドの調査

## 結論

ゆるっとWebのJavaScriptとWebAssemblyは、Godot Web Export templateを独自source差分とbuild optionで生成した成果物。addon利用時は内蔵runtimeだけで完結するが、addon配布物の作成時はGodot sourceとEmscriptenによるbuildが必須。

公式手順もWeb templateをGodot sourceからSConsとEmscriptenで生成し、`godot.web.template_release.wasm32.zip`として出力する構成。[Godot: Compiling for the Web](https://docs.godotengine.org/en/stable/engine_details/development/compiling/compiling_for_web.html)

公式のExport template packageはGodot versionごとの`version.txt`を持ち、version別directoryへ配置する設計。custom moduleや新しい版では独自template buildが想定される。[Godot: Introduction to the buildsystem](https://docs.godotengine.org/en/stable/engine_details/development/compiling/introduction_to_the_buildsystem.html)

## runtimeを変化させる入力

- Godot release、commit、source archive。
- yuruttoweb patchとoverlay source。
- SCons option。thread、3D、GDExtension、JavaScriptBridge、最適化など。
- Emscripten SDKとSCons。
- Brotli実装、品質、package順、timestamp。

上記を一つのmanifestへ記録し、Editor起動時にGodot version・commit・template hashを照合する必要あり。

## Web fontの境界

`matching_webfont`は同pathのWOFF2をprojectから公開directoryへ複製し、`@font-face`とfont mapをHTMLへ追加するExport設定。Godot engineのC++、JavaScript glue、WebAssemblyのcompile条件ではない。

WOFF2がある場合も、Godot側はControl配置、文字列計測、Canvas fallbackのためTextServerとTheme font情報を使用。Web fontなし専用runtimeからfont処理を外すことはできない。したがってruntime templateは一種類。Web font ON/OFFで変化するものは外部WOFF2、HTML、site JSON、全転送量だけ。

WOFF2は形式内部でBrotli圧縮済み。HTTPの`.br`を重ねず、そのまま長期cache配信する構成が最小。

## 配布build環境

- Linux amd64のDocker image digestを固定。
- Node.js、SCons、Godot、Emscriptenをversionとcommitで固定。
- SCons optionを独立fileへ集約。
- `SOURCE_DATE_EPOCH`、UTC、ZIP entry順、mtimeを固定。
- template raw、Brotli、license、全入力hashをruntime manifestへ保存。
- Docker外のaddon利用者はbuild toolchain不要。

## version更新

Godot版を更新するときはsource lock、patch、overlay、Emscripten、runtime optionを一組で更新。配布build、3D境界、DOM、IME、Browser、速度の全回帰後にruntime manifestとtemplateを配布。
