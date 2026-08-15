# ゆるっとWeb

Godot 4.7.1用の独立Webエクスポーター。

1. このdirectoryをprojectの`addons/gdweb_site`へ配置。
2. `プロジェクト > プロジェクト設定 > プラグイン`で「ゆるっとWeb」を有効化。
3. `プロジェクト > エクスポート > 追加 > ゆるっとWeb`を選択。
4. 出力先を`.html`にしてエクスポート。

専用Web runtimeを内蔵。Godot公式Webテンプレートは不要。site生成とBrotli圧縮にNode.jsを使用。
