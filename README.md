# YuruttoWebsiteExporter

Turn a Godot Engine project into a website, as it is.
DOM only is the default, so supported visuals and text become HTML and CSS without starting WebGL. Choose 3D when a scene needs Godot's Canvas or WebGL; text and browser input still come out as real HTML.
Lightweight, SEO-ready Godot web export.

## Good for

- Publishing a Godot work as a website, as it is
- Letting people find your work through web search
- Keeping text copyable, translatable, and readable by a screen reader
- Never writing HTML, JavaScript, or CSS

## Getting started

First, let your project export a site.

Copy the `addons/yurutto_website_exporter` folder from this repository into an `addons` folder in your own project.

Then turn on `YuruttoWebsiteExporter` in `Project > Project Settings > Plugins`. A new export target called `Yurutto Website` shows up.

Pick `Project > Export > Add > Yurutto Website`, choose the folder you want to export into, and your site is built.

Publish it on an HTTPS host that can apply the generated `_headers` file.

## What lands in the folder

Each file has its own job.

- `index.html`, `about/index.html`: real HTML for each public address. Once open, scenes switch without reloading
- `yweb-<hash>.js`, `yweb-<hash>.wasm`: the shared engine at the top of the export folder
- `site-<hash>.pck`: the shared scenes and resources at the top of the export folder
- `sitemap.xml`, `robots.txt`: directions for search engines. The URLs inside come from the site URL you set on the export screen
- `404.html`: shown when someone opens an address you don't have
- `_headers`, `yweb-security.json`: CSP and the HTTP security headers required by the published site
- files ending in `.br`: a lighter copy of the same content. A server that understands it picks it up and serves faster
- `GODOT_LICENSE.txt`, `licenses/`: Godot's notice and project-specific notices

## Adding pages

Open `Project > Tools > Yurutto Pages` when you want more pages. Add a page, choose its scene, enter its address and search text, then save. The screen updates the JSON selected by the export preset and preserves advanced entries such as `meta` and `json_ld`.
Turn on `Not a page` for a scene used inside another scene. It remains available to Godot but does not get its own HTML, route, or sitemap entry.
Scenes are matched by file location, so renaming a root node won't break anything.
Site-wide things — the public URL, language, favicon, social image, and web font — live on the export screen.

## Text that stays searchable and copyable

On export, on-screen text becomes HTML and rides on top of the picture. That is what makes it searchable and selectable.

- text of `Label`, `Button`, and `LinkButton`
- text of tabs, lists, trees, foldable containers, progress bars, and menu bars
- `LineEdit`, `TextEdit`, and `CodeEdit` connect to the browser's own input. IME, caret, selection, syntax colors, gutters, and guides come along
- text keeps up when you change the theme, rotate it, or move it with physics
- `LinkButton` comes out as a link, `Button` as a button

DOM only reproduces supported backgrounds, icons, focus rings, 2D drawing, and 3D shapes with HTML and CSS. The 3D setting keeps 2D and 3D drawing, physics, and shaders on Godot's canvas.

## Using the same typeface as your work

If your theme uses `res://fonts/Title.otf`, put `res://fonts/Title.woff2` beside it and the web font gets used.

Some decorative typefaces can't be reproduced in HTML. With the 3D setting, turn `YWeb > Font > Avoid Canvas Theme Font` off to keep that text on Godot's canvas. DOM only still uses browser text, so add the matching WOFF2 when the exact typeface matters.

## Publishing

Every address is written as a real file, such as `/about/index.html`. Upload the folder to a static host and direct links work without URL rewrite rules. After the first load, Godot switches scenes and updates browser history without reloading the engine.

Each scene runs for three frames during export, then its visible labels are written into that page's initial HTML. Name a label `HeroH1`, `StoryH2`, or `IntroP` to choose its element. Names from `H1` through `H6` work. Without those names, one large early label becomes H1, section titles become H2, card titles become H3, and the remaining labels become paragraphs. A `LinkButton` is written as an anchor with its public URI.

