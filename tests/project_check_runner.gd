# ゆるっとWebのproject検査を一つのGodot processで実行するtest入口。
# 実Exporterと同じGDScriptを読込み、終了値と理由を検査側へ返す。

extends SceneTree

# 引数のcheckerとprojectを検査して終了する。
func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2:
		printerr("checkerとprojectを指定してください。")
		quit(2)
		return
	var checker: Script = load(args[0])
	if checker == null:
		printerr("checkerを読めません。")
		quit(2)
		return
	var blocked: Array[String] = checker.new().inspect(args[1])
	for message in blocked:
		printerr(message)
	quit(1 if not blocked.is_empty() else 0)
