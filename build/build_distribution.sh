#!/bin/sh
# 固定Docker環境でaddon配布用Web runtimeを一括生成する。
# Host差を排除し、version更新時も同じ入口を使う設計。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # yweb project root。
. "$repo/build/distribution.lock"
image=yweb-runtime-builder:$RUNTIME_PROFILE # local専用builder名。
platform_name=$(printf '%s' "$BUILDER_PLATFORM" | tr '/' '-') # pathへ使える対象環境名。
cache=/work/tmp/distribution-$platform_name # container専用toolchain cache。
output=/work/tmp/distribution/runtime-proof # 配布前の展開成果物。
home=/work/tmp/distribution-$platform_name/home # Emscripten設定の書込先。

# 固定imageとSConsだけからbuilderを生成する。
docker build \
  --platform "$BUILDER_PLATFORM" \
  --build-arg "SCONS_VERSION=$SCONS_VERSION" \
  -f "$repo/build/distribution/Dockerfile" \
  -t "$image" "$repo"

mkdir -p "$repo/tmp/distribution-$platform_name/home"

# HostのGodot templateやEmscriptenを参照せず配布物を生成する。
docker run --rm \
  --platform "$BUILDER_PLATFORM" \
  --user "$(id -u):$(id -g)" \
  -e "HOME=$home" \
  -e "YWEB_BUILD_ROOT=$cache" \
  -e "YWEB_RUNTIME_OUT=$output" \
  -e "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH" \
  -e TZ=UTC \
  -v "$repo:/work" \
  -w /work \
  "$image"

node "$repo/tests/runtime_distribution.cjs"
