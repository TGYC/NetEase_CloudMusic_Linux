#!/usr/bin/env python3
"""创建 GitHub Release 并上传打包产物。"""
import json
import os
import sys
import urllib.request
import urllib.error

TOKEN = os.environ["GH_TOKEN"]
OWNER = "TGYC"
REPO = "NetEase_CloudMusic_Linux"
TAG = "v1.0.0"
RELEASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "release")

ARTIFACTS = [
    ("CloudMusic-1.0.0-x86_64.AppImage", "application/octet-stream"),
    ("CloudMusic-1.0.0-amd64.deb", "application/vnd.debian.binary-package"),
    ("CloudMusic-1.0.0-x64.tar.gz", "application/gzip"),
    ("CloudMusic-1.0.0-win-x64.zip", "application/zip"),
]

CHECKSUMS = {
    "CloudMusic-1.0.0-x86_64.AppImage": "b0c7c5a624ceee2e6f7a1498a4313e1aeeef0516704143dcc68f88afbf476d08",
    "CloudMusic-1.0.0-amd64.deb": "1e189624009e8e1d89480933c61f723e564d7c54fc3f676fda50404317d1a55d",
    "CloudMusic-1.0.0-x64.tar.gz": "9e954f97638b0321549437467ba2a5e3ee0b6a8fdb0f378a738775e9a25abfea",
    "CloudMusic-1.0.0-win-x64.zip": "6a65eb15fbef70eca8fae33c7448ba52e8d3d4b16d8976b08ec46ee939069081",
}

BODY = """## CloudMusic v1.0.0

一个使用 Electron 封装的**网易云音乐**桌面客户端（非官方，仅供学习使用）。

### ✨ 功能特性

- 🎨 无边框窗口 + 自定义标题栏（深色 / 浅色主题）
- 🔐 登录状态持久化 + Cookie 导出 / 导入
- 🎧 悬浮置顶迷你播放器（封面 / 歌名 / 上一首 / 播放暂停 / 下一首）
- 🎛️ 全局媒体键（Linux 走 MPRIS，Windows / macOS 走全局快捷键）
- 🧹 广告与数据统计拦截
- 🔗 外部链接交给系统浏览器
- 🖥️ 系统托盘 + 关闭时最小化到托盘
- 🔇 播放时防熄屏

### 📦 下载（4 个版本）

| 文件 | 平台 | 说明 |
| --- | --- | --- |
| CloudMusic-1.0.0-x86_64.AppImage | Linux | 便携版，`chmod +x` 后直接运行 |
| CloudMusic-1.0.0-amd64.deb | Debian / Ubuntu | `sudo dpkg -i` 安装到「显示应用」 |
| CloudMusic-1.0.0-x64.tar.gz | Linux | 通用压缩包，解压即用 |
| CloudMusic-1.0.0-win-x64.zip | Windows | 便携版，解压后运行 `CloudMusic.exe` |

### 🔑 SHA256 校验

```
b0c7c5a624ceee2e6f7a1498a4313e1aeeef0516704143dcc68f88afbf476d08  CloudMusic-1.0.0-x86_64.AppImage
1e189624009e8e1d89480933c61f723e564d7c54fc3f676fda50404317d1a55d  CloudMusic-1.0.0-amd64.deb
9e954f97638b0321549437467ba2a5e3ee0b6a8fdb0f378a738775e9a25abfea  CloudMusic-1.0.0-x64.tar.gz
6a65eb15fbef70eca8fae33c7448ba52e8d3d4b16d8976b08ec46ee939069081  CloudMusic-1.0.0-win-x64.zip
```

> 首次打开会跳转到登录页，扫码登录后自动进入播放器，登录状态会持久保存。"""


def api_request(url, method="GET", data=None, headers=None, content_type=None):
    h = {
        "Authorization": f"token {TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "cloudmusic-release",
    }
    if headers:
        h.update(headers)
    if content_type:
        h["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main():
    # 1. 创建 Release
    payload = json.dumps({
        "tag_name": TAG,
        "name": TAG,
        "body": BODY,
        "draft": False,
        "prerelease": False,
    }).encode("utf-8")
    status, resp = api_request(
        f"https://api.github.com/repos/{OWNER}/{REPO}/releases",
        method="POST",
        data=payload,
        content_type="application/json",
    )
    if status not in (200, 201):
        print(f"[release] 创建失败 HTTP {status}: {resp.decode('utf-8', 'replace')[:500]}")
        sys.exit(1)
    info = json.loads(resp)
    release_id = info["id"]
    upload_url = info["upload_url"].split("{")[0]
    print(f"[release] 创建成功 id={release_id} url={upload_url}")

    # 2. 上传资产
    for filename, mime in ARTIFACTS:
        path = os.path.join(RELEASE_DIR, filename)
        if not os.path.exists(path):
            print(f"[asset] 跳过（不存在）{filename}")
            continue
        with open(path, "rb") as f:
            data = f.read()
        s, r = api_request(
            f"{upload_url}?name={filename}",
            method="POST",
            data=data,
            content_type=mime,
        )
        if s in (200, 201):
            print(f"[asset] 上传成功 {filename} ({len(data)//1024//1024} MB)")
        else:
            print(f"[asset] 上传失败 HTTP {s} {filename}: {r.decode('utf-8','replace')[:300]}")

    print("完成。Release 地址：")
    print(f"  https://github.com/{OWNER}/{REPO}/releases/tag/{TAG}")


if __name__ == "__main__":
    main()
