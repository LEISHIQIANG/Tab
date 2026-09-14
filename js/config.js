// ── Configuration & Static Data ──
(function() {
  "use strict";

  // ── SVG Icons Definition (No Emojis) ──
  const SVG_ICONS = {
    ai: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/><path d="M19 5l.7 2.1a1 1 0 0 0 .7.7L22.5 8.5l-2.1.7a1 1 0 0 0-.7.7L19 12l-.7-2.1a1 1 0 0 0-.7-.7L15.5 8.5l2.1-.7a1 1 0 0 0 .7-.7L19 5z"/></svg>`,
    architecture: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M8 10h.01M16 10h.01M12 14h.01M8 14h.01M16 14h.01"/></svg>`,
    design: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12c0 3.6 2.4 6.6 6 7.6.6.1 1-.4 1-.9 0-.4-.1-.8-.1-1.2 0-1.1.9-2 2-2h1.5c3.6 0 6.5-2.9 6.5-6.5C22 5.6 17.5 2 12 2z"/></svg>`,
    tools: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    software: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
    code: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    network: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    media: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"/></svg>`,
    social: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    academic: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    map: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
    shop: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    folder: `<svg class="cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  };

  // ── Constants ──
  const DEFAULT_CAT_ORDER = ['AI 工具', '建筑设计', '影音阅读', '设计素材', '社交平台', '在线工具', '软件资源', '技术开发', '网络工具', '学术资讯', '地图出行', '购物生活', '其他', 'VPN'];
  const DEFAULT_CAT_ICONS = {
    'AI 工具': 'ai',
    '建筑设计': 'architecture',
    '设计素材': 'design',
    '在线工具': 'tools',
    '软件资源': 'software',
    '技术开发': 'code',
    '网络工具': 'network',
    '影音阅读': 'media',
    '社交平台': 'social',
    '学术资讯': 'academic',
    '地图出行': 'map',
    '购物生活': 'shop',
    '主页': 'folder',
    'VPN': 'network',
    '其他': 'folder'
  };

  const WALLPAPERS = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920',
    'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=1920',
    'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1920',
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920',
    'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920',
    'https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?w=1920',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920',
    'https://images.unsplash.com/photo-1552083375-1447ce886485?w=1920',
    'https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=1920',
  ];

  const ENGINE_ICONS = {
    google: `icons/google.com.ico`,
    baidu: `icons/baidu.com.ico`,
    bing: `icons/bing.com.ico`,
    yandex: `icons/yandex.com.ico`,
    github: `icons/github.com.ico`,
    xiaohongshu: `icons/xiaohongshu.com.ico`,
    zhihu: `icons/zhihu.com.ico`
  };

  const engines = {
    google:  { url:'https://www.google.com/search?q=', label:'Google' },
    baidu:   { url:'https://www.baidu.com/s?wd=',     label:'百度' },
    bing:    { url:'https://www.bing.com/search?q=',   label:'Bing' },
    yandex:  { url:'https://yandex.com/search/?text=', label:'Yandex' },
    github:  { url:'https://github.com/search?q=',     label:'GitHub' },
    xiaohongshu: { url:'https://www.xiaohongshu.com/search_result?keyword=', label:'小红书' },
    zhihu:   { url:'https://www.zhihu.com/search?q=',   label:'知乎' }
  };

  const FALLBACK_COLORS = [
    '#4f6ef6','#e85d75','#43b581','#f0a040','#9b59b6','#1abc9c','#e67e22',
    '#3498db','#2ecc71','#e74c3c','#16a085','#f39c12','#2980b9','#8e44ad','#27ae60',
  ];


  // Expose to window
  window.SVG_ICONS = SVG_ICONS;
  window.DEFAULT_CAT_ORDER = DEFAULT_CAT_ORDER;
  window.DEFAULT_CAT_ICONS = DEFAULT_CAT_ICONS;
  window.WALLPAPERS = WALLPAPERS;
  window.ENGINE_ICONS = ENGINE_ICONS;
  window.engines = engines;
  window.FALLBACK_COLORS = FALLBACK_COLORS;
})();
