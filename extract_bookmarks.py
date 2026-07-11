#!/usr/bin/env python3
"""
Extract bookmarks from Chrome + iTab backup, merge & intelligently classify.
Run: python extract_bookmarks.py
Output: bookmarks.json + bookmarks.js
"""

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


CHROME_BOOKMARKS_PATH = os.path.expandvars(
    r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Bookmarks"
)
ITAB_BACKUP_PATH = r"D:\iTab备份-2026-06-22 06_10.itabdata"
OUTPUT_JSON = Path(__file__).parent / "bookmarks.json"
OUTPUT_JS = Path(__file__).parent / "bookmarks.js"

CATEGORY_ORDER = [
    "AI 工具", "建筑设计", "设计素材", "在线工具",
    "软件资源", "网络工具", "影音阅读", "社交平台",
    "学术资讯", "地图出行", "购物生活", "其他",
]

CLASSIFICATION_RULES = [
    ("建筑设计", [
        "autodesk", "欧特克", "archdaily", "architizer",
        "建筑cg", "cgjztu", "建筑曲奇", "archcookie",
        "模袋云", "modaiyun", "建筑设计云",
        "gooood", "谷德设计",
        "rhino", "food4rhino",
        "sketchup", "草图大师", "su插件", "sucj.me", "liutao",
        "energyplus",
        "标准图集", "jzxx.vip",
        "地形生成", "terrain-generator", "dx3377",
        "微思", "wislayers", "空间可视化",
        "geohub", "自定义地图",
        "航拍全景", "airpano",
        "studioalternativi",
        "d5render", "d5渲染器",
        "topoexport",
        "snazzymaps",
        "建筑设计",
    ]),

    ("设计素材", [
        "3d素材", "纹理", "texture", "hdr素材", "3d模型",
        "poly haven", "polyhaven", "ambientcg",
        "字体天下", "fonts.net.cn",
        "字体大全", "sozi.cn",
        "字体搬运工", "sucai999",
        "喵图记", "miaotj",
        "免费商用",
        "wallhaven", "pixabay", "pexels", "unsplash",
        "behance", "pixiv", "pinterest",
        "worldvectorlogo", "icon-icons",
        "素材", "材质",
    ]),

    ("AI 工具", [
        "liblib", "哩布",
        "通义万相", "tongyi", "wanxiang",
        "ai绘画", "ai创意", "ai创作", "aigc", "ai生成",
        "人工智能",
        "具像ai", "jx.cool",
        "ai室内设计",
        "openevai",
        "ai去水印", "quququ.cn",
        "chatgpt", "gemini", "claude", "grok", "deepseek",
        "minimax", "豆包", "doubao",
        "civitai", "huggingface",
        "trae.ai", "zenmux", "302.ai", "lovart.ai",
        "openrouter", "seadance",
        "antigravity",
    ]),

    ("在线工具", [
        "pdf转换", "pdf编辑", "pdf在线",
        "ilovepdf", "pdf24", "xpdf", "超级pdf",
        "pdf365", "福昕pdf", "aconvert", "yunzhan365",
        "格式转换",
        "tbox", "在线工具导航",
        "视频下载", "datatool", "视频解析", "cobalt.tools",
        "视频去水印", "zhibofeng",
        "acrobat.adobe",
        "office tool plus", "otp.landian",
        "hotkeycheatsheet", "快捷键",
        "hubweb", "苹果产品参数",
        "learn-anything",
        "dns leak", "browserleaks", "scamalytics",
        "ip查询", "网速测试",
        "qwerty learner",
    ]),

    ("软件资源", [
        "吾爱破解", "52pojie",
        "方舟下载", "fzxz",
        "软件目录", "游戏目录",
        "绿色软件", "dute8",
        "千宿", "qsu.hk",
        "cybermania",
        "fmhy",
        "hellogithub",
        "兰客创意", "wechalet",
        "ohio", "资源分享", "simonmy",
    ]),

    ("网络工具", [
        "vpn", "代理", "proxy", "privadovpn", "zoog",
        "proxy-seller", "isp代理",
        "仪表盘", "白羊星", "baiyangxing",
        "harry university mail",
        "cloudflare", "acck", "ocent", "vmiss",
        "dotdot", "lisahost", "丽萨主机",
        "telegram", "whatsapp", "discord",
    ]),

    ("影音阅读", [
        "观影", "gyling", "电影",
        "z-library", "zlib", "电子书",
        "太空鱼", "taikyu", "link3.cc/taikyu",
        "youtube", "bilibili", "哔哩",
        "抖音", "douyin", "tiktok",
        "虎牙", "huya",
        "steam", "store.steampowered",
        "cctv", "电视",
    ]),

    ("社交平台", [
        "github", "gitee", "码云",
        "csdn",
        "reddit", "twitter", "instagram", "facebook",
        "小红书", "xiaohongshu",
        "知乎", "zhihu",
        "微博", "weibo",
        "gmail", "outlook", "qq邮箱", "icloud",
        "飞书", "feishu",
        "sketchup forum",
    ]),

    ("学术资讯", [
        "nature", "sciencemag", "science.org",
        "cnki", "知网",
        "wikipedia", "维基",
        "人民日报", "people.com",
        "研究生", "chsi.com",
        "internet archive", "archive.org",
    ]),

    ("地图出行", [
        "地图", "map", "earth",
        "谷歌地球", "高德", "amap", "百度地图",
        "openstreetmap", "earthol",
        "天气", "weather", "weatherspark", "worldweatheronline",
        "msn", "msn.cn",
    ]),

    ("购物生活", [
        "淘宝", "taobao", "京东", "jd.com",
        "亚马逊", "amazon",
        "夸克网盘", "quark",
        "tradingview", "trading view",
    ]),

    ("其他", [
        "外贸", "waimao",
        "助学贷款", "csls.cdb",
        "bing", "yandex",
    ]),
]


