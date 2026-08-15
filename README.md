# gdweb

Godot 4.7.1の標準Web描画を保ちながら、文字と入力だけを意味のあるHTMLへ重ねるWeb exporter実験実装。

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

Godot 4.7.1とNode.jsを使用。アドオンをprojectへ入れて有効化後、`プロジェクト > エクスポート > 追加 > ゆるっとWeb`を選び、エクスポート。Node.jsはPATH、Homebrew、標準導入先から自動検出。

```sh
node build/install_site_addon.cjs examples/omochi_game
sh build/export_minimum.sh examples/omochi_game tmp/omochi-game/site/index.html
```

`ゆるっとWeb`は固定4.7.1 runtimeをアドオンへ内蔵。Godot公式Webテンプレートの導入、標準Web preset、custom template指定は不要。

成果物にはScene別HTML、site controller、sitemap、robots、nginx設定例、Brotli圧縮、各licenseを生成。CanvasはBrowser全域へ追従。

runtimeを再生成する開発時だけ、macOS、Xcode Command Line Tools、Git、curl、uv、SCons、Emscriptenを使用。

```sh
uv tool install scons
sh build/prepare_runtime.sh
```

Site情報は`res://gdweb-site.json`へ記述。Sceneを表すkeyへscene resource、URI、title、descriptionを対応付け。実行時は一意なscene resource pathで照合するため、root Node名の変更に影響されない構成。Export設定側にはbase URL、locale、favicon、OGP画像、routing、Web fontを用意。

OGP画像は一枚の指定からOpen GraphとTwitter Cardへ展開。`OGP Frame`で撮影frameを指定し、`OGP Auto`でEditor上の保存済みSceneを実行。元画面の縦横比を保って中央切り抜きし、`res://web/ogp.png`へ1200×630 PNGとして保存。

Themeで`res://fonts/Title.otf`を使う場合、`res://fonts/Title.woff2`があれば同じfontとしてDOMへ適用。`GDWeb > Font > Matching Webfont`は既定ON。対応するWeb fontがない場合もDOM表示を維持し、Browser標準`sans-serif`を使用。

`GDWeb > Font > Avoid Canvas Theme Font`は既定ON。再現できない文字装飾をwarning後にBrowser標準表示へ置換。OFFでは該当文字だけをGodot標準Canvas表示へ退避。背景、icon、focus枠、pointer処理は設定に関係なくCanvasへ維持。

Routing既定はserver設定不要のHash。SEOと`/about/`直リンクにはHistoryを選び、成果物の`nginx-gdweb.conf.example`を使用。

```sh
docker run --rm -p 8080:8080 \
  -v "$PWD/tmp/omochi-game/site:/usr/share/nginx/html:ro" \
  -v "$PWD/tmp/omochi-game/site/nginx-gdweb.conf.example:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine
```

別のstatic originを前段nginxから配信する場合は`nginx-gdweb-proxy.conf.example`を使用。History APIのfallbackだけでなく、既知routeごとの静的metadataを生成する構成。

## 対象範囲

対応下限はGodot 4.7.1。現行source lock、patch、回帰試験の実証対象は4.7.1-stable。新しいGodot releaseはsource差分と一括回帰の合格後に対応対象へ追加。

2D Web作品向け。3Dと`RichTextLabel`のBBCodeは対象外。対応する`.woff2`がないTheme fontはBrowser標準fontでDOM表示。

`examples/aa_invaders`は390×844向けのAA固定画面シューティング。顔文字自機、5行8列の独自AA編隊、画面Button、反転下降、敵弾、損耗防壁、3 life、wave更新を含む実装例。

`examples/progsha_site`はprogsha.comのHTML、CSS、画像、動画を資料化した白Themeの再現例。書籍、REBADGE、最新記事、アダムノート、コミュニティ、運営情報をTextureRect、Canvas面、DOM文字へ分け、PC三列とスマートフォン一列へ切り替え。取得資料は`source/`へ元pathで保存し、背景動画は2秒時点のframeをGodotで表示。Scene 2 frame目を1200×630で撮影したOGPも同梱。

## ライセンス

project codeは権利留保。[LICENSE](LICENSE)を参照。LINE Seed JPはSIL Open Font License 1.1。[Third-party notices](THIRD_PARTY_NOTICES.md)を参照。
project内の`.woff2`を公開する場合、そのfontに対応するlicense通知はproject側で同梱。
