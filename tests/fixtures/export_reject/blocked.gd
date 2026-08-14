# 動的資源、directory走査、Browser API、Mesh生成の拒否対象。

extends Node2D


# 限定runtimeで到達を確定できない処理をまとめる。
func blocked() -> void:
	JavaScriptBridge.eval("")
	load("res://main.tscn")
	DirAccess.open("res://")
	draw_mesh(null, null)
	var _device: RenderingDevice
