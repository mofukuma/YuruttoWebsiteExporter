// Scene同期完了を外部site codeが受け取れる例。
document.addEventListener('gdweb:scene-enter', (event) => {
	document.documentElement.dataset.gdwebScene = event.detail.name;
});
