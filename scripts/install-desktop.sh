#!/usr/bin/env bash
# 将 CloudMusic 安装到当前用户的应用程序菜单（GNOME「显示应用」），无需 root 权限。
#
# 原理：把图标放入 ~/.local/share/icons/，把 .desktop 文件放入 ~/.local/share/applications/。
# GNOME 会自动扫描这些目录，应用即出现在「显示应用」里。
#
# 用法：
#   ./scripts/install-desktop.sh          # 安装
#   ./scripts/install-desktop.sh --uninstall  # 卸载

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="cloudmusic-desktop"
APP_NAME="CloudMusic"
APP_NAME_ZH="网易云音乐"

ICON_SRC="$DIR/assets/icon.png"
LAUNCHER_SRC="$DIR/scripts/launcher.sh"

# 安装位置
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
DESKTOP_FILE="$APPS_DIR/$APP_ID.desktop"
ICON_FILE="$ICONS_DIR/$APP_ID.png"

uninstall() {
  echo "卸载 CloudMusic…"
  rm -f "$DESKTOP_FILE"
  rm -f "$ICON_FILE"
  rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/icons/$APP_ID.png"
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
  fi
  echo "已卸载。"
}

if [ "${1:-}" = "--uninstall" ]; then
  uninstall
  exit 0
fi

# 前置检查
if [ ! -f "$ICON_SRC" ]; then
  echo "缺少图标：$ICON_SRC（请先运行 python3 scripts/gen-icons.py）" >&2
  exit 1
fi
if [ ! -f "$LAUNCHER_SRC" ]; then
  echo "缺少启动脚本：$LAUNCHER_SRC" >&2
  exit 1
fi

echo "安装 CloudMusic 到应用程序菜单…"
mkdir -p "$APPS_DIR" "$ICONS_DIR"

chmod +x "$LAUNCHER_SRC"
cp "$ICON_SRC" "$ICON_FILE"
# 兼容：部分桌面环境在 ~/.local/share/icons 根目录查找图标
cp "$ICON_SRC" "${XDG_DATA_HOME:-$HOME/.local/share}/icons/$APP_ID.png"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_NAME
Name[zh_CN]=$APP_NAME_ZH
GenericName=Music Player
GenericName[zh_CN]=音乐播放器
Comment=网易云音乐桌面客户端
Exec=$LAUNCHER_SRC
Icon=$APP_ID
Terminal=false
Categories=AudioVideo;Audio;Player;
StartupWMClass=cloudmusic-desktop
StartupNotify=true
EOF

chmod +x "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
fi

echo "✅ 安装完成。"
echo "   图标位置：$ICON_FILE"
echo "   菜单项：  $DESKTOP_FILE"
echo "   现在可在 GNOME「显示应用」中搜索到「$APP_NAME_ZH / $APP_NAME」。"