def normalize_url(url):
    """Normalize URL for deduplication."""
    url = url.strip().rstrip("/")
    try:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}{p.path}".rstrip("/")
    except Exception:
        return url


def classify_bookmark(name, url):
    text = (name + " " + url).lower()
    for category, keywords in CLASSIFICATION_RULES:
        for kw in keywords:
            if kw in text:
                return category
    return "其他"


def extract_chrome_bookmarks(node):
    """Recursively extract all URL bookmarks from Chrome bookmarks node."""
    items = []
    if "children" not in node:
        return items
    for child in node["children"]:
        if child.get("type") == "url":
            url = child.get("url", "")
            if url and not url.startswith("chrome://"):
                items.append({"name": child.get("name", ""), "url": url})
        elif child.get("type") == "folder":
            items.extend(extract_chrome_bookmarks(child))
    return items


def extract_itab_icons(node):
    """Recursively extract icon links from iTab nav config."""
    items = []
    if "children" in node:
        for child in node["children"]:
            t = child.get("type", "")
            url = child.get("url", "")
            if url and t in ("icon", "component") and not url.startswith("itab://"):
                items.append({
                    "name": child.get("name", ""),
                    "url": url,
                    "icon": child.get("src", ""),
                    "bg": child.get("backgroundColor", ""),
                })
            elif t == "folder":
                items.extend(extract_itab_icons(child))
    return items


