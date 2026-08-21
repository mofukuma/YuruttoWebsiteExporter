# ゆるっとWeb独立エクスポーター調査

## 目的

Godot 4.7.1のエクスポート画面へ「ゆるっとWeb」を独立した出力先として追加し、公式Webテンプレートの有無や変更から切り離すための調査。

## 公式の拡張点

- 外部エクスポート先の基底は`EditorExportPlatformExtension`。`EditorPlugin.add_export_platform()`で登録する仕様。
- プラットフォーム名、ロゴ、拡張子、機能、設定検査、書き出し処理をアドオン側で実装可能。
- `_export_project()`から`save_pack()`を呼び、Godot標準のexport filterとPCK生成処理を利用可能。
- Export presetの設定は`_get_export_options()`が返す辞書で定義可能。最低限`name`と`type`が必須。

出典：

- https://docs.godotengine.org/en/stable/classes/class_editorexportplatformextension.html
- https://docs.godotengine.org/en/stable/classes/class_editorplugin.html
- `tmp/godot-minimum-source/editor/export/editor_export_platform_extension.cpp`
- `tmp/godot-minimum-source/editor/plugins/editor_plugin.cpp`

## 公式Web書き出しの構成

Godot 4.7.1のWeb書き出しは次の処理で成立。

1. `save_pack()`で`<名前>.pck`を生成。
2. Web runtime ZIPを出力先へ展開し、`godot.*`を`<名前>.*`へ改名。
3. HTMLの`$GODOT_*`をruntime設定へ置換。
4. PCKとWASMのbyte数を`fileSizes`へ設定。
5. splash、icon、PWAを選択に応じて生成。

参照：

- `tmp/godot-minimum-source/platform/web/export/export_plugin.cpp`
- https://docs.godotengine.org/en/stable/classes/class_editorexportplatformweb.html

## テンプレート管理の判断

Godotのテンプレート管理画面は公式プラットフォーム用テンプレート群の導入手段。独自プラットフォームが公式Webテンプレートを探す必須仕様ではない。

ゆるっとWeb runtimeはGodot 4.7.1の固定source、patch、overlayから生成済み。公式Webテンプレートを後から改造すると、未導入、版違い、再ダウンロードによる置換の影響を受けるため不採用。

アドオンへ専用ZIPを同梱し、そのSHA-256を検査してから展開する方式を採用。公式テンプレートdirectoryを読み書きせず、標準Web presetも変更しない構成。

## 単体完結の境界

アドオンに次を保持。

- 固定4.7.1 Web runtime ZIP
- 独立プラットフォーム本体
- Web site、SEO、route、OGP、Web font、Brotli生成処理
- 3D混入検査
- Godot licenseと著作権通知

静的site生成はGDScriptで実行。Brotliは固定runtimeと一緒に同梱。リポジトリ外のbuild script、Node.js、Godot公式テンプレートは不要。

## 結論

`EditorExportPlugin`による標準Web拡張ではなく、`EditorExportPlatformExtension`による独立プラットフォームへ変更。表示名は「ゆるっとWeb」。アドオンを導入して有効化すればExport presetが増える構成。
