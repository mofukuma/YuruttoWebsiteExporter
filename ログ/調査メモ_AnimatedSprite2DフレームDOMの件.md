# AnimatedSprite2DフレームDOMの調査メモ

SpriteFramesのatlas領域を、Godotの描画位置と同じ規則でDOMへ写そう。

AnimatedSprite2Dは現在frameのTexture2DをSpriteFramesから取得し、`centered`、`offset`、横反転、縦反転を反映した矩形へ描く。AtlasTextureは`region`をatlasから切り出し、`margin`を含む最終の表示矩形とsource矩形を`get_rect_region()`で決める。

DOM側は表示矩形の親を`overflow:hidden`にし、atlas全体の子画像をsource位置に合わせて移動する。反転時は子画像へ負のscaleを設定する。この構造ならframeが変わっても親の配置を保ち、子画像の位置更新で追従できる。

- AnimatedSprite2D公式実装: https://github.com/godotengine/godot/blob/master/scene/2d/animated_sprite_2d.cpp
- AtlasTexture公式実装: https://github.com/godotengine/godot/blob/master/scene/resources/atlas_texture.cpp
- AtlasTexture公式資料: https://docs.godotengine.org/en/stable/classes/class_atlastexture.html
