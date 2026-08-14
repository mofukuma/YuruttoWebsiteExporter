# 静的preloadと文字列内tokenを許可する境界試験。
# 実行時に依存先を変更しない参照だけを含める。

extends Control

const FIXED := preload("res://allowed_resource.tres") # 固定Resource参照。
const TOKEN := "load(\"res://ignored.tres\")" # 文字列内の非実行token。


# コメント内のload("res://ignored.tres")を検査対象から外す。
func fixed_resource() -> Resource:
	return FIXED
