#!/usr/bin/env python3
"""
Generate a dedicated high-resolution 1200x630 Open Graph / Twitter social preview card
for EuroInference using only Python's standard library (zlib, struct, math).
"""

import math
import struct
import zlib

WIDTH = 1200
HEIGHT = 630

# Colors in (R, G, B)
BG_DARK = (11, 16, 32)        # #0b1020
BG_PANEL = (17, 24, 48)       # Slightly lighter container panel
EU_YELLOW = (255, 204, 0)     # #ffcc00
TEXT_WHITE = (248, 250, 252)  # #f8fafc
TEXT_MUTED = (148, 163, 184)  # #94a3b8
BORDER_COLOR = (40, 52, 85)   # Subtle border
ACCENT_BLUE = (14, 116, 144)  # #0e7490

# Standard 8x8 bitmap font for letters and numbers
# Simple 5x7 / 8x8 font representation for key titles
# We can render crisp vector/bitmap text for "EUROINFERENCE" and subtitle

FONT_MAP = {
    'A': [
        " 000 ",
        "0   0",
        "00000",
        "0   0",
        "0   0",
        "0   0",
    ],
    'B': [
        "0000 ",
        "0   0",
        "0000 ",
        "0   0",
        "0   0",
        "0000 ",
    ],
    'C': [
        " 0000",
        "0    ",
        "0    ",
        "0    ",
        "0    ",
        " 0000",
    ],
    'D': [
        "0000 ",
        "0   0",
        "0   0",
        "0   0",
        "0   0",
        "0000 ",
    ],
    'E': [
        "00000",
        "0    ",
        "0000 ",
        "0    ",
        "0    ",
        "00000",
    ],
    'F': [
        "00000",
        "0    ",
        "0000 ",
        "0    ",
        "0    ",
        "0    ",
    ],
    'G': [
        " 0000",
        "0    ",
        "0 000",
        "0   0",
        "0   0",
        " 0000",
    ],
    'H': [
        "0   0",
        "0   0",
        "00000",
        "0   0",
        "0   0",
        "0   0",
    ],
    'I': [
        "000",
        " 0 ",
        " 0 ",
        " 0 ",
        " 0 ",
        "000",
    ],
    'L': [
        "0    ",
        "0    ",
        "0    ",
        "0    ",
        "0    ",
        "00000",
    ],
    'M': [
        "0   0",
        "00 00",
        "0 0 0",
        "0   0",
        "0   0",
        "0   0",
    ],
    'N': [
        "0   0",
        "00  0",
        "0 0 0",
        "0  00",
        "0   0",
        "0   0",
    ],
    'O': [
        " 000 ",
        "0   0",
        "0   0",
        "0   0",
        "0   0",
        " 000 ",
    ],
    'P': [
        "0000 ",
        "0   0",
        "0000 ",
        "0    ",
        "0    ",
        "0    ",
    ],
    'R': [
        "0000 ",
        "0   0",
        "0000 ",
        "0 0  ",
        "0  0 ",
        "0   0",
    ],
    'S': [
        " 0000",
        "0    ",
        " 000 ",
        "    0",
        "    0",
        "0000 ",
    ],
    'T': [
        "00000",
        "  0  ",
        "  0  ",
        "  0  ",
        "  0  ",
        "  0  ",
    ],
    'U': [
        "0   0",
        "0   0",
        "0   0",
        "0   0",
        "0   0",
        " 000 ",
    ],
    'V': [
        "0   0",
        "0   0",
        "0   0",
        "0   0",
        " 0 0 ",
        "  0  ",
    ],
    'Y': [
        "0   0",
        "0   0",
        " 0 0 ",
        "  0  ",
        "  0  ",
        "  0  ",
    ],
    ' ': [
        "   ",
        "   ",
        "   ",
        "   ",
        "   ",
        "   ",
    ],
    '-': [
        "     ",
        "     ",
        "00000",
        "     ",
        "     ",
        "     ",
    ],
    '/': [
        "    0",
        "   0 ",
        "  0  ",
        " 0   ",
        "0    ",
        "     ",
    ],
    '•': [
        "     ",
        " 000 ",
        " 000 ",
        " 000 ",
        "     ",
        "     ",
    ],
}


