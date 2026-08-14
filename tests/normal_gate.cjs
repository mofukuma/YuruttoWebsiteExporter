// gdwebの正常経路だけを、終了状態と残留processまで含めて検査する。
// 固定したGodot、作品、browser試験以外の実行を受け付けない。
// 設計思想：所有PIDと実行pathを境界にし、別作品のGodotへ干渉しない。

const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const tmp = path.join(root, 'tmp/gdweb/final-gate'); // 全正常結果だけを置く場所。
const project = path.join(root, 'tmp/gdweb/smoke'); // 全機能を一画面へ集約した作品。
const output = path.join(root, 'tmp/gdweb/smoke-export/index.html'); // 正常書き出し先。
const siteTest = path.join(root, 'tests/daito_projects.cjs'); // 参考作品の実Browser試験。
const matrix = path.join(root, 'tmp/gdweb/normal-matrix'); // 正常機能表のfixture root。
const n17 = path.join(matrix, 'n17_subviewport'); // 複数Canvas描画面の正常fixture。
const godot = path.join(root, 'tmp/godot-source/bin/godot.macos.editor.arm64'); // gdweb改変Editor。
const node = path.resolve(process.execPath); // 固定browser試験を動かす現在のNode。
const ps = '/bin/ps'; // PID、親PID、process group、実行pathの観測だけに使用。
const maxLog = 2 * 1024 * 1024; // 連続出力でgate自身が肥大化しない上限。
const reportDirs = [
	path.join(os.homedir(), 'Library/Logs/DiagnosticReports'),
	'/Library/Logs/DiagnosticReports',
]; // macOS crash報告元。
const browserTests = new Set([
	path.join(project, 'test.cjs'),
	siteTest,
	...['path_static.cjs', 'dom_handle_static.cjs', 'dom_dirty_static.cjs', 'dom_input_static.cjs', 'dom_window_static.cjs', 'gui_manifest_generate.cjs', 'gui_inventory_static.cjs', '2d_inventory_static.cjs', 'canvas_coverage_static.cjs', 'runtime_static.cjs', 'export_boundary.cjs', 'reproduction_static.cjs'].map((name) => path.join(root, 'tests', name)),
]); // 製品runtimeと同一証拠を読む固定試験だけを許可。

// 正常fixtureだけを列挙し、不正入力fixtureを構成から隔離する。
const commands = [
	{ id: 'native', file: godot, args: ['--path', project, '--resolution', '640x360', '--', '--native-subviewport-proof', path.join(n17, 'native.json'), path.join(root, 'tmp/gdweb/smoke-export/delayed.pck')], timeoutMs: 10_000 },
	{ id: 'export', file: godot, args: ['--headless', '--path', project, '--export-release', 'gdweb', output], timeoutMs: 30_000 },
	{ id: 'browser', file: node, args: [path.join(project, 'test.cjs')], timeoutMs: 30_000 },
	{ id: 'daito_projects', file: node, args: [siteTest], timeoutMs: 10_000 },
	...['gui_manifest_generate.cjs', 'path_static.cjs', 'dom_handle_static.cjs', 'dom_dirty_static.cjs', 'dom_input_static.cjs', 'dom_window_static.cjs', 'gui_inventory_static.cjs', '2d_inventory_static.cjs', 'canvas_coverage_static.cjs', 'runtime_static.cjs'].map((name) => ({ id: name.replace('.cjs', ''), file: node, args: [path.join(root, 'tests', name)], timeoutMs: 5_000 })),
	{ id: 'export_boundary', file: node, args: [path.join(root, 'tests/export_boundary.cjs')], timeoutMs: 10_000 },
	{ id: 'reproduction_static', file: node, args: [path.join(root, 'tests/reproduction_static.cjs')], timeoutMs: 5_000 },
];


// 引数は固定commandの選択だけを許し、外部pathや任意commandを受け取らない。
function options(argv) {
	const value = { dryRun: false, only: null };
	for (const arg of argv) {
		if (arg === '--dry-run') value.dryRun = true;
		else if (arg.startsWith('--only=')) value.only = new Set(arg.slice(7).split(',').filter(Boolean));
		else throw new Error(`未対応のgate引数: ${arg}`);
	}
	return value;
}


