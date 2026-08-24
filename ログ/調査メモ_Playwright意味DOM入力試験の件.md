# Playwright意味DOM入力試験の調査メモ

## 何のために調べたか

Canvasへ重ねた意味DOMを、利用者と同じ入口から安定して操作できる試験にしよう。固定座標ではなく、役割、名前、placeholderから対象を選び、描画位置の変更で壊れにくくするよ。

## 採用する方法

- ButtonとLinkButtonは`getByRole()`で選び、`click()`とkeyboard操作を使う。
- LineEditとTextEditは`getByPlaceholder()`で選び、`fill()`を使う。
- 操作結果はGodotが更新した状態表示を待ち、BrowserからGodotへの往復を確かめる。
- 操作前後のDOM要素参照を比較し、同じIDで作り直す場合も検出する。
- Tab移動は画面上のGodot確定位置で次の意味DOMを選び、次のControlへ直接focusを渡す。

Playwright公式は、利用者から見える役割を優先したlocatorを推奨している。locatorの操作には表示、安定、操作可能状態の自動待機が入るため、固定sleepを増やさず短時間で検査できるよ。

Godot Webは起動時にCanvasへfocusでき、HTML入力とCanvas内Controlのfocusが競合する事例もある。DOM間のTab移動で一度Canvasへ戻すと次の入力を奪うため、古いControlのfocus解放を挟まず、次のControlへ直接渡す設計にするよ。

## 参考

- [Locators](https://playwright.dev/docs/locators)
- [Auto-waiting](https://playwright.dev/docs/actionability)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Godot Web export settings](https://github.com/godotengine/godot/blob/master/platform/web/doc_classes/EditorExportPlatformWeb.xml)
- [HTML inputとCanvas focusの競合例](https://github.com/godotengine/godot/issues/108355)