def draw_pixel(canvas, x, y, r, g, b, a=255):
    if 0 <= x < WIDTH and 0 <= y < HEIGHT:
        idx = (y * WIDTH + x) * 4
        if a == 255:
            canvas[idx] = r
            canvas[idx + 1] = g
            canvas[idx + 2] = b
            canvas[idx + 3] = 255
        else:
            # Alpha blend
            alpha = a / 255.0
            inv = 1.0 - alpha
            canvas[idx] = int(r * alpha + canvas[idx] * inv)
            canvas[idx + 1] = int(g * alpha + canvas[idx + 1] * inv)
            canvas[idx + 2] = int(b * alpha + canvas[idx + 2] * inv)
            canvas[idx + 3] = 255


def draw_rect(canvas, x0, y0, w, h, color, fill=True, border_color=None):
    r, g, b = color
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            is_border = (x == x0 or x == x0 + w - 1 or y == y0 or y == y0 + h - 1)
            if is_border and border_color:
                draw_pixel(canvas, x, y, border_color[0], border_color[1], border_color[2])
            elif fill:
                draw_pixel(canvas, x, y, r, g, b)


def draw_text(canvas, text, start_x, start_y, scale=4, color=(255, 255, 255)):
    x_cursor = start_x
    for char in text.upper():
        glyph = FONT_MAP.get(char, FONT_MAP[' '])
        for row_idx, line in enumerate(glyph):
            for col_idx, cell in enumerate(line):
                if cell == '0':
                    for dy in range(scale):
                        for dx in range(scale):
                            draw_pixel(canvas, x_cursor + col_idx * scale + dx, start_y + row_idx * scale + dy, color[0], color[1], color[2])
        x_cursor += (len(glyph[0]) + 1) * scale + scale


def draw_star(canvas, cx, cy, r_outer, r_inner, color):
    # 5-pointed star
    for y in range(cy - r_outer - 1, cy + r_outer + 2):
        for x in range(cx - r_outer - 1, cx + r_outer + 2):
            dx = x - cx
            dy = y - cy
            dist = math.hypot(dx, dy)
            if dist > r_outer + 1:
                continue
            angle = math.atan2(dy, dx) - math.pi / 2
            while angle < 0:
                angle += 2 * math.pi
            # Each star point is 2pi / 5 = 72 deg
            sector = angle % (2 * math.pi / 5)
            half_sec = math.pi / 5
            rel_angle = abs(sector - half_sec)
            r_max = r_inner / math.cos(rel_angle) if math.cos(rel_angle) > 0 else r_outer
            # Smooth approximation
            if dist <= min(r_outer, r_inner + (r_outer - r_inner) * (1 - rel_angle / half_sec)):
                draw_pixel(canvas, x, y, color[0], color[1], color[2])