// executableと対象scriptを実在する固定pathへ照合する。
function validate(command) {
	if (!path.isAbsolute(command.file)) throw new Error(`${command.id}: executableが絶対pathではない`);
	if (!fs.existsSync(command.file)) throw new Error(`${command.id}: executableがない: ${command.file}`);
	if (!fs.existsSync(project)) throw new Error(`正常作品がない: ${project}`);
	if (command.file === node) {
		const script = command.args[0];
		if (!browserTests.has(script) || !fs.existsSync(script)) throw new Error(`${command.id}: 固定browser試験ではない`);
	}
	if (command.file !== godot && command.file !== node) throw new Error(`${command.id}: 許可外executable`);
	if (command.args.some((arg) => /(?:^|\/)invalid(?:-|\/)|warning-test/.test(arg))) {
		throw new Error(`${command.id}: エラーfixtureは禁止`);
	}
}


// 書き出し先の親だけを作り、Exporterの出力前提を正常fixture側で満たす。
function prepare(command) {
	if (command.id === 'native') {
		fs.mkdirSync(path.dirname(command.args.at(-1)), { recursive: true });
		return;
	}
	if (!command.args.includes('--export-release')) return;
	const outputFile = command.args.at(-1);
	if (!path.isAbsolute(outputFile)) throw new Error(`${command.id}: export先が絶対pathではない`);
	fs.mkdirSync(path.dirname(outputFile), { recursive: true });
}


// symlinkを解決し、診断報告のprocPathと同じ実体pathへ揃える。
function executable(file) {
	if (!path.isAbsolute(file)) return file;
	try {
		return fs.realpathSync(file);
	} catch {
		return path.normalize(file);
	}
}


// crash報告の追加と更新をfile単位で比較できる形へする。
function diagnostics() {
	const found = new Map();
	for (const dir of reportDirs) {
		if (!fs.existsSync(dir)) continue;
		for (const name of fs.readdirSync(dir)) {
			const file = path.join(dir, name);
			try {
				const stat = fs.statSync(file);
				if (stat.isFile()) found.set(file, `${stat.size}:${stat.mtimeMs}`);
			} catch {
				// OSが同時に整理したfileは次のsnapshotへ委ねる。
			}
		}
	}
	return found;
}


// snapshot後に現れた、または更新された診断報告だけを返す。
function diagnosticDelta(before, after) {
	return [...after].filter(([file, stamp]) => before.get(file) !== stamp).map(([file]) => file);
}


// macOS日時を実行時間帯と比較できるUTC時刻へ変換する。
function macTime(value) {
	const match = value?.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d+))? ([+-]\d{2})(\d{2})$/);
	if (!match) return NaN;
	const ms = (match[3] || '').slice(0, 3).padEnd(3, '0');
	return Date.parse(`${match[1]}T${match[2]}.${ms}${match[4]}:${match[5]}`);
}


// 配布fileのSHA-256を測定時の固定値と照合する。
function artifactHashes(dir) {
	return Object.fromEntries(fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile()).map((name) => {
		const data = fs.readFileSync(path.join(dir, name));
		return [name, crypto.createHash('sha256').update(data).digest('hex')];
	}));
}


// file集合とhashの両方が同じ測定だけを有効とする。
function sameHashes(actual, expected) {
	const names = Object.keys(actual);
	return names.length === Object.keys(expected || {}).length && names.every((name) => expected[name] === actual[name]);
}


// .ips本文の所有照合に必要な三項目だけを読む。
function parseDiagnostic(file) {
	try {
		const text = fs.readFileSync(file, 'utf8');
		const split = text.indexOf('\n');
		const body = JSON.parse(text.slice(split + 1));
		return {
			file,
			pid: Number(body.pid),
			procPath: executable(body.procPath || ''),
			procLaunch: body.procLaunch || '',
			procLaunchMs: macTime(body.procLaunch),
		};
	} catch (error) {
		return { file, parseError: error.message };
	}
}


// PID、絶対実行path、起動時刻が全一致する報告だけを自分の失敗とする。
function ownedDiagnostics(files, owners) {
	const parsed = files.map(parseDiagnostic);
	const owned = parsed.filter((report) => owners.some((owner) => (
		report.pid === owner.pid
		&& path.isAbsolute(report.procPath || '')
		&& report.procPath === owner.executable
		&& report.procLaunchMs >= owner.startedAt
		&& report.procLaunchMs <= owner.endedAt
	)));
	return { owned, unrelated: parsed.filter((report) => !owned.includes(report)) };
}


