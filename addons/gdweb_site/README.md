# ゆるっとWeb

Godot 4.7.1-stable固定commit用の独立Webエクスポーター。

1. このdirectoryをprojectの`addons/gdweb_site`へ配置。
2. `プロジェクト > プロジェクト設定 > プラグイン`で「ゆるっとWeb」を有効化。
3. `プロジェクト > エクスポート > 追加 > ゆるっとWeb`を選択。
4. 出力先を`.html`にしてエクスポート。

専用Web runtimeとBrotliを内蔵。利用時にGodot公式Webテンプレート、Node.js、Dockerは不要。異なるGodot版はExport前に拒否。
