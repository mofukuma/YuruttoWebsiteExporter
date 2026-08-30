# Luma Studio

一般的なWordPress企業サイトの情報設計を、GodotとDOM onlyで試す作例だよ。Hero、サービス、写真カルーセル、About、実績、顧客の声、CTAを一つの縦長サイトへまとめている。

## 試してみよう

最初にDOM onlyのWeb成果物を作ろう。

```sh
cd sample/wordpress_studio
sh build.sh
```

次に静的serverを起動しよう。

```sh
sh serve.sh
```

ブラウザで`http://127.0.0.1:4173/`を開くとHome、`http://127.0.0.1:4173/about/`を開くとAboutが表示される。serverを止めるときは`Ctrl+C`だよ。

表示と操作をまとめて確かめるときは、次のPlaywright検査を使おう。sourceが同じ場合は書き出し済み成果物を再利用する。

```sh
node ../../tests/wordpress_studio.cjs
```

成果物は`output/`、PC・mobile・About・カルーセルの確認画像は`../../tmp/wordpress-studio/`に生成されるよ。

## 作例で確認できること

- HeroとCTAを持つ企業サイトの構成
- 左右Button、hoverを持つ手動の写真カルーセル
- 縦scrollと画面幅に応じた1列・複数列の切替
- HomeとAboutの物理HTML、再読込なしのscene遷移
- DOMとして選択できる文字と、ブラウザから押せるButton
- マウスhover、クリック結果、キーボードfocusのPlaywright検査
- 内容hash付きの共有JS、WASM、PCK

写真の出典は[images/CREDITS.md](images/CREDITS.md)にまとめている。文章、色、構成はLuma Studio用に新しく作成したものだよ。
