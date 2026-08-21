# ゆるっとWeb配布テンプレートをLinux amd64で再現する固定build環境。
# GodotとEmscriptenはrepository内lockを正本とする設計。

FROM node:24.1.0-bookworm-slim@sha256:4b7fd762424e57e5cb316bece2c33fa35263ab11edd406f1a49d228e223c29d1

ARG SCONS_VERSION=4.10.1
ARG UV_VERSION=0.12.1

# Python道具の導入はuvへ寄せる。版を固定したまま、同じ手順をhost側とも揃える。
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl git libdigest-sha-perl patch pkg-config python3 unzip xz-utils zip \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://astral.sh/uv/${UV_VERSION}/install.sh" | env UV_INSTALL_DIR=/usr/local/bin sh \
    && env UV_TOOL_DIR=/opt/uv-tools UV_TOOL_BIN_DIR=/usr/local/bin \
        uv tool install --python /usr/bin/python3 "scons==${SCONS_VERSION}" \
    && chmod -R a+rX /opt/uv-tools /usr/local/bin

WORKDIR /work

ENTRYPOINT ["sh", "build/prepare_template.sh"]
