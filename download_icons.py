#!/usr/bin/env python3
"""
Download all bookmark icons to local icons/ folder with multi-source fallback.
Run: python download_icons.py
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).parent
ICONS_DIR = BASE_DIR / "icons"
BOOKMARKS_JSON = BASE_DIR / "bookmarks.json"
BOOKMARKS_JS = BASE_DIR / "bookmarks.js"
ITAB_BACKUP = r"D:\iTab备份-2026-06-22 06_10.itabdata"

REQUEST_TIMEOUT = 8
DELAY = 0.2

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"


def get_domain(url):
    try:
        return urlparse(url).hostname.replace("www.", "")
    except Exception:
        return None


def get_filename(domain, ext):
    safe = domain.replace(":", "_").replace("/", "_")
    return f"{safe}.{ext}"


def http_get(url, timeout=REQUEST_TIMEOUT):
    """Fetch a URL, return (bytes, content_type) or (None, None)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content = resp.read()
            ct = resp.headers.get("Content-Type", "")
            return content, ct
    except Exception:
        return None, None


def is_valid_icon(data):
    """Check if downloaded data looks like an actual icon."""
    if not data or len(data) < 80:
        return False
    # SVG check
    if data.strip().startswith(b"<svg") or data.strip().startswith(b"<?xml"):
        return True
    # PNG check
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    # ICO check
    if data[:4] == b"\x00\x00\x01\x00":
        return True
    # JPEG check
    if data[:2] == b"\xff\xd8":
        return True
    # WEBP check
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    # GIF check
    if data[:6] in (b"GIF89a", b"GIF87a"):
        return True
    # If it's binary and > 500 bytes, probably ok
    if len(data) > 500:
        return True
    return False


def guess_ext(data, content_type=""):
    """Guess file extension from content."""
    if data.startswith(b"<svg") or data.startswith(b"<?xml"):
        return "svg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"\x00\x00\x01\x00":
        return "ico"
    if data[:2] == b"\xff\xd8":
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:6] in (b"GIF89a", b"GIF87a"):
        return "gif"
    if "svg" in content_type:
        return "svg"
    if "png" in content_type:
        return "png"
    return "ico"


def download_icon_to_path(url, filepath):
    """Download from URL, save to filepath. Returns True on success."""
    data, ct = http_get(url)
    if data and is_valid_icon(data):
        with open(filepath, "wb") as f:
            f.write(data)
        return True
    return False


def try_all_sources(domain):
    """
    Try multiple favicon sources for a domain.
    Returns (data, extension) or (None, None).
    """
    urls = [
        f"https://{domain}/favicon.ico",
        f"https://www.google.com/s2/favicons?domain={domain}&sz=64",
        f"https://favicon.im/{domain}?size=64",
        f"https://icons.duckduckgo.com/ip3/{domain}.ico",
        f"https://{domain}/apple-touch-icon.png",
        f"https://{domain}/favicon.png",
    ]

    for url in urls:
        data, ct = http_get(url)
        if data and is_valid_icon(data):
            ext = guess_ext(data, ct)
            return data, ext
        time.sleep(0.1)

    return None, None


def scrape_favicon_url(domain):
    """Try to find favicon URL from homepage HTML."""
    for scheme in ("https", "http"):
        url = f"{scheme}://{domain}/"
        data, _ = http_get(url, timeout=6)
        if not data:
            continue
        try:
            html = data.decode("utf-8", errors="ignore")
        except Exception:
            continue

        # Search for <link rel="icon" ... href="...">
        patterns = [
            r'<link[^>]+rel=["\'](?:shortcut )?icon["\'][^>]+href=["\']([^"\']+)["\']',
            r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\'](?:shortcut )?icon["\']',
            r'<link[^>]+rel=["\']apple-touch-icon["\'][^>]+href=["\']([^"\']+)["\']',
        ]
        for pat in patterns:
            m = re.search(pat, html, re.IGNORECASE)
            if m:
                fav_url = m.group(1)
                if fav_url.startswith("//"):
                    fav_url = scheme + ":" + fav_url
                elif fav_url.startswith("/"):
                    fav_url = f"{scheme}://{domain}{fav_url}"
                elif not fav_url.startswith("http"):
                    fav_url = f"{scheme}://{domain}/{fav_url}"
                return fav_url
        return None
    return None