// macOSのprocess表を読み、所有した子processだけを追跡する。
function processTable() {
	return new Promise((resolve, reject) => {
		execFile(ps, ['-axo', 'pid=,ppid=,pgid=,comm='], { maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
			if (error) return reject(error);
			const rows = stdout.split('\n').map((line) => {
				const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
				return match && { pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), executable: executable(match[4]) };
			}).filter(Boolean);
			resolve(rows);
		});
	});
}


// 起点PIDから辿れる子孫を抽出し、後の再親化もPIDで検知する。
function descendants(rows, parentPid) {
	const ids = new Set([parentPid]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const row of rows) {
			if (ids.has(row.ppid) && !ids.has(row.pid)) {
				ids.add(row.pid);
				changed = true;
			}
		}
	}
	ids.delete(parentPid);
	return rows.filter((row) => ids.has(row.pid));
}


// 観測済みPIDまたは専用groupに残るprocessだけを抽出する。
function residuals(rows, leaderPid, seen) {
	return rows.filter((row) => row.pgid === leaderPid || seen.get(row.pid) === row.executable);
}


// signal対象を専用groupへ限定し、他のGodotには触れない。
function signalGroup(pid, signal) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(-pid, signal);
		return true;
	} catch (error) {
		if (error.code !== 'ESRCH') throw error;
		return false;
	}
}


// 監視時と同じ実行pathのまま残ったPIDだけを個別終了する。
function signalResiduals(rows, seen, signal) {
	for (const row of rows) {
		if (seen.get(row.pid) !== row.executable) continue;
		try {
			process.kill(row.pid, signal);
		} catch (error) {
			if (error.code !== 'ESRCH') throw error;
		}
	}
}


// 出力を上限内で保持し、判定に必要な末尾を失わない。
function appendLog(state, chunk) {
	state.text += chunk;
	if (Buffer.byteLength(state.text) <= maxLog) return;
	state.text = state.text.slice(-maxLog);
	state.truncated = true;
}


