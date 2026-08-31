# YuruttoWebsiteExporter

Godotで作った作品を、そのままWebサイトにするアドオンだよ。
DOM onlyでは対応している絵と文字をHTMLとCSSで表示するよ。CanvasやWebGLが必要なら3Dを選べる。文字と入力欄はどちらも本物のHTMLだから、検索、コピー、読み上げに使えるよ。

## 使ってみよう

まずはこのフォルダを、君のプロジェクトの`addons`へ置こう。

そうしたら`プロジェクト > プロジェクト設定 > プラグイン`を開いて、`YuruttoWebsiteExporter`を有効にしよう。

あとは`プロジェクト > エクスポート > 追加 > Yurutto Website`を選んで、出力先を`.html`にして書き出そう。

ページを増やすときは`プロジェクト > ツール > Yurutto Pages`を開こう。シーン、アドレス、検索用の文言をページごとに入れて保存できるよ。画面に出ないJSONの詳細設定は残る。
ほかのシーン内で使うSceneは`Not a page`をオンにしよう。Sceneを残したまま、専用HTMLとrouteから外せるよ。

書き出しでは各シーンを3フレーム動かし、Labelを最初のHTMLへ入れるよ。`HeroH1`、`StoryH2`、`IntroP`のようにノード名へ意味を付けられる。指定がなければ文字サイズとツリー順から見出しを補い、LinkButtonは公開URI付きのリンクになるよ。

元画像を持つTexture系Nodeは、説明と寸法付きの画像として最初のHTMLへ入るよ。metaの`yweb_alt`を優先し、未設定ならCaption、ファイル名、親Node名から説明を補う。`Background`や`Icon`のような装飾名は画像検索へ出さないよ。個別に除外したい画像はmetaの`yweb_seo_image`を`false`にしよう。Atlas、region、複数frameのSpriteは画像範囲を誤らないよう対象外になるよ。

採取中は`web` featureを有効にする。OSごとにNode構成を分ける場合は、`web`の判定を先に書こう。

## 一緒に入ってるもの

書き出しに使うWebテンプレートと、転送を軽くするBrotli圧縮は、この中に入ってるよ。
Godotの公式Webテンプレートも、Node.jsも、Dockerもいらない。

## 対応しているGodot

Godot 4.7.1-stableの決まったcommit向けに作ってあるよ。
違う版で書き出そうとしたときは、失敗する前に画面で知らせるようにしてある。
