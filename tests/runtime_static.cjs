// 最終WasmとJavaScriptからGPU経路の不在と採用機能の組込みを確認する。
// 実行中の推測でなく、配布する二つのbinaryだけを判定対象にする。
// 設計思想：GPUはimportとclassの両方を禁止し、必要機能はclass実在で固定。

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(process.argv[2] || 'tmp/gdweb/runtime-proof'); // 配布成果物。
const resultFile = path.resolve(process.argv[3] || 'tmp/gdweb/normal-matrix/build/static-final-result.json'); // 判定証拠。
const jsFile = path.join(root, 'godot.js'); // Emscripten wrapper。
const wasmFile = path.join(root, 'godot.wasm'); // 限定engine。
const js = fs.readFileSync(jsFile, 'utf8');
const wasm = fs.readFileSync(wasmFile);
const wasmStrings = execFileSync('/usr/bin/strings', [wasmFile], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const body = js.match(/var wasmImports=\{([^}]+)\};var wasmExports/);
assert(body, 'wasmImportsが見つからない');
const imports = body[1].split(',').map((item) => item.slice(item.indexOf(':') + 1));
const gpuImports = imports.filter((name) => /(?:^|_)gl[A-Z_]|webgl|webgpu|shader/i.test(name));
const audioImports = imports.filter((name) => /godot_audio/i.test(name));
const lines = new Set(wasmStrings.split('\n'));
const absent = ['Shader', 'ShaderMaterial', 'CanvasItemMaterial']; // 禁止class。
const required = [
	'RigidBody2D',
	'StaticBody2D',
	'CollisionShape2D',
	'PhysicsServer2D',
	'GodotPhysics2D',
	'AudioStreamPlayer',
	'AudioStreamPlayer2D',
	'AudioStreamWAV',
	'NavigationServer2D',
	'VideoStreamTheora',
]; // 採用class。

const jsGpuTerms = Object.fromEntries(['OpenGL', 'WebGL', 'GLES', 'WebGPU', 'Shader'].map((name) => [name, js.match(new RegExp(`\\b${name}\\b`, 'gi'))?.length || 0])); // 生成JSの禁止語。

function artifact(file) {
	const bytes = fs.readFileSync(file);
	return { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

const result = {
	ok: gpuImports.length === 0
		&& audioImports.length > 0
		&& absent.every((name) => !lines.has(name))
		&& required.every((name) => wasmStrings.includes(name))
		&& Object.values(jsGpuTerms).every((count) => count === 0),
	artifacts: { js: artifact(jsFile), wasm: artifact(wasmFile) },
	importCount: imports.length,
	gpuImports,
	audioImportCount: audioImports.length,
	absentClasses: Object.fromEntries(absent.map((name) => [name, !lines.has(name)])),
	requiredClasses: Object.fromEntries(required.map((name) => [name, wasmStrings.includes(name)])),
	jsGpuTerms,
};

fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
