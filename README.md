# CloudMusic · 网易云音乐桌面版

一个使用 [Electron](https://www.electronjs.org/) 封装的**网易云音乐（NetEase Cloud Music）桌面客户端**，加载官方网页播放器 <https://music.163.com/st/webplayer>，并提供原生桌面体验。

> ⚠️ 本项目为**非官方**客户端，仅供个人学习与使用，请勿用于商业用途。

## ✨ 功能特性

- 🎨 **无边框窗口 + 自定义标题栏**：后退 / 前进 / 刷新 / 首页、窗口控制按钮，深色 / 浅色主题（跟随系统）。
- 🔐 **登录状态持久化**：使用独立的 `persist:` 会话分区，Cookie 保存在本地，重启后仍保持登录，退出前自动落盘。
- 🍪 **Cookie 导出 / 导入**：可从「更多」菜单手动把 Cookie 导出为 JSON 备份，或从备份文件导入恢复登录状态。
- 🧹 **广告与数据统计拦截**：拦截常见第三方追踪域名，可在「更多」菜单中开关。
- 🔗 **外部链接智能处理**：网易域名（163.com / 126.net / netease.com）在应用内打开，其余链接交给系统默认浏览器。
- 📺 **全屏与视频体验**：F11 全屏、视频进入全屏时自动隐藏标题栏。
- 🖥️ **系统托盘**：支持「关闭时最小化到托盘」，托盘菜单可显示/隐藏窗口、迷你播放器、回到首页、退出。
- 🎧 **迷你播放器**：悬浮置顶的小窗，显示封面 / 歌名 / 歌手，支持上一首 / 播放暂停 / 下一首，双击回到主窗口；右上角 📌 可开关「始终置顶」。
- 🎛️ **全局媒体键**：Linux（Ubuntu/GNOME）通过 MPRIS 接入系统媒体控制，Windows / macOS 通过全局快捷键，支持播放/暂停、上一首、下一首。
- 🎹 **快捷键支持**：刷新、前进后退、缩放、全屏、开发者工具等。
- 💾 **窗口状态记忆**：自动记住窗口大小、位置和最大化状态。
- 🔇 **播放时防熄屏**：播放音乐时阻止显示器休眠。
- 🛡️ **安全配置**：`contextIsolation` + `sandbox` 开启，仅通过 preload 暴露白名单 API。

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18（推荐 20+）
- npm / pnpm / yarn

### 安装依赖

```bash
npm install
```

> 国内用户如遇到 Electron 二进制下载缓慢，可先设置镜像后重试：
>
> ```bash
> export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
> npm install
> ```

### 运行

```bash
npm start
```

开发模式（额外打印日志）：

```bash
npm run dev
```

## ⌨️ 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl/Cmd + R` | 刷新 |
| `Ctrl/Cmd + Shift + R` | 强制刷新（忽略缓存） |
| `Alt + ←` / `Alt + →` | 后退 / 前进 |
| `Ctrl/Cmd + H` | 回到首页 |
| `Ctrl/Cmd + Shift + M` | 迷你播放器（开 / 关） |
| `Ctrl/Cmd + + / - / 0` | 放大 / 缩小 / 重置缩放 |
| `F11` | 全屏 |
| `Ctrl/Cmd + Shift + I` | 开发者工具 |

## 🖥️ 安装到 Ubuntu「显示应用」

> 有两种方式，任选其一。

### 方式一：一键安装（无需 root）

直接安装到当前用户的应用程序菜单（GNOME 会立即在「显示应用」里显示）：

```bash
./scripts/install-desktop.sh
```

安装后，在 GNOME「显示应用」中搜索「网易云音乐」或「CloudMusic」即可找到并固定到 Dock。

卸载：

```bash
./scripts/install-desktop.sh --uninstall
```

### 方式二：打包为 .deb 安装包（系统级安装）

```bash
npm run dist:linux
sudo dpkg -i release/*.deb
```

## 📁 项目结构

```
cloudmusic-desktop/
├── package.json          # 项目配置、脚本、打包配置
├── scripts/
│   ├── gen-icons.py      # 生成应用图标（红底圆形 + 音符）
│   ├── launcher.sh       # 启动脚本（供 .desktop 调用）
│   └── install-desktop.sh# 一键安装到 GNOME「显示应用」（无需 root）
├── assets/
│   └── icon.png          # 窗口 / 托盘图标 (256x256)
├── build/
│   └── icon.png          # 打包图标 (1024x1024)
└── src/
    ├── main.js           # 主进程：窗口、会话、拦截、托盘、媒体键、迷你播放器等
    ├── preload.js        # 标题栏窗口的预加载脚本（白名单 API）
    ├── preload-player.js # 内容页预加载：读取播放状态 + 转发控制命令
    ├── preload-mini.js   # 迷你播放器窗口的预加载脚本
    ├── settings.js       # 设置与窗口状态的读写（JSON 持久化）
    └── renderer/
        ├── index.html    # 自定义标题栏 + 错误页 + 轻提示
        ├── styles.css    # 标题栏与 UI 样式
        ├── renderer.js   # 标题栏交互逻辑
        ├── mini.html     # 迷你播放器界面
        ├── mini.css      # 迷你播放器样式
        └── mini.js       # 迷你播放器交互逻辑
```

## 📦 打包

使用 [electron-builder](https://www.electron.build/)：

```bash
# Linux（AppImage + deb）
npm run dist:linux

# Windows（NSIS 安装包）
npm run dist:win

# macOS（DMG）
npm run dist:mac
```

打包产物输出到 `release/` 目录。

## 🔧 常见问题

### Linux 下启动报沙箱错误（SUID sandbox）

若出现 `The SUID sandbox helper binary was found, but is not configured correctly`，可临时使用 `--no-sandbox` 启动：

```bash
npx electron . --no-sandbox
```

或在 Chrome 内核的 sandbox 不可用的环境（容器、无 root 权限）中运行。正式安装时建议配置好 `chrome-sandbox` 权限：

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

### 首次打开显示登录页

`/st/webplayer` 在未登录时会跳转到登录页，这是网易云音乐自身的行为。扫码登录后会自动跳回播放器，且登录状态会持久保存。

### 播放音频失败 / 403

本项目已为音乐 CDN（`*.126.net`）请求自动补全 `Referer` 头。若仍失败，请确认网络可正常访问网易云音乐。

### 全局媒体键（播放/暂停/上一首/下一首）

- **Ubuntu / GNOME（推荐）**：通过 MPRIS 接入系统媒体控制。按下键盘的媒体键、锁屏/通知中心的媒体控件、蓝牙耳机按键，都能控制播放。前提是系统存在 D-Bus 会话总线（桌面环境默认都有）。
- **Windows / macOS**：通过全局快捷键实现。

> 若 Linux 下媒体键无效，确认系统是 Xorg 还是 Wayland 均可（MPRIS 与两者兼容）；若仍无效，可查看终端日志中的 `[mpris]` / `[media]` 输出。

### 清除登录状态

点击标题栏右侧「⋯」→「清除浏览数据…」→ 选择「清除缓存和 Cookie」，即可退出登录。

### 备份 / 迁移登录状态（Cookie）

登录状态保存在本地 Cookie 中，重启后自动保持。如需手动备份或迁移到另一台电脑：

1. 点击标题栏右侧「⋯」→「导出 Cookie…」，把 Cookie 保存为 JSON 文件；
2. 在新设备上点击「⋯」→「导入 Cookie…」，选择该文件即可恢复登录。

> Cookie 文件包含账号登录凭证，请妥善保管、勿泄露给他人。

## ⚖️ 免责声明

本项目仅作为 Electron 技术学习示例，所有内容版权归网易云音乐及原作者所有。请勿用于任何商业或非法用途，使用本软件产生的任何后果由使用者自行承担。

## 📄 License

[MIT](./LICENSE)
# NetEase_CloudMusic-Linux
