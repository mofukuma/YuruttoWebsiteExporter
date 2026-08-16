# YuruttoWebsiteExporter

GodotだけでWebサイトをゆるっと作るためのアドオン。
絵とかはGodotのまま、文字は本物のHTMLで出すよ。だから検索にも出るし、コピーも読み上げもできる。
Lightweight, SEO-ready godot web export.

## こんなときにつかおう

- Godotで作った2D作品を、そのままWebサイトとして公開したい
- 作品をインターネット検索から見つけてほしい
- 文字をコピー、翻訳、読み上げできる状態にしたい
- HTML、JavaScript、CSSを絶対書きたくない

## 使い方

まずは君のプロジェクトでサイトを書き出せるようにしよう。使うGodotは4.7.1を選ぼう。

このリポジトリの`addons/yurutto_website_exporter`フォルダを、君のプロジェクトに`addons`フォルダを作って、そこへコピーしよう。

次に`プロジェクト > プロジェクト設定 > プラグイン`で`YuruttoWebsiteExporter`を有効にする。すると、書き出し先の種類に`ゆるっとWebサイト`が増える。

`プロジェクト > エクスポート > 追加 > ゆるっとWebサイト`を選び、書き出ししたいフォルダを選ぼう。するとサイトのデータが完成するよ。

あとは君のサイトにアップロードすればオーケー。レンタルサーバーでも、GitHub Pagesみたいな無料の置き場でも大丈夫。

## フォルダの中身

フォルダの中身は、それぞれこんな役目。

- `index.html`: サイトの本体。どのページもここが開いて、中で切り替わる
- `sitemap.xml`、`robots.txt`: 検索に見つけてもらうための案内。置くだけ
- `404.html`: 知らないアドレスを開かれたとき用
- `.br`付き: 同じ中身の軽い版。対応しているサーバーなら勝手に選ばれて速い
- `GODOT_LICENSE.txt`: Godotの表記。一緒に置いたままに
- `nginx-yweb.conf*.example`: 自分でサーバーを立てるときだけ使う

## ページを増やす

ページを増やしたくなったら`res://yweb-site.json`を書こう。どのシーンをどのアドレスで見せるか、タイトルと説明を並べるだけ。
シーンはファイルの場所で見分けるから、ルートノードの名前を変えても壊れないよ。
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

書体を優先したいときは`YWeb > Font > Avoid Canvas Theme Font`をオフに。その文字だけGodotの絵で出る。

## 公開のしかた

URLの見せかたを選べるよ。最初は`/#about`みたいな感じになっている。これはサーバーの設定がいらないので、置くだけで動く。
`/about/`みたいな普通のアドレスにしたいときはHistoryを選ぼう。ページごとに`/about/index.html`が本物のファイルとして書き出されるから、GitHub Pagesみたいな置き場ならそのままで直リンクも開くよ。

自分でnginxを立てる人は、一緒に出てくる`nginx-yweb.conf.example`を読ませると楽。軽い`.br`版を選んで配ったり、知らないURLをサイトで受け止めたりしてくれる。

## SNSに貼ったときサムネイルを出す

用意するのは画像一枚だけ。あとはSNSごとの書き方(Open GraphとTwitter Card)へまとめて出るよ。

作品の画面をそのまま使いたいときは、`OGP Frame`で撮りたい場面を決めて`OGP Auto`を押そう。シーンを動かして真ん中を切り抜き、`res://web/ogp.png`へ1200×630で保存してくれる。縦横の比率は崩さない。

## できること・できないこと

2DのWeb作品向け。3Dが入っているプロジェクトは書き出せないよ。`RichTextLabel`のBBCodeも外。
使えるGodotは4.7.1-stableの決まったビルドだけ。違うものだとエクスポート前に止まる。

## アドオン自体をいじる人へ

どこに何があるか。

- `build/`: 書き出しに使うruntimeを作るところ
- `examples/`: 動かして試せる作例。`aa_invaders`は390×844の縦画面シューティング
- `tests/`: Godotの検査と、Playwrightで実際のブラウザを見るテスト
- `ログ/`: 設計、実装計画、調査メモ

runtimeを作り直すときはこれ。誰の手元でも同じものになるよう、Docker内で組み立てる。GitHub Actionsの`Build distribution runtime`も同じ入口。

```sh
sh build/build_distribution.sh
```

ブラウザを見るテストにはChromiumが要る。入れるのはこれ。

```sh
npm --prefix tmp/playwright install playwright-core@1.56.0
node tmp/playwright/node_modules/playwright-core/cli.js install chromium
```

## ライセンス

同梱のruntimeはGodot Engine (MIT)。書き出したサイトにも`GODOT_LICENSE.txt`が入るよ。
