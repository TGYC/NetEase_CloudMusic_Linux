#!/usr/bin/env bash
# CloudMusic 启动脚本：定位项目目录并启动 Electron。
# 供 .desktop 文件调用；也可手动运行。

set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

ELECTRON="$DIR/node_modules/.bin/electron"
if [ ! -x "$ELECTRON" ]; then
  ELECTRON="$(command -v electron 2>/dev/null || true)"
fi

if [ -z "$ELECTRON" ]; then
  msg="未找到 Electron。请先执行：cd \"$DIR\" && npm install"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "CloudMusic" "$msg"
  fi
  echo "$msg" >&2
  exit 1
fi

# 先正常启动；若因 SUID sandbox 未正确配置而失败，则回退到 --no-sandbox。
LOG="$(mktemp)"
"$ELECTRON" "$DIR" "$@" 2>"$LOG"
code=$?
if [ "$code" -ne 0 ] && grep -qE "SUID sandbox|chrome-sandbox" "$LOG" 2>/dev/null; then
  exec "$ELECTRON" "$DIR" --no-sandbox "$@"
fi
rm -f "$LOG"
exit "$code"
