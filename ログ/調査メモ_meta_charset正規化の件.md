# meta charset正規化の調査メモ

## 目的

書き出したHTMLの文字コード宣言を一意にし、Browserが本文を読む前にUTF-8を確定できるようにする。

## 公式情報

- HTML Living Standardは、文字コード宣言を先頭1024 byte以内へ置くよう定めている。
  - https://html.spec.whatwg.org/multipage/semantics.html#charset1024
- 一つの文書へ文字コード宣言を複数置かないことも定めている。
  - https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-charset

## 採用する判断

Godot templateや再生成前のHTMLにあるcharset宣言を全て除き、`head`開始直後へ`<meta charset="utf-8">`を一件生成する。これによりtemplate内容が変わっても、宣言数と位置を同じ規則で保つ。
