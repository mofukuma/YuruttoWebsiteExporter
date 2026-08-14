# Clipboard非同期反映の調査

## 対象

TextEditのcopy、cut、paste、undo、redoを確認するChromium試験。

## 症状

`Meta+X`直後の`Meta+V`がまれに反映されず、500ミリ秒以内に入力値が`copy😀\nאב`へ変化しない状態。同じ貼付判定で2回発生。

## 根拠

- [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API): Clipboardの読み書きは非同期処理であり、完了をPromiseで受け取る設計。
- [Clipboard](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard): `readText()`と`writeText()`はPromiseを返すAPI。
- [paste event](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event): 貼付操作の既定動作が編集可能要素へ内容を挿入する仕組み。

## 対応

copy確認後にClipboardを空にし、cutによる`copy`の再書込みを識別。入力値の切取りとClipboard書込みの両方を待機後、TextEditへ焦点と先頭カーソルを設定して貼付を一度実行。

## 判定

OSの非同期Clipboard処理と貼付操作の競合。書込み完了を観測できない従来手順が原因。