def main():
    canvas = bytearray(WIDTH * HEIGHT * 4)

    # 1. Background fill
    for y in range(HEIGHT):
        for x in range(WIDTH):
            idx = (y * WIDTH + x) * 4
            # Subtle radial background glow from center
            dist_center = math.hypot(x - WIDTH // 2, y - HEIGHT // 2) / 600.0
            glow = max(0.0, 1.0 - dist_center * 0.7)
            r = int(BG_DARK[0] + 8 * glow)
            g = int(BG_DARK[1] + 12 * glow)
            b = int(BG_DARK[2] + 28 * glow)
            canvas[idx] = min(255, r)
            canvas[idx + 1] = min(255, g)
            canvas[idx + 2] = min(255, b)
            canvas[idx + 3] = 255

    # 2. Top gold accent bar
    draw_rect(canvas, 0, 0, WIDTH, 8, EU_YELLOW)

    # 3. Main Center Glass Panel
    panel_x, panel_y, panel_w, panel_h = 80, 70, 1040, 490
    draw_rect(canvas, panel_x, panel_y, panel_w, panel_h, BG_PANEL, fill=True, border_color=BORDER_COLOR)

    # 4. EU Flag Star Ring decoration on the left
    ring_cx, ring_cy = 220, 310
    star_radius = 80
    for i in range(12):
        theta = i * (2 * math.pi / 12) - math.pi / 2
        sx = int(ring_cx + star_radius * math.cos(theta))
        sy = int(ring_cy + star_radius * math.sin(theta))
        draw_star(canvas, sx, sy, 11, 5, EU_YELLOW)

    # 5. Brand Title: "EURO" (EU Yellow) + "INFERENCE" (White)
    title_scale = 10
    draw_text(canvas, "EURO", 360, 150, scale=title_scale, color=EU_YELLOW)
    # Length of "EURO" = (4 chars * ~6 cols) * 10 ~ 240px
    euro_width = (6 + 6 + 6 + 6) * title_scale + 4 * title_scale
    draw_text(canvas, "INFERENCE", 360 + euro_width + 10, 150, scale=title_scale, color=TEXT_WHITE)

    # 6. Primary Subtitle: "MULTI-PROVIDER LLM PRICING COMPARE"
    draw_text(canvas, "MULTI-PROVIDER LLM PRICING COMPARE", 365, 260, scale=4, color=TEXT_WHITE)

    # 7. Key Features / Badges Row
    badge_items = [
        ("DATA SOVEREIGNTY", EU_YELLOW),
        ("PROMPT CACHING", (52, 211, 153)),
        ("VALUE & QUALITY", (147, 197, 253)),
        ("EU HOSTED", EU_YELLOW)
    ]
    badge_x = 365
    badge_y = 330
    for label, col in badge_items:
        text_w = len(label) * 6 * 2 + 10
        draw_rect(canvas, badge_x, badge_y, text_w + 24, 34, BG_DARK, fill=True, border_color=col)
        draw_text(canvas, label, badge_x + 12, badge_y + 9, scale=2, color=col)
        badge_x += text_w + 38

    # 8. Description row
    draw_text(canvas, "COMPARE MISTRAL • CORTECS • EDEN AI • OPPER • MAMMOUTH", 365, 410, scale=3, color=TEXT_MUTED)
    draw_text(canvas, "TRANSPARENT INFERENCE ECONOMICS • ZERO TRACKING • AGPL-3.0", 365, 460, scale=2, color=TEXT_MUTED)

    # 9. Bottom URL
    draw_text(canvas, "HTTPS://EUROINFERENCE.EU", 365, 505, scale=3, color=EU_YELLOW)

    # Convert to PNG format with filter byte 0 per scanline
    raw_data = bytearray()
    for y in range(HEIGHT):
        raw_data.append(0)  # Filter 0: None
        start = y * WIDTH * 4
        raw_data.extend(canvas[start:start + WIDTH * 4])

    compressed = zlib.compress(bytes(raw_data), 9)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = bytearray(b'\x89PNG\r\n\x1a\n')
    # IHDR chunk
    ihdr = struct.pack('>IIBBBBB', WIDTH, HEIGHT, 8, 6, 0, 0, 0)
    png.extend(chunk(b'IHDR', ihdr))
    # IDAT chunk
    png.extend(chunk(b'IDAT', compressed))
    # IEND chunk
    png.extend(chunk(b'IEND', b''))

    output_path = 'assets/og-image.png'
    with open(output_path, 'wb') as f:
        f.write(png)
    print(f"Generated {output_path} successfully ({len(png)} bytes, {WIDTH}x{HEIGHT}).")


if __name__ == '__main__':
    main()
