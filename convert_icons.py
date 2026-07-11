#!/usr/bin/env python3
"""
Convert all icons to uniform 32x32 ICO format.
SVG → rendered by Node.js/sharp → PNG → ICO (Pillow)
PNG/JPG/WEBP → resized to 32x32 → ICO
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

BASE_DIR = Path(__file__).parent
ICONS_DIR = BASE_DIR / "icons"
BOOKMARKS_JSON = BASE_DIR / "bookmarks.json"
BOOKMARKS_JS = BASE_DIR / "bookmarks.js"
NODE = r"C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\node.exe"
NODE_MODULES = str(BASE_DIR / "node_modules")
TARGET_SIZE = 32

SVG_RENDER_JS = f"""
const sharp = require('sharp');
const fs = require('fs');
const svgPath = process.argv[2];
const outPath = process.argv[3];
const svg = fs.readFileSync(svgPath, 'utf-8');
sharp(Buffer.from(svg))
  .resize({TARGET_SIZE}, {TARGET_SIZE}, {{ fit: 'contain', background: {{ r: 0, g: 0, b: 0, alpha: 0 }} }})
  .png()
  .toFile(outPath)
  .then(() => process.exit(0))
  .catch(err => {{ console.error(err.message); process.exit(1); }});
"""


def render_svg(svg_path):
    """Render SVG to PNG using Node.js/sharp."""
    tmp_png = tempfile.mktemp(suffix=".png")
    tmp_js = tempfile.mktemp(suffix=".js")
    with open(tmp_js, "w") as f:
        f.write(SVG_RENDER_JS)

    env = os.environ.copy()
    env["NODE_PATH"] = NODE_MODULES

    result = subprocess.run(
        [NODE, tmp_js, str(svg_path), tmp_png],
        capture_output=True, text=True, timeout=30, env=env,
        cwd=str(BASE_DIR),
    )
    try:
        os.unlink(tmp_js)
    except Exception:
        pass

    if result.returncode != 0:
        print(f"    render error: {result.stderr.strip()[:100]}")
        try:
            os.unlink(tmp_png)
        except Exception:
            pass
        return None

    return tmp_png


def image_to_ico(src_path, dst_path):
    """Convert any image to 32x32 ICO using Pillow."""
    try:
        img = Image.open(src_path).convert("RGBA")
        img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
        img.save(dst_path, format="ICO", sizes=[(32, 32)])
        return True
    except Exception as e:
        print(f"    PIL error: {e}")
        return False


def main():
    if not ICONS_DIR.exists():
        print("icons/ not found.")
        sys.exit(1)

    # Collect all icon files (skip .ico that are already 32x32)
    icon_files = sorted([f for f in ICONS_DIR.iterdir() if f.is_file()])
    already_ok = 0

    # Pre-scan: check which ICOs are already correct size
    for f in icon_files:
        if f.suffix.lower() == ".ico":
            try:
                img = Image.open(f)
                if img.size == (TARGET_SIZE, TARGET_SIZE):
                    already_ok += 1
            except Exception:
                pass

    need_convert = len(icon_files) - already_ok
    print(f"Total files: {len(icon_files)}, already 32x32 ICO: {already_ok}, need convert: {need_convert}\n")

    converted = 0
    failed = 0

    for i, src_path in enumerate(icon_files):
        ext = src_path.suffix.lower()
        stem = src_path.stem

        # Skip already-perfect ICOs
        if ext == ".ico":
            try:
                img = Image.open(src_path)
                if img.size == (TARGET_SIZE, TARGET_SIZE):
                    continue
            except Exception:
                pass

        dst_path = ICONS_DIR / f"{stem}.ico"

        # SVG: render → PNG → ICO
        if ext == ".svg":
            tmp_png = render_svg(src_path)
            if tmp_png and image_to_ico(tmp_png, dst_path):
                converted += 1
                print(f"  [{i+1:3d}/{len(icon_files)}] {stem:40s} svg → ico ✓")
            else:
                failed += 1
                print(f"  [{i+1:3d}/{len(icon_files)}] {stem:40s} svg → ico ✗")
            if tmp_png:
                try:
                    os.unlink(tmp_png)
                except Exception:
                    pass
            continue

        # Bitmap: PNG/JPG/WEBP/GIF → ICO
        if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
            if image_to_ico(src_path, dst_path):
                converted += 1
                print(f"  [{i+1:3d}/{len(icon_files)}] {stem:40s} {ext[1:]} → ico ✓")
            else:
                failed += 1
                print(f"  [{i+1:3d}/{len(icon_files)}] {stem:40s} {ext[1:]} → ico ✗")
            continue

        # ICO that needs resize
        if ext == ".ico":
            if image_to_ico(src_path, dst_path):
                converted += 1
                print(f"  [{i+1:3d}/{len(icon_files)}] {stem:40s} ico → ico (32x32) ✓")
            else:
                failed += 1
                print(f"  [{i+1:3d}/{len(icon_files)}] {stem:40s} ico resize ✗")
            continue

    # Update bookmarks.json paths to .ico
    if BOOKMARKS_JSON.exists():
        with open(BOOKMARKS_JSON, "r", encoding="utf-8") as f:
            bookmarks = json.load(f)

        for bm in bookmarks:
            icon = bm.get("icon", "")
            if icon.startswith("icons/"):
                bm["icon"] = icon.rsplit(".", 1)[0] + ".ico"

        with open(BOOKMARKS_JSON, "w", encoding="utf-8") as f:
            json.dump(bookmarks, f, ensure_ascii=False, indent=2)

        js_content = "window.__BOOKMARKS__ = " + json.dumps(bookmarks, ensure_ascii=False) + ";"
        with open(BOOKMARKS_JS, "w", encoding="utf-8") as f:
            f.write(js_content)

    # Stats
    ico_count = len(list(ICONS_DIR.glob("*.ico")))
    other_count = len([f for f in ICONS_DIR.iterdir() if f.suffix.lower() != ".ico"])

    print(f"\n{'='*50}")
    print(f"Converted: {converted}, Failed: {failed}")
    print(f"ICO: {ico_count}, Other formats: {other_count}")
    if other_count > 0:
        print("Other files (old formats, safe to delete):")
        for f in sorted(ICONS_DIR.iterdir()):
            if f.suffix.lower() != ".ico":
                print(f"  {f.name}")


if __name__ == "__main__":
    main()