Visible image nodes with a source file are also written as real images with hashed URLs and dimensions. Set the `yweb_alt` metadata for an exact description. Otherwise, a nearby caption, the source filename, or the parent node name supplies it. Names such as `Background`, `Icon`, and `Mask` stay decorative and are omitted. Set `yweb_seo_image` metadata to `false` to exclude another image. Atlas, region, and multi-frame sprites are omitted rather than publishing the wrong part of a sheet.

The snapshot runner enables Godot's `web` feature. If scene construction also branches on `macos`, `windows`, or `linux`, test `web` first so the exported structure is selected.

Engine and PCK filenames include a content hash. Unchanged files keep the same URL for browser cache reuse, while changed files receive a new URL. HTML should be revalidated by the host; the included development server uses that policy.

Keep `Production` enabled for a public export. It rejects non-HTTPS public URLs, insecure third-party assets, missing SRI, and common secret-key formats before the PCK is made. The export also writes CSP, HSTS, `nosniff`, referrer, frame, and permissions policies. Your host must apply `_headers`; the CSP meta element is a second line of defense, not a replacement for HTTP headers.

Scene snapshots execute project code. Do not export an untrusted project or pull request in a CI job that carries deployment or payment credentials, and do not pass payment secrets to the export job. Use an isolated job with no service credentials and restricted network access.

For GitHub Releases, protect the `production` environment with a required reviewer and allow deployments from `main`. The workflow fixes the candidate before its browser test and publishes it only after that unprivileged test succeeds.

The raw WebAssembly file may exceed a host's per-file limit even when its Brotli copy is smaller. Check the generated file sizes against the chosen host before deployment. GitHub Pages is suitable for non-commercial demos, but its terms and lack of custom response headers make it unsuitable for a paid service.

### Payments

This exporter can provide the public site and a `LinkButton` that leads to a hosted checkout. It does not make a browser trustworthy. Never put secret keys, authoritative prices, payment status, or access rights in scenes, PCK, JavaScript, HTML, or URLs.

Create checkout sessions from a trusted backend, calculate prices there, and grant access after a signed webhook has been verified and matched to the order. Handle duplicate webhook events idempotently. A success page is not proof of payment. Publish privacy, terms, refund, contact, and any commerce disclosures required in your jurisdiction as physical pages reachable before checkout.

Set `commerce.enabled` in `yweb-site.json` when exporting a paid site. Use `mode: "hosted"`, list the permitted HTTPS origins in `checkout_hosts`, and map `privacy`, `terms`, `refund`, `contact`, and `disclosure` to public scene URIs. Use the disclosure page for the seller, address, contact, prices, extra charges, payment timing, delivery, and return terms required by the service's jurisdiction. The export fails if this boundary is incomplete, but legal review remains the operator's responsibility.

If the selected host has a per-file limit, set its exact byte value as `hosting.max_file_bytes`. Export then fails before publication when the raw WASM, PCK, or another file exceeds it. `yweb-security.json` records the five largest generated files for verification.

Deploy hashed assets first, then manifests and HTML. Keep the previous hashed generation until the new site passes health checks, and switch the host or release pointer back if it fails. Verify a normal page, hosted-checkout handoff, CSP headers, WASM startup, and an unknown URL that returns HTTP 404 with `noindex,nofollow` and no WASM/PCK request. Configure the host's custom 404 feature to serve the generated `404.html`; uploading that file does not by itself guarantee a 404 status.

## Showing a thumbnail on social media

Prepare one image. It gets written out for each service's format (Open Graph and Twitter Card).

To use a moment from your work, set the frame with `OGP Frame` and press `OGP Auto`. It runs the scene, crops the middle, and saves `res://web/ogp.png` at 1200×630 without distorting the aspect ratio.

## What it can and can't do

DOM only avoids Canvas and WebGL. Choose 3D for scenes that need Canvas drawing, 2D or 3D physics, shaders, or native 3D rendering. Some animated and custom `RichTextLabel` effects can't be reproduced as HTML.

## For people working on the addon

Where things live.

- `build/`: where the export template gets built
- `examples/`: sample projects you can run
- `tests/`: Godot checks, plus Playwright tests against a real browser

Rebuilding the export template. It is assembled inside Docker so everyone ends up with the same bytes.

