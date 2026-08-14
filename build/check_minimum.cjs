// minimum版へ渡すprojectから3D Node、resource、shader、assetを検出する。
// 標準Web exporterの前段で境界違反を止め、3D欠落runtimeを配布しない。
// 設計思想：変換や黙認を行わず、該当fileと理由を短く返す。

const fs = require('node:fs');
const path = require('node:path');

const textTypes = new Set(['.tscn', '.tres', '.gd', '.gdshader']); // 内容を検査するGodot text形式。
const modelTypes = new Set(['.blend', '.dae', '.fbx', '.glb', '.gltf', '.obj']); // 3D model形式。
const rules = [
	[/\btype\s*=\s*"[^"]*3D"/, '3D型'],
	[/\btype\s*=\s*"(?:ArrayMesh|BoxMesh|CapsuleMesh|CylinderMesh|PlaneMesh|PrismMesh|QuadMesh|SphereMesh|TextMesh|TubeTrailMesh|Environment|Sky|CameraAttributes\w*)"/, '3D resource'],
	[/^\s*extends\s+\w*3D\b/m, '3D script'],
	[/^\s*shader_type\s+spatial\b/m, 'spatial shader'],
]; // text resource内で拒否する最小3D表現。

// 隠し生成物を除き、project fileを再帰列挙する。
function files(root, current = root) {
	const found = [];
	for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
		if (entry.name === '.godot' || entry.name === '.git') continue;
		const file = path.join(current, entry.name);
		if (entry.isDirectory()) found.push(...files(root, file));
		else found.push(file);
	}
	return found;
}

// 一つのprojectから3D境界違反を集める。
function inspect(root) {
	const blocked = [];
	for (const file of files(root)) {
		const ext = path.extname(file).toLowerCase();
		const relative = path.relative(root, file);
		if (modelTypes.has(ext)) {
			blocked.push({ file: relative, reason: '3D asset' });
			continue;
		}
		if (!textTypes.has(ext)) continue;
		const source = fs.readFileSync(file, 'utf8');
		for (const [pattern, reason] of rules) {
			if (pattern.test(source)) blocked.push({ file: relative, reason });
		}
	}
	return blocked;
}

// CLI実行時は違反一覧を返し、書き出し処理を非0終了させる。
if (require.main === module) {
	const root = path.resolve(process.argv[2] || '.');
	const blocked = inspect(root);
	if (blocked.length) {
		for (const item of blocked) console.error(`${item.file}: ${item.reason}`);
		process.exitCode = 1;
	}
}

module.exports = { inspect };
