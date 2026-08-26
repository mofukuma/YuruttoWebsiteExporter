# YuruttoWebsiteExporter

Turn a Godot Engine project into a website, as it is.
The visuals stay on Godot's canvas, while the text comes out as real HTML. So search engines find it, and people can select, copy, and have it read aloud.
Lightweight, SEO-ready Godot web export.

## Good for

- Publishing a 2D Godot work as a website, as it is
- Letting people find your work through web search
- Keeping text copyable, translatable, and readable by a screen reader
- Never writing HTML, JavaScript, or CSS

## Getting started

First, let your project export a site.

Copy the `addons/yurutto_website_exporter` folder from this repository into an `addons` folder in your own project.

Then turn on `YuruttoWebsiteExporter` in `Project > Project Settings > Plugins`. A new export target called `Yurutto Website` shows up.

Pick `Project > Export > Add > Yurutto Website`, choose the folder you want to export into, and your site is built.

Upload it to your site and you are done. A rented server works, and so does a free host like GitHub Pages.

## What lands in the folder

Each file has its own job.

- `index.html`, `about/index.html`: real HTML for each public address. Once open, scenes switch without reloading
- `yweb-<hash>.js`, `yweb-<hash>.wasm`: the shared engine at the top of the export folder
- `site-<hash>.pck`: the shared scenes and resources at the top of the export folder
- `sitemap.xml`, `robots.txt`: directions for search engines. The URLs inside come from the site URL you set on the export screen
- `404.html`: shown when someone opens an address you don't have
- files ending in `.br`: a lighter copy of the same content. A server that understands it picks it up and serves faster
- `GODOT_LICENSE.txt`: Godot's notice. Keep it next to the rest

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

Backgrounds, icons, focus rings, 2D drawing, physics, and shaders stay on Godot's canvas.

## Using the same typeface as your work

If your theme uses `res://fonts/Title.otf`, put `res://fonts/Title.woff2` beside it and the web font gets used.

Some decorative typefaces can't be reproduced in HTML. When you'd rather keep the typeface, turn `YWeb > Font > Avoid Canvas Theme Font` off, and that text comes out on Godot's canvas instead.

## Publishing

Every address is written as a real file, such as `/about/index.html`. Upload the folder to a static host and direct links work without URL rewrite rules. After the first load, Godot switches scenes and updates browser history without reloading the engine.

Each scene runs for three frames during export, then its visible labels are written into that page's initial HTML. Name a label `HeroH1`, `StoryH2`, or `IntroP` to choose its element. Names from `H1` through `H6` work. Without those names, one large early label becomes H1, section titles become H2, card titles become H3, and the remaining labels become paragraphs. A `LinkButton` is written as an anchor with its public URI.

Visible image nodes with a source file are also written as real images with hashed URLs and dimensions. Set the `yweb_alt` metadata for an exact description. Otherwise, a nearby caption, the source filename, or the parent node name supplies it. Names such as `Background`, `Icon`, and `Mask` stay decorative and are omitted. Set `yweb_seo_image` metadata to `false` to exclude another image. Atlas, region, and multi-frame sprites are omitted rather than publishing the wrong part of a sheet.

The snapshot runner enables Godot's `web` feature. If scene construction also branches on `macos`, `windows`, or `linux`, test `web` first so the exported structure is selected.

Engine and PCK filenames include a content hash. Unchanged files keep the same URL for browser cache reuse, while changed files receive a new URL. HTML should be revalidated by the host; the included development server uses that policy.

## Showing a thumbnail on social media

Prepare one image. It gets written out for each service's format (Open Graph and Twitter Card).

To use a moment from your work, set the frame with `OGP Frame` and press `OGP Auto`. It runs the scene, crops the middle, and saves `res://web/ogp.png` at 1200×630 without distorting the aspect ratio.

## What it can and can't do

Made for 2D web works. A project containing 3D can't be exported. Some of `RichTextLabel`'s BBCode can't be reproduced.

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

Use `2d` or `3d` in place of `dom` to build and test that level. `sh build/build_distribution.sh dom` does the same targeted build in the fixed Docker environment and keeps its result under `tmp/`. Run it without a level when preparing all three release templates.

The browser tests need Chromium. Install it with this.

```sh
npm --prefix tmp/playwright install playwright-core@1.56.0
node tmp/playwright/node_modules/playwright-core/cli.js install chromium
```

## License

This addon is MIT. © 2026 Omochi. Use it however you like.
The bundled export template comes from Godot Engine (MIT). Exported sites carry `GODOT_LICENSE.txt` too.

---

# 日本語

Godotで作った作品を、そのままWebサイトにするアドオン。
絵とかはGodotのまま、文字は本物のHTMLで出すよ。だから検索にも出るし、コピーも読み上げもできる。

## こんなときにつかおう

- Godotで作った2D作品を、そのままWebサイトとして公開したい
- 作品をインターネット検索から見つけてほしい
- 文字をコピー、翻訳、読み上げできる状態にしたい
- HTML、JavaScript、CSSを絶対書きたくない

