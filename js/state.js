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
      return true;
    } catch (error) {
      // 自定义壁纸可能超过浏览器的 localStorage 容量，保留当前页面状态但提示用户。
      console.warn('无法保存本地导航配置：', error);
      showToast('配置未能写入浏览器存储，请减少自定义壁纸大小后重试');
      return false;
    }
  }

  function exportConfiguration() {
    const storage = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) storage[key] = localStorage.getItem(key);
    }
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), storage }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'my-navigation-config.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('配置已导出');
  }

  function importConfiguration(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const payload = JSON.parse(event.target.result);
        if (!payload || payload.version !== 1 || !payload.storage || typeof payload.storage !== 'object') throw new Error('invalid');
        Object.entries(payload.storage).forEach(([key, value]) => {
          if (key.startsWith(STORAGE_PREFIX) && typeof value === 'string') localStorage.setItem(key, value);
        });
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
  state.engine = load('engine', 'google');
  if (!engines[state.engine]) state.engine = 'google';
  state.blur   = load('blur', DEFAULT_STATE.blur);
  state.bg     = load('bg', DEFAULT_STATE.bg);
  state.bgOpacity = Number(load('bgOpacity', DEFAULT_STATE.bgOpacity));
  state.overlayOpacity = Number(load('overlayOpacity', state.theme === 'dark' ? 0.40 : DEFAULT_STATE.overlayOpacity));
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
  //    - 上次已合并的服务器版本号 (nav2-last_revision)
  //    - 当前书签缓存视图 (nav2-bookmarks)，保证无网/秒级离线渲染
  const normalizeUrl = u => (u || '').replace(/\/+$/, '').trim().toLowerCase();

  function getUserDiff() {
    return load('user_diff', {
      deletedUrls: [],
      modifiedSites: {},
      customSites: []
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

    // 兼容历史老版本数据：平滑迁移至 user_diff 差分模型
    if (savedBookmarks && (!diff.deletedUrls || diff.deletedUrls.length === 0) && (!diff.customSites || diff.customSites.length === 0)) {
      const serverBaseline = window.__BOOKMARKS__ || [];
      const serverMap = new Map();
      serverBaseline.forEach(b => serverMap.set(normalizeUrl(b.url), b));

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
    diff.customSites = (diff.customSites || []).filter(b => normalizeUrl(b.url) !== norm);
    if (diff.modifiedSites && diff.modifiedSites[norm]) {
      delete diff.modifiedSites[norm];
    }
    saveUserDiff(diff);

    bookmarks = bookmarks.filter(b => normalizeUrl(b.url) !== norm);
    save('bookmarks', bookmarks);
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

  function resetBookmarksToOfficial() {
    if (confirm('确定要将书签重置为官方最新版本吗？\n您的界面外观与个性化设置将保留，所有本地增删的书签将恢复为官方推荐状态。')) {
      saveUserDiff({ deletedUrls: [], modifiedSites: {}, customSites: [] });
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
  window.getUserDiff = getUserDiff;
  window.saveUserDiff = saveUserDiff;
  window.initBookmarksData = initBookmarksData;
  window.deleteBookmarkByUrl = deleteBookmarkByUrl;
  window.updateBookmarkData = updateBookmarkData;
  window.addBookmarkData = addBookmarkData;
  window.resetBookmarksToOfficial = resetBookmarksToOfficial;
})();
