# DOM行ボックスとChromium行送りの調査

## 結論

DOM前面文字の行の高さは、Godotが確定した文字項目の高さを正本にする。文字寸法だけから求めた行送りは、Browserが`sans-serif`へ選ぶfont次第で確定高さを超える。

Chromium 151が寸法の算出を変えたわけではない。headless時に`sans-serif`が指すfontが変わり、Godot確定高さより背の高いfontで測るようになったことが、test失敗として現れた。

## 実測

Chromium 141 (chromium-1194) と Chromium 151 (chromium-1234) を、同じ実行fileでheadlessとheadedの両方から比較。

font名を指定した場合の寸法は両版で完全に一致する（16px、上/下）。

| 指定 | Chromium 141 | Chromium 151 |
| --- | --- | --- |
| Helvetica | 14 / 4 | 14 / 4 |
| Arial | 14 / 3 | 14 / 3 |
| Hiragino Kaku Gothic ProN | 14 / 2 | 14 / 2 |
| LINE Seed JP (Web font) | 15 / 3 | 15 / 3 |

`sans-serif`が実際に選ぶfont（CDPの`CSS.getPlatformFontsForNode`）:

| 実行形態 | Chromium 141 | Chromium 151 |
| --- | --- | --- |
| headless | Hiragino Kaku Gothic ProN | Helvetica |
| headed | Hiragino Kaku Gothic ProN | Hiragino Kaku Gothic ProN |

headlessのChromium 151だけがOS表示言語に基づく既定fontを使わず、内蔵既定のHelveticaを選ぶ。`--lang`や`locale`では変わらない。この既定fontはAccept-Languageではなくapplicationの表示言語資源に由来するため。

結果として、Tree項目の行の高さがHiragino由来の16pxからHelvetica由来の18pxへ変わり、Godot確定高さ15pxを超えた。glyph実寸は上13.28 / 下1.17で、はみ出しているのは字形ではなく行送りの余白。

Godot側の一行の高さ（既定Theme font）:

| 文字寸法 | TextLine | TextParagraph |
| --- | --- | --- |
| 15px | 22 | 16 |
| 16px | 23 | 17 |

TabBar、MenuBar、FoldableContainer、ProgressBarはTextLine、TreeとItemListはTextParagraphで文字を確定するため、同じ16pxでも項目の高さが23pxと15pxに分かれる。

## 判断

`gdweb_text_capture_line`が渡す矩形は、Godotが確定した一行分の文字の箱そのもの。DOM側は`line-height`にその高さを使い、Browserが選んだfontの行送りを持ち込まない。

版差の有無に関わらず必要な修正。`sans-serif`がHelveticaやArialへ解決する環境では、Chromium 141でも同じ余白のはみ出しが起きていた。

副次的に、旧指定では16px文字の23px項目でDOMの文字が約5px上にずれていた。行の箱を一致させることで、Godotの描画位置との差はfont寸法差の約1.5pxまで縮む。

## 制約

Godot確定高さがBrowser fontの行の高さより小さいとき、上下の余白だけが箱の外へ出る。glyphは箱の内側に収まるため表示は欠けない。したがって縦のはみ出し検査は`scrollHeight`ではなくglyph実寸で行う。

Theme fontに対応するWeb fontがない項目は、Browserが選ぶfont次第で上下位置が動く。この選択はheadlessとheaded、OS表示言語で変わるため、位置の一致を検査条件にはできない。

## 参考

- [Different font family between headless and headed (puppeteer#922)](https://github.com/puppeteer/puppeteer/issues/922): macOSの日本語環境でheadlessとheadedの既定fontが割れる既知の事象。
- [Chrome + System Fonts Snafu](https://css-tricks.com/chrome-system-fonts-snafu/): Chromeの汎用font指定がOS側の設定と一致しない事例。