## 使い方

まずは君のプロジェクトでサイトを書き出せるようにしよう。

このリポジトリの`addons/yurutto_website_exporter`フォルダを、君のプロジェクトに`addons`フォルダを作って、そこへコピーしよう。

次に`プロジェクト > プロジェクト設定 > プラグイン`で`YuruttoWebsiteExporter`を有効にする。すると、書き出し先の種類に`Yurutto Website`が増える。

`プロジェクト > エクスポート > 追加 > Yurutto Website`を選び、書き出ししたいフォルダを選ぼう。するとサイトのデータが完成するよ。

あとは君のサイトにアップロードすればオーケー。レンタルサーバーでも、GitHub Pagesみたいな無料の置き場でも大丈夫。

## フォルダの中身

フォルダの中身は、それぞれこんな役目。

- `index.html`、`about/index.html`: 公開URLごとの本物のHTML。開いた後は再読込せずシーンが切り替わる
- `yweb-<hash>.js`、`yweb-<hash>.wasm`: 書き出しフォルダ直下で共有するエンジン
- `site-<hash>.pck`: 書き出しフォルダ直下で共有するシーンと素材
- `sitemap.xml`、`robots.txt`: 検索に見つけてもらうための案内。中のURLはエクスポート画面の公開URLから作られる
- `404.html`: 知らないアドレスを開かれたとき用
- `.br`付き: 同じ中身の軽い版。対応しているサーバーなら勝手に選ばれて速い
- `GODOT_LICENSE.txt`: Godotの表記。一緒に置いたままに

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

背景、アイコン、フォーカスの枠、2Dの絵、物理、シェーダーはGodotの描画のまま。

## 作品と同じ書体で文字を出す

テーマで`res://fonts/Title.otf`を使っているなら、隣に`res://fonts/Title.woff2`を置けば、Webフォントを使ってくれる。

書体を優先したいときは`YWeb > Font > Avoid Canvas Theme Font`をオフに。そういう文字はGodotの絵で出る。

## 公開のしかた

`/about/`なら`/about/index.html`という本物のファイルが作られるよ。フォルダを静的な置き場へアップロードすれば、URL書換え設定なしで直リンクが開く。最初に開いた後は、Godotがシーンとブラウザ履歴を再読込なしで切り替えるよ。

書き出し中に各シーンを3フレーム動かし、見えているLabelを最初のHTMLへ入れるよ。`HeroH1`、`StoryH2`、`IntroP`のようにノード名へ意味を付けると、その要素になる。`H1`から`H6`まで使える。指定がなければ、序盤の大きなLabelをH1、節のTitleをH2、card内のTitleをH3、残りを本文として選ぶ。LinkButtonは公開URI付きのリンクになるよ。

元画像を持つTexture系Nodeも、本物の画像として最初のHTMLへ入るよ。正確な説明はmetaの`yweb_alt`へ書こう。未設定なら近くのCaption、画像ファイル名、親Node名の順で補う。`Background`、`Icon`、`Mask`のような装飾名は画像検索へ出さないよ。個別に除外したい画像はmetaの`yweb_seo_image`を`false`にしよう。Atlas、region、複数frameのSpriteは画像範囲を誤らないよう対象外になるよ。

採取中はGodotの`web` featureを有効にする。シーン構築を`macos`、`windows`、`linux`でも分けるなら、`web`の判定を先に書こう。書き出し用のNode構成を選べるよ。

エンジンとPCKの名前には中身のhashが入る。中身が同じなら同じURLをブラウザcacheで再利用し、変わったときは新しいURLになる。HTMLは公開先で更新確認される設定にしよう。同梱の開発serverも同じ方針だよ。

## SNSに貼ったときサムネイルを出す

用意するのは画像一枚。あとはSNSごとの書き方(Open GraphとTwitter Card)へまとめて出るよ。

作品の画面をそのまま使いたいときは、`OGP Frame`で撮りたい場面を決めて`OGP Auto`を押そう。シーンを動かして真ん中を切り抜き、`res://web/ogp.png`へ1200×630で保存してくれる。縦横の比率は崩さない。

## できること・できないこと

2DのWeb作品向け。3Dが入っているプロジェクトは書き出せないよ。`RichTextLabel`のBBCodeは一部再現できないよ。

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

2Dなら`dom`を`2d`へ、3Dなら`3d`へ変えよう。固定Docker環境でDOM用を検証するときは`sh build/build_distribution.sh dom`。結果は`tmp/`に残るよ。三段すべての配布物を揃えるときは、段を付けずに実行しよう。

ブラウザを見るテストにはChromiumが要る。入れるのはこれ。

```sh
npm --prefix tmp/playwright install playwright-core@1.56.0
node tmp/playwright/node_modules/playwright-core/cli.js install chromium
```

## ライセンス

このアドオンはMIT。© 2026 Omochi。好きに使ってね。
同梱のエクスポートテンプレートはGodot Engine (MIT)。書き出したサイトにも`GODOT_LICENSE.txt`が入るよ。
