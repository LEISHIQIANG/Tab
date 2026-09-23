// ── State & Storage Management ──
(function() {
  "use strict";

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
    clockSubTZ: 'auto',
    invertClockColor: false,
    showStatusBar: false,
    collapsedCats: []
  };
  window.DEFAULT_STATE = DEFAULT_STATE;

  let _bookmarks = window.__BOOKMARKS__ || [];
  Object.defineProperty(window, "bookmarks", {
    get() { return _bookmarks; },
    set(v) { _bookmarks = v; },
    configurable: true
  });

  let state = Object.assign({}, DEFAULT_STATE);
  window.state = state;

  // ── Storage ──
  const STORAGE_PREFIX = 'nav2-';
  // 派生缓存键：由基线+差分在每次启动时重建，不计入"用户配置更新时间"，
  // 否则每次打开页面都会误判本地比配置文件新、触发无意义的文件回写。
  const DERIVED_KEYS = new Set(['bookmarks', 'last_revision', 'ip_cache', 'updated_at', 'created_at']);
  function load(k, def) {
    try {
      const v = localStorage.getItem(STORAGE_PREFIX + k);
      return v !== null ? JSON.parse(v) : def;
    } catch (error) {
      console.warn('无法读取本地导航配置：', error);
      return def;
    }
  }
  function save(k, v) {
    try {
      localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(v));
      if (!DERIVED_KEYS.has(k)) {
        localStorage.setItem(STORAGE_PREFIX + 'updated_at', String(Date.now()));
        // config-sync.js 注入的钩子：个人配置有实质变更，防抖写回本地配置文件
        if (typeof window.__onConfigDirty === 'function') window.__onConfigDirty();
      }
      return true;
    } catch (error) {
      // 自定义壁纸可能超过浏览器的 localStorage 容量，保留当前页面状态但提示用户。
      console.warn('无法保存本地导航配置：', error);
      if (typeof showToast === 'function') showToast('配置未能写入浏览器存储，请减少自定义壁纸大小后重试');
      return false;
    }
  }

  // 首次访问检测：新用户在本地固化一份官方默认配置的起点标记
  let isFirstVisit = false;
  try {
    if (localStorage.getItem(STORAGE_PREFIX + 'created_at') === null) {
      localStorage.setItem(STORAGE_PREFIX + 'created_at', String(Date.now()));
      isFirstVisit = true;
    }
  } catch (error) { /* 存储不可用时静默降级 */ }
  window.IS_FIRST_VISIT = isFirstVisit;

  // ── 个人配置快照（导出 / 导入 / 本地配置文件同步 三方共用的统一格式）──
  // 派生缓存不进快照：接收方启动时会用「官方基线 + user_diff」自行重建。
  const SNAPSHOT_EXCLUDED_KEYS = new Set([STORAGE_PREFIX + 'bookmarks', STORAGE_PREFIX + 'ip_cache']);
  function buildConfigSnapshot() {
    const storage = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX) && !SNAPSHOT_EXCLUDED_KEYS.has(key)) {
        storage[key] = localStorage.getItem(key);
      }
    }
    const updatedAt = Number(storage[STORAGE_PREFIX + 'updated_at'] || 0) || Date.now();
    if (String(updatedAt) !== storage[STORAGE_PREFIX + 'updated_at']) {
      storage[STORAGE_PREFIX + 'updated_at'] = String(updatedAt);
    }
    return {
      version: 2,
      updatedAt,
      revision: window.BOOKMARKS_REVISION || '',
      exportedAt: new Date().toISOString(),
      storage
    };
  }
  function applyConfigSnapshot(payload, opts) {
    if (!payload || !payload.storage || typeof payload.storage !== 'object') throw new Error('invalid snapshot');
    Object.entries(payload.storage).forEach(([key, value]) => {
      if (key.startsWith(STORAGE_PREFIX) && typeof value === 'string') localStorage.setItem(key, value);
    });
    // asLocalEdit：视为用户主动变更（手动导入），本地配置时间戳取当前时间，
    // 保证比配置文件新、随后会被推出到文件；同步应用时保持文件自带的时间戳避免来回覆盖。
    if (opts && opts.asLocalEdit) {
      localStorage.setItem(STORAGE_PREFIX + 'updated_at', String(Date.now()));
    } else {
      const t = Number(payload.updatedAt || 0);
      const cur = Number(localStorage.getItem(STORAGE_PREFIX + 'updated_at') || 0);
      if (t > cur) localStorage.setItem(STORAGE_PREFIX + 'updated_at', String(t));
    }
  }

  function exportConfiguration() {
    const payload = JSON.stringify(buildConfigSnapshot(), null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'my-navigation-config.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('个人配置已导出');
  }

  function importConfiguration(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const payload = JSON.parse(event.target.result);
        const okVersion = payload && (payload.version === 1 || payload.version === 2);
        if (!okVersion || !payload.storage || typeof payload.storage !== 'object') throw new Error('invalid');
        // 导入会整份覆盖本地配置：先自动留一份备份，便于误导入后恢复
        if (window.ConfigFileSync && typeof window.ConfigFileSync.backupLocalConfig === 'function') {
          try { await window.ConfigFileSync.backupLocalConfig(); } catch { /* 备份失败不阻塞导入 */ }
        }
        applyConfigSnapshot(payload, { asLocalEdit: true });
        showToast('配置已导入，正在应用');
        setTimeout(() => location.reload(), 500);
      } catch {
        showToast('无效的配置文件');
      }
    };
    reader.readAsText(file);
  }

  // Load all settings
  state.theme  = load('theme', 'light');
  // 主题为「跟随系统」时，按当前系统偏好解析出实际主题（影响遮罩等主题相关默认值）
  const sysDark = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const effectiveTheme = (state.theme === 'auto') ? (sysDark ? 'dark' : 'light') : state.theme;
  state.engine = load('engine', 'google');
  if (!engines[state.engine]) state.engine = 'google';
  state.blur   = load('blur', DEFAULT_STATE.blur);
  state.bg     = load('bg', DEFAULT_STATE.bg);
  state.bgOpacity = Number(load('bgOpacity', DEFAULT_STATE.bgOpacity));
  state.overlayOpacity = Number(load('overlayOpacity', effectiveTheme === 'dark' ? 0.40 : DEFAULT_STATE.overlayOpacity));
  state.iconSize = load('iconSize', DEFAULT_STATE.iconSize);
  const rawCols = Number(load('cols', DEFAULT_STATE.cols));
  state.cols = (rawCols >= 1 && rawCols <= 6) ? rawCols : DEFAULT_STATE.cols;
  state.gridMode = load('gridMode', DEFAULT_STATE.gridMode);
  const rawMasonryCols = Number(load('masonryCols', DEFAULT_STATE.masonryCols));
  state.masonryCols = (rawMasonryCols >= 1 && rawMasonryCols <= 5) ? rawMasonryCols : DEFAULT_STATE.masonryCols;
  state.gridColGap = load('gridColGap', DEFAULT_STATE.gridColGap);
  state.gridRowGap = load('gridRowGap', DEFAULT_STATE.gridRowGap);
  state.clusterPadding = load('clusterPadding', DEFAULT_STATE.clusterPadding);
  state.clusterGap = load('clusterGap', DEFAULT_STATE.clusterGap);
  state.searchWidth = load('searchWidth', DEFAULT_STATE.searchWidth);
  state.searchHeight = load('searchHeight', DEFAULT_STATE.searchHeight);
  state.searchRadius = load('searchRadius', DEFAULT_STATE.searchRadius);
  state.searchOpacity = load('searchOpacity', DEFAULT_STATE.searchOpacity);
  state.glassOpacity = load('glassOpacity', DEFAULT_STATE.glassOpacity);
  state.iconFontSize = load('iconFontSize', DEFAULT_STATE.iconFontSize);
  state.iconRadius = load('iconRadius', DEFAULT_STATE.iconRadius);
  state.clockWeight = load('clockWeight', load('dateWeight', DEFAULT_STATE.clockWeight));
  state.clusterRadius = load('clusterRadius', DEFAULT_STATE.clusterRadius);
  state.clusterOpacity = load('clusterOpacity', DEFAULT_STATE.clusterOpacity);
  state.clusterBlur = load('clusterBlur', DEFAULT_STATE.clusterBlur);
  state.minimalMode = load('minimalMode', false);
  state.gridGap = load('gridGap', DEFAULT_STATE.gridGap);
  state.catOrder = load('catOrder', DEFAULT_CAT_ORDER);
  state.catIcons = load('catIcons', DEFAULT_CAT_ICONS);
  state.openTargetBlank = load('openTargetBlank', DEFAULT_STATE.openTargetBlank);
  state.hideIconTitles = load('hideIconTitles', DEFAULT_STATE.hideIconTitles);
  state.showClockSeconds = load('showClockSeconds', DEFAULT_STATE.showClockSeconds);
  state.showClockSub = load('showClockSub', DEFAULT_STATE.showClockSub);
  state.invertClockColor = load('invertClockColor', DEFAULT_STATE.invertClockColor);
  state.showStatusBar = load('showStatusBar', DEFAULT_STATE.showStatusBar);
  state.clockSubTZ = load('clockSubTZ', DEFAULT_STATE.clockSubTZ);
  state.collapsedCats = load('collapsedCats', []);

  function applyHideIconTitles(hide) {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('hide-icon-titles', !!hide);
    }
  }
  applyHideIconTitles(state.hideIconTitles);

  // ── Smart Data Architecture & Three-Way Diff Sync ──
  // 数据权责清晰划分：
  // 1. 服务端代码控制：
  //    - 基线核心书签库 (window.__BOOKMARKS__)
  //    - 官方分类及图标 (DEFAULT_CAT_ORDER / DEFAULT_CAT_ICONS)
  //    - 官方书签库版本号 (window.BOOKMARKS_REVISION)
  // 2. 用户本地电脑保存：
  //    - 个性化界面参数 (nav2-theme, nav2-iconSize, nav2-blur, 各种开关等)
  //    - 本地用户差分数据 (nav2-user_diff)：
  //        * deletedUrls: 墓碑机制！记录用户主动删除的网站，确保服务器后续版本更新绝不“死灰复燃”
  //        * modifiedSites: 记录用户自定义改名、换分类等覆盖项
  //        * customSites: 记录用户自行添加的专属新网站
  //        * siteOrder: 记录每个分类内用户拖拽排定的网站顺序（含跨分类移动后的归属）
  //    - 上次已合并的服务器版本号 (nav2-last_revision)
  //    - 当前书签缓存视图 (nav2-bookmarks)，保证无网/秒级离线渲染
  //    - 个人配置更新时间戳 (nav2-updated_at)，供本地配置文件同步做最后写入者仲裁
  const normalizeUrl = u => (u || '').replace(/\/+$/, '').trim().toLowerCase();

  function getUserDiff() {
    return load('user_diff', {
      deletedUrls: [],
      modifiedSites: {},
      customSites: [],
      siteOrder: {}
    });
  }

  function saveUserDiff(diff) {
    save('user_diff', diff);
  }

  function initBookmarksData() {
    const serverRevision = window.BOOKMARKS_REVISION || '1.0.0';
    const lastRevision = load('last_revision', null);
    let diff = getUserDiff();
    let savedBookmarks = load('bookmarks', null);

    // 兼容历史老版本数据：平滑迁移至 user_diff 差分模型。
    // 仅当「存在整份书签缓存、但从未记录过版本号」（差分模型之前的旧版本数据）才迁移；
    // 否则缓存缺失的站点可能只是官方新收录（并非用户删除），误迁移会给它们打上墓碑，
    // 导致官方更新永远无法到达从未增删过书签的用户。
    const isLegacyData = (savedBookmarks && lastRevision === null);
    if (isLegacyData) {
      const serverBaseline0 = window.__BOOKMARKS__ || [];
      const serverMap = new Map();
      serverBaseline0.forEach(b => serverMap.set(normalizeUrl(b.url), b));

      const savedMap = new Map();
      savedBookmarks.forEach(b => savedMap.set(normalizeUrl(b.url), b));

      if (!diff.deletedUrls) diff.deletedUrls = [];
      if (!diff.modifiedSites) diff.modifiedSites = {};
      if (!diff.customSites) diff.customSites = [];

      serverMap.forEach((b, normUrl) => {
        if (!savedMap.has(normUrl)) {
          if (!diff.deletedUrls.includes(normUrl)) diff.deletedUrls.push(normUrl);
        }
      });

      savedBookmarks.forEach(sb => {
        const normUrl = normalizeUrl(sb.url);
        const srv = serverMap.get(normUrl);
        if (!srv) {
          diff.customSites.push(sb);
        } else if (srv.name !== sb.name || srv.category !== sb.category) {
          diff.modifiedSites[normUrl] = { name: sb.name, category: sb.category, icon: sb.icon || '' };
        }
      });
      saveUserDiff(diff);
    }

    const isNewServerRevision = (lastRevision !== serverRevision);
    const serverBaseline = window.__BOOKMARKS__ || [];
    const deletedSet = new Set((diff.deletedUrls || []).map(normalizeUrl));
    const modifiedMap = diff.modifiedSites || {};
    const customList = diff.customSites || [];

    let newSitesPushed = 0;
    const mergedList = [];
    const seenUrls = new Set();

    serverBaseline.forEach(bm => {
      const norm = normalizeUrl(bm.url);
      if (deletedSet.has(norm)) return; // 墓碑拦截，已删除的网站绝不复活

      let finalBm = { ...bm };
      if (modifiedMap[norm]) {
        finalBm = { ...finalBm, ...modifiedMap[norm] };
      }
      mergedList.push(finalBm);
      seenUrls.add(norm);

      if (isNewServerRevision && savedBookmarks) {
        if (!savedBookmarks.some(sb => normalizeUrl(sb.url) === norm)) {
          newSitesPushed++;
        }
      }
    });

    customList.forEach(cb => {
      const norm = normalizeUrl(cb.url);
      if (!seenUrls.has(norm)) {
        mergedList.push({ ...cb });
        seenUrls.add(norm);
      }
    });

    // 应用用户拖拽排定的组内顺序：排过的站点按记录顺序在前，
    // 未记录的（官方新增等）按基线顺序排在其后，绝不打乱用户已有排序。
    const siteOrder = (diff.siteOrder && typeof diff.siteOrder === 'object') ? diff.siteOrder : {};
    const orderEntries = Object.entries(siteOrder).filter(([, list]) => Array.isArray(list) && list.length > 0);
    if (orderEntries.length > 0) {
      const grouped = new Map();
      mergedList.forEach(bm => {
        const cat = bm.category || '其他';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat).push(bm);
      });
      const sorted = [];
      grouped.forEach((items, cat) => {
        const ord = siteOrder[cat];
        if (Array.isArray(ord) && ord.length > 0) {
          const idxMap = new Map();
          ord.forEach((u, i) => idxMap.set(u, i));
          items.sort((a, b) => {
            const ia = idxMap.get(normalizeUrl(a.url));
            const ib = idxMap.get(normalizeUrl(b.url));
            if (ia === undefined && ib === undefined) return 0;
            if (ia === undefined) return 1;
            if (ib === undefined) return -1;
            return ia - ib;
          });
        }
        sorted.push(...items);
      });
      mergedList.length = 0;
      mergedList.push(...sorted);
    }

    bookmarks = mergedList;
    save('bookmarks', bookmarks);
    save('last_revision', serverRevision);

    if (isNewServerRevision && newSitesPushed > 0) {
      setTimeout(() => {
        showToast('已为您同步服务器最新收录的 ' + newSitesPushed + ' 个网站！');
      }, 1000);
    }
  }
  initBookmarksData();

  function deleteBookmarkByUrl(rawUrl) {
    const norm = normalizeUrl(rawUrl);
    let diff = getUserDiff();
    if (!diff.deletedUrls) diff.deletedUrls = [];
    if (!diff.deletedUrls.includes(norm)) {
      diff.deletedUrls.push(norm);
    }
    // 记录撤销所需信息：是否自建站点、原组内排序位置
    const customIdx = (diff.customSites || []).findIndex(b => normalizeUrl(b.url) === norm);
    const wasCustom = customIdx >= 0;
    const customEntry = wasCustom ? Object.assign({}, diff.customSites[customIdx]) : null;
    diff.customSites = (diff.customSites || []).filter(b => normalizeUrl(b.url) !== norm);
    if (diff.modifiedSites && diff.modifiedSites[norm]) {
      delete diff.modifiedSites[norm];
    }
    let orderInfo = null;
    const target = bookmarks.find(b => normalizeUrl(b.url) === norm);
    if (target && diff.siteOrder && Array.isArray(diff.siteOrder[target.category || '其他'])) {
      const orderIdx = diff.siteOrder[target.category || '其他'].indexOf(norm);
      if (orderIdx >= 0) orderInfo = { cat: target.category || '其他', index: orderIdx };
    }
    pruneSiteOrder(diff, norm);
    saveUserDiff(diff);

    const idx = bookmarks.findIndex(b => normalizeUrl(b.url) === norm);
    const removed = idx >= 0 ? Object.assign({}, bookmarks[idx]) : (customEntry ? Object.assign({}, customEntry) : null);
    const removedIndex = idx;
    bookmarks = bookmarks.filter(b => normalizeUrl(b.url) !== norm);
    save('bookmarks', bookmarks);
    return { removed, removedIndex, wasCustom, customEntry, orderInfo };
  }

  // 撤销删除：移除墓碑、还原自建站点与组内排序位置，并把书签插回原索引
  function undoDeleteBookmark(token) {
    if (!token || !token.removed) return;
    const norm = normalizeUrl(token.removed.url);
    let diff = getUserDiff();
    if (!diff.deletedUrls) diff.deletedUrls = [];
    diff.deletedUrls = diff.deletedUrls.filter(u => u !== norm);
    if (token.wasCustom) {
      if (!diff.customSites) diff.customSites = [];
      if (!diff.customSites.some(b => normalizeUrl(b.url) === norm)) {
        diff.customSites.push(token.customEntry || Object.assign({}, token.removed));
      }
    }
    if (token.orderInfo && diff.siteOrder && typeof diff.siteOrder === 'object') {
      const list = diff.siteOrder[token.orderInfo.cat];
      if (Array.isArray(list) && !list.includes(norm)) {
        list.splice(Math.min(token.orderInfo.index, list.length), 0, norm);
      }
    }
    saveUserDiff(diff);

    if (!bookmarks.some(b => normalizeUrl(b.url) === norm)) {
      const idx = token.removedIndex >= 0 ? Math.min(token.removedIndex, bookmarks.length) : bookmarks.length;
      bookmarks.splice(idx, 0, Object.assign({}, token.removed));
      save('bookmarks', bookmarks);
    }
  }

  // ── 分类管理：重命名 / 删除 ──
  // 重命名会同步：分类顺序与图标、折叠状态、书签缓存，以及 user_diff 中的
  // customSites / modifiedSites / siteOrder。对官方站点额外固化 modifiedSites.category，
  // 避免下次基线合并时被拉回旧分类名。
  function renameCategory(oldName, newName) {
    oldName = (oldName || '').trim();
    newName = (newName || '').trim();
    if (!oldName || !newName || oldName === newName) return false;
    const orderIdx = state.catOrder.indexOf(oldName);
    if (orderIdx === -1) return false;
    if (state.catOrder.includes(newName)) return false;

    state.catOrder.splice(orderIdx, 1, newName);
    if (state.catIcons[oldName] !== undefined) {
      state.catIcons[newName] = state.catIcons[oldName];
      delete state.catIcons[oldName];
    }
    state.collapsedCats = (state.collapsedCats || []).map(c => (c === oldName ? newName : c));
    save('catOrder', state.catOrder);
    save('catIcons', state.catIcons);
    save('collapsedCats', state.collapsedCats);

    const affected = bookmarks.filter(b => (b.category || '其他') === oldName);
    bookmarks.forEach(b => { if ((b.category || '其他') === oldName) b.category = newName; });
    save('bookmarks', bookmarks);

    const diff = getUserDiff();
    if (!diff.customSites) diff.customSites = [];
    if (!diff.modifiedSites) diff.modifiedSites = {};
    if (!diff.siteOrder) diff.siteOrder = {};
    let diffChanged = false;

    diff.customSites.forEach(b => {
      if ((b.category || '其他') === oldName) { b.category = newName; diffChanged = true; }
    });
    const customNorms = new Set(diff.customSites.map(b => normalizeUrl(b.url)));
    affected.forEach(bm => {
      const n = normalizeUrl(bm.url);
      if (customNorms.has(n)) return;
      const m = Object.assign({}, diff.modifiedSites[n], { category: newName });
      diff.modifiedSites[n] = m;
      diffChanged = true;
    });
    if (diff.siteOrder[oldName]) {
      diff.siteOrder[newName] = diff.siteOrder[oldName];
      delete diff.siteOrder[oldName];
      diffChanged = true;
    }
    if (diffChanged) saveUserDiff(diff);
    return true;
  }

  // 删除分类：其下站点移入「其他」（保持组内相对顺序），分类自身的顺序/图标/折叠记录一并清除。
  // 返回移入「其他」的站点数；被拒绝时返回 -1。
  function deleteCategory(name) {
    if (!name) return -1;
    const target = '其他';
    if (state.catOrder.length <= 1) {
      if (typeof showToast === 'function') showToast('至少需要保留一个分类');
      return -1;
    }
    const moved = bookmarks.filter(b => (b.category || '其他') === name);

    if (!state.catOrder.includes(target)) state.catOrder.push(target);
    if (!state.catIcons[target]) state.catIcons[target] = DEFAULT_CAT_ICONS[target] || 'folder';

    state.catOrder = state.catOrder.filter(c => c !== name);
    delete state.catIcons[name];
    state.collapsedCats = (state.collapsedCats || []).filter(c => c !== name);

    const diff = getUserDiff();
    if (!diff.customSites) diff.customSites = [];
    if (!diff.modifiedSites) diff.modifiedSites = {};
    if (!diff.siteOrder) diff.siteOrder = {};
    const targetOrder = Array.isArray(diff.siteOrder[target]) ? diff.siteOrder[target].slice() : [];
    const oldOrder = Array.isArray(diff.siteOrder[name]) ? diff.siteOrder[name] : [];

    moved.forEach(bm => {
      bm.category = target;
      const n = normalizeUrl(bm.url);
      const ci = diff.customSites.findIndex(b => normalizeUrl(b.url) === n);
      if (ci >= 0) {
        diff.customSites[ci].category = target;
      } else {
        diff.modifiedSites[n] = Object.assign({}, diff.modifiedSites[n], { category: target });
      }
      const oi = oldOrder.indexOf(n);
      if (oi >= 0 && !targetOrder.includes(n)) targetOrder.push(n);
    });
    delete diff.siteOrder[name];
    if (targetOrder.length > 0) diff.siteOrder[target] = targetOrder;
    saveUserDiff(diff);

    save('catOrder', state.catOrder);
    save('catIcons', state.catIcons);
    save('collapsedCats', state.collapsedCats);
    save('bookmarks', bookmarks);
    return moved.length;
  }

  // 从 siteOrder 的所有分类顺序表中移除指定站点（删除或搬走时调用）
  function pruneSiteOrder(diff, norm) {
    if (!diff.siteOrder || typeof diff.siteOrder !== 'object') return;
    Object.keys(diff.siteOrder).forEach(cat => {
      const list = diff.siteOrder[cat];
      if (Array.isArray(list)) {
        const next = list.filter(u => u !== norm);
        if (next.length !== list.length) diff.siteOrder[cat] = next;
        if (diff.siteOrder[cat].length === 0) delete diff.siteOrder[cat];
      }
    });
  }

  function updateBookmarkData(oldUrl, newName, newUrl, newCat) {
    const oldNorm = normalizeUrl(oldUrl);
    const newNorm = normalizeUrl(newUrl);
    let diff = getUserDiff();
    if (!diff.customSites) diff.customSites = [];
    if (!diff.deletedUrls) diff.deletedUrls = [];
    if (!diff.modifiedSites) diff.modifiedSites = {};

    const customIdx = diff.customSites.findIndex(b => normalizeUrl(b.url) === oldNorm);
    if (customIdx >= 0) {
      diff.customSites[customIdx] = { ...diff.customSites[customIdx], name: newName, url: newUrl, category: newCat };
    } else {
      if (oldNorm !== newNorm) {
        if (!diff.deletedUrls.includes(oldNorm)) diff.deletedUrls.push(oldNorm);
        diff.customSites.push({ name: newName, url: newUrl, category: newCat, icon: '', needs_proxy: false });
      } else {
        diff.modifiedSites[newNorm] = { name: newName, category: newCat };
      }
    }
    saveUserDiff(diff);

    const idx = bookmarks.findIndex(b => normalizeUrl(b.url) === oldNorm);
    if (idx >= 0) {
      bookmarks[idx].name = newName;
      bookmarks[idx].url = newUrl;
      bookmarks[idx].category = newCat;
    }
    save('bookmarks', bookmarks);
  }

  function addBookmarkData(name, url, cat) {
    const norm = normalizeUrl(url);
    let diff = getUserDiff();
    if (!diff.customSites) diff.customSites = [];
    if (!diff.deletedUrls) diff.deletedUrls = [];
    diff.deletedUrls = diff.deletedUrls.filter(u => u !== norm);
    const newBm = { name, url, category: cat, icon: '', needs_proxy: false };
    diff.customSites.push(newBm);
    saveUserDiff(diff);

    bookmarks.push(newBm);
    save('bookmarks', bookmarks);
  }

  // 拖拽布局提交：entries 为页面 DOM 顺序的 [{category, url}] 列表。
  // 把组内顺序与跨分类移动写入 user_diff，使其在刷新、官方基线更新后依然持久。
  function commitBookmarksLayout(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const diff = getUserDiff();
    if (!diff.customSites) diff.customSites = [];
    if (!diff.deletedUrls) diff.deletedUrls = [];
    if (!diff.modifiedSites) diff.modifiedSites = {};
    if (!diff.siteOrder) diff.siteOrder = {};

    const prevCatByUrl = new Map(bookmarks.map(b => [b.url, b.category]));

    // 1. 记录分类归属变更：自建站点直改 customSites；官方站点记 modifiedSites.category
    entries.forEach(en => {
      if (!en || !en.url) return;
      const prevCat = prevCatByUrl.get(en.url);
      if (prevCat === undefined || prevCat === en.category) return;
      const norm = normalizeUrl(en.url);
      const customIdx = diff.customSites.findIndex(b => normalizeUrl(b.url) === norm);
      if (customIdx >= 0) {
        diff.customSites[customIdx].category = en.category;
      } else {
        diff.modifiedSites[norm] = Object.assign({}, diff.modifiedSites[norm], { category: en.category });
      }
    });

    // 2. 用 DOM 顺序重建各分类的顺序表，替换旧表（DOM 是唯一事实来源）
    const newOrder = {};
    entries.forEach(en => {
      if (!en || !en.url) return;
      if (!newOrder[en.category]) newOrder[en.category] = [];
      newOrder[en.category].push(normalizeUrl(en.url));
    });
    diff.siteOrder = newOrder;
    saveUserDiff(diff);

    // 3. 按提交结果重建书签缓存（扁平数组顺序 = 分类 × 组内顺序）
    const byUrl = new Map(bookmarks.map(b => [b.url, b]));
    const inDom = new Set();
    const newBookmarks = [];
    entries.forEach(en => {
      const bm = byUrl.get(en.url);
      if (bm) {
        bm.category = en.category;
        newBookmarks.push(bm);
        inDom.add(en.url);
      }
    });
    // 兜底：不在 DOM 里的条目（搜索结果簇等异常场景）保留在尾部
    bookmarks.forEach(bm => { if (!inDom.has(bm.url)) newBookmarks.push(bm); });
    bookmarks = newBookmarks;
    save('bookmarks', bookmarks);
  }

  function resetBookmarksToOfficial() {
    if (confirm('确定要将书签重置为官方最新版本吗？\n您的界面外观与个性化设置将保留，所有本地增删的书签将恢复为官方推荐状态。')) {
      saveUserDiff({ deletedUrls: [], modifiedSites: {}, customSites: [], siteOrder: {} });
      save('bookmarks', window.__BOOKMARKS__ || []);
      save('last_revision', window.BOOKMARKS_REVISION || '1.0.0');
      bookmarks = [...(window.__BOOKMARKS__ || [])];
      state.catOrder = [...DEFAULT_CAT_ORDER];
      save('catOrder', state.catOrder);
      renderAll();
      showToast('已成功恢复为官方最新书签库！');
    }
  }

  // Ensure all categories in bookmarks exist in state.catOrder and state.catIcons
  const currentCategories = new Set(bookmarks.map(b => b.category).filter(Boolean));
  let orderChanged = false;
  let iconsChanged = false;

  currentCategories.forEach(cat => {
    if (!state.catOrder.includes(cat)) {
      state.catOrder.push(cat);
      orderChanged = true;
    }
    if (!state.catIcons[cat]) {
      state.catIcons[cat] = DEFAULT_CAT_ICONS[cat] || 'folder';
      iconsChanged = true;
    }
  });

  // 保留空的自定义分类：用户创建分类后还没添加图标时，也应在下次打开时存在。

  if (orderChanged) save('catOrder', state.catOrder);
  if (iconsChanged) save('catIcons', state.catIcons);



  // Expose to window
  window.DEFAULT_STATE = DEFAULT_STATE;
  window.STORAGE_PREFIX = STORAGE_PREFIX;
  window.load = load;
  window.save = save;
  window.exportConfiguration = exportConfiguration;
  window.importConfiguration = importConfiguration;
  window.buildConfigSnapshot = buildConfigSnapshot;
  window.applyConfigSnapshot = applyConfigSnapshot;
  window.getUserDiff = getUserDiff;
  window.saveUserDiff = saveUserDiff;
  window.initBookmarksData = initBookmarksData;
  window.deleteBookmarkByUrl = deleteBookmarkByUrl;
  window.undoDeleteBookmark = undoDeleteBookmark;
  window.renameCategory = renameCategory;
  window.deleteCategory = deleteCategory;
  window.updateBookmarkData = updateBookmarkData;
  window.addBookmarkData = addBookmarkData;
  window.commitBookmarksLayout = commitBookmarksLayout;
  window.resetBookmarksToOfficial = resetBookmarksToOfficial;
})();
