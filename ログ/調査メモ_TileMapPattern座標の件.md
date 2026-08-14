# TileMapPattern座標の調査メモ

## 対象

TileMapLayerへ貼り付けたpatternの配置先照合。

## 公式仕様

- [TileMapLayer](https://docs.godotengine.org/en/4.3/classes/class_tilemaplayer.html)

pattern内座標とTileMapLayer座標の対応はtile形状に依存する。加算で求めず、`map_pattern()`の戻り値を照合へ使う。

## 適用

- `set_pattern()`と`map_pattern()`を対で実行
- 返された座標のsource、atlas座標を確認
