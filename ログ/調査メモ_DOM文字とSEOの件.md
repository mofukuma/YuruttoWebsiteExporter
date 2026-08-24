# DOM文字とSEOの調査メモ

## 目的

DOM onlyの軽さと検索しやすさを保ちながら、Godotの文字表現をWebへ移す方法を決めるための資料だよ。

## 結論

通常のLabel、Button、Linkは文字列ごとの意味要素を使おう。字形ごとの要素は、waveなど各文字を別々に動かす表現へ限定するよ。

検索対象の本文は意味のあるHTMLとDOM内の文字として残す。画像へ置き換えて文字を非表示にする方式は標準経路にしない。Googleは意味のあるHTMLとDOM内で読める文字を推奨し、重要な語を見出しやリンク文字へ置くよう案内しているよ。

## 参考

- [SEO Guide for Web Developers](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [Google Search Essentials](https://developers.google.com/search/docs/essentials)
- [Design patterns for accessible, crawlable and indexable content](https://developers.google.com/search/blog/2008/05/design-patterns-for-accessible)
