# WordPress型Godotサイトの調査メモ

## 目的

一般的な企業サイトとして迷わず読める構成をGodotで再現し、DOM文字、カルーセル、物理route、静的配信を一つの作例で確認する。

## 参考資料

- [Astra Digital Agency](https://websitedemos.net/agency-02/): 写真を全面に置くHero、短いCTA、6枚のサービスカード、実績、顧客の声という直線的な構成。
- [Kadence Digital Services](https://startertemplatecloud.com/g15/): 白地と淡い青の曲面、濃紺見出し、数値指標、3列カードを交互に使う構成。
- [Blocksy Business](https://creativethemes.com/blocksy/starter-site/business/): 強い最上部CTA、理解しやすいAbout・Blog・Contactの分離、速度を重視する説明。
- [Divi Simple Landing Page](https://www.elegantthemes.com/layouts/simple/simple-landing-page): 大きな余白、紫のCTA面、実績数値を小さなカードへ並べる構成。
- WordPress.org公式配布: [Astra](https://wordpress.org/themes/astra/)、[Kadence](https://wordpress.org/themes/kadence/)、[Blocksy](https://wordpress.org/themes/blocksy/)の検証済みZIPを保存した。
- [Unsplash License](https://unsplash.com/license): 作例写真はUnsplashの無料写真を使用し、素材元URLを作例内へ記録する。

取得したHTML、画面、SHA-256は`tmp/wordpress-reference/`へ保存した。公式テーマ本体は`themes/`のAstra 4.13.10、Kadence 1.5.2、Blocksy 2.1.53で、ZIP検査にも成功している。固有の文章、ロゴ、配色、画像配置は複製せず、共通する情報設計を抽出する。

## 採用する設計

- Heroは濃紺、青、橙の3色と大きな日本語見出しで、右側へ写真と実績カードを置く。
- HomeはHero、サービス、画像カルーセル、About、数値、顧客の声、CTA、footerの順にする。
- Aboutは物理routeとして別sceneを用意し、Homeから再読込なしで移動できるようにする。
- ScrollContainerで縦長サイトを構成し、文字・Button・LinkButtonはDOMの意味要素として残す。
- カルーセルは自動送り、左右Button、現在位置表示を持ち、画像と説明を同時に切り替える。
- 写真には濃色overlayを使わず、周囲の面と余白で可読性を確保する。

## 検査条件

- HomeとAboutの物理HTMLが生成され、共有JS、WASM、PCKを読む。
- BrowserでHero、サービス、カルーセル、About、CTA、footerが表示される。
- カルーセルの自動送りと左右Button、Home・About間の無再読込遷移をPlaywrightで操作する。
- 1440×900と390×844で横はみ出しがなく、主要文字と操作要素が読める。
- 出力結果とスクリーンショットを`sample/wordpress_studio/output/`と`tmp/wordpress-studio/`へ保存する。
