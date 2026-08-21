# ゆるっとWeb独立エクスポーター実装計画

## 目的

Godot 4.7.1のExport画面へ「ゆるっとWeb」を追加し、専用runtimeとWebサイト生成機能を一つのアドオンで提供。

## 設計

- `EditorExportPlatformExtension`を使用。
- `EditorPlugin.add_export_platform()`で登録。
- 公式Webプラットフォーム、公式テンプレートdirectory、custom template設定へ非依存。
- 対応版をmanifestで固定したruntime ZIPをアドオンへ同梱。
- runtime ZIPのSHA-256不一致をExport前に拒否。
- PCK生成だけGodot共通の`save_pack()`を使用。
- 3DをExport前に拒否し、2DとControlを標準PCKへ収録。
- GDExtensionをExport前と共有library生成後に拒否。
- Canvasはブラウザ全域追従を固定。
- JavaScriptとWASMのBrotli生成を必須化。

## Export設定

- Site機能の有効化
- Scene別設定JSON
- 公開base URL
- title、description、locale、favicon
- HashまたはHistory route
- 同名Web font探索
- Canvas Theme font回避
- OGP画像、代替文、撮影frame、Auto撮影
- 起動時Canvas focus

main sceneを設定してあれば、あとは初期値のまま書き出せる構成。Site設定が無効でもDOM文字設定とBrotliを維持。

## 書き出し処理

1. 対象projectの3D型、3D asset、spatial shaderを検査。
2. 出力directoryと`.html`拡張子を検査。
3. `save_pack()`で同名PCKを生成。
4. 内蔵runtime ZIPを展開し、`godot.*`を出力名へ変更。
5. PCKとWASMのbyte数をHTML runtime設定へ設定。
6. Canvas resize policyをAdaptive相当の`2`へ固定。
7. site生成処理でmetadata、route、asset、OGP、Web fontを反映。
8. JavaScriptとWASMへBrotliを生成。
9. Godotとproject固有licenseを成果物へ配置。

途中失敗は非0の`Error`とExport messageで停止。部分成功を完了扱いにしない設計。

## ファイル構成

- `addons/yweb_site/platform.gd`：独立Exportプラットフォーム。
- `addons/yweb_site/templates/yweb.zip`：専用runtime。
- `addons/yweb_site/site_builder.gd`：site生成と圧縮manifest。
- `addons/yweb_site/project_check.gd`：文字形式とbinary resourceの3D検査。
- `addons/yweb_site/icon.svg`：Export一覧用ロゴ。

## CLI連携

- presetは「ゆるっとWeb」をplatformとして保持。
- 標準Web固有のtemplate、thread、PWA設定を保持しない構成。
- CLIはアドオン導入後に`--export-release <preset名>`を実行。
- 既存のSite設定名を維持し、静的site生成処理を共用。

## 検証

- アドオン単体にruntimeと必要scriptが揃うこと。
- runtime ZIPのhashと必須entry。
- Export画面へ「ゆるっとWeb」が一件だけ登録されること。
- 公式Webテンプレートdirectoryが空でも書き出せること。
- 標準Web presetとcustom template設定が不要なこと。
- `.html`、`.js`、`.wasm`、`.pck`、worklet、license、`.br`を生成すること。
- HTML内の実行名、PCK/WASM byte数、Adaptive値が正しいこと。
- 3D fixture拒否、2D fixture許可。
- Playwrightで起動、WebGL2、DOM文字、IME入力、route、Brotli配信を確認。
- Export終了後のserverとGodot processが0件。
