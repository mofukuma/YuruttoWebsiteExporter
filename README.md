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

- `index.html`: the site itself. Every page opens through this one and switches inside
- `sitemap.xml`, `robots.txt`: directions for search engines. The URLs inside come from the site URL you set on the export screen
- `404.html`: shown when someone opens an address you don't have
- files ending in `.br`: a lighter copy of the same content. A server that understands it picks it up and serves faster
- `GODOT_LICENSE.txt`: Godot's notice. Keep it next to the rest
- `nginx-yweb.conf*.example`: sample settings for people running their own server

## Adding pages

Write `res://yweb-site.json` when you want more pages. List which scene shows at which address, plus a title and description.
Scenes are matched by file location, so renaming a root node won't break anything.

In your game, keep changing scenes the usual way with `get_tree().change_scene_to_file()`.
The address, the title, and the back button follow along on their own — no web-specific code to write.
It works the other way too: opening an address directly, or pressing back, moves you to the matching scene.

Site-wide things — the public URL, language, favicon, social image, address style, web font — live on the export screen.

## Text that stays searchable and copyable

On export, on-screen text becomes HTML and rides on top of the picture. That is what makes it searchable and selectable.

- text of `Label`, `Button`, and `LinkButton`
- text of tabs, lists, trees, foldable containers, progress bars, and menu bars
- `LineEdit` and `TextEdit` connect to the browser's own input. IME, caret, and selection come along
- text keeps up when you change the theme, rotate it, or move it with physics
- `LinkButton` comes out as a link, `Button` as a button

Backgrounds, icons, focus rings, 2D drawing, physics, and shaders stay on Godot's canvas.

## Using the same typeface as your work

If your theme uses `res://fonts/Title.otf`, put `res://fonts/Title.woff2` beside it and the web font gets used.

Some decorative typefaces can't be reproduced in HTML. When you'd rather keep the typeface, turn `YWeb > Font > Avoid Canvas Theme Font` off, and that text comes out on Godot's canvas instead.

## Publishing

You can choose how addresses look. Out of the box they read like `/#about`, which asks nothing of the server.
For plain addresses like `/about/`, pick History. Each page is written out as a real `/about/index.html`, so a host like GitHub Pages opens direct links as they are.

Running your own nginx? Feed it the `nginx-yweb.conf.example` that comes along. It serves the lighter `.br` copies and catches unknown URLs back into the site.

## Showing a thumbnail on social media

Prepare one image. It gets written out for each service's format (Open Graph and Twitter Card).

To use a moment from your work, set the frame with `OGP Frame` and press `OGP Auto`. It runs the scene, crops the middle, and saves `res://web/ogp.png` at 1200×630 without distorting the aspect ratio.

## What it can and can't do

Pick a level on the export screen: DOM only, 2D, or 3D. DOM only draws everything with HTML and skips the canvas.
2D keeps canvas drawing and 2D physics. 3D adds 3D drawing and 3D physics, and the file you ship gets bigger.

DOM only and 2D can't export a project containing 3D, and they say so before writing anything.
GDExtension doesn't run at any level. Some of `RichTextLabel`'s BBCode can't be reproduced.

## For people working on the addon

Where things live.

- `build/`: where the export template gets built
- `examples/`: sample projects you can run
- `tests/`: Godot checks, plus Playwright tests against a real browser

Rebuilding the export template. It is assembled inside Docker so everyone ends up with the same bytes.

```sh
sh build/build_distribution.sh
```

While working on the template itself, build it on your own Mac instead. It skips the Docker emulation and rebuilds only what you changed, so the second run takes seconds. Pass the level you want to try: `dom`, `2d`, or `3d`.

```sh
sh build/dev_template.sh 2d
```

The browser tests need Chromium. Install it with this.

```sh
npm --prefix tmp/playwright install playwright-core@1.56.0
node tmp/playwright/node_modules/playwright-core/cli.js install chromium
```

One test compares the look and the frame cost against a plain Godot web export, so it needs Godot's own template. This puts it under `tmp/`, leaving your Godot install alone.

```sh
sh build/fetch_godot_templates.sh
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

- `index.html`: サイトの本体。どのページもここが開いて、中で切り替わる
- `sitemap.xml`、`robots.txt`: 検索に見つけてもらうための案内。中のURLはエクスポート画面の公開URLから作られる
- `404.html`: 知らないアドレスを開かれたとき用
- `.br`付き: 同じ中身の軽い版。対応しているサーバーなら勝手に選ばれて速い
- `GODOT_LICENSE.txt`: Godotの表記。一緒に置いたままに
- `nginx-yweb.conf*.example`: 自分でサーバーを立てる人向けの設定例

## ページを増やす

ページを増やしたくなったら`res://yweb-site.json`を書こう。どのシーンをどのアドレスで見せるか、タイトルと説明を並べる。
シーンはファイルの場所で見分けるから、ルートノードの名前を変えても壊れないよ。

