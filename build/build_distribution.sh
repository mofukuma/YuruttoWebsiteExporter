#!/bin/sh
# 固定Docker環境でaddon配布用Webテンプレートを一括生成する。
# Host差を排除し、version更新時も同じ入口を使う設計。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # yweb project root。
. "$repo/build/distribution.lock"
platform_name=$(printf '%s' "$BUILDER_PLATFORM" | tr '/' '-') # pathへ使える対象環境名。
cache=/work/tmp/distribution-$platform_name # container専用toolchain cache。
output=/work/tmp/distribution/template-proof # 配布前の展開成果物。
home=/work/tmp/distribution-$platform_name/home # Emscripten設定の書込先。

# 未知のlevelをcontainer起動前に止める。
for level in "$@"; do
	awk -v want="$level" '!/^#/ && $1 == want { found = 1 } END { exit !found }' "$repo/build/levels.options"
done

# 定義が同じDocker imageは生成処理を省く。
image_key=$(node "$repo/build/template_key.cjs" --image) # builder構成の識別値。
image=yweb-template-builder:$(printf '%s' "$image_key" | cut -c1-16) # 構成ごとに残すlocal builder名。
if ! docker image inspect "$image" >/dev/null 2>&1; then
	docker build \
	  --platform "$BUILDER_PLATFORM" \
	  --build-arg "SCONS_VERSION=$SCONS_VERSION" \
	  --build-arg "UV_VERSION=$UV_VERSION" \
	  --build-arg "UV_SHA256=$UV_SHA256" \
	  --build-arg "SCONS_SHA256=$SCONS_SHA256" \
	  -f "$repo/build/distribution/Dockerfile" \
	  -t "$image" "$repo"
fi

mkdir -p "$repo/tmp/distribution-$platform_name/home"

# 対象指定時は検証成果物をtmpへ留め、二構成を揃える実行で配布addonへ反映する。
publish=1
if test "$#" -gt 0; then publish=0; fi

# HostのGodot templateやEmscriptenを参照せず配布物を生成する。
docker run --rm \
  --platform "$BUILDER_PLATFORM" \
  --user "$(id -u):$(id -g)" \
  -e "HOME=$home" \
  -e "YWEB_BUILD_ROOT=$cache" \
  -e "YWEB_TEMPLATE_OUT=$output" \
  -e "YWEB_SCONS_CACHE=$cache/scons-cache" \
  -e "YWEB_COMPILE_ENV=$image_key" \
  -e "YWEB_PUBLISH=$publish" \
  -e "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH" \
  -e TZ=UTC \
  -v "$repo:/work" \
  -w /work \
  "$image" "$@"

if test "$publish" = 1; then
	node "$repo/tests/template_distribution.cjs"
else
	for level in "$@"; do
		node "$repo/tests/template_output.cjs" "$repo/tmp/distribution/template-proof/$level/yweb-$level-template.zip" "$level"
	done
fi
