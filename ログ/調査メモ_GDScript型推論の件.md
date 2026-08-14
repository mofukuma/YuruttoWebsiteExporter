# GDScript型推論の調査メモ

## 対象

ClassDBやNode propertyなど、戻り値が`Variant`になり得る式を含む試験コード。

## 公式仕様

- [Static typing in GDScript](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/static_typing.html)
- [GDScript reference](https://docs.godotengine.org/en/latest/tutorials/scripting/gdscript/gdscript_basics.html)

型が確定しない値からの`:=`推論は不許可。警告をエラーとして扱うprojectでは、式全体が真偽値でも明示型が必要。

## 適用

- ClassDB生成値は`Object`を明示
- propertyを含む複合判定は`bool`を明示
- 警告抑止annotationは使わず、データ境界を型注釈で示す
