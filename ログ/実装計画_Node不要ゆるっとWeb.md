# Node不要ゆるっとWeb 実装計画

## 目的

Godot 4.7.1-stableの固定commitとこのアドオンがあれば、検査、PCK、テンプレート、SEO、route、Web font、Brotli配信物まで生成できるExportプラットフォーム。

## 構成

- `platform.gd`：Export設定、固定runtime検証、PCK生成、成果物統合。
- `project_check.gd`：文字scene、script、binary resourceの2D境界検査。
- `site_builder.gd`：設定、SEO HTML、route、asset、Web font、manifest生成。
- `site_runtime.js`：scene resource pathとBrowser URL・headの同期。
- `nginx-yweb.conf`：History fallback、MIME、Brotli選択。
- `nginx-yweb-proxy.conf`：既存origin向けHistory fallback例。
- `templates/yweb.zip`：manifest対応runtimeと事前圧縮`.br`。

## Export設定

Node.jsのpath設定なし。Site、route、font、OGPの各設定だけを表示。Godot 4.7.1、main scene、runtime hashを実行前に検証。

## Project検査

- Node3D、3D resource、model file、3D shader表現を拒否。
- `.scn`と`.res`は`ResourceLoader`で実体を再帰走査。
- C#とGDExtensionを明示拒否。
- 2D scene、Texture2D、ShaderMaterialを許可。

## Site生成

- `yweb-site.json`のscene key、scene path、URI、title、概要を検証。
- Hashを既定、Historyを選択可能。
- base URLの公開pathをnginx内部rewriteへ反映。
- canonical、description、robots、OGP、Twitter、JSON-LD、favicon、sitemapを生成。
- scene切替時にtitle、URL、metadata、style、scriptを同期。
- 同path・同basenameのWOFF2をTheme fontへ対応付け。
- Browser同期scriptはHTML末尾へ直接埋込。
- local assetはproject内だけを複製。隣接する`.br`も存在時だけ複製。

## 圧縮

- JavaScriptとWebAssemblyの固定runtimeへ事前生成Brotliを同梱。
- rawと`.br`のbyte数・SHA-256を`yweb-compression.json`へ記録。
- nginxは`Accept-Encoding: br`のときだけ`.br`を配信。
- project固有JavaScriptはraw配信を許可し、隣接`.br`を任意利用。

## テスト

- Node.jsを検出できないPATHでもGodot Editor Export成功。
- addon内のNode設定、外部process、CJS参照0件。
- 2D許可、text 3D、binary Node3D、Mesh、Curve3D、GDExtension拒否。
- HashとHistoryの往復、scene event、script一回実行。
- OGP、favicon、Web font、SEO、sitemap、robots。
- runtime rawと`.br`の対応、hash、Brotli配信とidentity配信。
- fresh projectへaddonだけを配置した実ExportとBrowser起動。
- license完全一致、残留listener 0件。

## 完了条件

- Godot 4.7.1-stableとaddonがあればExportが通る。
- 利用者環境のNode.js、公式Export template、build directoryを参照しない。
- 固定runtimeのJavaScriptとWebAssemblyがBrotli配信可能。
- 既存のDOM文字、フォーム、SEO、route、OGP、2D Canvas境界を維持。