```sh
sh build/build_distribution.sh
```

While working on the template itself, build the level you are changing on your own Mac. The source, SDK, and compiled objects stay cached under `tmp/`.

```sh
sh build/check_template.sh dom
```

Use `3d` in place of `dom` to build and test the Canvas/WebGL setting. `sh build/build_distribution.sh dom` does the same targeted build in the fixed Docker environment and keeps its result under `tmp/`. Run it without a level when preparing both release templates.

The browser tests use Chromium, Firefox, and WebKit. Install them with this.

```sh
mkdir -p tmp/playwright
cp tests/browser/package.json tests/browser/package-lock.json tmp/playwright/
npm ci --prefix tmp/playwright --ignore-scripts
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/playwright-browsers" node tmp/playwright/node_modules/playwright-core/cli.js install chromium firefox webkit
```

## License

This addon is MIT. © 2026 Omochi. Use it however you like.
The bundled export template comes from Godot Engine (MIT). Exported sites carry `GODOT_LICENSE.txt` too.

---

# 日本語

Godotで作った作品を、そのままWebサイトにするアドオン。
初期設定のDOM onlyでは、対応している絵と文字をHTMLとCSSで表示するよ。CanvasやWebGLが必要なSceneは3Dを選べる。文字と入力欄はどちらも本物のHTMLだから、検索、コピー、読み上げに使えるよ。

## こんなときにつかおう

- Godotで作った作品を、そのままWebサイトとして公開したい
- 作品をインターネット検索から見つけてほしい
- 文字をコピー、翻訳、読み上げできる状態にしたい
- HTML、JavaScript、CSSを絶対書きたくない

## 使い方

まずは君のプロジェクトでサイトを書き出せるようにしよう。

このリポジトリの`addons/yurutto_website_exporter`フォルダを、君のプロジェクトに`addons`フォルダを作って、そこへコピーしよう。

次に`プロジェクト > プロジェクト設定 > プラグイン`で`YuruttoWebsiteExporter`を有効にする。すると、書き出し先の種類に`Yurutto Website`が増える。

`プロジェクト > エクスポート > 追加 > Yurutto Website`を選び、書き出ししたいフォルダを選ぼう。するとサイトのデータが完成するよ。

生成した`_headers`を適用できるHTTPS配信先へ公開しよう。

## フォルダの中身

フォルダの中身は、それぞれこんな役目。

- `index.html`、`about/index.html`: 公開URLごとの本物のHTML。開いた後は再読込せずシーンが切り替わる
- `yweb-<hash>.js`、`yweb-<hash>.wasm`: 書き出しフォルダ直下で共有するエンジン
- `site-<hash>.pck`: 書き出しフォルダ直下で共有するシーンと素材
- `sitemap.xml`、`robots.txt`: 検索に見つけてもらうための案内。中のURLはエクスポート画面の公開URLから作られる
- `404.html`: 知らないアドレスを開かれたとき用
- `_headers`、`yweb-security.json`: 公開時に必要なCSPとHTTP防御header
- `.br`付き: 同じ中身の軽い版。対応しているサーバーなら勝手に選ばれて速い
- `GODOT_LICENSE.txt`、`licenses/`: Godotとproject固有の表記

## ページを増やす

ページを増やしたくなったら`プロジェクト > ツール > Yurutto Pages`を開こう。ページを追加して、シーン、アドレス、検索用の文言を入れて保存できるよ。画面はExport presetで選んだJSONを更新し、`meta`や`json_ld`などの詳細設定は残す。
ほかのシーン内で使うSceneは`Not a page`をオンにしよう。Godotからは使えるまま、専用HTML、route、sitemapには出なくなるよ。
シーンはファイルの場所で見分けるから、ルートノードの名前を変えても壊れないよ。
公開URL、言語、favicon、SNS用の画像、Webフォントみたいなサイト全体の話は、エクスポート画面のほうにあるよ。

## 文字を検索やコピーの効く形に

画面の文字は、書き出すときに勝手にHTMLになって絵の上へ重なるよ。だから検索に出るし、選んでコピーもできる。

