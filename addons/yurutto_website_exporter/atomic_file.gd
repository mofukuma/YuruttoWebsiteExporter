# 一時fileを公開名へ原子的に切り替える共通処理。
# POSIX renameとWindows ReplaceFileを使い、既存fileの欠落時間を作らない設計。

@tool
extends RefCounted

# 同一volume上の一時fileを置換先へ原子的に移す。
static func replace(source: String, target: String) -> Error:
	return replace_all([{"source": source, "target": target}])

# 並び順を保った置換一覧を、Windowsでは一processへまとめて実行する。
static func replace_all(items: Array[Dictionary]) -> Error:
	if OS.get_name() != "Windows":
		for item in items:
			var error := DirAccess.rename_absolute(item.source, item.target)
			if error != OK:
				return error
		return OK
	var has_existing := false
	for item in items:
		if FileAccess.file_exists(item.target):
			has_existing = true
			break
	# 新規fileはWindowsでもrenameで欠落なく公開できるため、外部processを起動しない。
	if not has_existing:
		for item in items:
			var error := DirAccess.rename_absolute(item.source, item.target)
			if error != OK:
				return error
		return OK
	var root := OS.get_temp_dir().path_join("yweb-exporter")
	if DirAccess.make_dir_recursive_absolute(root) != OK:
		return ERR_CANT_CREATE
	var key := "%d-%d" % [OS.get_process_id(), Time.get_ticks_msec()]
	var script := root.path_join("replace-%s.ps1" % key)
	var manifest := root.path_join("replace-%s.json" % key)
	var file := FileAccess.open(script, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string("# 公開file一覧をWindows標準APIで原子的に置換する。\nparam([string]$Manifest)\n$ErrorActionPreference='Stop'\ntry{$Items=Get-Content -Raw -Encoding UTF8 -LiteralPath $Manifest|ConvertFrom-Json;foreach($Item in $Items){if([IO.File]::Exists($Item.target)){[IO.File]::Replace($Item.source,$Item.target,$null,$true)}else{[IO.File]::Move($Item.source,$Item.target)}}}catch{[Console]::Error.WriteLine($_.Exception.Message);exit 1}\nexit 0\n")
	file.close()
	file = FileAccess.open(manifest, FileAccess.WRITE)
	if file == null:
		DirAccess.remove_absolute(script)
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(items))
	file.close()
	var output: Array = []
	var code := OS.execute("powershell.exe", PackedStringArray(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, manifest]), output, true)
	DirAccess.remove_absolute(script)
	DirAccess.remove_absolute(manifest)
	return OK if code == 0 else FAILED
