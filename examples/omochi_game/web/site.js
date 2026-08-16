// Scene同期完了を外部site codeが受け取れる例。
document.addEventListener('yuruttoweb:scene-enter', (event) => {
	document.documentElement.dataset.yuruttowebScene = event.detail.name;
});