def main():
    if not BOOKMARKS_JSON.exists():
        print("bookmarks.json not found. Run extract_bookmarks.py first.")
        sys.exit(1)

    with open(BOOKMARKS_JSON, "r", encoding="utf-8") as f:
        bookmarks = json.load(f)

    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    total = len(bookmarks)
    downloaded = 0
    skipped = 0
    failed = 0

    print(f"Downloading icons for {total} bookmarks...\n")

    for i, bm in enumerate(bookmarks):
        domain = get_domain(bm["url"])
        if not domain:
            skipped += 1
            continue

        # If already has a valid local icon, skip
        current_icon = bm.get("icon", "")
        if current_icon.startswith("icons/"):
            local_file = BASE_DIR / current_icon
            if local_file.exists() and local_file.stat().st_size > 80:
                skipped += 1
                continue

        # Strategy 1: Try the original icon URL (from iTab)
        icon_url = bm.get("icon", "")
        ext = "ico"
        if icon_url and icon_url.startswith("http"):
            ext_from_url = icon_url.rsplit(".", 1)[-1].split("?")[0]
            if len(ext_from_url) <= 5 and ext_from_url in ("svg", "png", "ico", "jpg", "jpeg", "webp", "gif"):
                ext = ext_from_url
            filename = get_filename(domain, ext)
            filepath = ICONS_DIR / filename
            if download_icon_to_path(icon_url, filepath):
                bm["icon"] = f"icons/{filename}"
                downloaded += 1
                print(f"  [{i+1:3d}/{total}] {domain:35s} ✓ iTab original")
                time.sleep(DELAY)
                continue

        # Strategy 2: Try multi-source favicon fallback
        data, ext = try_all_sources(domain)
        if data:
            filename = get_filename(domain, ext)
            filepath = ICONS_DIR / filename
            with open(filepath, "wb") as f:
                f.write(data)
            bm["icon"] = f"icons/{filename}"
            downloaded += 1
            print(f"  [{i+1:3d}/{total}] {domain:35s} ✓ favicon ({ext})")
            time.sleep(DELAY)
            continue

        # Strategy 3: Scrape homepage for favicon link
        scraped_url = scrape_favicon_url(domain)
        if scraped_url:
            data, ct = http_get(scraped_url, timeout=8)
            if data and is_valid_icon(data):
                ext = guess_ext(data, ct)
                filename = get_filename(domain, ext)
                filepath = ICONS_DIR / filename
                with open(filepath, "wb") as f:
                    f.write(data)
                bm["icon"] = f"icons/{filename}"
                downloaded += 1
                print(f"  [{i+1:3d}/{total}] {domain:35s} ✓ scraped ({ext})")
                time.sleep(DELAY)
                continue

        # Strategy 4: Try parent domain (e.g. case.openevai.com → openevai.com)
        parts = domain.split(".")
        if len(parts) > 2:
            parent = ".".join(parts[-(2 if parts[-1] in ("cn","com","org","net","hk","io","ai","cc","sk","ws","me") else 3):])
            if parent != domain:
                data, ext = try_all_sources(parent)
                if data:
                    filename = get_filename(domain, ext)
                    filepath = ICONS_DIR / filename
                    with open(filepath, "wb") as f:
                        f.write(data)
                    bm["icon"] = f"icons/{filename}"
                    downloaded += 1
                    print(f"  [{i+1:3d}/{total}] {domain:35s} ✓ parent domain ({ext})")
                    time.sleep(DELAY)
                    continue

        # All strategies failed
        bm["icon"] = ""
        failed += 1
        print(f"  [{i+1:3d}/{total}] {domain:35s} ✗ no icon found")
        time.sleep(DELAY)

    # Save
    with open(BOOKMARKS_JSON, "w", encoding="utf-8") as f:
        json.dump(bookmarks, f, ensure_ascii=False, indent=2)

    js_content = "window.__BOOKMARKS__ = " + json.dumps(bookmarks, ensure_ascii=False) + ";"
    with open(BOOKMARKS_JS, "w", encoding="utf-8") as f:
        f.write(js_content)

    local_icons = sum(1 for b in bookmarks if b.get("icon", "").startswith("icons/"))
    print(f"\n{'='*50}")
    print(f"Done! Downloaded: {downloaded}, Cached: {skipped}, Failed: {failed}")
    print(f"Coverage: {local_icons}/{total} ({100*local_icons//total}%)")
    print(f"bookmarks.json & bookmarks.js updated")


if __name__ == "__main__":
    main()
