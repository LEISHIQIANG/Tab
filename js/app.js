// ── Main Application & UI Interactions ──
(function() {
  "use strict";

  const $ = id => document.getElementById(id);
  const el = {};

  function initRefs() {
    el.mainContent = $('mainContent');
    el.searchInput = $('searchInput');
    el.searchClear = $('searchClear');
    el.searchWrap = $('searchWrap');
    el.hero = $('hero');
    el.contextMenu = $('contextMenu');
    el.toast = $('toast');
    el.heroClock = $('heroClock');
    el.heroClockSub = $('heroClockSub');
    el.heroDate = $('heroDate');
    el.greeting = $('greeting');
    el.editModalOverlay = $('editModalOverlay');
    el.catModalOverlay = $('catModalOverlay');
    el.settingsOverlay = $('settingsOverlay');
    el.wpGallery = $('wpGallery');
  }
  initRefs();

  // ── Helpers ──
  function getDomain(url) { try { return new URL(url).hostname.replace(/^www\./,''); } catch { return url; } }
  function domainColor(d) { let h=0; for(let i=0;i<d.length;i++)h=d.charCodeAt(i)+((h<<5)-h); return FALLBACK_COLORS[Math.abs(h)%FALLBACK_COLORS.length]; }
  function domainInitial(d) { const p=d.split('.'); const n=p.length>1?p[p.length-2]:d; return (n[0]||'?').toUpperCase(); }


  // ── Apply Theme (Solar / Lunar SVG injection) ──
  function applyTheme(t) {
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    const btn = $('btnTheme');
    if (btn) {
      if (t === 'dark') {
        btn.innerHTML = `<svg class="se-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
      } else {
        btn.innerHTML = `<svg class="se-svg" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
      }
    }
  }
  applyTheme(state.theme);

  function applyInvertClockColor(invert) {
    state.invertClockColor = !!invert;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('invert-clock-color', state.invertClockColor);
    }
  }
  applyInvertClockColor(state.invertClockColor);

  // ── Bottom Status Bar & IP Geolocation ──
  let _ipFetchLock = false;
  async function fetchIpInfo(force = false) {
    if (!state.showStatusBar) return;
    if (_ipFetchLock && !force) return;
    _ipFetchLock = true;

    const ipEl = $('statusIp');
    const geoEl = $('statusGeo');
    const ispEl = $('statusIsp');
    const dotEl = document.querySelector('.bottom-status-bar .status-dot');
    const netStateEl = $('statusNetState');

    if (dotEl) { dotEl.className = 'status-dot loading'; }
    if (netStateEl) netStateEl.textContent = '检测中';
    if (ipEl) ipEl.textContent = '正在获取...';

    // 检查是否有较新鲜的本地缓存 (15分钟)
    const CACHE_KEY = 'nav2_ip_cache';
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && !force && (Date.now() - cached.time < 15 * 60 * 1000)) {
        renderIpData(cached.data);
        _ipFetchLock = false;
        return;
      }
    } catch {}

    function renderIpData(info) {
      if (ipEl) ipEl.textContent = info.ip || '未知';
      if (geoEl) geoEl.textContent = info.location || '-';
      if (ispEl) ispEl.textContent = info.isp || '-';
      if (dotEl) { dotEl.className = 'status-dot'; }
      if (netStateEl) netStateEl.textContent = '在线';
    }

    // 尝试主服务：ip.sb
    let resolved = false;
    try {
      const res = await fetch('https://api.ip.sb/geoip', { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const d = await res.json();
        if (d && d.ip) {
          const locParts = [d.country, d.region, d.city].filter(Boolean);
          const data = {
            ip: d.ip,
            location: locParts.join(' · ') || d.country || '-',
            isp: d.isp || d.organization || '-'
          };
          renderIpData(data);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data })); } catch {}
          resolved = true;
        }
      }
    } catch {}

    // 备用服务1：ipwho.is
    if (!resolved) {
      try {
        const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          const d = await res.json();
          if (d && d.success && d.ip) {
            const locParts = [d.country, d.region, d.city].filter(Boolean);
            const data = {
              ip: d.ip,
              location: locParts.join(' · ') || d.country || '-',
              isp: (d.connection && d.connection.isp) || '-'
            };
            renderIpData(data);
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data })); } catch {}
            resolved = true;
          }
        }
      } catch {}
    }

    // 备用服务2：ipinfo.io
    if (!resolved) {
      try {
        const res = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          const d = await res.json();
          if (d && d.ip) {
            const locParts = [d.country, d.region, d.city].filter(Boolean);
            const data = {
              ip: d.ip,
              location: locParts.join(' · ') || d.country || '-',
              isp: d.org || '-'
            };
            renderIpData(data);
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data })); } catch {}
            resolved = true;
          }
        }
      } catch {}
    }

    if (!resolved) {
      if (ipEl) ipEl.textContent = '获取失败';
      if (dotEl) { dotEl.className = 'status-dot offline'; }
      if (netStateEl) netStateEl.textContent = '离线/受限';
    }
    _ipFetchLock = false;
  }

  function applyStatusBarVisibility(show) {
    state.showStatusBar = !!show;
    const bar = $('bottomStatusBar');
    if (bar) {
      bar.style.display = state.showStatusBar ? 'block' : 'none';
      if (state.showStatusBar) {
        fetchIpInfo();
      }
    }
  }
  applyStatusBarVisibility(state.showStatusBar);

  // 绑定状态栏点击互动：点击 IP 快速复制，点击刷新按钮重新获取
  $('statusIpWrap')?.addEventListener('click', () => {
    const ip = $('statusIp')?.textContent;
    if (ip && ip !== '正在获取...' && ip !== '获取失败') {
      navigator.clipboard?.writeText(ip).then(() => showToast('IP 已复制: ' + ip));
    } else {
      fetchIpInfo(true);
    }
  });
  $('btnRefreshIp')?.addEventListener('click', e => {
    e.stopPropagation();
    fetchIpInfo(true);
  });

  function applyMinimalMode(enabled, animate = true) {
    const movingElements = [el.heroClock, el.heroClockSub, el.heroDate, el.searchWrap];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const firstPositions = animate && !reducedMotion
      ? new Map(movingElements.map(item => [item, item.getBoundingClientRect()]))
      : null;
    state.minimalMode = Boolean(enabled);
    const page = document.querySelector('.page');
    if (state.minimalMode) {
      page.classList.remove('minimal-content-away');
      void page.offsetWidth;
      page.classList.add('minimal-mode');
      if (!firstPositions) {
        page.classList.add('minimal-content-away');
      }
    } else {
      // 退出时先恢复可见性，再触发布局回弹，保证整个过程都有毛玻璃。
      page.classList.remove('minimal-content-away');
      void page.offsetWidth;
      page.classList.remove('minimal-mode');
    }
    save('minimalMode', state.minimalMode);

    if (!firstPositions) return;
    // FLIP：先把元素固定在旧屏幕坐标，下一帧再释放到新布局，避免日期先瞬移。
    movingElements.forEach(item => {
      const first = firstPositions.get(item);
      const last = item.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      const finalTransform = getComputedStyle(item).transform;
      const targetTransform = finalTransform === 'none' ? '' : finalTransform;
      item.getAnimations().forEach(animation => animation.cancel());
      item.style.transition = 'none';
      item.style.transform = `translate(${dx}px, ${dy}px) ${targetTransform}`.trim();
      item.dataset.flipTargetTransform = targetTransform;
    });
    void page.offsetWidth;
    requestAnimationFrame(() => {
      if (state.minimalMode) page.classList.add('minimal-content-away');
      movingElements.forEach(item => {
        const targetTransform = item.dataset.flipTargetTransform || '';
        item.style.transition = 'transform 0.56s cubic-bezier(0.2, 0.8, 0.2, 1)';
        item.style.transform = targetTransform;
        window.setTimeout(() => {
          item.style.transition = '';
          item.style.transform = '';
          delete item.dataset.flipTargetTransform;
        }, 580);
      });
    });
  }
  applyMinimalMode(state.minimalMode, false);

  [el.heroClock, el.heroClockSub, el.heroDate].forEach(trigger => {
    trigger.addEventListener('click', () => applyMinimalMode(!state.minimalMode));
    trigger.title = '点击切换极简模式';
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.minimalMode) applyMinimalMode(false);
  });

  $('btnTheme').addEventListener('click', () => {
    const n = state.theme==='dark'?'light':'dark';
    applyTheme(n); save('theme', n);
  });

  // ── Background ──
  function applyBg(url) {
    state.bg = url;
    document.documentElement.style.setProperty('--bg-img', url ? `url("${url}")` : 'none');
    const bgLayer = document.querySelector('.bg-layer');
    if (bgLayer) bgLayer.style.backgroundImage = url ? `url("${url}")` : 'none';
    save('bg', url);
  }
  function applyBlur(v) {
    state.blur = Number(v);
    document.documentElement.style.setProperty('--blur-amount', state.blur + 'px');
    const bgLayer = document.querySelector('.bg-layer');
    if (bgLayer) bgLayer.style.filter = `blur(${state.blur}px)`;
    save('blur', state.blur);
  }
  function applyBgOpacity(v) {
    state.bgOpacity = Math.max(0.05, Math.min(1.0, Number(v) || 1.0));
    document.documentElement.style.setProperty('--bg-opacity', state.bgOpacity);
    const bgLayer = document.querySelector('.bg-layer');
    if (bgLayer) bgLayer.style.opacity = state.bgOpacity;
    const spheres = document.querySelector('.bg-glow-spheres');
    if (spheres) spheres.style.opacity = state.bgOpacity;
    save('bgOpacity', state.bgOpacity);
  }
  function applyOverlayOpacity(v) {
    state.overlayOpacity = Math.max(0.0, Math.min(0.95, Number(v) === 0 ? 0 : (Number(v) || 0.20)));
    document.documentElement.style.setProperty('--overlay-opacity', state.overlayOpacity);
    const bgOverlay = document.querySelector('.bg-overlay');
    if (bgOverlay) bgOverlay.style.opacity = state.overlayOpacity;
    save('overlayOpacity', state.overlayOpacity);
  }
  applyBg(state.bg);
  applyBlur(state.blur);
  applyBgOpacity(state.bgOpacity);
  applyOverlayOpacity(state.overlayOpacity);

  // ── Search & Glass Style ──
  function applySearchStyle() {
    document.documentElement.style.setProperty('--search-width', state.searchWidth+'px');
    document.documentElement.style.setProperty('--search-height', (state.searchHeight ?? 54)+'px');
    document.documentElement.style.setProperty('--search-radius', state.searchRadius+'px');
    document.documentElement.style.setProperty('--search-opacity', state.searchOpacity);
    const sBox = document.querySelector('.search-box');
    if (sBox) sBox.style.setProperty('--search-height', (state.searchHeight ?? 54)+'px');
  }
  function applyGlassOpacity() {
    document.documentElement.style.setProperty('--glass-opacity', state.glassOpacity);
  }
  applySearchStyle();
  applyGlassOpacity();

  // ── Dynamic Layout Engine & Spacing ──
  function applyLayout() {
    const iconSize = Number(state.iconSize) || 54;
    const iconCols = Math.min(6, Math.max(1, Number(state.cols) || 4));
    const clusterCols = Math.min(5, Math.max(1, Number(state.masonryCols) || 4));
    const gridColGap = Number(state.gridColGap ?? 10);
    const gridRowGap = Number(state.gridRowGap ?? 12);
    const clusterPadding = Number(state.clusterPadding ?? 16);
    const clusterGap = Number(state.clusterGap ?? 14);

    // Natural slot width: icon size + horizontal margins and breathing room (minimum 70px)
    const slotWidth = Math.max(iconSize + 18, 70);

    // Dynamic width of each cluster card
    const clusterWidth = Math.round((iconCols * slotWidth) + ((iconCols - 1) * gridColGap) + (clusterPadding * 2) + 2);

    // Total layout width for all cluster columns side-by-side (including main-content 48px horizontal padding)
    const totalLayoutWidth = Math.round((clusterCols * clusterWidth) + ((clusterCols - 1) * clusterGap) + 48);

    document.documentElement.style.setProperty('--layout-max-width', totalLayoutWidth + 'px');
    document.documentElement.style.setProperty('--cluster-width', clusterWidth + 'px');
    document.documentElement.style.setProperty('--icon-size', iconSize + 'px');
    document.documentElement.style.setProperty('--icon-radius', (state.iconRadius ?? 14) + 'px');
    document.documentElement.style.setProperty('--col-count', iconCols);
    document.documentElement.style.setProperty('--cluster-cols', iconCols);
    document.documentElement.style.setProperty('--grid-col-gap', gridColGap + 'px');
    document.documentElement.style.setProperty('--grid-row-gap', gridRowGap + 'px');
    document.documentElement.style.setProperty('--cluster-padding', clusterPadding + 'px');
    document.documentElement.style.setProperty('--cluster-gap', clusterGap + 'px');
    document.documentElement.style.setProperty('--grid-gap', (state.gridGap ?? 10) + 'px');
    document.documentElement.style.setProperty('--icon-font-size', (state.iconFontSize ?? 11) + 'px');
    document.documentElement.style.setProperty('--cluster-radius', (state.clusterRadius ?? 20) + 'px');
    document.documentElement.style.setProperty('--clock-font-weight', state.clockWeight ?? 320);
    if (el.heroClock) el.heroClock.style.fontWeight = state.clockWeight ?? 320;
    document.documentElement.style.setProperty('--cluster-opacity', state.clusterOpacity ?? 0.45);
    document.documentElement.style.setProperty('--cluster-blur', (state.clusterBlur ?? 24) + 'px');

    if ($('layoutSummary')) {
      $('layoutSummary').textContent = '当前排版：' + clusterCols + ' 分栏 × ' + iconCols + ' 列 = 整体 ' + (clusterCols * iconCols) + ' 列图标';
    }
  }
  applyLayout();

  // ── Clock ──
  const weekDays = ['日','一','二','三','四','五','六'];
  const localOffset = new Date().getTimezoneOffset();
  const isBeijingLike = localOffset <= -420;
  const isLALike = localOffset >= 360;
  const subTZ = isBeijingLike ? 'America/Los_Angeles' : 'Asia/Shanghai';
  const subLabel = isBeijingLike ? '洛杉矶' : '北京';
  const subFmt = new Intl.DateTimeFormat('en', { timeZone: subTZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

  function updateClock() {
    const n = new Date();
    const h = String(n.getHours()).padStart(2,'0'), m = String(n.getMinutes()).padStart(2,'0'), s = String(n.getSeconds()).padStart(2,'0');
    const timeStr = state.showClockSeconds ? (h+':'+m+':'+s) : (h+':'+m);
    const dateStr = n.getFullYear()+'年'+(n.getMonth()+1)+'月'+n.getDate()+'日 星期'+weekDays[n.getDay()];
    el.heroClock.textContent = timeStr;
    el.heroDate.textContent = dateStr;

    if (state.showClockSub !== false) {
      el.heroClockSub.style.display = '';
      const subParts = subFmt.formatToParts(n);
      const subTime = subParts.map(p => p.value).join('');
      el.heroClockSub.innerHTML = subTime + '<span class="tz-label">' + subLabel + '</span>';
    } else {
      el.heroClockSub.style.display = 'none';
    }

    const hr = n.getHours();
    if (el.greeting) el.greeting.textContent = hr<6||hr>=18?'晚上好':hr<12?'早上好':'下午好';
  }
  updateClock(); setInterval(updateClock, 1000);

  // ── Search Engine ──
  function updateEngineUI() {
    const e = engines[state.engine];
    el.searchInput.placeholder = '在 '+e.label+' 上搜索...';
    document.querySelectorAll('.se-btn').forEach(b => b.classList.toggle('active', b.dataset.engine===state.engine));
    
    const btn = $('btnEngine');
    if (btn) {
      const iconUrl = ENGINE_ICONS[state.engine] || '';
      btn.innerHTML = iconUrl ? `<img class="se-icon-img" src="${iconUrl}" alt="${state.engine}">` : '';
    }
  }
  updateEngineUI();

  $('btnEngine').addEventListener('click', () => {
    const keys = Object.keys(engines);
    state.engine = keys[(keys.indexOf(state.engine)+1)%keys.length];
    updateEngineUI(); save('engine', state.engine);
  });
  document.querySelectorAll('.se-btn').forEach(b => b.addEventListener('click', () => {
    state.engine = b.dataset.engine;
    updateEngineUI(); save('engine', state.engine);
  }));
  el.searchInput.addEventListener('keydown', e => {
    if (e.key==='Enter') doSearch();
    if (e.key==='Escape') { el.searchInput.value=''; el.searchClear.classList.remove('visible'); el.searchInput.blur(); el.searchInput.closest('.search-box')?.classList.remove('has-input'); }
  });
  el.searchInput.addEventListener('input', onSearchInput);
  el.searchClear.addEventListener('click', () => {
    el.searchInput.value='';
    el.searchInput.focus();
    el.searchClear.classList.remove('visible');
    el.searchInput.closest('.search-box')?.classList.remove('has-input');
  });

  function doSearch() {
    const q = el.searchInput.value.trim();
    if (!q) return;
    window.open(engines[state.engine].url + encodeURIComponent(q), '_blank');
  }

  function onSearchInput() {
    const kw = el.searchInput.value.trim();
    el.searchClear.classList.toggle('visible', kw.length > 0);
    const box = el.searchInput.closest('.search-box');
    if (box) box.classList.toggle('has-input', kw.length > 0);
  }

  function groupByCategory(list) {
    const map = new Map();
    state.catOrder.forEach(cat => {
      map.set(cat, []);
    });
    for (const bm of list) {
      const cat = bm.category || '其他';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(bm);
    }
    return [...map.entries()].sort((a,b) => {
      const ai=state.catOrder.indexOf(a[0]), bi=state.catOrder.indexOf(b[0]);
      if (ai!==-1&&bi!==-1) return ai-bi;
      if (ai!==-1) return -1; if (bi!==-1) return 1;
      return a[0].localeCompare(b[0]);
    });
  }


  function handleIconError(img, domain) {
    img.onerror = null;
    fetchAndCacheOnlineFavicon(domain, (onlineUrl) => {
      img.src = onlineUrl;
      img.style.display = 'block';
      img.classList.add('loaded');
      const fb = img.nextElementSibling;
      if (fb) fb.style.display = 'none';
    }, () => {
      img.style.display = 'none';
      const fb = img.nextElementSibling;
      if (fb) fb.style.display = 'flex';
    });
  }

  async function hydrateCachedIcons() {
    await NavIconCache.init();
    const wraps = document.querySelectorAll('.icon-img-wrap');
    wraps.forEach(wrap => {
      const d = wrap.dataset.domain;
      if (!d || d === 'newtab') return;
      const cached = NavIconCache.getSync(d);
      if (cached && cached.dataUrl) {
        let img = wrap.querySelector('img.site-icon');
        if (!img) {
          img = document.createElement('img');
          img.className = 'site-icon loaded';
          img.loading = 'lazy';
          img.decoding = 'async';
          wrap.prepend(img);
        }
        if (img.src !== cached.dataUrl) {
          img.src = cached.dataUrl;
          img.style.display = 'block';
          img.classList.add('loaded');
          const fb = wrap.querySelector('.icon-fallback');
          if (fb) fb.style.display = 'none';
        }

        // Stale-While-Revalidate: 过期时后台静默更新
        if (Date.now() - cached.timestamp > NavIconCache.TTL) {
          setTimeout(() => {
            fetchAndCacheOnlineFavicon(d, (freshUrl) => {
              img.src = freshUrl;
            });
          }, 600);
        }
      } else {
        const curIcon = wrap.dataset.icon;
        if (!curIcon) {
          let img = wrap.querySelector('img.site-icon');
          if (img) handleIconError(img, d);
        }
      }
    });
  }

  function loadAllFavicons() {
    hydrateCachedIcons();
  }

  // ── Build icon HTML ──
  function shortenName(name, url) {
    let s = name.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
    const seps = [' | ', ' - ', ' — ', ' – ', '|', '-', '—', '–', '·', '：', ':', '，', ',', '、'];
    let parts = [s];
    for (const sep of seps) {
      const split = s.split(sep);
      if (split.length > 1) {
        const good = split.map(p => p.trim()).filter(p => p.length > 2
          && !/^(官网|官方网站|在线|免费|入口|首页|主页|登录|注册|下载|欢迎|访问|使用|提供|各种|各类|全部)$/.test(p)
          && !/^(为你?)?(推荐|精选|分享|展示|介绍)/.test(p)
          && !/^(更多|查看|了解更多|查看更多)/.test(p)
        );
        if (good.length > 0) {
          const short = good.filter(p => p.length <= 12);
          s = short.length > 0 ? short[0] : good[0];
          break;
        }
      }
    }

    s = s.replace(/(官网|官方网站|首页|入口|登录|注册|下载|欢迎|免费商用|免费下载|在线预览|在线转换|在线处理|在线工具|资源平台|官方入口|官方网址|官方网站入口)\s*$/g, '');
    s = s.replace(/(分享.*|推荐.*|大全|导航|聚合|指南|教程|文档|社区|论坛|中心|平台|工具集|工具箱|下载站|资源站)$/, '');

    const isAscii = /^[\x00-\x7F]+$/.test(s);
    const maxLen = isAscii ? 18 : 10;
    if (s.length > maxLen) {
      const d = getDomain(url).split('.')[0];
      if (d && d.length >= 2 && !/^(www|api|app|web|m|mail|dash|store|new)$/i.test(d)) {
        s = d.charAt(0).toUpperCase() + d.slice(1);
      } else {
        s = s.substring(0, maxLen);
      }
    }
    return s || name.substring(0, 10);
  }

  function iconItemHtml(bm) {
    const domain = bm.display_domain || getDomain(bm.url);
    const fd = bm.display_domain || getDomain(bm.url);
    const cachedItem = NavIconCache.getSync(fd);
    const ic = (cachedItem && cachedItem.dataUrl) ? cachedItem.dataUrl : (bm.icon || '');
    const shortName = shortenName(bm.name, bm.url);
    const hasIcon = Boolean(ic);
    const imgHtml = hasIcon
      ? '<img src="'+ic+'" loading="lazy" decoding="async" alt="" class="site-icon'+(cachedItem ? ' loaded' : '')+'" onload="this.classList.add(\'loaded\');const fb=this.nextElementSibling;if(fb)fb.style.display=\'none\';" onerror="handleIconError(this, \''+fd+'\')">'
      : '<img src="" loading="lazy" decoding="async" alt="" class="site-icon" style="display:none" onload="this.classList.add(\'loaded\');const fb=this.nextElementSibling;if(fb)fb.style.display=\'none\';" onerror="handleIconError(this, \''+fd+'\')">';
    const fallbackStyle = (hasIcon && cachedItem) ? ' style="display:none;background:'+domainColor(fd)+'"' : ' style="background:'+domainColor(fd)+'"';
    const targetAttr = state.openTargetBlank !== false ? ' target="_blank" rel="noopener noreferrer"' : ' target="_self"';
    return '<a class="icon-item" href="'+bm.url+'"'+targetAttr+' draggable="true"'
      +' data-url="'+bm.url.replace(/"/g,'&quot;')+'"'
      +' data-name="'+bm.name.replace(/"/g,'&quot;')+'"'
      +' data-domain="'+fd+'" data-icon="'+(bm.icon||'')+'" data-proxy="'+(bm.needs_proxy?'1':'0')+'"'
      +' data-cat="'+(bm.category||'其他')+'"'
      +' title="'+bm.name+'\n'+domain+'">'
      +'<span class="icon-img-wrap" data-domain="'+fd+'" data-icon="'+(bm.icon||'')+'">'
      + imgHtml
      +'<span class="icon-fallback"'+fallbackStyle+'>'+domainInitial(fd)+'</span>'
      +'</span>'
      +'<span class="icon-name">'+shortName+'</span></a>';
  }

  // ── Masonry waterfall layout ──
  function masonryLayout(wrap) {
    if (!wrap) wrap = el.mainContent.querySelector('.clusters-wrap');
    if (!wrap || wrap.children.length === 0) return;

    const isMobile = window.innerWidth <= 768;

    // 移动端小屏统一使用单列自然流布局，彻底避免多列分栏在小屏下被压扁挤压
    if (isMobile) {
      const oldCols = wrap.querySelectorAll('.masonry-col');
      if (oldCols.length > 0) {
        oldCols.forEach(col => {
          while (col.firstChild) wrap.appendChild(col.firstChild);
          col.remove();
        });
      }
      wrap.classList.add('single-column');
      return;
    }

    wrap.classList.remove('single-column');

    const oldCols = wrap.querySelectorAll('.masonry-col');
    if (oldCols.length > 0) {
      oldCols.forEach(col => {
        while (col.firstChild) wrap.appendChild(col.firstChild);
        col.remove();
      });
    }

    const clusters = Array.from(wrap.querySelectorAll('.cat-cluster'));
    if (clusters.length === 0) return;

    // Sort clusters based on state.catOrder to maintain consistent logical ordering across redraws
    clusters.sort((a, b) => {
      const ai = state.catOrder.indexOf(a.dataset.cat);
      const bi = state.catOrder.indexOf(b.dataset.cat);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return (a.dataset.cat || '').localeCompare(b.dataset.cat || '');
    });

    const gap = Number(state.clusterGap) || 14;
    const targetCols = Math.min(5, Math.max(1, parseInt(state.masonryCols, 10) || 4));
    let cols = targetCols;
    // Responsive guard: if wrap width is too narrow to hold targetCols columns gracefully, scale down
    const minColW = 200;
    while (cols > 1 && (wrap.clientWidth - (cols - 1) * gap) / cols < minColW) {
      cols--;
    }
    if (cols <= 1) {
      wrap.classList.add('single-column');
      return;
    }

    const totalGap = (cols - 1) * gap;
    const colWidth = (wrap.clientWidth - totalGap) / cols;

    const columns = [];
    for (let i = 0; i < cols; i++) {
      const col = document.createElement('div');
      col.className = 'masonry-col';
      col.style.width = colWidth + 'px';
      columns.push(col);
    }

    const colCounts = new Array(cols).fill(0);
    clusters.forEach(cluster => {
      const minIdx = colCounts.indexOf(Math.min(...colCounts));
      columns[minIdx].appendChild(cluster);
      const iconCount = cluster.querySelectorAll('.icon-item').length;
      colCounts[minIdx] += cluster.classList.contains('collapsed') ? 1 : (iconCount === 0 ? 1 : iconCount);
    });

    const fragment = document.createDocumentFragment();
    columns.forEach(col => fragment.appendChild(col));
    wrap.replaceChildren(fragment);
  }

  // ── Render ──
  function renderAll() {
    if (bookmarks.length === 0) {
      el.mainContent.innerHTML = '<div class="empty-state"><div class="empty-title">暂无书签</div></div>';
      return;
    }

    const groups = groupByCategory(bookmarks);
    let h = '<div class="clusters-wrap">';
    const gridModeClass = (state.gridMode === 'fluid') ? 'grid-fluid' : 'grid-fixed';
    for (const [cat, items] of groups) {
      const isCollapsed = state.collapsedCats && state.collapsedCats.includes(cat);
      h += '<div class="cat-cluster ' + gridModeClass + (isCollapsed ? ' collapsed' : '') + '" data-cat="'+cat+'">';
      
      const iconKey = state.catIcons[cat] || 'folder';
      const svgIcon = SVG_ICONS[iconKey] || SVG_ICONS['folder'];
      h += '<div class="cat-header" draggable="true">'
        + '<div class="cat-header-left">'
        + '<div class="cat-icon-badge">' + svgIcon + '</div>'
        + '<span class="cat-title">' + cat + '</span>'
        + '<span class="cat-count">' + items.length + '</span>'
        + '</div>'
        + '<button type="button" class="cat-collapse-btn" title="' + (isCollapsed ? '展开分类' : '折叠分类') + '" data-cat="' + cat + '">'
        + '<svg class="cat-collapse-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>'
        + '</button>'
        + '</div>';
      
      if (items.length === 0) {
        h += '<div class="empty-cat-placeholder">空分类（可将图标拖入此处）</div>';
      } else {
        h += items.map(iconItemHtml).join('');
      }
      
      h += '</div>';
    }
    h += '</div>';
    el.mainContent.innerHTML = h;
    loadAllFavicons();
    bindEvents();
    masonryLayout();
  }

  // ── Event binding after render ──
  function bindEvents() {
    el.mainContent.querySelectorAll('.icon-item').forEach(item => {
      item.addEventListener('dragstart', onDragStart);
      item.addEventListener('dragover', onDragOver);
      item.addEventListener('dragleave', onDragLeave);
      item.addEventListener('drop', onDrop);
      item.addEventListener('dragend', onDragEnd);
    });

    el.mainContent.querySelectorAll('.cat-collapse-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const cat = btn.dataset.cat;
        const cluster = btn.closest('.cat-cluster');
        if (!cluster) return;
        const willCollapse = !cluster.classList.contains('collapsed');
        cluster.classList.toggle('collapsed', willCollapse);
        btn.title = willCollapse ? '展开分类' : '折叠分类';

        if (willCollapse) {
          if (!state.collapsedCats.includes(cat)) state.collapsedCats.push(cat);
        } else {
          state.collapsedCats = state.collapsedCats.filter(c => c !== cat);
        }
        save('collapsedCats', state.collapsedCats);
        masonryLayout();
      });
    });

    el.mainContent.querySelectorAll('.cat-header').forEach(header => {
      header.addEventListener('dragstart', onCatDragStart);
      header.addEventListener('dragend', onCatDragEnd);
      header.addEventListener('dblclick', e => {
        if (e.target.closest('.cat-collapse-btn')) return;
        const btn = header.querySelector('.cat-collapse-btn');
        if (btn) btn.click();
      });
    });

    el.mainContent.querySelectorAll('.cat-cluster').forEach(cluster => {
      cluster.addEventListener('dragover', onClusterDragOver);
      cluster.addEventListener('dragover', onCatDragOver);
      cluster.addEventListener('drop', onDrop);
    });
  }

  // ── Icon drag & drop ──
  // 使用稳定占位符表示唯一落点：拖动元素本身不参与网格排版，
  // 因此同栏排序、跨栏移动、拖回原位和取消拖动都能保持确定的索引。
  let dragSrc = null;
  let dragPlaceholder = null;
  let dragOriginalParent = null;
  let dragOriginalNextSibling = null;
  let dragCommitted = false;

  function onDragStart(e) {
    dragSrc = this;
    dragOriginalParent = this.parentNode;
    dragOriginalNextSibling = this.nextSibling;
    dragCommitted = false;

    dragPlaceholder = document.createElement('div');
    dragPlaceholder.className = 'drag-placeholder';
    dragPlaceholder.setAttribute('aria-hidden', 'true');
    dragOriginalParent.insertBefore(dragPlaceholder, dragOriginalNextSibling);

    document.querySelectorAll('.cat-cluster').forEach(cluster => {
      cluster.classList.add('drag-active');
    });

    requestAnimationFrame(() => {
      this.classList.add('dragging');
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.url || 'bookmark');
  }

  function onDragOver(e) {
    e.preventDefault();
    if (!dragSrc) return;
    e.dataTransfer.dropEffect = 'move';
    const grid = this.closest('.cat-cluster');
    if (!grid || grid.dataset.cat === 'search-results') return;
    positionDragPlaceholder(grid, e.clientX, e.clientY);
  }

  function onDragLeave() {
    this.classList.remove('drag-over');
  }

  function onClusterDragOver(e) {
    e.preventDefault();
    if (!dragSrc) return;
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-active');
    positionDragPlaceholder(this, e.clientX, e.clientY);
  }

  function positionDragPlaceholder(grid, clientX, clientY) {
    if (!dragPlaceholder || !grid) return;
    const icons = Array.from(grid.querySelectorAll('.icon-item')).filter(item => item !== dragSrc);
    const empty = grid.querySelector('.empty-cat-placeholder');
    if (empty) empty.remove();

    if (icons.length === 0) {
      grid.appendChild(dragPlaceholder);
      return;
    }

    const rows = [];
    icons.forEach(icon => {
      const rect = icon.getBoundingClientRect();
      let row = rows.find(candidate => Math.abs(candidate.top - rect.top) < 8);
      if (!row) {
        row = { top: rect.top, bottom: rect.bottom, center: rect.top + rect.height / 2, items: [] };
        rows.push(row);
      }
      row.bottom = Math.max(row.bottom, rect.bottom);
      row.items.push({ icon, rect });
    });
    rows.sort((a, b) => a.top - b.top);
    rows.forEach(row => row.items.sort((a, b) => a.rect.left - b.rect.left));

    let rowIndex = rows.findIndex(row => clientY <= row.bottom);
    if (rowIndex === -1) rowIndex = rows.length - 1;
    const row = rows[rowIndex];
    let reference = row.items.find(item => clientX < item.rect.left + item.rect.width / 2)?.icon || null;

    if (!reference) {
      const nextRow = rows[rowIndex + 1];
      reference = nextRow ? nextRow.items[0].icon : null;
    }
    grid.insertBefore(dragPlaceholder, reference);
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragSrc || !dragPlaceholder) return;
    const grid = this.classList.contains('cat-cluster') ? this : this.closest('.cat-cluster');
    if (!grid || grid.dataset.cat === 'search-results') return;
    positionDragPlaceholder(grid, e.clientX, e.clientY);
    grid.insertBefore(dragSrc, dragPlaceholder);
    dragSrc.dataset.cat = grid.dataset.cat;
    dragCommitted = true;
    dragSrc.classList.remove('dragging');
    dragPlaceholder.remove();
    dragPlaceholder = null;
    updateEmptyPlaceholders();
  }

  function onDragEnd(e) {
    if (!dragCommitted && dragSrc && dragOriginalParent) {
      const reference = dragOriginalNextSibling && dragOriginalNextSibling.parentNode === dragOriginalParent
        ? dragOriginalNextSibling
        : null;
      dragOriginalParent.insertBefore(dragSrc, reference);
      dragSrc.dataset.cat = dragOriginalParent.dataset.cat;
    }
    cleanupDragState();
    saveBookmarksFromDOM();
    masonryLayout();
  }

  function cleanupDragState() {
    if (dragSrc) {
      dragSrc.classList.remove('dragging');
    }
    if (dragPlaceholder) dragPlaceholder.remove();
    document.querySelectorAll('.cat-cluster').forEach(cluster => {
      cluster.classList.remove('drag-active');
    });
    document.querySelectorAll('.icon-item').forEach(item => {
      item.style.transition = '';
      item.style.transform = '';
      item.classList.remove('drag-over');
    });
    dragSrc = null;
    dragPlaceholder = null;
    dragOriginalParent = null;
    dragOriginalNextSibling = null;
    dragCommitted = false;
    updateEmptyPlaceholders();
  }

  let lastCatOrderSwapTime = 0;
  function onCatDragStart(e) {
    state.draggedCat = this.parentNode.dataset.cat;
    this.parentNode.classList.add('dragging-cat');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  }

  function onCatDragEnd(e) {
    if (state.draggedCat) {
      const cluster = document.querySelector('.cat-cluster[data-cat="'+state.draggedCat+'"]');
      if (cluster) cluster.classList.remove('dragging-cat');
    }
    state.draggedCat = null;
    save('catOrder', state.catOrder);
    masonryLayout();
  }

  function onCatDragOver(e) {
    if (!state.draggedCat) return;
    e.preventDefault();

    const targetCluster = this.closest('.cat-cluster');
    const targetCat = targetCluster ? targetCluster.dataset.cat : null;
    if (!targetCat || targetCat === state.draggedCat || targetCat === 'search-results') return;

    const now = Date.now();
    if (now - lastCatOrderSwapTime < 240) return;

    const fromIdx = state.catOrder.indexOf(state.draggedCat);
    const toIdx = state.catOrder.indexOf(targetCat);
    if (fromIdx === -1 || toIdx === -1) return;

    state.catOrder.splice(fromIdx, 1);
    state.catOrder.splice(toIdx, 0, state.draggedCat);

    lastCatOrderSwapTime = now;
    masonryLayout();
  }

  function updateEmptyPlaceholders() {
    document.querySelectorAll('.cat-cluster').forEach(grid => {
      const hasIcons = grid.querySelector('.icon-item') !== null;
      let placeholder = grid.querySelector('.empty-cat-placeholder');
      
      if (!hasIcons) {
        if (!placeholder) {
          placeholder = document.createElement('div');
          placeholder.className = 'empty-cat-placeholder';
          placeholder.textContent = '空分类（可将图标拖入此处）';
          grid.appendChild(placeholder);
        }
      } else {
        if (placeholder) {
          placeholder.remove();
        }
      }
    });
  }

  function saveBookmarksFromDOM() {
    const newBookmarks = [];
    
    state.catOrder.forEach(cat => {
      const cluster = el.mainContent.querySelector(`.cat-cluster[data-cat="${cat}"]`);
      if (!cluster) return;
      
      const items = cluster.querySelectorAll('.icon-item');
      items.forEach(item => {
        const url = item.dataset.url;
        const bm = bookmarks.find(b => b.url === url);
        if (bm) {
          bm.category = cat;
          newBookmarks.push(bm);
        }
      });
    });
    
    const allClusters = el.mainContent.querySelectorAll('.cat-cluster');
    allClusters.forEach(cluster => {
      const cat = cluster.dataset.cat;
      if (!cat || state.catOrder.includes(cat) || cat === 'search-results') return;
      
      const items = cluster.querySelectorAll('.icon-item');
      items.forEach(item => {
        const url = item.dataset.url;
        const bm = bookmarks.find(b => b.url === url);
        if (bm) {
          bm.category = cat;
          newBookmarks.push(bm);
        }
      });
    });

    bookmarks = newBookmarks;
    save('bookmarks', bookmarks);
  }

  // ── Global Context Menu ──
  document.addEventListener('contextmenu', onGlobalContextMenu);
  
  function onGlobalContextMenu(e) {
    if (e.target.closest('input, select, textarea, button, .modal, .settings-panel, #wpUploadBtn')) {
      return;
    }
    
    e.preventDefault();
    
    const iconItem = e.target.closest('.icon-item');
    
    let x = e.clientX, y = e.clientY;
    const mw = 180, mh = iconItem ? 170 : 90;
    if (x + mw > window.innerWidth) x = window.innerWidth - mw - 8;
    if (y + mh > window.innerHeight) y = window.innerHeight - mh - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    
    el.contextMenu.style.left = x + 'px';
    el.contextMenu.style.top = y + 'px';
    
    if (iconItem) {
      state.contextTarget = iconItem;
      state.contextCat = null;
      el.contextMenu.classList.remove('mode-blank');
      el.contextMenu.classList.add('mode-icon');
    } else {
      state.contextTarget = null;
      const cluster = e.target.closest('.cat-cluster');
      state.contextCat = cluster ? cluster.dataset.cat : null;
      el.contextMenu.classList.remove('mode-icon');
      el.contextMenu.classList.add('mode-blank');
    }
    
    el.contextMenu.classList.add('show');
  }

  function hideContextMenu() { 
    el.contextMenu.classList.remove('show'); 
    state.contextTarget = null; 
    state.contextCat = null; 
  }
  
  function updateBodyScrollLock() {
    const showModal = document.querySelector('.modal-overlay.show, .settings-overlay.show') !== null;
    if (showModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  }
  
  document.addEventListener('click', e => { 
    if(!el.contextMenu.contains(e.target)) hideContextMenu(); 
  });
  document.addEventListener('keydown', e => { 
    if(e.key==='Escape') hideContextMenu(); 
  });

  el.contextMenu.querySelectorAll('.cm-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      const t = state.contextTarget;
      
      if (action === 'add-site') {
        openAddModal(state.contextCat);
      } else if (action === 'add-category') {
        openAddCatModal();
      } else if (action === 'open-settings') {
        openSettings();
      } else if (t) {
        switch(action) {
          case 'open': window.open(t.dataset.url,'_blank'); break;
          case 'copy': navigator.clipboard.writeText(t.dataset.url).then(()=>showToast('链接已复制')); break;
          case 'edit': openEditModal(t); break;
          case 'refresh-icon': {
            const domain = t.dataset.domain;
            if (domain) {
              showToast('正在重新获取图标...');
              NavIconCache.delete(domain).then(() => {
                const wrap = t.querySelector('.icon-img-wrap');
                if (wrap) {
                  let img = wrap.querySelector('img.site-icon');
                  if (!img) {
                    img = document.createElement('img');
                    img.className = 'site-icon';
                    wrap.prepend(img);
                  }
                  fetchAndCacheOnlineFavicon(domain, (freshUrl) => {
                    img.src = freshUrl;
                    img.style.display = 'block';
                    const fb = wrap.querySelector('.icon-fallback');
                    if (fb) fb.style.display = 'none';
                    showToast('图标已刷新并更新缓存');
                  });
                }
              });
            }
            break;
          }
          case 'delete':
            if(confirm('确定删除 "'+t.dataset.name+'"?')){
              deleteBookmarkByUrl(t.dataset.url);
              renderAll();
              showToast('已删除');
            }
            break;
        }
      }
      hideContextMenu();
    });
  });

  // ── Add / Edit Modal ──
  function openAddModal(cat) {
    state.editTarget = null;
    $('editModalTitle').textContent = '添加网站';
    $('editName').value = '';
    $('editUrl').value = '';
    buildCategorySelect(cat || state.catOrder[0] || '其他');
    initCustomSelects();
    el.editModalOverlay.classList.add('show');
    updateBodyScrollLock();
    $('editName').focus();
  }

  function openEditModal(item) {
    state.editTarget = item;
    $('editModalTitle').textContent = '编辑网站';
    $('editName').value = item.dataset.name || '';
    $('editUrl').value = item.dataset.url || '';
    buildCategorySelect(item.dataset.cat || '其他');
    initCustomSelects();
    el.editModalOverlay.classList.add('show');
    updateBodyScrollLock();
  }

  function buildCategorySelect(selected) {
    const sel = $('editCategory');
    sel.innerHTML = state.catOrder.map(c => {
      return '<option value="'+c+'"'+(c===selected?' selected':'')+'>'+c+'</option>';
    }).join('');
  }

  $('editCancel').addEventListener('click', () => { el.editModalOverlay.classList.remove('show'); updateBodyScrollLock(); });
  el.editModalOverlay.addEventListener('click', e => { if(e.target===el.editModalOverlay) { el.editModalOverlay.classList.remove('show'); updateBodyScrollLock(); } });

  $('editSave').addEventListener('click', () => {
    const name = $('editName').value.trim();
    const url = $('editUrl').value.trim();
    const cat = $('editCategory').value;
    if (!name || !url) { showToast('请填写名称和网址'); return; }
    if (!/^https?:\/\//.test(url)) { showToast('网址需以 http:// 或 https:// 开头'); return; }

    if (state.editTarget) {
      const oldUrl = state.editTarget.dataset.url;
      updateBookmarkData(oldUrl, name, url, cat);
    } else {
      addBookmarkData(name, url, cat);
    }

    el.editModalOverlay.classList.remove('show');
    updateBodyScrollLock();
    renderAll();
    showToast('已保存');
  });

  // ── Add Category Modal ──
  function openAddCatModal() {
    $('catName').value = '';
    $('catIconSelect').value = 'folder';
    initCustomSelects();
    $('catModalOverlay').classList.add('show');
    updateBodyScrollLock();
    $('catName').focus();
  }
  
  $('catCancel').addEventListener('click', () => { $('catModalOverlay').classList.remove('show'); updateBodyScrollLock(); });
  $('catModalOverlay').addEventListener('click', e => {
    if (e.target === $('catModalOverlay')) { $('catModalOverlay').classList.remove('show'); updateBodyScrollLock(); }
  });
  
  $('catSave').addEventListener('click', () => {
    const name = $('catName').value.trim();
    const iconKey = $('catIconSelect').value;
    if (!name) {
      showToast('请填写分类名称');
      return;
    }
    if (state.catOrder.includes(name)) {
      showToast('该分类已存在');
      return;
    }
    
    const otherIdx = state.catOrder.indexOf('其他');
    if (otherIdx !== -1) {
      state.catOrder.splice(otherIdx, 0, name);
    } else {
      state.catOrder.push(name);
    }
    state.catIcons[name] = iconKey;
    
    save('catOrder', state.catOrder);
    save('catIcons', state.catIcons);
    
    $('catModalOverlay').classList.remove('show');
    updateBodyScrollLock();
    renderAll();
    showToast('分类创建成功');
  });

  // ── Settings Panel ──
  const sliders = {
    sliderSize:           { get:()=>state.iconSize,        set:v=>{state.iconSize=v; save('iconSize',v); applyLayout(); renderAll();}, fmt:v=>v+'px' },
    sliderMasonryCols:    { get:()=>state.masonryCols,     set:v=>{state.masonryCols=Math.min(5, Math.max(1, Math.round(v))); save('masonryCols',state.masonryCols); applyLayout(); masonryLayout();}, fmt:v=>v+' 栏' },
    sliderCols:           { get:()=>state.cols,            set:v=>{state.cols=Math.min(6, Math.max(1, Math.round(v))); save('cols',state.cols); applyLayout(); masonryLayout();}, fmt:v=>v+' 列' },
    sliderGridColGap:     { get:()=>state.gridColGap,      set:v=>{state.gridColGap=v; save('gridColGap',v); applyLayout(); masonryLayout();}, fmt:v=>v+'px' },
    sliderGridRowGap:     { get:()=>state.gridRowGap,      set:v=>{state.gridRowGap=v; save('gridRowGap',v); applyLayout(); masonryLayout();}, fmt:v=>v+'px' },
    sliderClusterPadding: { get:()=>state.clusterPadding,  set:v=>{state.clusterPadding=v; save('clusterPadding',v); applyLayout(); masonryLayout();}, fmt:v=>v+'px' },
    sliderClusterGap:     { get:()=>state.clusterGap,      set:v=>{state.clusterGap=v; save('clusterGap',v); applyLayout(); masonryLayout();}, fmt:v=>v+'px' },
    sliderSW:             { get:()=>state.searchWidth,     set:v=>{state.searchWidth=v;  save('searchWidth',v);  applySearchStyle();}, fmt:v=>v+'px' },
    sliderSH:             { get:()=>state.searchHeight,    set:v=>{state.searchHeight=v; save('searchHeight',v); applySearchStyle();}, fmt:v=>v+'px' },
    sliderSR:             { get:()=>state.searchRadius,    set:v=>{state.searchRadius=v; save('searchRadius',v); applySearchStyle();}, fmt:v=>v+'px' },
    sliderSO:             { get:()=>state.searchOpacity,   set:v=>{state.searchOpacity=v;save('searchOpacity',v);applySearchStyle();}, fmt:v=>v.toFixed(2) },
    sliderGO:             { get:()=>state.glassOpacity,    set:v=>{state.glassOpacity=v; save('glassOpacity',v); applyGlassOpacity();}, fmt:v=>v.toFixed(2) },
    sliderBlur:           { get:()=>parseInt(state.blur),  set:v=>{applyBlur(v);},                              fmt:v=>v+'px' },
    sliderBgOpacity:      { get:()=>state.bgOpacity,       set:v=>{applyBgOpacity(v);},                         fmt:v=>Number(v).toFixed(2) },
    sliderOverlayOpacity: { get:()=>state.overlayOpacity,  set:v=>{applyOverlayOpacity(v);},                    fmt:v=>Number(v).toFixed(2) },
    sliderTextSize:       { get:()=>state.iconFontSize,    set:v=>{state.iconFontSize=v; save('iconFontSize',v); applyLayout();}, fmt:v=>v+'px' },
    sliderIconRadius:     { get:()=>state.iconRadius,      set:v=>{state.iconRadius=v; save('iconRadius',v); applyLayout();}, fmt:v=>v+'px' },
    sliderClockWeight:    { get:()=>state.clockWeight,     set:v=>{state.clockWeight=v; save('clockWeight',v); applyLayout();}, fmt:v=>v },
    sliderClusterRadius:  { get:()=>state.clusterRadius,   set:v=>{state.clusterRadius=v; save('clusterRadius',v); applyLayout();}, fmt:v=>v+'px' },
    sliderClusterOpacity: {
      get:()=>state.clusterOpacity,
      set:v=>{
        state.clusterOpacity = Math.max(0.05, Math.min(1.0, Number(v) || 0.45));
        document.documentElement.style.setProperty('--cluster-opacity', state.clusterOpacity);
        document.querySelectorAll('.cat-cluster').forEach(c => {
          c.style.setProperty('--cluster-opacity', state.clusterOpacity);
        });
        save('clusterOpacity', state.clusterOpacity);
      },
      fmt:v=>Number(v).toFixed(2)
    },
    sliderClusterBlur:    { get:()=>state.clusterBlur,     set:v=>{state.clusterBlur=v; save('clusterBlur',v); applyLayout();}, fmt:v=>v+'px' },
  };

  Object.entries(sliders).forEach(([id, cfg]) => {
    const slider = $(id);
    const valEl = $('val'+id.replace('slider',''));
    if (!slider) return;

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      cfg.set(v);
      if (valEl) valEl.textContent = cfg.fmt(v);
    });
    slider.addEventListener('change', () => {
      const v = parseFloat(slider.value);
      cfg.set(v);
    });
  });

  function syncSliders() {
    Object.entries(sliders).forEach(([id, cfg]) => {
      const slider = $(id);
      const valEl = $('val'+id.replace('slider',''));
      const v = cfg.get();
      if (slider) slider.value = v;
      if (valEl) valEl.textContent = cfg.fmt(v);
    });
  }

  $('btnSettings')?.addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', () => { el.settingsOverlay.classList.remove('show'); updateBodyScrollLock(); });
  $('settingsReset').addEventListener('click', resetDefaults);
  $('settingsExport').addEventListener('click', exportConfiguration);
  $('settingsImport').addEventListener('click', () => $('settingsImportFile').click());
  $('settingsClearCache').addEventListener('click', async () => {
    await NavIconCache.clear();
    showToast('图标缓存已全部清理');
    renderAll();
  });
  $('settingsImportFile').addEventListener('change', event => {
    importConfiguration(event.target.files[0]);
    event.target.value = '';
  });
  el.settingsOverlay.addEventListener('click', e => { if(e.target===el.settingsOverlay) { el.settingsOverlay.classList.remove('show'); updateBodyScrollLock(); } });

  const DEFAULT_STATE = {
    iconSize: 40, cols: 4, blur: 9,
    gridMode: 'fixed', masonryCols: 4,
    gridColGap: 10, gridRowGap: 12, clusterPadding: 19, clusterGap: 14,
    searchWidth: 620, searchHeight: 40, searchRadius: 14, searchOpacity: 0.45, glassOpacity: 0.62,
    iconFontSize: 11, iconRadius: 14, clockWeight: 540,
    clusterRadius: 20, clusterOpacity: 0.45, clusterBlur: 24, gridGap: 10,
    bg: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920',
    bgOpacity: 0.85,
    overlayOpacity: 0.25,
    openTargetBlank: true,
    hideIconTitles: false,
    showClockSeconds: true,
    showClockSub: true,
    invertClockColor: false,
    showStatusBar: false,
    collapsedCats: []
  };

  function resetDefaults() {
    Object.assign(state, window.DEFAULT_STATE || DEFAULT_STATE);
    state.catOrder = [...DEFAULT_CAT_ORDER];
    state.catIcons = Object.assign({}, DEFAULT_CAT_ICONS);
    state.collapsedCats = [];

    save('iconSize',state.iconSize); save('cols',state.cols); save('blur',state.blur);
    save('gridMode',state.gridMode); save('masonryCols',state.masonryCols);
    save('gridColGap',state.gridColGap); save('gridRowGap',state.gridRowGap);
    save('clusterPadding',state.clusterPadding); save('clusterGap',state.clusterGap);
    save('searchWidth',state.searchWidth); save('searchHeight',state.searchHeight); save('searchRadius',state.searchRadius);
    save('searchOpacity',state.searchOpacity); save('glassOpacity',state.glassOpacity);
    save('iconFontSize', state.iconFontSize); save('iconRadius', state.iconRadius); save('clockWeight', state.clockWeight);
    save('clusterRadius', state.clusterRadius); save('clusterOpacity', state.clusterOpacity); save('clusterBlur', state.clusterBlur); save('gridGap', state.gridGap);
    save('catOrder', state.catOrder); save('catIcons', state.catIcons);
    save('bgOpacity', state.bgOpacity); save('overlayOpacity', state.overlayOpacity);
    save('openTargetBlank', state.openTargetBlank);
    save('hideIconTitles', state.hideIconTitles);
    save('showClockSeconds', state.showClockSeconds);
    save('showClockSub', state.showClockSub);
    save('invertClockColor', state.invertClockColor);
    save('showStatusBar', state.showStatusBar);
    save('collapsedCats', state.collapsedCats);

    applyBg(state.bg); applyBlur(state.blur); applyBgOpacity(state.bgOpacity); applyOverlayOpacity(state.overlayOpacity);
    applyLayout(); applySearchStyle(); applyGlassOpacity();
    applyHideIconTitles(state.hideIconTitles);
    applyInvertClockColor(state.invertClockColor);
    applyStatusBarVisibility(state.showStatusBar);
    updateClock();
    renderAll(); openSettings();
    showToast('外观与偏好已恢复默认');
  }

  function updateGridModeUI() {
    const isFixed = (state.gridMode !== 'fluid');
    if ($('groupCols')) $('groupCols').style.display = isFixed ? 'block' : 'none';
  }

  function openSettings() {
    syncSliders();
    if ($('settingOpenTargetBlank')) $('settingOpenTargetBlank').checked = state.openTargetBlank !== false;
    if ($('settingHideIconTitles')) $('settingHideIconTitles').checked = !!state.hideIconTitles;
    if ($('settingClockSeconds')) $('settingClockSeconds').checked = !!state.showClockSeconds;
    if ($('settingClockSub')) $('settingClockSub').checked = state.showClockSub !== false;
    if ($('settingInvertClockColor')) $('settingInvertClockColor').checked = !!state.invertClockColor;
    if ($('settingShowStatusBar')) $('settingShowStatusBar').checked = !!state.showStatusBar;
    if ($('selectGridMode')) {
      $('selectGridMode').value = state.gridMode || 'fixed';
      syncCustomSelect($('selectGridMode'));
    }
    updateGridModeUI();
    const revEl = $('syncRevisionLabel');
    if (revEl) revEl.textContent = window.BOOKMARKS_REVISION || '1.0.0';
    buildWallpaperGallery();
    el.settingsOverlay.classList.add('show');
    updateBodyScrollLock();
  }

  if ($('selectGridMode')) {
    $('selectGridMode').addEventListener('change', e => {
      state.gridMode = e.target.value;
      save('gridMode', state.gridMode);
      updateGridModeUI();
      renderAll();
    });
  }

  if ($('settingOpenTargetBlank')) {
    $('settingOpenTargetBlank').addEventListener('change', e => {
      state.openTargetBlank = e.target.checked;
      save('openTargetBlank', state.openTargetBlank);
      renderAll();
    });
  }

  if ($('settingHideIconTitles')) {
    $('settingHideIconTitles').addEventListener('change', e => {
      state.hideIconTitles = e.target.checked;
      save('hideIconTitles', state.hideIconTitles);
      applyHideIconTitles(state.hideIconTitles);
      masonryLayout();
    });
  }

  if ($('settingClockSeconds')) {
    $('settingClockSeconds').addEventListener('change', e => {
      state.showClockSeconds = e.target.checked;
      save('showClockSeconds', state.showClockSeconds);
      updateClock();
    });
  }

  if ($('settingClockSub')) {
    $('settingClockSub').addEventListener('change', e => {
      state.showClockSub = e.target.checked;
      save('showClockSub', state.showClockSub);
      updateClock();
    });
  }

  if ($('settingInvertClockColor')) {
    $('settingInvertClockColor').addEventListener('change', e => {
      state.invertClockColor = e.target.checked;
      save('invertClockColor', state.invertClockColor);
      applyInvertClockColor(state.invertClockColor);
    });
  }

  if ($('settingShowStatusBar')) {
    $('settingShowStatusBar').addEventListener('change', e => {
      state.showStatusBar = e.target.checked;
      save('showStatusBar', state.showStatusBar);
      applyStatusBarVisibility(state.showStatusBar);
    });
  }

  if ($('btnResetOfficialBm')) {
    $('btnResetOfficialBm').addEventListener('click', resetBookmarksToOfficial);
  }

  function buildWallpaperGallery() {
    let h = '';
    WALLPAPERS.forEach((wp,i) => {
      h += '<div class="wp-thumb'+(wp===state.bg?' active':'')+'" style="background-image:url('+wp+')" data-wp="'+wp+'" title="壁纸 '+(i+1)+'"></div>';
    });
    h += '<div class="wp-upload" id="wpUploadBtn" title="上传自定义壁纸">+</div>';
    el.wpGallery.innerHTML = h;

    el.wpGallery.querySelectorAll('.wp-thumb').forEach(t => {
      t.addEventListener('click', () => { applyBg(t.dataset.wp); openSettings(); });
    });
    el.wpGallery.querySelector('#wpUploadBtn')?.addEventListener('click', () => $('wpUpload').click());
  }

  $('btnWallpaper')?.addEventListener('click', openSettings);

  $('wpUpload').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => { applyBg(ev.target.result); openSettings(); };
    r.readAsDataURL(f);
    e.target.value = '';
  });

  let toastTimer;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2000);
  }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey||e.metaKey) && e.key==='k') { e.preventDefault(); el.searchInput.focus(); el.searchInput.select(); }
  });

  let masonryTimer;
  let lastWindowWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    // 移动端滚动时顶部地址栏和底部工具栏的伸缩只会改变 innerHeight，不会改变宽度。
    // 过滤掉这种无意义的高度 resize，杜绝滚动造成的重复排版抖动
    if (window.innerWidth === lastWindowWidth) return;
    lastWindowWidth = window.innerWidth;

    clearTimeout(masonryTimer);
    masonryTimer = setTimeout(masonryLayout, 150);
  });

  // ── Custom Select Element Helpers ──
  function initCustomSelects() {
    document.querySelectorAll('.modal select, .settings-panel select').forEach(select => {
      let wrap = select.nextElementSibling;
      if (!wrap || !wrap.classList.contains('custom-select-wrap')) {
        // Clean up any orphaned custom dropdown associated with this select to prevent leaks
        if (select.customDropdown && select.customDropdown.parentNode) {
          select.customDropdown.parentNode.removeChild(select.customDropdown);
        }

        select.style.display = 'none';

        wrap = document.createElement('div');
        wrap.className = 'custom-select-wrap';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.innerHTML = `<span class="custom-select-text"></span><span class="custom-select-arrow"></span>`;
        
        // Append dropdown to body to bypass the parent container's backdrop-filter nesting browser rendering bug
        const dropdown = document.createElement('div');
        dropdown.className = 'custom-select-dropdown';
        document.body.appendChild(dropdown);
        select.customDropdown = dropdown;

        wrap.appendChild(trigger);
        select.parentNode.insertBefore(wrap, select.nextSibling);

        function updateDropdownPosition() {
          if (!dropdown.classList.contains('show')) return;
          const rect = trigger.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            dropdown.classList.remove('show');
            trigger.classList.remove('active');
            return;
          }
          const spaceBelow = window.innerHeight - rect.bottom;
          const approxHeight = Math.min(dropdown.scrollHeight || 180, 220);

          if (spaceBelow < approxHeight && rect.top > approxHeight) {
            dropdown.style.top = Math.max(10, rect.top - approxHeight - 4) + 'px';
          } else {
            dropdown.style.top = (rect.bottom + 4) + 'px';
          }

          dropdown.style.minWidth = rect.width + 'px';
          dropdown.style.maxWidth = Math.max(rect.width, 360) + 'px';

          const dropWidth = dropdown.offsetWidth || rect.width;
          if (rect.left + dropWidth > window.innerWidth - 12) {
            dropdown.style.left = Math.max(12, window.innerWidth - dropWidth - 12) + 'px';
          } else {
            dropdown.style.left = rect.left + 'px';
          }
        }
        dropdown._updatePosition = updateDropdownPosition;

        trigger.addEventListener('click', e => {
          e.stopPropagation();
          document.querySelectorAll('.custom-select-dropdown.show').forEach(d => {
            if (d !== dropdown) d.classList.remove('show');
          });
          document.querySelectorAll('.custom-select-trigger.active').forEach(t => {
            if (t !== trigger) t.classList.remove('active');
          });

          const isShow = dropdown.classList.toggle('show');
          trigger.classList.toggle('active', isShow);

          if (isShow) {
            updateDropdownPosition();
          }
        });
      }

      syncCustomSelect(select);
    });
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('.custom-select-wrap') && !e.target.closest('.custom-select-dropdown')) {
      document.querySelectorAll('.custom-select-dropdown.show').forEach(d => d.classList.remove('show'));
      document.querySelectorAll('.custom-select-trigger.active').forEach(t => t.classList.remove('active'));
    }
  });

  window.addEventListener('scroll', e => {
    // 关键修复：如果在下拉菜单自身滚动查看选项，绝对不能关闭！
    if (e.target && (e.target.closest?.('.custom-select-dropdown') || e.target.classList?.contains('custom-select-dropdown'))) {
      return;
    }
    // 如果是在弹窗/设置面板内部滚动，动态跟随定位，保持下拉菜单紧贴输入框
    const openDropdowns = document.querySelectorAll('.custom-select-dropdown.show');
    if (openDropdowns.length > 0) {
      if (e.target && e.target.closest?.('.modal-overlay, .settings-panel, .settings-content')) {
        openDropdowns.forEach(d => d._updatePosition?.());
        return;
      }
      // 只有在外部主页面滚动时才关闭
      openDropdowns.forEach(d => d.classList.remove('show'));
      document.querySelectorAll('.custom-select-trigger.active').forEach(t => t.classList.remove('active'));
    }
  }, true);

  function syncCustomSelect(select) {
    const wrap = select.nextElementSibling;
    if (!wrap || !wrap.classList.contains('custom-select-wrap')) return;

    const trigger = wrap.querySelector('.custom-select-trigger');
    const dropdown = select.customDropdown;
    if (!dropdown) return;
    
    dropdown.innerHTML = '';

    const options = Array.from(select.options);
    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'custom-select-item' + (opt.value === select.value ? ' selected' : '');
      item.dataset.value = opt.value;
      
      const isIconSelect = select.id === 'catIconSelect';
      if (isIconSelect && SVG_ICONS[opt.value]) {
        item.innerHTML = `<span class="custom-select-item-icon">${SVG_ICONS[opt.value]}</span><span class="custom-select-item-text">${opt.text}</span>`;
      } else {
        item.innerHTML = `<span>${opt.text}</span>`;
      }

      item.addEventListener('click', e => {
        e.stopPropagation();
        select.value = opt.value;
        select.dispatchEvent(new Event('change'));
        
        dropdown.querySelectorAll('.custom-select-item').forEach(it => {
          it.classList.toggle('selected', it.dataset.value === opt.value);
        });

        updateTrigger(select, trigger);
        
        dropdown.classList.remove('show');
        trigger.classList.remove('active');
      });

      dropdown.appendChild(item);
    });

    updateTrigger(select, trigger);
  }

  function updateTrigger(select, trigger) {
    const selectedOpt = select.options[select.selectedIndex];
    const textEl = trigger.querySelector('.custom-select-text');
    if (selectedOpt) {
      const isIconSelect = select.id === 'catIconSelect';
      if (isIconSelect && SVG_ICONS[selectedOpt.value]) {
        textEl.innerHTML = `<span class="custom-select-trigger-icon">${SVG_ICONS[selectedOpt.value]}</span><span class="custom-select-trigger-text">${selectedOpt.text}</span>`;
      } else {
        textEl.textContent = selectedOpt.text;
      }
    } else {
      textEl.textContent = '请选择';
    }
  }

  // ── Init ──
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const shortcutBadge = $('searchShortcutBadge');
  if (shortcutBadge) {
    shortcutBadge.textContent = isMac ? '⌘ K' : 'Ctrl K';
  }

  // Pre-load two-tier memory cache from IndexedDB in parallel, then hydrate
  NavIconCache.init().then(() => {
    hydrateCachedIcons();
  });

  renderAll();
  initCustomSelects();

  function handleHashRoute() {
    if (location.hash === '#settings') {
      openSettings();
    } else if (location.hash === '#settings-dropdown') {
      openSettings();
      setTimeout(() => {
        const trigger = document.querySelector('.settings-panel .custom-select-trigger');
        if (trigger) trigger.click();
      }, 300);
    }
  }
  handleHashRoute();
  window.addEventListener('hashchange', handleHashRoute);



  // Expose key UI methods for inline attributes and external triggers
  window.renderAll = renderAll;
  window.showToast = showToast;
  window.handleIconError = handleIconError;
  window.openSettings = openSettings;
  window.applyInvertClockColor = applyInvertClockColor;
})();