- `Label`、`Button`、`LinkButton`の文字
- タブ、リスト、ツリー、折りたたみ、進捗バー、メニューバーの文字
- `LineEdit`、`TextEdit`、`CodeEdit`はブラウザの入力欄につながる。日本語入力、カーソル、選択、構文色、gutter、ガイドもそのまま
- テーマを変えても、回しても、物理で動かしても、文字はちゃんとついてくる
- `LinkButton`はリンク、`Button`はボタンとして出る

DOM onlyでは、対応している背景、アイコン、フォーカスの枠、2Dの絵、3D形状をHTMLとCSSで再現するよ。3Dを選ぶと、2D・3Dの描画、物理、シェーダーはGodotのCanvasへ残る。

## 作品と同じ書体で文字を出す

テーマで`res://fonts/Title.otf`を使っているなら、隣に`res://fonts/Title.woff2`を置けば、Webフォントを使ってくれる。

3D設定で書体を優先したいときは`YWeb > Font > Avoid Canvas Theme Font`をオフにしよう。対象文字はGodotのCanvasへ残る。DOM onlyはブラウザ文字を使うため、正確な書体が必要なら対応するWOFF2も用意しよう。

## 公開のしかた

`/about/`なら`/about/index.html`という本物のファイルが作られるよ。フォルダを静的な置き場へアップロードすれば、URL書換え設定なしで直リンクが開く。最初に開いた後は、Godotがシーンとブラウザ履歴を再読込なしで切り替えるよ。

書き出し中に各シーンを3フレーム動かし、見えているLabelを最初のHTMLへ入れるよ。`HeroH1`、`StoryH2`、`IntroP`のようにノード名へ意味を付けると、その要素になる。`H1`から`H6`まで使える。指定がなければ、序盤の大きなLabelをH1、節のTitleをH2、card内のTitleをH3、残りを本文として選ぶ。LinkButtonは公開URI付きのリンクになるよ。

元画像を持つTexture系Nodeも、本物の画像として最初のHTMLへ入るよ。正確な説明はmetaの`yweb_alt`へ書こう。未設定なら近くのCaption、画像ファイル名、親Node名の順で補う。`Background`、`Icon`、`Mask`のような装飾名は画像検索へ出さないよ。個別に除外したい画像はmetaの`yweb_seo_image`を`false`にしよう。Atlas、region、複数frameのSpriteは画像範囲を誤らないよう対象外になるよ。

採取中はGodotの`web` featureを有効にする。シーン構築を`macos`、`windows`、`linux`でも分けるなら、`web`の判定を先に書こう。書き出し用のNode構成を選べるよ。

エンジンとPCKの名前には中身のhashが入る。中身が同じなら同じURLをブラウザcacheで再利用し、変わったときは新しいURLになる。HTMLは公開先で更新確認される設定にしよう。同梱の開発serverも同じ方針だよ。

公開用Exportでは`Production`を有効にしよう。HTTPSではない公開URL、安全ではない外部asset、SRI不足、代表的な秘密鍵形式がPCK生成前に拒否されるよ。CSP、HSTS、`nosniff`、参照元、frame、権限のpolicyも生成する。配信先では`_headers`を適用しよう。CSPのmeta要素は補助で、HTTP headerの代用にはならないよ。

Scene snapshotではproject codeが実行される。信頼していないprojectやpull requestを、配信鍵や決済鍵を持つCI jobでExportしてはいけないよ。Export jobへ決済秘密を渡さず、service credentialのない分離jobでnetworkも制限しよう。

GitHub Releaseを使う場合は、`production` environmentへ承認者を設定し、`main`からのdeployに制限しよう。workflowはBrowser試験前に候補を確定し、権限のない試験jobが通った場合に公開するよ。

Brotli版が小さくても、圧縮前のWebAssemblyが配信先の一file上限を超える場合がある。生成後の容量と配信先の上限を照合しよう。GitHub Pagesは非商用demoには使えるけど、利用条件と任意headerを設定できない点から課金サービスには向かないよ。

### 課金を使う場合

このExporterが担当するのは、公開siteとHosted Checkoutへ進む`LinkButton`まで。Browserは信頼できないので、秘密鍵、正式な価格、支払済み状態、利用権限をScene、PCK、JavaScript、HTML、URLへ入れてはいけないよ。

