# YuruttoWebsiteExporter

固定したGodot Web描画を保ちながら、文字と入力だけを意味のあるHTMLへ重ねるWeb exporter実験実装。
GodotだけでWebサイトを完結。軽量に書き出し、文字は実HTMLなので検索結果にも出ます。
Lightweight, SEO-ready web export.

## 特徴

- `Label`、`Button`、`LinkButton`の文字をDOMへ同期
- metadataなしの`LineEdit`と`TextEdit`をBrowser標準入力へ接続
- TabBar、ItemList、Tree、FoldableContainer、ProgressBar、MenuBarの文字をDOMへ同期
- IME、focus、選択範囲、Theme変更、回転、物理移動へ追従
- 2D描画、物理、Shader、Button背景をGodot Canvasへ維持
- `LinkButton`を`a`、`Button`を`button`として出力
- ObjectID由来の安定したDOM ID
- WebAssemblyとJavaScriptのBrotli事前圧縮
- Adaptive CanvasによるBrowser全体表示
- Scene別title、description、OGP、URL、sitemapの静的生成
- Hash routing既定、History APIとnginx fallback対応
- Theme fontと同じpathの`.woff2`を使うWeb font対応
- 指定frameを縦横比維持の1200×630で保存するOGP Auto
- 3Dを含むprojectの書き出し拒否

## 構成

- `build/`: Godot source差分、runtime build、Web書き出し、圧縮、配信処理
- `examples/`: 文字機能ラボと2D物理ゲーム
- `tests/`: Godot headless検査とPlaywright Browser実測
- `ログ/`: 設計、実装計画、公式資料の調査結果

## Web書き出し

Godot 4.7.1を使用。アドオンをprojectへ入れて有効化後、`プロジェクト > エクスポート > 追加 > ゆるっとWebサイト`を選び、エクスポート。Godot公式WebテンプレートとNode.jsは不要。

```sh
mkdir -p /path/to/project/addons
cp -R addons/yurutto_website_exporter /path/to/project/addons/
```

`ゆるっとWebサイト`は対応Godotから生成済みのruntimeをアドオンへ内蔵。Godot公式Webテンプレートの導入、標準Web preset、custom template指定は不要。現行配布物はGodot 4.7.1-stableの固定commit専用。

成果物にはScene別HTML、site controller、sitemap、robots、nginx設定例、Brotli圧縮、各licenseを生成。CanvasはBrowser全域へ追従。

配布runtimeの生成にはDockerを使用。Godot source、Emscripten、SCons、Node.js、build optionをlockし、由来とhashを`runtime.json`へ保存。Host側のGodot templateやNode.jsは不使用。

```sh
sh build/build_distribution.sh
```

Godot版を上げる場合は`build/source.lock`、patch、overlayを更新し、この一括buildと全回帰の合格後にtemplateと`runtime.json`を配布。GitHub Actionsの`Build distribution runtime`からも同じ入口を実行可能。

Site情報は`res://yuruttoweb-site.json`へ記述。Sceneを表すkeyへscene resource、URI、title、descriptionを対応付け。実行時は一意なscene resource pathで照合するため、root Node名の変更に影響されない構成。Export設定側にはbase URL、locale、favicon、OGP画像、routing、Web fontを用意。

OGP画像は一枚の指定からOpen GraphとTwitter Cardへ展開。`OGP Frame`で撮影frameを指定し、`OGP Auto`でEditor上の保存済みSceneを実行。元画面の縦横比を保って中央切り抜きし、`res://web/ogp.png`へ1200×630 PNGとして保存。

Themeで`res://fonts/Title.otf`を使う場合、`res://fonts/Title.woff2`があれば同じfontとしてDOMへ適用。`YuruttoWeb > Font > Matching Webfont`は既定ON。対応するWeb fontがない場合もDOM表示を維持し、Browser標準`sans-serif`を使用。Web fontはproject由来の外部assetであり、ON、OFF、fileなしのいずれもJS、WASM、各Brotliは同一。WOFF2は内部圧縮済みのため追加の`.woff2.br`は生成しない。

`YuruttoWeb > Font > Avoid Canvas Theme Font`は既定ON。再現できない文字装飾をwarning後にBrowser標準表示へ置換。OFFでは該当文字だけをGodot標準Canvas表示へ退避。背景、icon、focus枠、pointer処理は設定に関係なくCanvasへ維持。

Routing既定はserver設定不要のHash。SEOと`/about/`直リンクにはHistoryを選び、成果物の`nginx-yuruttoweb.conf.example`を使用。base URLに`/site/`のような公開pathがある場合も、同設定へ内部rewriteを自動生成。

```sh
docker run --rm -p 8080:8080 \
  -v "$PWD/tmp/omochi-game/site:/usr/share/nginx/html:ro" \
  -v "$PWD/tmp/omochi-game/site/nginx-yuruttoweb.conf.example:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine
```

別のstatic originを前段nginxから配信する場合は`nginx-yuruttoweb-proxy.conf.example`を使用。History APIのfallbackだけでなく、既知routeごとの静的metadataを生成する構成。

## 対象範囲

現行配布物の対応版はGodot 4.7.1-stableの固定commit。異なるGodot版やcommitはExport前に拒否。新しいreleaseは固定build環境と一括回帰の合格後、その版専用runtimeを持つaddonとして配布。

2D Web作品向け。3Dと`RichTextLabel`のBBCodeは対象外。対応する`.woff2`がないTheme fontはBrowser標準fontでDOM表示。

`examples/aa_invaders`は390×844向けのAA固定画面シューティング。顔文字自機、5行8列の独自AA編隊、画面Button、反転下降、敵弾、損耗防壁、3 life、wave更新を含む実装例。

Web font検査で使うLINE Seed JPはrepositoryへ含めず、Google Fonts CDNから取得。`tmp/fonts/`へTTFを保存し、WOFF2は`fonttools`で生成。Fontを使うtestは実行時に自動取得するため、通常は手動実行不要。第二引数を渡すとそのdirectoryへも配置する。

```sh
node build/fetch_webfont.cjs
```

Browser実測testはplaywright-core 1.56.0が持つChromium 1194で固定。実行pathは`tests/browser.cjs`が導入済みregistryから解決するため、test側に固定pathを書かない。Chromium版を上げる場合は全Browser実測testの再合格を条件とする。

```sh
npm --prefix tmp/playwright install playwright-core@1.56.0
node tmp/playwright/node_modules/playwright-core/cli.js install chromium
```

## ライセンス

project codeは権利留保。
内蔵runtimeはGodot Engine (MIT) 由来。license本文は`LICENSES/`を正本とし、配布templateと書き出した成果物へ`GODOT_LICENSE.txt`と`GODOT_COPYRIGHT.txt`として同梱。
project内の`.woff2`を公開する場合、そのfontに対応するlicense通知はproject側で同梱。
