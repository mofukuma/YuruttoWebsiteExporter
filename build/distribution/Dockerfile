# ゆるっとWeb配布runtimeをLinux amd64で再現する固定build環境。
# GodotとEmscriptenはrepository内lockを正本とする設計。

FROM node:24.1.0-bookworm-slim@sha256:4b7fd762424e57e5cb316bece2c33fa35263ab11edd406f1a49d228e223c29d1

ARG SCONS_VERSION=4.10.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl git libdigest-sha-perl patch pkg-config python3 python3-pip unzip xz-utils zip \
    && python3 -m pip install --break-system-packages --no-cache-dir "scons==${SCONS_VERSION}" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work

ENTRYPOINT ["sh", "build/prepare_runtime.sh"]