def main():
    # ── Step 1: Extract Chrome bookmarks ──
    chrome_items = []
    if os.path.exists(CHROME_BOOKMARKS_PATH):
        with open(CHROME_BOOKMARKS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        for root_key in ["bookmark_bar", "other", "synced"]:
            root = data.get("roots", {}).get(root_key)
            if root:
                chrome_items.extend(extract_chrome_bookmarks(root))
        print(f"Chrome bookmarks: {len(chrome_items)}")
    else:
        print("Chrome bookmarks file not found, skipping.")

    # ── Step 2: Extract iTab icons ──
    itab_items = []
    if os.path.exists(ITAB_BACKUP_PATH):
        with open(ITAB_BACKUP_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        for group in data.get("navConfig", []):
            itab_items.extend(extract_itab_icons(group))
        print(f"iTab icons: {len(itab_items)}")
    else:
        print("iTab backup file not found, skipping.")

    # ── Step 3: Merge — prefer iTab data (has icons), fallback to Chrome ──
    merged = {}  # normalized_url → bookmark dict

    # Add Chrome items first (lower priority)
    for item in chrome_items:
        key = normalize_url(item["url"])
        if key not in merged:
            merged[key] = {"name": item["name"], "url": item["url"], "icon": ""}

    # Overlay iTab items (higher priority — they have custom icons)
    for item in itab_items:
        key = normalize_url(item["url"])
        merged[key] = {
            "name": item["name"],
            "url": item["url"],
            "icon": item.get("icon", ""),
        }

    all_bookmarks = list(merged.values())

    chrome_only = sum(1 for b in all_bookmarks if not b["icon"])
    itab_only = sum(1 for b in all_bookmarks if b["icon"])
    print(f"\nMerged: {len(all_bookmarks)} total ({chrome_only} from Chrome, {itab_only} from iTab/have icon)")

    # ── Step 4: Classify ──
    for bm in all_bookmarks:
        bm["category"] = classify_bookmark(bm["name"], bm["url"])

    # ── Step 4.5: Tag proxy-needed sites ──
    PROXY_DOMAINS = {
        "google.com", "youtube.com", "twitter.com", "facebook.com", "instagram.com",
        "reddit.com", "pinterest.com", "tiktok.com", "discord.com", "telegram.org",
        "whatsapp.com", "openai.com", "chatgpt.com", "claude.ai", "grok.com",
        "huggingface.co", "civitai.com", "openrouter.ai", "seadanceai.com",
        "lovart.ai", "gemini.google.com", "antigravity.google",
        "wikipedia.org", "archive.org", "nature.com", "sciencemag.org",
        "zoog.info", "privadovpn.com", "proxy-seller.com", "vmiss.com",
        "ocent.net", "dotdotnetworks.com", "lisahost.com", "acck.io",
        "cloudflare.com", "scamalytics.com", "browserleaks.com",
        "z-library.sk", "cybermania.ws", "fmhy.net",
        "snazzymaps.com", "worldvectorlogo.com", "pexels.com", "unsplash.com",
        "wallhaven.cc", "minimax.io", "behance.net", "pixiv.net",
        "food4rhino.com", "architizer.com", "topoexport.com",
        "learn-anything.xyz", "hotkeycheatsheet.com", "studioalternativi.com",
        "icon-icons.com", "sketchup.com", "steampowered.com", "yandex.com",
    }
    proxy_count = 0
    for bm in all_bookmarks:
        domain = ""
        try:
            domain = urlparse(bm["url"]).hostname.replace("www.", "")
        except Exception:
            pass
        needs = any(domain == d or domain.endswith("." + d) for d in PROXY_DOMAINS)
        bm["needs_proxy"] = needs
        if needs:
            proxy_count += 1
    print(f"Proxy-needed sites: {proxy_count}")

    # Sort by category order, then name
    cat_index = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    all_bookmarks.sort(key=lambda b: (cat_index.get(b["category"], 99), b["name"].lower()))

    # ── Step 5: Write outputs ──
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(all_bookmarks, f, ensure_ascii=False, indent=2)
    print(f"JSON → {OUTPUT_JSON}")

    js_content = "window.__BOOKMARKS__ = " + json.dumps(all_bookmarks, ensure_ascii=False) + ";"
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write(js_content)
    print(f"JS   → {OUTPUT_JS}")

    # ── Step 6: Summary ──
    categories = {}
    for bm in all_bookmarks:
        cat = bm["category"]
        categories[cat] = categories.get(cat, 0) + 1

    print("\n📂 分类结果：")
    for cat in CATEGORY_ORDER:
        if cat in categories:
            print(f"  {cat}: {categories[cat]} 个")

    others = [b for b in all_bookmarks if b["category"] == "其他"]
    if others:
        print(f"\n⚠️  {len(others)} 个书签归入「其他」：")
        for b in others:
            print(f"  - {b['name']}  →  {b['url']}")


if __name__ == "__main__":
    main()
