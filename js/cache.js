// ── Icon Cache & Online Fetcher ──
(function() {
  "use strict";

  // ── High-Performance Two-Tier Icon Cache (Memory Map + IndexedDB + LRU) ──
  const NavIconCache = {
    DB_NAME: 'NavIconCacheDB',
    STORE_NAME: 'icons',
    VERSION: 2,
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
                  if (item && item.domain && item.dataUrl) {
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
            if (!item) return resolve(null);
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

    async set(domain, dataUrl) {
      if (!domain || !dataUrl) return;
      const item = {
        domain,
        dataUrl,
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
  function fetchAndCacheOnlineFavicon(domain, onFound, onFail) {
    if (!domain || domain === 'newtab') {
      if (onFail) onFail();
      return;
    }
    const sources = [
      'https://' + domain + '/favicon.ico',
      'https://favicon.im/' + domain + '?size=64',
      'https://api.iowen.cn/favicon/' + domain + '.png',
      'https://icons.duckduckgo.com/ip2/' + domain + '.ico'
    ];

    let idx = 0;
    function tryNext() {
      if (idx >= sources.length) {
        if (onFail) onFail();
        return;
      }
      const url = sources[idx++];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let timer = setTimeout(() => {
        img.src = '';
        tryNext();
      }, 2500);

      img.onload = () => {
        clearTimeout(timer);
        if (onFound) onFound(url);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(64, Math.max(16, img.naturalWidth || 32));
          canvas.height = Math.min(64, Math.max(16, img.naturalHeight || 32));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          NavIconCache.set(domain, dataUrl);
        } catch {
          NavIconCache.set(domain, url);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        tryNext();
      };
      img.src = url;
    }
    tryNext();
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
