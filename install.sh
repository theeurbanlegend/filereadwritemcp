#!/bin/sh
# Installs the FileReadWrite agent as `frw-agent`.
#   curl -fsSL https://raw.githubusercontent.com/theeurbanlegend/filereadwritemcp/main/install.sh | sh
# Options (env vars): FRW_VERSION=v1.2.3, FRW_INSTALL_DIR=~/.local/bin, FRW_REPO=owner/repo,
#   FRW_DOWNLOAD_URL (a mirror serving the release assets)
set -eu

REPO="${FRW_REPO:-theeurbanlegend/filereadwritemcp}"
VERSION="${FRW_VERSION:-latest}"
INSTALL_DIR="${FRW_INSTALL_DIR:-$HOME/.local/bin}"

fail() {
  echo "error: $*" >&2
  exit 1
}

os=$(uname -s)
arch=$(uname -m)
case "$os-$arch" in
  Darwin-arm64) target=aarch64-apple-darwin ;;
  Darwin-x86_64) target=x86_64-apple-darwin ;;
  Linux-x86_64 | Linux-amd64) target=x86_64-unknown-linux-gnu ;;
  *) fail "no prebuilt agent for $os $arch. Build it from source: cargo build --release in agent/" ;;
esac

if [ -n "${FRW_DOWNLOAD_URL:-}" ]; then
  base="$FRW_DOWNLOAD_URL"
elif [ "$VERSION" = "latest" ]; then
  base="https://github.com/$REPO/releases/latest/download"
else
  base="https://github.com/$REPO/releases/download/$VERSION"
fi

command -v curl >/dev/null 2>&1 || fail "curl is required"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

asset="agent-$target"
echo "Downloading $asset ($VERSION)..."
curl -fsSL "$base/$asset" -o "$tmp/$asset" || fail "download failed: $base/$asset"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" || fail "download failed: $base/SHA256SUMS"

expected=$(awk -v f="$asset" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")
[ -n "$expected" ] || fail "$asset is not listed in SHA256SUMS"
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$asset" | awk '{ print $1 }')
else
  actual=$(shasum -a 256 "$tmp/$asset" | awk '{ print $1 }')
fi
[ "$expected" = "$actual" ] || fail "checksum mismatch for $asset (expected $expected, got $actual)"

mkdir -p "$INSTALL_DIR"
mv "$tmp/$asset" "$INSTALL_DIR/frw-agent"
chmod 755 "$INSTALL_DIR/frw-agent"
if [ "$os" = "Darwin" ]; then
  xattr -d com.apple.quarantine "$INSTALL_DIR/frw-agent" 2>/dev/null || true
fi

echo "Installed $("$INSTALL_DIR/frw-agent" --version) to $INSTALL_DIR/frw-agent"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo
    echo "$INSTALL_DIR is not on your PATH. Add this to your shell profile:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac
echo
echo "Next: run 'frw-agent' and enter the enrollment code from your dashboard."