// 一つの正常commandを専用process groupで実行し、全終了条件を測る。
async function run(command) {
	const before = diagnostics();
	const stdout = { text: '', truncated: false };
	const stderr = { text: '', truncated: false };
	const seen = new Map();
	const startedAt = Date.now();
	let timedOut = false;
	let spawnError = null;
	let watchError = null;
	let scanning = false;
	const child = spawn(command.file, command.args, {
		cwd: root,
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	if (Number.isInteger(child.pid)) seen.set(child.pid, executable(command.file)); // leaderも所有PID履歴へ追加。
	child.stdout.on('data', (chunk) => appendLog(stdout, chunk.toString()));
	child.stderr.on('data', (chunk) => appendLog(stderr, chunk.toString()));
	child.on('error', (error) => { spawnError = error.message; });

	// 短命なbrowser子processも再親化前に記録する監視。
	const watch = setInterval(async () => {
		if (scanning) return;
		scanning = true;
		try {
			for (const row of descendants(await processTable(), child.pid)) seen.set(row.pid, row.executable);
		} catch (error) {
			watchError = error.message;
		} finally {
			scanning = false;
		}
	}, 100);
	let timer;
	let hardTimer;
	let guardTimer;
	const ended = await new Promise((resolve) => {
		let done = false;
		const finish = (value) => {
			if (done) return;
			done = true;
			resolve(value);
		};
		child.once('close', (code, signal) => finish({ code, signal }));
		timer = setTimeout(() => {
			timedOut = true;
			signalGroup(child.pid, 'SIGTERM');
		}, command.timeoutMs);
		hardTimer = setTimeout(async () => {
			if (!timedOut) return;
			signalGroup(child.pid, 'SIGKILL');
			try {
				const rows = await processTable();
				signalResiduals(residuals(rows, child.pid, seen), seen, 'SIGKILL');
			} catch {
				// 最終process照合で観測不能として失敗させる。
			}
		}, command.timeoutMs + 2_000);
		guardTimer = setTimeout(() => {
			timedOut = true;
			child.stdout.destroy();
			child.stderr.destroy();
			finish({ code: null, signal: 'TIMEOUT' });
		}, command.timeoutMs + 4_000);
	});
	clearTimeout(timer);
	clearTimeout(hardTimer);
	clearTimeout(guardTimer);
	clearInterval(watch);
	while (scanning) await new Promise((resolve) => setTimeout(resolve, 10));
	await new Promise((resolve) => setTimeout(resolve, 50));

	let rows = [];
	let processScanError = null;
	try {
		rows = await processTable();
	} catch (error) {
		processScanError = error.message;
	}
	const left = residuals(rows, child.pid, seen);
	if (left.length) {
		signalGroup(child.pid, 'SIGTERM');
		signalResiduals(left, seen, 'SIGTERM');
		await new Promise((resolve) => setTimeout(resolve, 30));
		signalGroup(child.pid, 'SIGKILL');
		signalResiduals(left, seen, 'SIGKILL');
	}
	await new Promise((resolve) => setTimeout(resolve, 50));
	const endedAt = Date.now();
	const owners = [...seen].map(([pid, file]) => ({ pid, executable: file, startedAt, endedAt }));
	const delta = diagnosticDelta(before, diagnostics());
	const reports = ownedDiagnostics(delta, owners);
	const text = `${stdout.text}\n${stderr.text}`;
	const badText = [...new Set(text.split('\n').filter((line) => /\bERROR\b|\bCRASH(?:ED)?\b|segmentation fault|abort trap|assertion failed/i.test(line)))];
	// crashは終了signal/codeで即失敗。遅れて生成される.ipsは所有三項目で補助確認。
	const ok = !timedOut && ended.code === 0 && ended.signal === null && !spawnError && !watchError && !processScanError && badText.length === 0 && reports.owned.length === 0 && left.length === 0;
	return {
		id: command.id,
		ok,
		timeoutMs: command.timeoutMs,
		durationMs: endedAt - startedAt,
		exitCode: ended.code,
		signal: ended.signal,
		timedOut,
		spawnError,
		watchError,
		processScanError,
		badText,
		diagnosticReports: reports.owned,
		unrelatedDiagnosticReports: reports.unrelated,
		residualProcesses: left,
		ownedProcesses: owners,
		stdout: stdout.text,
		stderr: stderr.text,
		stdoutTruncated: stdout.truncated,
		stderrTruncated: stderr.truncated,
	};
}


// 遅延生成された.ipsを全fileから再読し、今回所有したpathだけを最終照合する。
async function lateDiagnostics(results) {
	await new Promise((resolve) => setTimeout(resolve, 50));
	const owners = results.flatMap((result) => result.ownedProcesses);
	return ownedDiagnostics([...diagnostics().keys()], owners).owned;
}


// 選択した正常commandを順番に通し、最初の失敗で安全側へ止める。
async function main() {
	const option = options(process.argv.slice(2));
	const partial = !!option.only;
	commands.forEach(validate);
	const selected = option.only ? commands.filter((command) => option.only.has(command.id)) : commands;
	if (option.only && selected.length !== option.only.size) throw new Error('存在しない正常commandが指定された');
	if (option.dryRun) {
		console.log(JSON.stringify(selected.map(({ id, file, args, timeoutMs }) => ({ id, file, args, timeoutMs })), null, 2));
		return;
	}
	fs.mkdirSync(tmp, { recursive: true });
	const results = [];
	for (const command of selected) {
		prepare(command);
		const result = await run(command);
		results.push(result);
		console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.id} code=${result.exitCode} signal=${result.signal || '-'} timeout=${result.timedOut} diagnostics=${result.diagnosticReports.length} residual=${result.residualProcesses.length}`);
		if (!result.ok) break;
	}
	const late = await lateDiagnostics(results);
	const lifecycleOk = results.length === selected.length && results.every((result) => result.ok) && late.length === 0;
	const gui = JSON.parse(fs.readFileSync(path.join(matrix, 'n16_gui/runtime-result.json'), 'utf8'));
	const subviewport = JSON.parse(fs.readFileSync(path.join(matrix, 'n17_subviewport/runtime-result.json'), 'utf8'));
	const features = JSON.parse(fs.readFileSync(path.join(matrix, 'n18_2d_features/runtime-result.json'), 'utf8'));
	const canvas = JSON.parse(fs.readFileSync(path.join(matrix, 'n19_canvas_commands/runtime-result.json'), 'utf8'));
	const boundary = JSON.parse(fs.readFileSync(path.join(root, 'tmp/gdweb/boundary/runtime-result.json'), 'utf8'));
	const inventory = JSON.parse(fs.readFileSync(path.join(matrix, 'n18_2d_features/inventory-static-result.json'), 'utf8'));
	const manifest = JSON.parse(fs.readFileSync(path.join(matrix, 'n18_2d_features/project/feature_manifest.json'), 'utf8'));
	const sizes = JSON.parse(fs.readFileSync(path.join(root, 'tmp/gdweb/metrics/sizes.json'), 'utf8'));
	const performance = JSON.parse(fs.readFileSync(path.join(root, 'tmp/gdweb/metrics/performance.json'), 'utf8'));
	const reproduction = JSON.parse(fs.readFileSync(path.join(root, 'tmp/gdweb/reproduction/result.json'), 'utf8'));
	const siteProof = JSON.parse(fs.readFileSync(path.join(root, 'tmp/daito-site/result.json'), 'utf8'));
	const sitePerf = JSON.parse(fs.readFileSync(path.join(root, 'tmp/daito-site/performance.json'), 'utf8'));
	const distribution = { gdweb: path.join(root, 'tmp/gdweb/smoke-export'), full: path.join(root, 'tmp/gdweb/full-export') };
	const currentArtifacts = Object.fromEntries(Object.entries(distribution).map(([kind, dir]) => [kind, artifactHashes(dir)]));
	const sizeArtifacts = Object.fromEntries(['gdweb', 'full'].map((kind) => [kind, Object.fromEntries(Object.entries(sizes[kind].files).map(([name, value]) => [name, value.sha256]))]));
	const metrics = {
		ok: sizes.ok && performance.ok
			&& ['gdweb', 'full'].every((kind) => sameHashes(currentArtifacts[kind], sizeArtifacts[kind]) && sameHashes(currentArtifacts[kind], performance.artifacts[kind]))
			&& ['gdweb', 'full'].every((kind) => ['cold', 'warm'].every((state) => performance.samples[kind][state].length === 7))
			&& ['cold', 'warm'].every((state) => performance.samples.gdweb[state].every((sample) => sample.fcp_ms > 0 && sample.first_canvas_ms > 0))
			&& ['raw', 'gzip', 'brotli'].every((key) => sizes.reduction[key] > 0),
		sizes: sizes.reduction,
		performance: performance.summary,
	};
	const structuralGroups = {
		n18_c_cpu_canvas: manifest.types.filter((type) => !type.name.startsWith('Navigation') && /Particle|Mesh|SurfaceTool|Light|Occluder|CanvasGroup|BackBuffer|CanvasModulate/.test(type.name)),
		n18_f_skeleton: manifest.types.filter((type) => /Skeleton|Bone/.test(type.name)),
	};
	const n18Groups = {
		...features.groups,
		...Object.fromEntries(Object.entries(structuralGroups).map(([group, types]) => [group, types.length > 0 && types.every((type) => type.capacity === 'structural-excluded')])),
	};
	const hashes = new Set([gui.runtime_sha256, subviewport.runtime_sha256, features.runtime_sha256, canvas.runtime_sha256]);
	const sameRuntime = hashes.size === 1;
	const site = {
		ok: siteProof.ok && siteProof.seo
			&& siteProof.initial_display?.loader_hidden
			&& siteProof.initial_display.preview_ms < siteProof.initial_display.wasm_delay_ms
			&& siteProof.containment?.dpr > 1
			&& siteProof.containment.desktop.backing_ratio.x > 1
			&& siteProof.containment.mobile.backing_ratio.x > 1
			&& siteProof.containment.desktop.max_right <= siteProof.containment.desktop.viewport.width + 0.5
			&& siteProof.containment.mobile.max_right <= siteProof.containment.mobile.viewport.width + 0.5
			&& siteProof.images?.loaded_before_screenshot
			&& siteProof.images.colored_samples > 1000
			&& siteProof.resize?.transitions === 2
			&& siteProof.runtime_sha256 === gui.runtime_sha256,
		proof: path.join(root, 'tmp/daito-site/result.json'),
	};
	// 参考作品は同一内容のfull Webより表示と操作が速い場合だけ合格とする。
	const sitePerformance = {
		ok: sitePerf.ok
			&& sameHashes(artifactHashes(path.join(root, 'tmp/daito-site/out')), sitePerf.artifacts.gdweb)
			&& sameHashes(artifactHashes(path.join(root, 'tmp/daito-site/full-out')), sitePerf.artifacts.full)
			&& ['gdweb', 'full'].every((kind) => ['cold', 'warm'].every((state) => sitePerf.samples[kind][state].length === 7))
			&& ['cold', 'warm'].every((state) => ['first_canvas_ms', 'interactive_ms', 'transfer_bytes'].every((key) => sitePerf.reduction[state][key] > 0)),
		proof: path.join(root, 'tmp/daito-site/performance.json'),
		reduction: sitePerf.reduction,
	};
	const normal = {
		N01: canvas.ok && ['rect', 'triangle', 'circle', 'line', 'polygon2d'].every((key) => key in canvas.pixels),
		N02: canvas.texture_lifecycle && ['texture', 'tiled'].every((key) => key in canvas.pixels),
		N03: features.groups.n18_b_sprite_geometry && 'rotatedImage' in features.pixels,
		N04: features.groups.n18_b_sprite_geometry && ['flippedLeft', 'flippedRight'].every((key) => key in features.pixels),
		N05: gui.ok && gui.viewport_max_error_px < 1,
		N06: gui.ok && gui.input.disabled && gui.themes.combinations === 9,
		N07: features.groups.n18_a_transform_state && 'zOverlap' in features.pixels,
		N08: gui.ok && gui.semantics.popup,
		N09: gui.ok && gui.input.ime && gui.input.selection && gui.input.tab,
		N10: gui.ok && gui.semantics.containers,
		N11: features.groups.n18_d_physics,
		N12: features.groups.n18_h_audio_path && features.audio?.finished,
		N13: gui.ok && gui.themes.viewports === 3,
		N14: lifecycleOk,
		N15: features.delayed_pack?.mounted && features.delayed_pack.server_hits === 1 && features.delayed_pack.warm_transfer === 0,
		N16: gui.ok && gui.counts.total === 78 && gui.counts.concrete === 64,
		N17: subviewport.ok && subviewport.mae < subviewport.limit,
		N18: features.ok && ['n18_a_transform_state', 'n18_b_sprite_geometry', 'n18_c_cpu_canvas', 'n18_d_physics', 'n18_e_tile_parallax', 'n18_f_skeleton', 'n18_g_navigation', 'n18_h_audio_path', 'n18_i_video'].every((group) => n18Groups[group]) && inventory.inventoryOk && inventory.implementationReady && inventory.counts.unimplemented === 0,
		N19: canvas.ok && canvas.commands.length === 7 && canvas.excluded.length === 3,
	};
	// 実在三作品は専用証拠が存在し、同じruntime hashのときだけ合格とする。
	const integrations = Object.fromEntries(['I01', 'I02', 'I03'].map((id) => {
		const prefix = id.toLowerCase();
		const dir = fs.readdirSync(matrix, { withFileTypes: true }).find((item) => item.isDirectory() && item.name.startsWith(`${prefix}_`));
		const file = dir && path.join(matrix, dir.name, 'runtime-result.json');
		const value = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
		return [id, { ok: !!value?.ok && value.runtime_sha256 === gui.runtime_sha256, proof: file || null }];
	}));
	const completeOk = lifecycleOk && sameRuntime && site.ok && sitePerformance.ok && boundary.ok && metrics.ok && reproduction.ok && Object.values(normal).every(Boolean) && Object.values(integrations).every((item) => item.ok);
	const report = {
		ok: partial ? null : completeOk,
		partial_ok: partial ? lifecycleOk : null,
		complete: !partial,
		selected: partial ? selected.map((command) => command.id) : commands.map((command) => command.id),
		createdAt: new Date().toISOString(),
		runtimeSha256: gui.runtime_sha256,
		sameRuntime,
		normal,
		integrations,
		site,
		sitePerformance,
		boundary,
		n18Groups,
		metrics,
		reproduction,
		lateDiagnosticReports: late,
		results,
	};
	const name = partial ? `partial-${selected.map((command) => command.id).join('-')}.json` : 'result.json';
	fs.writeFileSync(path.join(tmp, name), JSON.stringify(report, null, 2));
	if (partial ? !lifecycleOk : !completeOk) process.exitCode = 1;
}

main().catch((error) => {
	console.error(error.stack || error);
	process.exitCode = 1;
});
