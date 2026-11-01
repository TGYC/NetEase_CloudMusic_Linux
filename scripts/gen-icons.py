#!/usr/bin/env python3
"""生成 CloudMusic 应用图标（网易云音乐风格：红底圆形 + 白色音符）。

依赖：Pillow（`pip install pillow`）。
输出：
  build/icon.png   -> 1024x1024（electron-builder 打包用）
  assets/icon.png  -> 256x256（窗口 / 托盘用）
"""

import os
from PIL import Image, ImageDraw, ImageFont

RED = (194, 12, 12)          # #C20C0C 网易云音乐经典红
RED_DARK = (156, 8, 8)
WHITE = (255, 255, 255, 255)

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
]

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def find_font():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def draw_note(draw, cx, cy, scale, color=WHITE):
    """绘制一个白色八分音符（note head + 旗杆 + 旗尾）。"""
    head_rx = 0.085 * scale
    head_ry = 0.064 * scale
    stem_len = 0.34 * scale
    head_cx = cx
    head_cy = cy
    # 音符头（椭圆，稍微倾斜）
    draw.ellipse(
        [
            head_cx - head_rx,
            head_cy - head_ry,
            head_cx + head_rx,
            head_cy + head_ry,
        ],
        fill=color,
    )
    # 旗杆（从头部右上方向下延伸，用圆角矩形模拟）
    stem_top_x = head_cx + head_rx * 0.62
    stem_top_y = head_cy - stem_len
    stem_w = 0.022 * scale
    draw.rounded_rectangle(
        [stem_top_x - stem_w / 2, stem_top_y, stem_top_x + stem_w / 2, head_cy],
        radius=stem_w / 2,
        fill=color,
    )
    # 旗尾（从旗杆顶部向右的曲线）
    tail_w = 0.075 * scale
    tail_h = 0.10 * scale
    draw.rounded_rectangle(
        [stem_top_x, stem_top_y, stem_top_x + tail_w, stem_top_y + tail_h],
        radius=tail_h / 2,
        fill=color,
    )


def make_icon(size):
    # 4x 超采样抗锯齿
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(S * 0.015)
    # 红色圆形底 + 轻微径向高光（用两层椭圆模拟）
    d.ellipse([pad, pad, S - pad, S - pad], fill=RED)
    highlight = int(S * 0.22)
    d.ellipse(
        [int(S * 0.18), int(S * 0.10), int(S * 0.72), int(S * 0.60)],
        fill=(218, 40, 40, 90),
    )

    font_path = find_font()
    if font_path:
        # 优先用 ♫ 符号（双音符，更像网易云 logo）
        font = ImageFont.truetype(font_path, int(S * 0.52))
        glyph = "\u266B"  # ♫
        bbox = d.textbbox((0, 0), glyph, font=font)
        gw = bbox[2] - bbox[0]
        gh = bbox[3] - bbox[1]
        x = (S - gw) / 2 - bbox[0]
        y = (S - gh) / 2 - bbox[1]
        d.text((x, y), glyph, font=font, fill=WHITE)
    else:
        # 无字体时退回手绘单音符
        draw_note(d, S * 0.5, S * 0.56, S)

    return img.resize((size, size), Image.LANCZOS)


def main():
    build_dir = os.path.join(ROOT, "build")
    assets_dir = os.path.join(ROOT, "assets")
    os.makedirs(build_dir, exist_ok=True)
    os.makedirs(assets_dir, exist_ok=True)

    make_icon(1024).save(os.path.join(build_dir, "icon.png"))
    make_icon(256).save(os.path.join(assets_dir, "icon.png"))
    print("icons written to build/icon.png and assets/icon.png")


if __name__ == "__main__":
    main()
