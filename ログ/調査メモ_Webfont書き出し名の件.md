# Web font書き出し名の件

## 対象

DOM初期化時のWeb font URLが`undefined.font.woff2`となり、HTTP 404で失敗する状態。

## 実測

- 出力HTML: `index.html`
- 出力font: `index.font.woff2`
- CSSが生成したURL: `undefined.font.woff2`
- HTTP応答: 404
- `GodotConfig.executable`: DOM初期化の実行環境から参照不可

## 根拠

- GodotのWeb書き出しは`$GODOT_CONFIG`をHTML shellの置換値とし、その`executable`をEngine初期化へ渡す。
  - https://docs.godotengine.org/en/latest/tutorials/platform/web/customizing_html5_shell.html
- EngineConfigの`executable`はWasmの拡張子を除いた名であり、Engineの起動設定。library内の任意時点で公開globalとして使う契約ではない。
  - https://docs.godotengine.org/en/latest/tutorials/platform/web/html5_shell_classref.html
- GodotのWeb書き出しは初期出力名と同名の関連fileを前提とする。
  - https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html

## 方針

現在HTMLのfile名から拡張子を除き、Godot書き出しの同名規則で`.font.woff2`を組み立てる。Engine内部設定の参照は使用しない。
