#!/usr/bin/env python3
# scripts/extract-body-template.py
# Extracts a figure body from a painting to use as a guest visitor template.
# The extracted figure has its head region made transparent so a generated
# face can be composited onto it.
#
# Usage:
#   python3 scripts/extract-body-template.py
#
# Output:
#   public/guest-bodies/hanxizai-visitor.png

from PIL import Image
import numpy as np
import os

# ── Config ────────────────────────────────────────────────────────────────────

# Source painting — use the hanxizai image from tmp-calibration
PAINTING_PATH = './tmp-calibration/hanxizai.jpg'

# The figure to extract — copy the far-right seated guest (x:0.82, y:0.20, w:0.10, h:0.58)
# We'll flip it horizontally so it faces the opposite direction as the "new" visitor
FIGURE_REGION = {
    'x': 0.820,  # normalized left
    'y': 0.180,  # normalized top
    'w': 0.105,  # normalized width
    'h': 0.600,  # normalized height
}

# Head region within the extracted figure (to make transparent for face overlay)
# The face takes up roughly the top 25% of the figure
HEAD_REGION = {
    'y_start': 0.00,  # top of figure
    'y_end':   0.30,  # bottom of head region (will be made transparent)
}

OUTPUT_PATH = './public/guest-bodies/hanxizai-visitor.png'

# ── Extract ───────────────────────────────────────────────────────────────────

def main():
    if not os.path.exists(PAINTING_PATH):
        print(f'❌ Painting not found: {PAINTING_PATH}')
        print('   Run from ruhua project root, ensure tmp-calibration/hanxizai.jpg exists')
        return

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    img = Image.open(PAINTING_PATH).convert('RGBA')
    W, H = img.size
    print(f'Painting size: {W}x{H}')

    # Extract figure region
    x1 = int(FIGURE_REGION['x'] * W)
    y1 = int(FIGURE_REGION['y'] * H)
    x2 = int((FIGURE_REGION['x'] + FIGURE_REGION['w']) * W)
    y2 = int((FIGURE_REGION['y'] + FIGURE_REGION['h']) * H)
    figure = img.crop((x1, y1, x2, y2))
    FW, FH = figure.size
    print(f'Extracted figure: {FW}x{FH} px')

    # Flip horizontally — new visitor faces opposite direction
    figure = figure.transpose(Image.FLIP_LEFT_RIGHT)

    # Make head region transparent — face will be composited here
    data = np.array(figure)
    head_y1 = int(HEAD_REGION['y_start'] * FH)
    head_y2 = int(HEAD_REGION['y_end'] * FH)

    # Gradient fade from transparent at top to opaque at head_y2
    for y in range(head_y1, head_y2):
        alpha = int(255 * (y - head_y1) / max(1, head_y2 - head_y1))
        # Smooth fade using cosine
        alpha = int(255 * (1 - np.cos(np.pi * (y - head_y1) / (head_y2 - head_y1))) / 2)
        data[y, :, 3] = np.minimum(data[y, :, 3], alpha)

    # Also feather the outer edges of the figure for natural blending
    for x in range(FW):
        # Left edge
        if x < 10:
            data[:, x, 3] = np.minimum(data[:, x, 3], int(255 * x / 10))
        # Right edge
        if x > FW - 10:
            data[:, x, 3] = np.minimum(data[:, x, 3], int(255 * (FW - x) / 10))
    for y in range(FH):
        # Bottom edge
        if y > FH - 20:
            data[y, :, 3] = np.minimum(data[y, :, 3], int(255 * (FH - y) / 20))

    result = Image.fromarray(data)
    result.save(OUTPUT_PATH, 'PNG')
    print(f'✅ Saved body template: {OUTPUT_PATH}')
    print(f'   Size: {FW}x{FH}')
    print(f'   Head region (transparent): top {head_y2}px ({HEAD_REGION["y_end"]*100:.0f}% of figure)')
    print()
    print('Next steps:')
    print('  1. Open the PNG and check the head region is transparent')
    print('  2. Adjust HEAD_REGION y_end if needed')
    print('  3. Update faceInBody coordinates in lib/faceRegions.js to match')

if __name__ == '__main__':
    main()
