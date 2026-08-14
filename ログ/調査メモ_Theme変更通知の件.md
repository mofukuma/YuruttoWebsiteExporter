# Theme変更通知の調査メモ

## 対象

同じControl treeへ適用する3 Themeの実行時切替。

## 公式仕様

- [Control](https://docs.godotengine.org/en/stable/classes/class_control.html)
- [Theme](https://docs.godotengine.org/en/stable/classes/class_theme.html)

祖先Controlの`theme`変更時、子Controlへ`NOTIFICATION_THEME_CHANGED`が届く。文字項目はObject propertyではなく、`get_theme_*`で取得する。

## 適用

- Button signal到達を状態Labelで先に確認
- Theme適用後の子Labelを`get_theme_color`と`get_theme_font_size`からDOM同期
- 操作不達とTheme伝播不良を別の合格条件にする
