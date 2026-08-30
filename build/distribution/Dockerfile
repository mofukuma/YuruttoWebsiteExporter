# ゆるっとWeb配布テンプレートをLinux amd64で再現する固定build環境。
# GodotとEmscriptenはrepository内lockを正本とする設計。

FROM node:24.1.0-bookworm-slim@sha256:4b7fd762424e57e5cb316bece2c33fa35263ab11edd406f1a49d228e223c29d1

ARG SCONS_VERSION=4.10.1
ARG UV_VERSION=0.12.1
# uv公式archiveを検証するhash。
ARG UV_SHA256=90b2f223fb69d19db49e117da601f64978593417988530aa733d456141b4bcbb
# SCons wheelを検証するhash。
ARG SCONS_SHA256=bd9d1c52f908d874eba92a8c0c0a8dcf2ed9f3b88ab956d0fce1da479c4e7126

# Python道具は公式releaseとwheelのhashを照合してから導入する。
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential ca-certificates curl git libdigest-sha-perl patch pkg-config python3 unzip xz-utils zip \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz" -o /tmp/uv.tar.gz \
    && echo "${UV_SHA256}  /tmp/uv.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/uv.tar.gz -C /tmp \
    && install /tmp/uv-x86_64-unknown-linux-gnu/uv /tmp/uv-x86_64-unknown-linux-gnu/uvx /usr/local/bin/ \
    && curl -fsSL "https://files.pythonhosted.org/packages/ce/bf/931fb9fbb87234c32b8b1b1c15fba23472a10777c12043336675633809a7/scons-${SCONS_VERSION}-py3-none-any.whl" -o "/tmp/scons-${SCONS_VERSION}-py3-none-any.whl" \
    && echo "${SCONS_SHA256}  /tmp/scons-${SCONS_VERSION}-py3-none-any.whl" | sha256sum -c - \
    && env UV_TOOL_DIR=/opt/uv-tools UV_TOOL_BIN_DIR=/usr/local/bin \
        UV_NO_INDEX=1 uv tool install --python /usr/bin/python3 "/tmp/scons-${SCONS_VERSION}-py3-none-any.whl" \
    && rm -rf /tmp/uv* /tmp/scons-* \
    && chmod -R a+rX /opt/uv-tools /usr/local/bin

WORKDIR /work

ENTRYPOINT ["sh", "build/prepare_template.sh"]
