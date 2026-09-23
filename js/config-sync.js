// ── 本地个人配置文件直连（File System Access API）──
// 将统一快照（buildConfigSnapshot）读写到磁盘上的同一个 JSON 文件，
// 多个浏览器各自"关联"该文件即共享同一套个人配置：
//   · 每次配置变更 → 防抖写回文件
//   · 启动 / 窗口重新获得焦点 → 重读文件，按 updated_at 最后写入者胜
//   · 文件较新（其他浏览器改过）→ 应用到本地并刷新页面
// 不支持该 API 的浏览器（Firefox / Safari）自动降级为仅 localStorage + 手动导入导出。
(function() {
  "use strict";

  const SUPPORTED = typeof window.showOpenFilePicker === 'function';
  const DB_NAME = 'NavConfigSyncDB';
  const STORE = 'handles';
  const BACKUP_STORE = 'backups';
  const MAX_BACKUPS = 3;
  const HANDLE_KEY = 'config-file';
  const WRITE_DEBOUNCE_MS = 1000;   // 配置变更后防抖写盘间隔
  const REREAD_MIN_INTERVAL_MS = 3000; // 焦点重读文件的最小间隔，避免频繁磁盘 IO
  const NOTICE_KEY = 'nav2_sync_notice';

  let handle = null;          // FileSystemFileHandle | null
  let lastSyncAt = 0;         // 最近一次成功写盘/读盘时间
  let lastFileContent = '';   // 最近已知文件内容，内容不变则不做任何处理
  let writing = false;
  let dirtyTimer = null;
  let lastCheckAt = 0;
  let suppressed = false;     // 应用文件配置等待 reload 期间暂停一切同步动作
  let pendingAuth = false;    // 句柄存在但权限待授予（等待用户任意点击补授权）

  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  // ── IndexedDB：跨会话保存文件句柄 ──
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        if (!req.result.objectStoreNames.contains(BACKUP_STORE)) req.result.createObjectStore(BACKUP_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function loadStoredHandle() {
    try {
      const db = await openDB();
      return await new Promise((resolve) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  }
  async function storeHandle(h) {
    try {
      const db = await openDB();
      await new Promise((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(h, HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch { /* 存储失败仅影响下次启动需重新关联 */ }
  }
  async function clearStoredHandle() {
    try {
      const db = await openDB();
      await new Promise((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch { /* 忽略 */ }
  }

  // ── 权限 ──
  // requestPermission 必须在用户手势内调用；非手势场景只查询、不请求。
  async function queryGranted() {
    if (!handle || !handle.queryPermission) return false;
    try { return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'; }
    catch { return false; }
  }
  async function ensurePermission() {
    if (!handle) return false;
    if (await queryGranted()) return true;
    try { return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'; }
    catch { return false; }
  }

  // ── 读写文件 ──
  async function readFileText() {
    try {
      const file = await handle.getFile();
      return (await file.text()).trim();
    } catch { return null; }
  }

  async function writeSnapshotToFile() {
    if (!handle || writing) return false;
    writing = true;
    try {
      if (!(await queryGranted())) { pendingAuth = true; updateStatus(); return false; }
      const text = JSON.stringify(window.buildConfigSnapshot(), null, 2);
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      lastFileContent = text;
      lastSyncAt = Date.now();
      updateStatus();
      return true;
    } catch (error) {
      console.warn('配置文件写入失败：', error);
      toast('配置文件写入失败，本次修改仍保存在浏览器内');
      return false;
    } finally {
      writing = false;
    }
  }

  // ── 双向仲裁：文件较新则应用并刷新，本地较新则写出到文件 ──
  async function pullOrPush() {
    if (!handle || suppressed) return;
    if (!(await queryGranted())) { pendingAuth = true; updateStatus(); return; }

    const text = await readFileText();
    if (text === null) { updateStatus('无法读取配置文件'); return; }
    if (text === '') {
      // 刚创建的空文件：用当前本地配置做首次种子化
      await writeSnapshotToFile();
      toast('已用当前配置初始化配置文件');
      return;
    }
    if (text === lastFileContent) return;

    let payload = null;
    try { payload = JSON.parse(text); } catch { updateStatus('配置文件不是有效的 JSON'); return; }
    if (!payload || !payload.storage || typeof payload.storage !== 'object') {
      updateStatus('配置文件格式不受支持');
      return;
    }

    const fileUpdated = Number(payload.updatedAt || 0);
    const localUpdated = Number(localStorage.getItem('nav2-updated_at') || 0);
    if (fileUpdated > localUpdated) {
      // 其他浏览器改过配置 → 先自动备份本地现状（整快照覆盖前留后路），再应用并刷新
      await backupLocalConfig();
      lastFileContent = text;
      try {
        window.applyConfigSnapshot(payload);
      } catch (error) {
        console.warn('配置文件应用失败：', error);
        updateStatus('配置文件应用失败');
        return;
      }
      suppressed = true;
      try { sessionStorage.setItem(NOTICE_KEY, '1'); } catch { /* 忽略 */ }
      setTimeout(() => location.reload(), 80);
    } else {
      // 本地较新（或相同）→ 把最新个人配置写出到文件
      await writeSnapshotToFile();
    }
  }

  // ── 自动备份：把当前本地配置快照存入 IndexedDB（保留最近 MAX_BACKUPS 份）──
  async function backupLocalConfig() {
    try {
      if (typeof window.buildConfigSnapshot !== 'function') return false;
      const db = await openDB();
      if (!db) return false;
      const payload = window.buildConfigSnapshot();
      const now = Date.now();
      await new Promise(resolve => {
        const tx = db.transaction(BACKUP_STORE, 'readwrite');
        // backups 为 out-of-line store，必须显式提供 key
        tx.objectStore(BACKUP_STORE).put({ id: 'bk-' + now, time: now, payload }, 'bk-' + now);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      // 裁剪：仅保留最近 MAX_BACKUPS 份
      await new Promise(resolve => {
        const tx = db.transaction(BACKUP_STORE, 'readwrite');
        const req = tx.objectStore(BACKUP_STORE).getAll();
        req.onsuccess = () => {
          const items = (req.result || []).sort((a, b) => (b.time || 0) - (a.time || 0));
          items.slice(MAX_BACKUPS).forEach(item => {
            if (item && item.id) tx.objectStore(BACKUP_STORE).delete(item.id);
          });
          resolve();
        };
        req.onerror = () => resolve();
      });
      return true;
    } catch (error) {
      console.warn('配置备份失败：', error);
      return false;
    }
  }

  async function getBackupInfo() {
    try {
      const db = await openDB();
      if (!db) return null;
      return await new Promise(resolve => {
        const tx = db.transaction(BACKUP_STORE, 'readonly');
        const req = tx.objectStore(BACKUP_STORE).getAll();
        req.onsuccess = () => {
          const items = (req.result || []).sort((a, b) => (b.time || 0) - (a.time || 0));
          resolve(items.length > 0 ? { time: items[0].time, count: items.length } : null);
        };
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  }

  async function restoreLatestBackup() {
    try {
      const db = await openDB();
      if (!db) return false;
      const latest = await new Promise(resolve => {
        const tx = db.transaction(BACKUP_STORE, 'readonly');
        const req = tx.objectStore(BACKUP_STORE).getAll();
        req.onsuccess = () => {
          const items = (req.result || []).sort((a, b) => (b.time || 0) - (a.time || 0));
          resolve(items[0] || null);
        };
        req.onerror = () => resolve(null);
      });
      if (!latest || !latest.payload) return false;
      window.applyConfigSnapshot(latest.payload, { asLocalEdit: true });
      setTimeout(() => location.reload(), 100);
      return true;
    } catch (error) {
      console.warn('恢复备份失败：', error);
      return false;
    }
  }

  // ── state.js save() 的脏标记钩子 ──
  window.__onConfigDirty = function() {
    if (!handle || !SUPPORTED || suppressed) return;
    if (dirtyTimer) clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => { dirtyTimer = null; writeSnapshotToFile(); }, WRITE_DEBOUNCE_MS);
  };

  // 页面关闭前尽力把未落盘的变更冲刷到文件
  window.addEventListener('beforeunload', () => {
    if (dirtyTimer && handle && !suppressed) {
      clearTimeout(dirtyTimer);
      dirtyTimer = null;
      writeSnapshotToFile();
    }
  });

  // ── 焦点重读：切换浏览器 / 标签页回来时检测文件是否被其他浏览器更新 ──
  async function onFocusCheck() {
    if (!handle || suppressed) return;
    const now = Date.now();
    if (now - lastCheckAt < REREAD_MIN_INTERVAL_MS) return;
    lastCheckAt = now;
    if (!(await queryGranted())) { pendingAuth = true; updateStatus(); return; }
    const text = await readFileText();
    if (text === null || text === lastFileContent) return;
    pullOrPush();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onFocusCheck();
  });
  window.addEventListener('focus', onFocusCheck);

  // ── 启动时补授权：权限状态为 prompt 时，借用户第一次任意点击请求授权 ──
  function armAuthOnClick() {
    const handler = async () => {
      document.removeEventListener('click', handler, true);
      if (!handle) return;
      const granted = await ensurePermission();
      pendingAuth = !granted;
      if (granted) await pullOrPush();
      updateStatus();
    };
    document.addEventListener('click', handler, true);
  }

  // ── 对外 API ──
  async function init() {
    if (!SUPPORTED) { updateStatus(); return; }
    handle = await loadStoredHandle();
    if (!handle) { updateStatus(); return; }
    if (!(await queryGranted())) {
      pendingAuth = true;
      armAuthOnClick();
      updateStatus();
      return;
    }
    await pullOrPush();
    updateStatus();
  }

  async function linkConfigFile(mode) {
    if (!SUPPORTED) { toast('当前浏览器不支持本地文件直连，请使用导出/导入配置'); return; }
    const types = [{ description: '个人导航配置', accept: { 'application/json': ['.json'] } }];
    try {
      let h;
      if (mode === 'create') {
        h = await window.showSaveFilePicker({ suggestedName: 'nav-config.json', types });
      } else {
        [h] = await window.showOpenFilePicker({ types, multiple: false });
      }
      handle = h;
      lastFileContent = '';
      pendingAuth = false;
      await storeHandle(h);
      if (!(await ensurePermission())) {
        pendingAuth = true;
        toast('未获得文件读写权限，配置文件暂未生效');
      } else {
        await pullOrPush();
      }
      updateStatus();
    } catch (error) {
      if (error && error.name === 'AbortError') return; // 用户取消选择
      console.warn('关联配置文件失败：', error);
      toast('关联配置文件失败');
    }
  }

  async function unlinkConfigFile() {
    handle = null;
    pendingAuth = false;
    lastFileContent = '';
    if (dirtyTimer) { clearTimeout(dirtyTimer); dirtyTimer = null; }
    await clearStoredHandle();
    updateStatus();
    toast('已取消关联，配置仍保存在浏览器本地');
  }

  async function syncNow() {
    if (!handle) { toast('尚未关联配置文件'); return; }
    const granted = await ensurePermission(); // 按钮点击是用户手势，可直接请求授权
    pendingAuth = !granted;
    if (!granted) { updateStatus(); toast('未获得文件读写权限'); return; }
    await pullOrPush();
    updateStatus();
    if (!suppressed) toast('配置文件已是最新');
  }

  function getStatus() {
    const insecureContext = (typeof window.isSecureContext !== 'undefined') && !window.isSecureContext;
    return {
      supported: SUPPORTED,
      // 不支持的原因：insecure = 站点经 HTTP 访问，浏览器禁用本地文件 API（需 HTTPS 或 localhost）；
      // unsupported = 浏览器本身未实现该 API（如 Firefox / Safari）
      reason: SUPPORTED ? '' : (insecureContext ? 'insecure' : 'unsupported'),
      linked: !!handle,
      fileName: handle ? handle.name : '',
      lastSyncAt,
      pendingAuth
    };
  }

  // 应用来自文件的配置并刷新后，由 app.js 启动时消费一次性提示
  function consumeSyncNotice() {
    try {
      if (sessionStorage.getItem(NOTICE_KEY) === '1') {
        sessionStorage.removeItem(NOTICE_KEY);
        return true;
      }
    } catch { /* 忽略 */ }
    return false;
  }

  function updateStatus(message) {
    document.dispatchEvent(new CustomEvent('configsyncstatus', { detail: Object.assign(getStatus(), { message: message || '' }) }));
  }

  window.ConfigFileSync = {
    supported: SUPPORTED,
    init,
    link: linkConfigFile,
    unlink: unlinkConfigFile,
    syncNow,
    getStatus,
    consumeSyncNotice,
    backupLocalConfig,
    getBackupInfo,
    restoreLatestBackup
  };
})();
