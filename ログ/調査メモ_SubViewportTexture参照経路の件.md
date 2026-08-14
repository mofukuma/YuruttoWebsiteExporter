# SubViewportTexture参照経路

## 結論

SubViewportの生成数ではなく、`ViewportTexture`が返すproxy RIDの解決が必要。render target画像を直接返す設計ではない。

## 根拠

- [ViewportTexture公式資料](https://docs.godotengine.org/en/stable/classes/class_viewporttexture.html): `Viewport.get_texture()`で動的textureを取得。scene内で局所化されるResource。
- [SubViewport公式資料](https://docs.godotengine.org/en/stable/classes/class_subviewport.html): 2px以上のsizeと、ViewportTextureへの割当またはSubViewportContainerが表示条件。`UPDATE_ALWAYS`は毎frame更新。
- [Godot本家viewport.cpp](https://github.com/godotengine/godot/blob/master/scene/main/viewport.cpp): `ViewportTexture::get_rid()`はplaceholderを基底にproxyを生成して返す。表示側へ渡るRIDはrender target texture RIDそのものではない。

## 採用設計

Dummy textureへproxy先RIDを保持。Canvas画像handle取得時だけ実画像RIDまで解決。render target、通常ImageTexture、ViewportTextureを同じhandle参照へ収束。