信頼できるbackendでCheckout Sessionを作り、そこで価格を計算しよう。署名済みWebhookの検証と注文照合が終わってから利用権限を一度付与する。重複Webhookも安全に無視できるようにしよう。成功pageは支払いの証明にはならないよ。privacy、terms、refund、contactと、地域ごとに必要な取引表示を、決済前に辿れる物理pageとして用意しよう。

課金siteは`yweb-site.json`で`commerce.enabled`を有効にする。`mode`は`hosted`、`checkout_hosts`には許可するHTTPS origin、`privacy`、`terms`、`refund`、`contact`、`disclosure`には公開SceneのURIを指定しよう。`disclosure`には事業者名、住所、連絡先、価格、追加費用、支払時期、提供時期、返品条件など、運営地域で必要な取引表示を置こう。不足があればExportは停止するけど、法的適合の確認は運営者の責任だよ。

配信先に一fileごとの上限がある場合は、正確なbyte数を`hosting.max_file_bytes`へ指定しよう。圧縮前のWASM、PCK、ほかのfileが超えると公開前にExportを停止する。`yweb-security.json`には生成物のうち大きい5件が記録されるよ。

配信はhash付きasset、manifest、HTMLの順で反映しよう。新siteの疎通が終わるまで前世代のhash資源を残し、失敗時はhostやreleaseの参照先を前世代へ戻す。正常page、Hosted Checkoutへの遷移、CSP header、WASM起動、未知URLを確認しよう。未知URLはHTTP 404、`noindex,nofollow`、WASM/PCK取得なしが合格条件だよ。生成した`404.html`を返すcustom 404機能は配信先で設定しよう。fileのuploadでは404 statusまで保証されないよ。

## SNSに貼ったときサムネイルを出す

用意するのは画像一枚。あとはSNSごとの書き方(Open GraphとTwitter Card)へまとめて出るよ。

作品の画面をそのまま使いたいときは、`OGP Frame`で撮りたい場面を決めて`OGP Auto`を押そう。シーンを動かして真ん中を切り抜き、`res://web/ogp.png`へ1200×630で保存してくれる。縦横の比率は崩さない。

## できること・できないこと

DOM onlyはCanvasとWebGLを起動しないよ。Canvas描画、2D・3D物理、シェーダー、Godot本来の3D描画が必要なら3Dを選ぼう。`RichTextLabel`の動く効果や独自効果には、HTMLで再現できないものがあるよ。

## アドオン自体をいじる人へ

どこに何があるか。

- `build/`: 書き出しに使うエクスポートテンプレートを作るところ
- `examples/`: 動かして試せる作例。
- `tests/`: Godotの検査と、Playwrightで実際のブラウザを見るテスト

エクスポートテンプレートを作り直すときはこれ。誰の手元でも同じものになるよう、Docker内で組み立てる。

```sh
sh build/build_distribution.sh
```

テンプレート自体をいじっている間は、変更中の段を手元のMacで組もう。source、SDK、コンパイル済みの部品は`tmp/`へ残り、同じ入力なら再利用されるよ。

```sh
sh build/check_template.sh dom
```

CanvasとWebGLを使う構成なら`dom`を`3d`へ変えよう。固定Docker環境でDOM用を検証するときは`sh build/build_distribution.sh dom`。結果は`tmp/`に残るよ。二構成の配布物を揃えるときは、段を付けずに実行しよう。

ブラウザを見るテストにはChromium、Firefox、WebKitが要る。入れるのはこれ。

```sh
mkdir -p tmp/playwright
cp tests/browser/package.json tests/browser/package-lock.json tmp/playwright/
npm ci --prefix tmp/playwright --ignore-scripts
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/playwright-browsers" node tmp/playwright/node_modules/playwright-core/cli.js install chromium firefox webkit
```

## ライセンス

このアドオンはMIT。© 2026 Omochi。好きに使ってね。
同梱のエクスポートテンプレートはGodot Engine (MIT)。書き出したサイトにも`GODOT_LICENSE.txt`が入るよ。
