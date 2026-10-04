// ── Icon Cache & Online Fetcher ──
(function() {
  "use strict";

  // ── High-Performance Two-Tier Icon Cache (Memory Map + IndexedDB + LRU) ──
  const NavIconCache = {
    DB_NAME: 'NavIconCacheDB',
    STORE_NAME: 'icons',
    VERSION: 2,
    DATA_VERSION: 2,
    MAX_ITEMS: 1000,
    TTL: 30 * 24 * 3600 * 1000,
    _memoryCache: new Map(),
    _dbPromise: null,
    _initPromise: null,

    getDB() {
      if (!this._dbPromise) {
        this._dbPromise = new Promise((resolve) => {
          if (!window.indexedDB) return resolve(null);
          const req = indexedDB.open(this.DB_NAME, this.VERSION);
          req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(this.STORE_NAME)) {
              const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'domain' });
              store.createIndex('lastUsed', 'lastUsed', { unique: false });
            }
            if (!db.objectStoreNames.contains('wallpapers')) {
              db.createObjectStore('wallpapers', { keyPath: 'key' });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
      }
      return this._dbPromise;
    },

    async init() {
      if (!this._initPromise) {
        this._initPromise = new Promise(async (resolve) => {
          try {
            const db = await this.getDB();
            if (!db) return resolve(false);
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
              if (Array.isArray(req.result)) {
                req.result.forEach(item => {
                  // 只装载当前版本的抓取结果,旧版(未经像素校验,可能含纯色占位坏图)
                  // 条目不进入内存缓存,页面会按缺失处理并触发重新抓取
                  if (item && item.domain && item.dataUrl && item.v === this.DATA_VERSION) {
                    this._memoryCache.set(item.domain, item);
                  }
                });
              }
              resolve(true);
            };
            req.onerror = () => resolve(false);
          } catch {
            resolve(false);
          }
        });
      }
      return this._initPromise;
    },

    getSync(domain) {
      if (!domain) return null;
      return this._memoryCache.get(domain) || null;
    },

    async get(domain) {
      if (!domain) return null;
      if (this._memoryCache.has(domain)) {
        return this._memoryCache.get(domain);
      }
      try {
        const db = await this.getDB();
        if (!db) return null;
        return new Promise(resolve => {
          const tx = db.transaction(this.STORE_NAME, 'readwrite');
          const store = tx.objectStore(this.STORE_NAME);
          const req = store.get(domain);
          req.onsuccess = () => {
            const item = req.result;
            if (!item || !item.dataUrl || item.v !== this.DATA_VERSION) return resolve(null);
            item.lastUsed = Date.now();
            store.put(item);
            this._memoryCache.set(domain, item);
            resolve(item);
          };
          req.onerror = () => resolve(null);
        });
      } catch {
        return null;
      }
    },

    async set(domain, dataUrl, version) {
      if (!domain || !dataUrl) return;
      const item = {
        domain,
        dataUrl,
        v: version || 1,
        timestamp: Date.now(),
        lastUsed: Date.now()
      };
      this._memoryCache.set(domain, item);
      try {
        const db = await this.getDB();
        if (!db) return;
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        store.put(item);

        const countReq = store.count();
        countReq.onsuccess = () => {
          if (countReq.result > this.MAX_ITEMS) {
            const index = store.index('lastUsed');
            const cursorReq = index.openCursor();
            let toDelete = countReq.result - this.MAX_ITEMS;
            cursorReq.onsuccess = () => {
              const cursor = cursorReq.result;
              if (cursor && toDelete > 0) {
                store.delete(cursor.primaryKey);
                this._memoryCache.delete(cursor.primaryKey);
                toDelete--;
                cursor.continue();
              }
            };
          }
        };
      } catch (e) {
        console.warn('IconCache set failed', e);
      }
    },

    async delete(domain) {
      if (!domain) return;
      this._memoryCache.delete(domain);
      try {
        const db = await this.getDB();
        if (!db) return;
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        tx.objectStore(this.STORE_NAME).delete(domain);
      } catch {}
    },

    async clear() {
      this._memoryCache.clear();
      try {
        const db = await this.getDB();
        if (!db) return;
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        tx.objectStore(this.STORE_NAME).clear();
      } catch {}
    }
  };

  // ── Online Favicon Fetching & Caching ──
  // 并行竞速抓取,带直连优先权:
  //   1. 直连源(favicon.ico/svg/apple-touch-icon)成功 → 立即采用;
  //   2. CDN 源成功 → 先持有,等待直连:直连全部出局立即采用,否则最多等 3s;
  //   3. 等待期内直连成功 → 采用直连结果,放弃 CDN 候选。
  // 这样 CDN 对未收录站点返回的占位图(地球/"f"字)只有在直连确实不可达时
  // 才有机会被采用;支持 CORS 的 CDN 源另有像素校验拦截全透明/纯色块坏图。
  // 全部失败的域名写入负缓存,10 分钟内不再重复轰炸;手动刷新可强制绕过。
  const NEG_CACHE_KEY = 'nav2_icon_negcache';
  const NEG_TTL = 10 * 60 * 1000;
  const CDN_FETCH_TIMEOUT = 3500;
  const DIRECT_FETCH_TIMEOUT = 6000; // 站点自身服务器可能偏慢,但它的图标最权威,放宽超时
  const DIRECT_GRACE_MS = 3000;      // CDN 结果先持有最多 3s 等直连;直连全部出局则立即采用
  const ENTRY_VERSION = NavIconCache.DATA_VERSION;
  const _inflightFetches = new Map(); // domain -> [{onFound, onFail}]

  function negCacheRead() {
    try { return JSON.parse(sessionStorage.getItem(NEG_CACHE_KEY) || '{}'); } catch { return {}; }
  }
  function negCacheWrite(map) {
    try { sessionStorage.setItem(NEG_CACHE_KEY, JSON.stringify(map)); } catch {}
  }

  function buildFaviconSources(domain) {
    return [
      // 直连源:站点自己声明的图标最准确。CDN 对未收录站点常返回占位图
      // (地球/"f"字等),无法靠像素校验识别,因此直连源拥有优先采用权
      { url: 'https://' + domain + '/favicon.ico', timeout: DIRECT_FETCH_TIMEOUT, direct: true },
      { url: 'https://' + domain + '/favicon.svg', timeout: DIRECT_FETCH_TIMEOUT, direct: true },
      { url: 'https://' + domain + '/apple-touch-icon.png', timeout: DIRECT_FETCH_TIMEOUT, direct: true },
      // CDN 兜底:响应快,但对未收录站点可能返回占位图,靠像素校验+直连优先双保险拦截
      { url: 'https://favicon.cccyun.cc/' + domain, timeout: CDN_FETCH_TIMEOUT, cors: true },
      { url: 'https://icons.duckduckgo.com/ip2/' + domain + '.ico', timeout: CDN_FETCH_TIMEOUT },
      { url: 'https://www.google.com/s2/favicons?sz=64&domain=' + domain, timeout: CDN_FETCH_TIMEOUT }
    ];
  }

  // 像素校验:识别"加载成功"的坏图 —— 全透明或整张纯色块(如某些 CDN 给未收录
  // 站点返回的全黑 PNG)。真实图标几乎总有透明边缘或多色内容。仅对 CORS 可读像素
  // 的源调用;拿不到像素数据时宁可信其有,由展示层兜底。
  function isUsableIconPixels(ctx, w, h) {
    let data;
    try { data = ctx.getImageData(0, 0, w, h).data; } catch { return true; }
    const total = w * h;
    let transparent = 0, opaque = 0;
    let r0 = 0, g0 = 0, b0 = 0, uniform = true;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) { transparent++; continue; }
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (opaque === 0) { r0 = r; g0 = g; b0 = b; }
      else if (uniform && Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) > 30) uniform = false;
      opaque++;
    }
    if (opaque === 0) return false;                           // 全透明
    if (transparent >= total * 0.995) return false;           // 几乎全透明
    // 不透明且所有像素近同色:纯色块坏图。有透明底的镂空单色 logo
    // (透明占比高)不受影响,只有整张实心纯色才拦。
    if (uniform && transparent < total * 0.005) return false;
    return true;
  }

  function drawToSizedCanvas(img) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(64, Math.max(16, img.naturalWidth || 32));
    canvas.height = Math.min(64, Math.max(16, img.naturalHeight || 32));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function fetchAndCacheOnlineFavicon(domain, onFound, onFail, opts) {
    if (!domain || domain === 'newtab') {
      if (onFail) onFail();
      return;
    }
    const force = !!(opts && opts.force);

    // 同域并发去重:抓取进行中只登记回调,共用同一次结果
    if (_inflightFetches.has(domain)) {
      _inflightFetches.get(domain).push({ onFound, onFail });
      return;
    }
    _inflightFetches.set(domain, [{ onFound, onFail }]);
    const flush = (ok, url) => {
      const cbs = _inflightFetches.get(domain) || [];
      _inflightFetches.delete(domain);
      cbs.forEach(cb => {
        if (ok) { if (cb.onFound) cb.onFound(url); }
        else if (cb.onFail) cb.onFail();
      });
    };

    const neg = negCacheRead();
    if (force) {
      if (neg[domain]) { delete neg[domain]; negCacheWrite(neg); }
    } else if (neg[domain] && Date.now() - neg[domain] < NEG_TTL) {
      flush(false);
      return;
    }

    const sources = buildFaviconSources(domain);
    let finished = false;
    let settledCount = 0;          // 已出结果的源数
    let pendingDirect = 0;         // 仍在等待结果的直连源数
    let heldCdn = null;            // 已通过校验、等待直连信号期过后的 CDN 候选 {url, value}
    let heldTimer = null;
    const total = sources.length;
    sources.forEach(s => { if (s.direct) pendingDirect++; });

    const finalize = (ok, url) => {
      if (finished) return;
      finished = true;
      if (heldTimer) { clearTimeout(heldTimer); heldTimer = null; }
      if (!ok) { neg[domain] = Date.now(); negCacheWrite(neg); }
      flush(ok, url);
    };
    // 直连源优先:CDN 结果只有在直连全部出局、或优先等待期结束后才采用
    const tryAdoptHeld = () => {
      if (finished || !heldCdn) return;
      const adopted = heldCdn;
      heldCdn = null;
      NavIconCache.set(domain, adopted.value, ENTRY_VERSION);
      finalize(true, adopted.url);
    };
    const onSourceSettled = (src) => {
      settledCount++;
      if (src.direct) pendingDirect--;
      if (finished) return;
      if (heldCdn && pendingDirect <= 0) { tryAdoptHeld(); return; } // 直连已全部出局
      if (settledCount >= total) {
        if (heldCdn) tryAdoptHeld();
        else finalize(false);
      }
    };
    const failOne = (src) => onSourceSettled(src);

    sources.forEach(src => {
      const img = new Image();
      if (src.cors) img.crossOrigin = 'anonymous';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        img.src = '';
        failOne(src);
      }, src.timeout || CDN_FETCH_TIMEOUT);
      img.onload = () => {
        if (settled || finished) return;
        settled = true;
        clearTimeout(timer);
        // CORS 可读像素的源先校验后采用:全透明/纯色块等坏图按失败处理
        let value = null;
        if (src.cors) {
          try {
            const canvas = drawToSizedCanvas(img);
            if (!isUsableIconPixels(canvas.getContext('2d'), canvas.width, canvas.height)) {
              failOne(src);
              return;
            }
            value = canvas.toDataURL('image/png');
          } catch { value = src.url; } // 画布被污染:退化为远程 URL
        } else {
          try { value = drawToSizedCanvas(img).toDataURL('image/png'); }
          catch { value = src.url; }   // 同上
        }
        if (src.direct) {
          // 直连最权威:立即采用,并放弃仍在等待期的 CDN 候选
          NavIconCache.set(domain, value, ENTRY_VERSION);
          finalize(true, src.url);
        } else if (!heldCdn) {
          heldCdn = { url: src.url, value };
          if (pendingDirect > 0) heldTimer = setTimeout(tryAdoptHeld, DIRECT_GRACE_MS);
          else tryAdoptHeld();
        } else {
          onSourceSettled(src); // 后到的 CDN 结果无人认领,仅记账
        }
      };
      img.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        failOne(src);
      };
      img.src = src.url;
    });
  }
  // ── Wallpaper Store（大体积 dataURL 壁纸专用，避免撑爆 localStorage 配额）──
  const WallpaperStore = {
    STORE_NAME: 'wallpapers',
    async get(key) {
      try {
        const db = await NavIconCache.getDB();
        if (!db) return null;
        return new Promise(resolve => {
          const tx = db.transaction(this.STORE_NAME, 'readonly');
          const req = tx.objectStore(this.STORE_NAME).get(key);
          req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
          req.onerror = () => resolve(null);
        });
      } catch { return null; }
    },
    async set(key, dataUrl) {
      if (!key || !dataUrl) return;
      try {
        const db = await NavIconCache.getDB();
        if (!db) return;
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        tx.objectStore(this.STORE_NAME).put({ key, dataUrl, time: Date.now() });
      } catch (e) {
        console.warn('WallpaperStore set failed', e);
      }
    },
    async clear() {
      try {
        const db = await NavIconCache.getDB();
        if (!db) return;
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        tx.objectStore(this.STORE_NAME).clear();
      } catch {}
    }
  };

  // ── Bing 每日一图（官方 JSONP 接口 → 第三方直链兜底；纯图片地址无需 CORS）──
  function tryLoadImage(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const probe = new Image();
      const timer = setTimeout(() => reject(new Error('image timeout')), timeoutMs);
      probe.onload = () => { clearTimeout(timer); resolve(url); };
      probe.onerror = () => { clearTimeout(timer); reject(new Error('image failed')); };
      probe.src = url;
    });
  }
  function fetchBingDaily() {
    return new Promise((resolve, reject) => {
      const cbName = '_bingJsonp' + Date.now();
      const script = document.createElement('script');
      let settled = false;
      const timer = setTimeout(() => finish(reject, new Error('jsonp timeout')), 6000);
      function finish(fn, val) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { delete window[cbName]; } catch {}
        script.remove();
        fn(val);
      }
      window[cbName] = data => {
        try {
          const img = data && data.images && data.images[0];
          if (img && img.url) finish(resolve, 'https://cn.bing.com' + img.url);
          else finish(reject, new Error('empty payload'));
        } catch (e) { finish(reject, e); }
      };
      script.onerror = () => finish(reject, new Error('jsonp error'));
      script.src = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&callback=' + cbName;
      document.head.appendChild(script);
    }).catch(() =>
      tryLoadImage('https://bing.img.run/uhd.php', 6000)
        .catch(() => tryLoadImage('https://api.dujin.org/bing/uhd.php', 6000))
    );
  }


  // Expose to window
  window.NavIconCache = NavIconCache;
  window.WallpaperStore = WallpaperStore;
  window.fetchBingDaily = fetchBingDaily;
  window.fetchAndCacheOnlineFavicon = fetchAndCacheOnlineFavicon;
})();