作品のほうは、いつもどおり`get_tree().change_scene_to_file()`でシーンを変えればいい。
アドレスとタイトルと戻るボタンは、そのあと勝手についてくる。Web用の書き足しはいらないよ。
逆にアドレスを直に開いたときや、ブラウザの戻るを押したときも、対応するシーンへ移る。

公開URL、言語、favicon、SNS用の画像、URLの見せかた、Webフォントみたいなサイト全体の話は、エクスポート画面のほうにあるよ。

## 文字を検索やコピーの効く形に

画面の文字は、書き出すときに勝手にHTMLになって絵の上へ重なるよ。だから検索に出るし、選んでコピーもできる。

- `Label`、`Button`、`LinkButton`の文字
- タブ、リスト、ツリー、折りたたみ、進捗バー、メニューバーの文字
- `LineEdit`と`TextEdit`はブラウザの入力欄につながる。日本語入力、カーソル、選択もそのまま
- テーマを変えても、回しても、物理で動かしても、文字はちゃんとついてくる
- `LinkButton`はリンク、`Button`はボタンとして出る

背景、アイコン、フォーカスの枠、2Dの絵、物理、シェーダーはGodotの描画のまま。

## 作品と同じ書体で文字を出す

テーマで`res://fonts/Title.otf`を使っているなら、隣に`res://fonts/Title.woff2`を置けば、Webフォントを使ってくれる。

書体を優先したいときは`YWeb > Font > Avoid Canvas Theme Font`をオフに。そういう文字はGodotの絵で出る。

## 公開のしかた

URLの見せかたを選べるよ。最初は`/#about`みたいな感じになっている。これはサーバー側の設定がいらない形。
`/about/`みたいな普通のアドレスにしたいときはHistoryを選ぼう。ページごとに`/about/index.html`が本物のファイルとして書き出されるから、GitHub Pagesみたいな置き場ならそのままで直リンクも開くよ。

自分でnginxを立てる人は、一緒に出てくる`nginx-yweb.conf.example`を読ませると楽。軽い`.br`版を選んで配ったり、知らないURLをサイトで受け止めたりしてくれる。

## SNSに貼ったときサムネイルを出す

用意するのは画像一枚。あとはSNSごとの書き方(Open GraphとTwitter Card)へまとめて出るよ。

作品の画面をそのまま使いたいときは、`OGP Frame`で撮りたい場面を決めて`OGP Auto`を押そう。シーンを動かして真ん中を切り抜き、`res://web/ogp.png`へ1200×630で保存してくれる。縦横の比率は崩さない。

## できること・できないこと

エクスポート画面で段を選ぶよ。DOM only、2D、3Dの三つ。
DOM onlyはCanvasを積まず、全部HTMLで描くよ。2DはCanvasの描画と2D物理を持つよ。
3Dは3Dの描画と物理まで入るぶん、配るファイルは大きくなるよ。

DOM onlyと2Dは3Dの入ったプロジェクトを書き出せない。書き出す前に教えてくれるよ。
GDExtensionはどの段でも動かないよ。`RichTextLabel`のBBCodeは一部再現できないよ。

## アドオン自体をいじる人へ

どこに何があるか。

- `build/`: 書き出しに使うエクスポートテンプレートを作るところ
- `examples/`: 動かして試せる作例。
- `tests/`: Godotの検査と、Playwrightで実際のブラウザを見るテスト

エクスポートテンプレートを作り直すときはこれ。誰の手元でも同じものになるよう、Docker内で組み立てる。

```sh
sh build/build_distribution.sh
```

テンプレート自体をいじっている間は、手元のMacで組むほうが速いよ。Dockerの真似っこを通さず、変えたところを組み直すから、二回目からは数秒で終わる。試したい段を渡してね。`dom`、`2d`、`3d`があるよ。

```sh
sh build/dev_template.sh 2d
```

ブラウザを見るテストにはChromiumが要る。入れるのはこれ。

```sh
npm --prefix tmp/playwright install playwright-core@1.56.0
node tmp/playwright/node_modules/playwright-core/cli.js install chromium
```

見た目とフレームの重さを素のGodot Web書き出しと比べるテストがあって、そっちはGodot本家のテンプレートが要るよ。`tmp/`へ置くから、手元のGodotの設定はそのままだよ。

```sh
sh build/fetch_godot_templates.sh
```

## ライセンス

このアドオンはMIT。© 2026 Omochi。好きに使ってね。
同梱のエクスポートテンプレートはGodot Engine (MIT)。書き出したサイトにも`GODOT_LICENSE.txt`が入るよ。
