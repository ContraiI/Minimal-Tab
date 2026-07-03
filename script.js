// Edge有时忽略autocomplete=off属性，延迟二次赋值确保生效
window.addEventListener('load', () => {
  const input = document.getElementById('search-input');
  input.setAttribute('autocomplete', 'off');
  setTimeout(() => input.setAttribute('autocomplete', 'off'), 100);
});

// 数码管字体数字时钟，每秒更新
function updateDigitalClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('digital-clock').textContent = `${h}:${m}:${s}`;
}

function hideDigitalClock() {
  const clock = document.getElementById('digital-clock');
  if (clock) { clock.style.opacity = '0'; clock.style.visibility = 'hidden'; }
}

function showDigitalClock() {
  if (!isClockVisible()) return;
  const clock = document.getElementById('digital-clock');
  if (clock) { clock.style.opacity = '1'; clock.style.visibility = 'visible'; }
}

updateDigitalClock();
setInterval(updateDigitalClock, 1000);

// 页面顶部居中Toast提示，自动计时消失，重复调用会重置计时
let toastTimer = null;
function showToast(message, duration = 2000, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = 'toast';
  if (type) toast.classList.add(type);
  toast.classList.add('show');
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toastTimer = null;
  }, duration);
}

// 搜索引擎搜索URL配置
const engines = {
  bing:  { url: 'https://cn.bing.com/search?q=' },
  google: { url: 'https://www.google.com/search?q=' },
  github: { url: 'https://github.com/search?q=' },
  baidu:  { url: 'https://www.baidu.com/s?wd=' }
};

let currentEngine = 'bing';
let currentEngineIcons = { white: './icons/bing-white.svg', default: './icons/bing-default.svg' };

// localStorage键名常量
const LS_DEFAULT_ENGINE = 'preferredDefaultEngine';
const LS_DISABLED = 'disabledEngines';
const LS_SEARCH_HISTORY = 'searchHistory';
const LS_SEARCH_HISTORY_ENABLED = 'searchHistoryEnabled';
const LS_CLOCK_VISIBLE = 'clockVisible';
const LS_CUSTOM_ENGINES = 'customEngines';
const MAX_WALLPAPER_HISTORY = 12;
const MAX_HISTORY_ITEMS = 20;

// 保存搜索关键词到历史，去重后置于开头，超出上限截断
function saveSearchHistory(keyword) {
  if (!isSearchHistoryEnabled() || !keyword.trim()) return;
  let history = getSearchHistory().filter(item => item !== keyword);
  history.unshift(keyword);
  if (history.length > MAX_HISTORY_ITEMS) history = history.slice(0, MAX_HISTORY_ITEMS);
  localStorage.setItem(LS_SEARCH_HISTORY, JSON.stringify(history));
}

function getSearchHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(LS_SEARCH_HISTORY) || '[]');
    return Array.isArray(h) ? h : [];
  } catch (e) { return []; }
}

function isSearchHistoryEnabled() {
  return localStorage.getItem(LS_SEARCH_HISTORY_ENABLED) !== 'false';
}

function setSearchHistoryEnabled(enabled) {
  localStorage.setItem(LS_SEARCH_HISTORY_ENABLED, enabled.toString());
}

function isClockVisible() {
  return localStorage.getItem(LS_CLOCK_VISIBLE) !== 'false';
}

function setClockVisible(visible) {
  localStorage.setItem(LS_CLOCK_VISIBLE, visible.toString());
}

function nameToSlug(name) {
  if (/[一-鿿]/.test(name)) {
    let slug = '';
    for (const ch of name) {
      const code = ch.charCodeAt(0);
      if (code >= 0x4E00 && code <= 0x9FFF) {
        slug += (PINYIN_MAP[code - 0x4E00] || '').toLowerCase();
      } else {
        slug += ch.toLowerCase();
      }
    }
    return slug;
  }
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function getCustomEngines() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_CUSTOM_ENGINES) || '[]');
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}

function saveCustomEngines(list) {
  localStorage.setItem(LS_CUSTOM_ENGINES, JSON.stringify(list));
}

function injectCustomEngines() {
  const column = document.querySelector('.engine-column');
  if (!column) return;
  column.querySelectorAll('.engine-item.custom').forEach(el => el.remove());
  Object.keys(engines).forEach(key => {
    if (key.startsWith('custom_')) delete engines[key];
  });
  const customEngines = getCustomEngines();
  customEngines.forEach((ce, i) => {
    engines[ce.id] = { url: ce.url };
    const item = document.createElement('div');
    item.className = 'engine-item custom';
    item.setAttribute('data-engine', ce.id);
    item.setAttribute('data-white', ce.iconWhite);
    item.setAttribute('data-default', ce.iconDefault);
    item.setAttribute('data-index', 100 + i);
    const icon = document.createElement('img');
    icon.className = 'engine-icon sm';
    icon.src = ce.iconWhite;
    const span = document.createElement('span');
    span.textContent = ce.name;
    item.appendChild(icon);
    item.appendChild(span);
    column.appendChild(item);
  });
}

function removeHistoryItem(keyword) {
  const history = getSearchHistory().filter(item => item !== keyword);
  localStorage.setItem(LS_SEARCH_HISTORY, JSON.stringify(history));
}

function clearSearchHistory() {
  localStorage.setItem(LS_SEARCH_HISTORY, JSON.stringify([]));
  renderHistoryList();
}

// 历史下拉框与搜索框底部圆角联动（展开时去掉下方圆角）
function showHistoryDropdown() {
  const dd = document.getElementById('history-dropdown');
  if (dd) { dd.classList.add('show'); searchInput.classList.add('expanded'); }
}

function hideHistoryDropdown() {
  const dd = document.getElementById('history-dropdown');
  if (dd) { dd.classList.remove('show'); searchInput.classList.remove('expanded'); }
}

// 渲染历史记录列表，filter为空显示全部，支持拼音匹配
function renderHistoryList(filter = '') {
  if (!isSearchHistoryEnabled()) { hideHistoryDropdown(); return; }
  const list = document.getElementById('history-list');
  const dd = document.getElementById('history-dropdown');
  if (!list || !dd) return;

  const history = getSearchHistory();
  let filtered = filter
    ? history.filter(item => matchPinyin(item, filter))
    : history;
  if (filter && filtered.length === 0) filtered = history; // 无匹配时显示全部

  list.innerHTML = '';

  if (filtered.length === 0) { hideHistoryDropdown(); return; }

  filtered.forEach(item => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const icon = document.createElement('img');
    icon.className = 'history-icon';
    icon.src = './icons/history-black.svg';
    icon.alt = '';
    row.appendChild(icon);

    const text = document.createElement('span');
    text.className = 'history-text';
    text.textContent = item;
    row.appendChild(text);

    const del = document.createElement('div');
    del.className = 'history-delete';
    del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeHistoryItem(item);
      renderHistoryList(filter);
    });
    row.appendChild(del);

    row.addEventListener('click', () => {
      searchInput.value = item;
      hideHistoryDropdown();
      search();
    });
    list.appendChild(row);
  });

  showHistoryDropdown();
}

// 引擎图标双元素引用（白色/彩色叠加，通过opacity过渡切换）
const engineIconWhite = document.getElementById('currentEngineIconWhite');
const engineIconDefault = document.getElementById('currentEngineIconDefault');
const engineIconWrap = document.querySelector('.engine-icon-wrap');
const engineListEl = document.getElementById('engineList');
const searchInput = document.getElementById('search-input');

// 从localStorage恢复默认引擎，若未设置则取HTML中.active元素
function initEngineFromDOM() {
  const saved = localStorage.getItem(LS_DEFAULT_ENGINE);
  if (saved) {
    const el = engineListEl.querySelector(`.engine-item[data-engine="${saved}"]`);
    if (el) {
      engineListEl.querySelectorAll('.engine-item').forEach(i => i.classList.remove('active'));
      el.classList.add('active');
      currentEngine = saved;
      currentEngineIcons = { white: el.dataset.white, default: el.dataset.default };
      return;
    }
  }
  const active = engineListEl.querySelector('.engine-item.active');
  if (active) {
    currentEngine = active.dataset.engine;
    currentEngineIcons = { white: active.dataset.white, default: active.dataset.default };
  }
}
initEngineFromDOM();

if (engineIconWhite && engineIconDefault) {
  engineIconWhite.src = currentEngineIcons.white;
  engineIconDefault.src = currentEngineIcons.default;
}

// 同步所有引擎图标：搜索框大图标 + 下拉菜单小图标 + 聚焦/失焦状态
function updateEngineIcon() {
  if (!engineIconWrap || !searchInput) return;
  if (engineIconWhite && engineIconWhite.src !== currentEngineIcons.white) {
    engineIconWhite.src = currentEngineIcons.white;
  }
  if (engineIconDefault && engineIconDefault.src !== currentEngineIcons.default) {
    engineIconDefault.src = currentEngineIcons.default;
  }
  const focused = document.activeElement === searchInput || searchInput.matches(':focus');
  engineIconWrap.classList.toggle('focused', focused);
  engineListEl.querySelectorAll('.engine-item').forEach(item => {
    const icon = item.querySelector('.engine-icon');
    if (!icon) return;
    const target = item.dataset.engine === currentEngine && focused ? item.dataset.default : item.dataset.white;
    if (icon.src !== target) icon.src = target;
  });
}

const clearBtn = document.getElementById('clear-btn');
const searchBtn = document.getElementById('search-btn');

// 根据输入框是否有内容显示/隐藏清除和搜索按钮
function toggleBtns() {
  const has = searchInput.value.trim() !== '';
  clearBtn.style.display = has ? 'flex' : 'none';
  searchBtn.style.display = has ? 'flex' : 'none';
  updateEngineIcon();
}

// 用当前引擎搜索，保存历史，新标签页打开
function search() {
  const kw = searchInput.value.trim();
  if (!kw) return;
  saveSearchHistory(kw);
  window.open(engines[currentEngine].url + encodeURIComponent(kw), '_blank');
  searchInput.value = '';
  toggleBtns();
}

// 搜索框输入 → 实时过滤历史记录
searchInput.addEventListener('input', () => {
  toggleBtns();
  updateEngineIcon();
  if (!isSearchHistoryEnabled()) { hideHistoryDropdown(); return; }
  const history = getSearchHistory();
  if (history.length === 0) { hideHistoryDropdown(); return; }
  const value = searchInput.value.trim();
  renderHistoryList(value);
  showHistoryDropdown();
});
// 浏览器自动填充兼容
searchInput.addEventListener('change', () => setTimeout(toggleBtns, 100));
searchInput.addEventListener('webkitFillAvailable', toggleBtns);
searchInput.addEventListener('autocomplete', toggleBtns);

// 聚焦时显示历史下拉并隐藏时钟，失焦时恢复
searchInput.addEventListener('focus', () => {
  updateEngineIcon();
  if (isSearchHistoryEnabled() && getSearchHistory().length > 0) renderHistoryList();
  hideDigitalClock();
});
searchInput.addEventListener('blur', () => {
  updateEngineIcon();
  setTimeout(hideHistoryDropdown, 150); // 延迟确保历史项点击事件能触发
  showDigitalClock();
});
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  toggleBtns();
  updateEngineIcon();
  searchInput.focus();
});

searchBtn.addEventListener('click', search);

toggleBtns();
updateEngineIcon();
// load后再次同步图标，确保Edge兼容
window.addEventListener('load', () => setTimeout(updateEngineIcon, 200));

// 搜索引擎下拉选择器交互
const engineSelectorEl = document.querySelector('.engine-selector');
let preventReopenUntil = 0; // 选择后300ms内阻止再次打开

if (engineSelectorEl && engineListEl) {
  // 点击图标切换下拉
  engineSelectorEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (Date.now() < preventReopenUntil) return;
    engineSelectorEl.classList.toggle('open');
  });
  // 点击引擎项 → 切换引擎并关闭下拉
  engineListEl.addEventListener('click', (e) => {
    const item = e.target.closest('.engine-item');
    if (!item) return;
    e.stopPropagation();
    engineListEl.querySelectorAll('.engine-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentEngine = item.dataset.engine;
    currentEngineIcons = { white: item.dataset.white, default: item.dataset.default };
    updateEngineIcon();
    engineSelectorEl.classList.remove('open');
    preventReopenUntil = Date.now() + 300;
    searchInput.focus();
  });
  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
    if (!engineSelectorEl.contains(e.target)) engineSelectorEl.classList.remove('open');
  });
  // Esc关闭下拉
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') engineSelectorEl.classList.remove('open');
  });
}

// 设置面板（导入壁纸 / 搜索引擎管理 / 搜索历史开关）
(function(){
  const settingsBtn = document.getElementById('settingsBtn');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const engineManager = document.getElementById('sidebarEngineList');
  const historyToggle = document.getElementById('sidebarHistoryToggle');
  const LS_BG = 'customBg';
  const bgLayerA = document.getElementById('bgLayerA');
  const bgLayerB = document.getElementById('bgLayerB');
  let bgActive = 'a';

  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('show');
    settingsBtn.style.opacity = '1';
    populateEngineManager();
    populateDefaultEngineManager();
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('show');
    settingsBtn.style.opacity = '';
  }

  function setBgDirect(url) {
    bgLayerA.style.backgroundImage = url ? `url(${url})` : '';
    bgLayerA.style.opacity = '1';
    bgLayerB.style.opacity = '0';
    bgActive = 'a';
  }

  // 恢复已保存的自定义壁纸（Data URL存储）
  const savedBg = localStorage.getItem(LS_BG);
  if (savedBg) {
    setBgDirect(savedBg);
  }

  function applyWallpaper(dataUrl) {
    const incoming = bgActive === 'a' ? bgLayerB : bgLayerA;
    const outgoing = bgActive === 'a' ? bgLayerA : bgLayerB;
    incoming.style.backgroundImage = `url(${dataUrl})`;
    requestAnimationFrame(() => {
      incoming.style.opacity = '1';
      outgoing.style.opacity = '0';
    });
    bgActive = bgActive === 'a' ? 'b' : 'a';
    localStorage.setItem(LS_BG, dataUrl);
    updateWallpaperThumb();
  }

  function resetWallpaper() {
    const incoming = bgActive === 'a' ? bgLayerB : bgLayerA;
    const outgoing = bgActive === 'a' ? bgLayerA : bgLayerB;
    incoming.style.backgroundImage = '';
    requestAnimationFrame(() => {
      incoming.style.opacity = '1';
      outgoing.style.opacity = '0';
    });
    bgActive = bgActive === 'a' ? 'b' : 'a';
    localStorage.removeItem(LS_BG);
    updateWallpaperThumb();
  }

  if (historyToggle) {
    historyToggle.checked = isSearchHistoryEnabled();
    historyToggle.addEventListener('change', () => {
      setSearchHistoryEnabled(historyToggle.checked);
      if (!historyToggle.checked) hideHistoryDropdown();
    });
  }

  const clockToggle = document.getElementById('sidebarClockToggle');
  const clockFollowRow = document.getElementById('clockFollowRow');
  const clockFollowToggle = document.getElementById('clockFollowToggle');
  const clockPositionRow = document.getElementById('clockPositionRow');
  const clockPositionSeg = document.getElementById('clockPositionSeg');
  const clockCustomRow = document.getElementById('clockCustomRow');
  const clockCustomSeg = document.getElementById('clockCustomSeg');
  const clockEl = document.getElementById('digital-clock');
  const LS_CLOCK_POS = 'clockPosition';
  const LS_CLOCK_FOLLOW = 'clockFollow';
  const LS_CLOCK_CUSTOM_POS = 'clockCustomPos';

  function applyClockPosition(pos) {
    if (clockEl) clockEl.style.order = pos === 'above' ? '-1' : '0';
    if (clockPositionSeg) {
      clockPositionSeg.querySelectorAll('.theme-mode-opt').forEach(b => b.classList.toggle('active', b.dataset.pos === pos));
    }
    localStorage.setItem(LS_CLOCK_POS, pos);
  }

  function updateClockCascade() {
    const clockOn = isClockVisible();
    if (clockFollowRow) clockFollowRow.classList.toggle('hidden', !clockOn);
    if (!clockOn) {
      if (clockPositionRow) clockPositionRow.classList.add('hidden');
      if (clockCustomRow) clockCustomRow.classList.add('hidden');
    } else {
      const followOn = clockFollowToggle ? clockFollowToggle.checked : true;
      if (clockPositionRow) clockPositionRow.classList.toggle('hidden', !followOn);
      if (clockCustomRow) clockCustomRow.classList.toggle('hidden', followOn);
    }
  }

  if (clockToggle) {
    clockToggle.checked = isClockVisible();
    if (!isClockVisible()) hideDigitalClock();
    updateClockCascade();
    clockToggle.addEventListener('change', () => {
      setClockVisible(clockToggle.checked);
      if (clockToggle.checked) showDigitalClock();
      else hideDigitalClock();
      updateClockCascade();
    });
  }

  if (clockPositionSeg) {
    const savedPos = localStorage.getItem(LS_CLOCK_POS) || 'below';
    applyClockPosition(savedPos);
    clockPositionSeg.querySelectorAll('.theme-mode-opt').forEach(b => {
      b.addEventListener('click', () => applyClockPosition(b.dataset.pos));
    });
  }

  // 时钟自定义位置选择器（跟随关闭时使用）
  const posMap = {
    'left-top':     { top: '40px', left: '40px', right: '', bottom: '' },
    'right-top':    { top: '40px', left: '', right: '40px', bottom: '' },
    'center':       { top: '', left: '', right: '', bottom: '' },
    'left-bottom':  { top: '', left: '40px', right: '', bottom: '40px' },
    'right-bottom': { top: '', left: '', right: '40px', bottom: '40px' }
  };
  function applyClockCustomPos(pos) {
    if (!clockEl || !posMap[pos]) return;
    const p = posMap[pos];
    if (pos === 'center') {
      clockEl.style.position = '';
      clockEl.style.top = ''; clockEl.style.left = '';
      clockEl.style.right = ''; clockEl.style.bottom = '';
    } else {
      clockEl.style.position = 'fixed';
      clockEl.style.top = p.top; clockEl.style.left = p.left;
      clockEl.style.right = p.right; clockEl.style.bottom = p.bottom;
    }
    if (clockCustomSeg) {
      clockCustomSeg.querySelectorAll('.theme-mode-opt').forEach(b => b.classList.toggle('active', b.dataset.pos === pos));
    }
    localStorage.setItem(LS_CLOCK_CUSTOM_POS, pos);
  }
  if (clockCustomSeg) {
    const saved = localStorage.getItem(LS_CLOCK_CUSTOM_POS) || 'center';
    applyClockCustomPos(saved);
    clockCustomSeg.querySelectorAll('.theme-mode-opt').forEach(b => {
      b.addEventListener('click', () => applyClockCustomPos(b.dataset.pos));
    });
  }

  // 时钟跟随搜索框开关
  function applyClockFollow(enabled) {
    if (clockEl) {
      if (enabled) {
        clockEl.style.transform = 'translate(var(--search-offset-x, 0px), var(--search-offset-y, 0px))';
        clockEl.style.position = '';
        clockEl.style.top = ''; clockEl.style.left = '';
        clockEl.style.right = ''; clockEl.style.bottom = '';
        applyClockPosition(localStorage.getItem(LS_CLOCK_POS) || 'below');
      } else {
        clockEl.style.transform = '';
        applyClockCustomPos(localStorage.getItem(LS_CLOCK_CUSTOM_POS) || 'center');
      }
    }
  }
  if (clockFollowToggle) {
    const savedFollow = localStorage.getItem(LS_CLOCK_FOLLOW) !== 'false';
    clockFollowToggle.checked = savedFollow;
    applyClockFollow(savedFollow);
    updateClockCascade();
    clockFollowToggle.addEventListener('change', () => {
      const on = clockFollowToggle.checked;
      localStorage.setItem(LS_CLOCK_FOLLOW, on ? 'true' : 'false');
      applyClockFollow(on);
      updateClockCascade();
    });
  }

  // 外观模式选择器（三段：系统 / 浅色 / 深色）
  const themeModeSeg = document.getElementById('themeModeSeg');
  const LS_THEME_MODE = 'themeMode';
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(isDark) {
    sidebar.classList.toggle('light', !isDark);
    document.body.classList.toggle('light-mode', !isDark);
  }

  function getSystemDark() { return darkModeQuery.matches; }

  function setThemeMode(mode) {
    themeModeSeg.querySelectorAll('.theme-mode-opt').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    localStorage.setItem(LS_THEME_MODE, mode);
    if (mode === 'system') {
      applyTheme(getSystemDark());
    } else {
      applyTheme(mode === 'dark');
    }
  }

  if (themeModeSeg) {
    const savedMode = localStorage.getItem(LS_THEME_MODE) || 'system';
    setThemeMode(savedMode);

    darkModeQuery.addEventListener('change', () => {
      if (localStorage.getItem(LS_THEME_MODE) === 'system') {
        applyTheme(getSystemDark());
      }
    });

    themeModeSeg.querySelectorAll('.theme-mode-opt').forEach(btn => {
      btn.addEventListener('click', () => setThemeMode(btn.dataset.mode));
    });
  }

  // 设置按钮点击 → 切换侧边栏
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  // 关闭侧边栏（仅遮罩可关闭）
  sidebarOverlay.addEventListener('click', closeSidebar);

  // 主题色管理
  const LS_ACCENT = 'accentColor';
  function applyAccent(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    document.body.style.setProperty('--accent', hex);
    document.body.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    localStorage.setItem(LS_ACCENT, hex);
  }

  const savedAccent = localStorage.getItem(LS_ACCENT) || '#0066cc';
  applyAccent(savedAccent);

  // 预设色块点击
  const themeColorRow = document.getElementById('themeColorRow');

  function highlightSwatch(hex) {
    themeColorRow.querySelectorAll('.theme-color-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === hex);
    });
  }
  highlightSwatch(savedAccent);

  themeColorRow.querySelectorAll('.theme-color-swatch').forEach(s => {
    s.addEventListener('click', () => {
      const hex = s.dataset.color;
      applyAccent(hex);
      highlightSwatch(hex);
    });
  });

  // 左侧导航点击切换右侧面板
  const sidebarNav = sidebar.querySelector('.sidebar-nav');
  const navItems = sidebar.querySelectorAll('.sidebar-nav-item');

  // 浮动高亮块
  const navHighlight = document.createElement('div');
  navHighlight.className = 'nav-highlight';
  sidebarNav.appendChild(navHighlight);

  function moveHighlight(target) {
    const navRect = sidebarNav.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    navHighlight.style.top = (targetRect.top - navRect.top) + 'px';
    navHighlight.style.height = targetRect.height + 'px';
  }

  // 初始定位
  const initActive = sidebar.querySelector('.sidebar-nav-item.active');
  if (initActive) {
    requestAnimationFrame(() => moveHighlight(initActive));
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const panelId = item.dataset.panel;
      if (!panelId || item.classList.contains('active')) return;
      // 切换导航高亮
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      moveHighlight(item);
      // 切换内容面板
      sidebar.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('sidebarPanel' + panelId.charAt(0).toUpperCase() + panelId.slice(1));
      if (panel) panel.classList.add('active');
    });
  });

  // 壁纸管理
  const wallpaperModal = document.getElementById('wallpaperModal');
  const wallpaperGrid = document.getElementById('wallpaperGrid');
  const wallpaperImportBtn = document.getElementById('wallpaperImportBtn');
  const wallpaperRotateEditBtn = document.getElementById('wallpaperRotateEditBtn');
  const wallpaperFileInput = document.getElementById('wallpaperFileInput');
  const wallpaperCancel = document.getElementById('wallpaperCancel');
  const LS_WH = 'wallpaperHistory';
  const LS_WRP = 'wallpaperRotationPool';

  function getRotationPool() {
    try {
      const p = JSON.parse(localStorage.getItem(LS_WRP) || '[]');
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  function saveRotationPool(pool) {
    localStorage.setItem(LS_WRP, JSON.stringify(pool));
  }

  function getWallpaperHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(LS_WH) || '[]');
      return Array.isArray(h) ? h : [];
    } catch (e) { return []; }
  }

  function saveWallpaperHistory(list) {
    localStorage.setItem(LS_WH, JSON.stringify(list.slice(0, MAX_WALLPAPER_HISTORY)));
  }

  function compressWallpaper(dataUrl, callback) {
    const MAX_DIM = 1920;
    const QUALITY = 0.85;

    // SVG 无法绘制到 Canvas，直接原样存储
    if (dataUrl.startsWith('data:image/svg')) {
      callback(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = function () {
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      // 尺寸已经很小，无需压缩
      if (w <= MAX_DIM && h <= MAX_DIM) {
        callback(dataUrl);
        return;
      }

      // 等比缩放
      if (w > h) {
        h = Math.round(h * MAX_DIM / w);
        w = MAX_DIM;
      } else {
        w = Math.round(w * MAX_DIM / h);
        h = MAX_DIM;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      try {
        const compressed = canvas.toDataURL('image/jpeg', QUALITY);
        callback(compressed);
      } catch (e) {
        // Canvas 导出失败（极少见），回退到原图
        callback(dataUrl);
      }
    };
    img.onerror = function () {
      callback(dataUrl);
    };
    img.src = dataUrl;
  }

  function addWallpaperToHistory(dataUrl) {
    let list = getWallpaperHistory().filter(item => item !== dataUrl);
    list.unshift(dataUrl);
    saveWallpaperHistory(list);
    // 若已配置轮换池，新壁纸自动加入
    const pool = getRotationPool();
    if (pool.length && !pool.includes(dataUrl)) {
      pool.push(dataUrl);
      saveRotationPool(pool);
    }
  }

  let wallpaperEditMode = false;
  let wallpaperEditChecked = new Set();

  function renderWallpaperGrid() {
    const history = getWallpaperHistory();
    const current = localStorage.getItem(LS_BG);
    const pool = getRotationPool();
    wallpaperGrid.innerHTML = '';
    if (wallpaperEditMode) {
      wallpaperGrid.classList.add('edit-mode');
      wallpaperEditChecked = new Set(pool.length ? pool : history);
    } else {
      wallpaperGrid.classList.remove('edit-mode');
    }
    if (history.length === 0) {
      wallpaperGrid.innerHTML = '<div class="wallpaper-empty">暂无历史壁纸</div>';
      return;
    }
    history.forEach(dataUrl => {
      const item = document.createElement('div');
      item.className = 'wallpaper-item';
      if (dataUrl === current) item.classList.add('active');

      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '';
      item.appendChild(img);

      // 编辑模式复选框
      const check = document.createElement('span');
      check.className = 'wallpaper-rotate-check';
      if (wallpaperEditChecked.has(dataUrl)) check.classList.add('checked');
      check.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (wallpaperEditChecked.has(dataUrl)) {
          wallpaperEditChecked.delete(dataUrl);
          check.classList.remove('checked');
        } else {
          wallpaperEditChecked.add(dataUrl);
          check.classList.add('checked');
        }
      });
      item.appendChild(check);

      item.addEventListener('click', () => {
        if (wallpaperEditMode) {
          check.click();
          return;
        }
        applyWallpaper(dataUrl);
        renderWallpaperGrid();
        showToast('切换成功', 2000, 'success');
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'wallpaper-delete';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (dataUrl === localStorage.getItem(LS_BG)) {
          showToast('该壁纸正在使用');
          return;
        }
        const list = getWallpaperHistory().filter(item => item !== dataUrl);
        saveWallpaperHistory(list);
        // 同步从轮换池中移除
        const p = getRotationPool().filter(u => u !== dataUrl);
        saveRotationPool(p);
        wallpaperEditChecked.delete(dataUrl);
        renderWallpaperGrid();
      });
      item.appendChild(delBtn);
      wallpaperGrid.appendChild(item);
    });
  }

  wallpaperRotateEditBtn.addEventListener('click', () => {
    if (wallpaperEditMode) {
      // 确认：保存勾选的轮换池
      const checked = Array.from(wallpaperEditChecked);
      saveRotationPool(checked);
      wallpaperEditMode = false;
      wallpaperRotateEditBtn.textContent = '壁纸轮换';
      renderWallpaperGrid();
      showToast('轮换列表已更新', 2000, 'success');
      // 若轮换已开启且当前壁纸不在新池中，立即切换
      const rotation = localStorage.getItem(LS_WALLPAPER_ROTATE) || 'off';
      if (rotation !== 'off' && checked.length > 0) {
        const cur = localStorage.getItem(LS_BG);
        if (cur && !checked.includes(cur)) doWallpaperRotate();
      }
    } else {
      // 进入编辑模式
      wallpaperEditMode = true;
      wallpaperRotateEditBtn.textContent = '确认';
      renderWallpaperGrid();
    }
  });

  // 关闭弹窗时退出编辑模式
  wallpaperCancel.addEventListener('click', () => {
    wallpaperEditMode = false;
    wallpaperRotateEditBtn.textContent = '壁纸轮换';
    wallpaperModal.classList.remove('show');
  });

  // 整个缩略图区域可点击打开壁纸管理（按钮点击冒泡至此）
  document.getElementById('sidebarWallpaperThumb').addEventListener('click', () => {
    renderWallpaperGrid();
    wallpaperModal.classList.add('show');
  });

  wallpaperImportBtn.addEventListener('click', () => wallpaperFileInput.click());

  wallpaperFileInput.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;

    // 校验文件类型
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 3000);
      wallpaperFileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function () {
      compressWallpaper(reader.result, (compressed) => {
        try {
          addWallpaperToHistory(compressed);
          applyWallpaper(compressed);
          renderWallpaperGrid();
          showToast('导入成功', 2000, 'success');
        } catch (e) {
          showToast('存储空间不足', 3000);
        }
      });
    };
    reader.onerror = function () {
      showToast('文件读取异常', 3000);
      wallpaperFileInput.value = '';
    };
    try {
      reader.readAsDataURL(file);
    } catch (e) {
      showToast('无法读取文件', 3000);
      wallpaperFileInput.value = '';
    }
  });

  wallpaperModal.addEventListener('click', (e) => {
    if (e.target === wallpaperModal) wallpaperModal.classList.remove('show');
  });

  function updateWallpaperThumb() {
    const thumb = document.getElementById('sidebarWallpaperThumbImg');
    if (!thumb) return;
    const bg = localStorage.getItem(LS_BG);
    thumb.src = bg || './images/bg.webp';
  }
  updateWallpaperThumb();

  document.getElementById('wallpaperResetBtn').addEventListener('click', () => {
    localStorage.removeItem(LS_WRP);
    resetWallpaper();
    renderWallpaperGrid();
    sidebarOverlaySlider.value = '0.3';
    sidebarOverlayVal.textContent = '30%';
    document.body.style.setProperty('--overlay-opacity', '0.3');
    localStorage.removeItem('overlayOpacity');
    updateWallpaperThumb();
    showToast('已恢复', 2000, 'success');
  });

  document.getElementById('wallpaperClearBtn').addEventListener('click', () => {
    const current = localStorage.getItem(LS_BG);
    if (current) {
      localStorage.setItem(LS_WH, JSON.stringify([current]));
    } else {
      localStorage.removeItem(LS_WH);
    }
    renderWallpaperGrid();
    showToast('已清空', 2000, 'success');
  });

  // 壁纸自动轮换
  const rotateDropdown = document.getElementById('wallpaperRotateDropdown');
  const rotateTrigger = document.getElementById('rotateTrigger');
  const rotateSizer = document.getElementById('rotateSizer');
  const rotateList = document.getElementById('rotateList');
  const LS_WALLPAPER_ROTATE = 'wallpaperRotation';
  const rotateOptions = [
    { value: 'off', label: '不进行轮换' },
    { value: '1h',  label: '每 1 小时轮换' },
    { value: '6h',  label: '每 6 小时轮换' },
    { value: '12h', label: '每 12 小时轮换' },
    { value: '24h', label: '每 24 小时轮换' }
  ];
  let rotateTimer = null;

  rotateOptions.forEach(opt => {
    const el = document.createElement('div');
    el.className = 'rotate-option';
    el.setAttribute('data-value', opt.value);
    el.textContent = opt.label;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectRotation(opt.value);
      rotateDropdown.classList.remove('open');
    });
    rotateList.appendChild(el);

    // sizer：隐藏的宽度占位，确保容器宽度 ≥ 最长选项
    const sz = document.createElement('span');
    sz.textContent = opt.label;
    rotateSizer.appendChild(sz);
  });

  function selectRotation(value) {
    const opt = rotateOptions.find(o => o.value === value);
    if (opt) rotateTrigger.textContent = opt.label;
    rotateList.querySelectorAll('.rotate-option').forEach(o => o.classList.toggle('active', o.getAttribute('data-value') === value));
    localStorage.setItem(LS_WALLPAPER_ROTATE, value);
    startWallpaperRotation(value);
  }

  function getRotateIntervalHours(value) {
    switch (value) {
      case '1h':  return 1;
      case '6h':  return 6;
      case '12h': return 12;
      case '24h': return 24;
      default:    return 0;
    }
  }

  function doWallpaperRotate() {
    const history = getWallpaperHistory();
    if (history.length < 2) return;
    const pool = getRotationPool();
    const candidates = pool.length ? pool.filter(u => history.includes(u)) : history;
    if (candidates.length < 2) return;
    const current = localStorage.getItem(LS_BG);
    const others = candidates.filter(h => h !== current);
    if (!others.length) return;
    const pick = others[Math.floor(Math.random() * others.length)];
    if (pick) applyWallpaper(pick);
  }

  function startWallpaperRotation(value) {
    if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
    const hours = getRotateIntervalHours(value);
    if (!hours) return;

    function schedule() {
      const now = new Date();
      const h = now.getHours();
      const nextHour = Math.ceil((h + 1e-6) / hours) * hours;
      const next = new Date(now);
      if (nextHour >= 24) {
        next.setHours(0, 0, 0, 0);
        next.setDate(next.getDate() + 1);
      } else {
        next.setHours(nextHour, 0, 0, 0);
      }
      rotateTimer = setTimeout(() => {
        doWallpaperRotate();
        schedule();
      }, next.getTime() - now.getTime());
    }

    schedule();
  }

  document.getElementById('rotateNowBtn').addEventListener('click', () => {
    doWallpaperRotate();
    showToast('已轮换', 1500, 'success');
  });

  rotateTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    rotateDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!rotateDropdown.contains(e.target)) rotateDropdown.classList.remove('open');
  });

  const savedRotation = localStorage.getItem(LS_WALLPAPER_ROTATE) || 'off';
  selectRotation(savedRotation);

  // 搜索功能面板：分区折叠/展开（默认折叠）
  document.querySelectorAll('.section-collapse-header').forEach(header => {
    const section = header.parentElement;
    const sectionId = section.id;
    const saved = localStorage.getItem('collapse_' + sectionId);
    if (saved !== 'expanded') {
      section.classList.add('collapsed');
    }
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      localStorage.setItem('collapse_' + sectionId, section.classList.contains('collapsed') ? 'collapsed' : 'expanded');
    });
  });

  function updateSliderTrack(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const pct = ((slider.value - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--slider-track, #555) ${pct}%)`;
  }

  function getNodeStep(slider) {
    const ds = slider.dataset.step;
    return ds ? parseFloat(ds) : ((parseFloat(slider.max) - parseFloat(slider.min)) / 100);
  }

  function roundToNode(value, step) { return Math.round(value / step) * step; }

  function formatSliderVal(v, step, slider) {
    const unit = slider.dataset.unit || '';
    const scaled = unit === '%' ? v * 100 : v;
    const decimals = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
    return parseFloat(scaled.toFixed(decimals)) + unit;
  }

  function snapToNode(slider) {
    const step = getNodeStep(slider);
    const snapped = roundToNode(parseFloat(slider.value), step);
    slider.value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), snapped));
    slider.dispatchEvent(new Event('input'));
  }

  document.querySelectorAll('input[type="range"]').forEach(s => {
    s.addEventListener('change', () => snapToNode(s));
  });

  // 侧边栏遮罩透明度滑块
  const sidebarOverlaySlider = document.getElementById('sidebarOverlaySlider');
  const sidebarOverlayVal = document.getElementById('sidebarOverlayVal');
  const savedOpacity = localStorage.getItem('overlayOpacity');
  if (savedOpacity) {
    sidebarOverlaySlider.value = savedOpacity;
    document.body.style.setProperty('--overlay-opacity', savedOpacity);
  }
  sidebarOverlayVal.textContent = Math.round(parseFloat(sidebarOverlaySlider.value) * 100) + '%';
  updateSliderTrack(sidebarOverlaySlider);

  sidebarOverlaySlider.addEventListener('input', () => {
    const v = sidebarOverlaySlider.value;
    const step = getNodeStep(sidebarOverlaySlider);
    sidebarOverlayVal.textContent = formatSliderVal(roundToNode(v, step), step,sidebarOverlaySlider);
    document.body.style.setProperty('--overlay-opacity', v);
    localStorage.setItem('overlayOpacity', v);
    updateSliderTrack(sidebarOverlaySlider);
  });

  sidebarOverlaySlider.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = getNodeStep(sidebarOverlaySlider);
    const delta = e.deltaY > 0 ? -step : step;
    sidebarOverlaySlider.value = Math.max(parseFloat(sidebarOverlaySlider.min), Math.min(parseFloat(sidebarOverlaySlider.max), parseFloat(sidebarOverlaySlider.value) + delta));
    sidebarOverlaySlider.dispatchEvent(new Event('input'));
  });

  // 侧边栏模糊滑块
  const sidebarBlurSlider = document.getElementById('sidebarBlurSlider');
  const sidebarBlurVal = document.getElementById('sidebarBlurVal');
  const LS_BLUR = 'wallpaperBlur';
  const savedBlur = localStorage.getItem(LS_BLUR) || '0';
  sidebarBlurSlider.value = savedBlur;
  document.body.style.setProperty('--blur-px', savedBlur + 'px');
  sidebarBlurVal.textContent = savedBlur + 'px';
  updateSliderTrack(sidebarBlurSlider);

  sidebarBlurSlider.addEventListener('input', () => {
    const v = sidebarBlurSlider.value;
    const step = getNodeStep(sidebarBlurSlider);
    sidebarBlurVal.textContent = formatSliderVal(roundToNode(v, step), step,sidebarBlurSlider);
    document.body.style.setProperty('--blur-px', v + 'px');
    localStorage.setItem(LS_BLUR, v);
    updateSliderTrack(sidebarBlurSlider);
  });

  sidebarBlurSlider.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = getNodeStep(sidebarBlurSlider);
    const delta = e.deltaY > 0 ? -step : step;
    sidebarBlurSlider.value = Math.max(parseFloat(sidebarBlurSlider.min), Math.min(parseFloat(sidebarBlurSlider.max), parseFloat(sidebarBlurSlider.value) + delta));
    sidebarBlurSlider.dispatchEvent(new Event('input'));
  });

  // 侧边栏透明度滑块
  const sidebarOpacitySlider = document.getElementById('sidebarOpacitySlider');
  const sidebarOpacityVal = document.getElementById('sidebarOpacityVal');
  const LS_SIDEBAR_OPACITY = 'sidebarOpacity';
  const savedSidebarOpacity = localStorage.getItem(LS_SIDEBAR_OPACITY) || '1';

  function applySidebarOpacity(v) {
    const opacity = parseFloat(v);
    document.body.style.setProperty('--sidebar-opacity', v);

    // 浅色模式下透明度降低时加深文字，保证可读性
    const factor = (opacity - 0.2) / 0.8;                  // 0.2→0, 1→1
    const mainGray = Math.round(51 * factor);               // #333→#000
    const navGray = Math.round(51 + 71 * factor);           // #7a7a7a→#333
    const labelGray = Math.round(51 + 85 * factor);          // #888→#333
    document.body.style.setProperty('--sidebar-main-rgb', `${mainGray},${mainGray},${mainGray}`);
    document.body.style.setProperty('--sidebar-nav-rgb', `${navGray},${navGray},${navGray}`);
    document.body.style.setProperty('--sidebar-label-rgb', `${labelGray},${labelGray},${labelGray}`);
  }

  sidebarOpacitySlider.value = savedSidebarOpacity;
  applySidebarOpacity(savedSidebarOpacity);
  sidebarOpacityVal.textContent = parseInt(parseFloat(savedSidebarOpacity) * 100) + '%';
  updateSliderTrack(sidebarOpacitySlider);

  sidebarOpacitySlider.addEventListener('input', () => {
    const v = sidebarOpacitySlider.value;
    const step = getNodeStep(sidebarOpacitySlider);
    sidebarOpacityVal.textContent = formatSliderVal(roundToNode(v, step), step,sidebarOpacitySlider);
    applySidebarOpacity(v);
    localStorage.setItem(LS_SIDEBAR_OPACITY, v);
    updateSliderTrack(sidebarOpacitySlider);
  });

  sidebarOpacitySlider.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = getNodeStep(sidebarOpacitySlider);
    const delta = e.deltaY > 0 ? -step : step;
    sidebarOpacitySlider.value = Math.max(parseFloat(sidebarOpacitySlider.min), Math.min(parseFloat(sidebarOpacitySlider.max), parseFloat(sidebarOpacitySlider.value) + delta));
    sidebarOpacitySlider.dispatchEvent(new Event('input'));
  });

  // 侧边栏毛玻璃滑块
  const sidebarBlurSlider2 = document.getElementById('sidebarBlurSlider2');
  const sidebarBlurVal2 = document.getElementById('sidebarBlurVal2');
  const LS_SIDEBAR_BLUR = 'sidebarBlur';
  const savedSidebarBlur = localStorage.getItem(LS_SIDEBAR_BLUR) || '0';
  sidebarBlurSlider2.value = savedSidebarBlur;
  document.body.style.setProperty('--sidebar-blur', savedSidebarBlur);
  sidebarBlurVal2.textContent = savedSidebarBlur + 'px';
  updateSliderTrack(sidebarBlurSlider2);

  sidebarBlurSlider2.addEventListener('input', () => {
    const v = sidebarBlurSlider2.value;
    const step = getNodeStep(sidebarBlurSlider2);
    sidebarBlurVal2.textContent = formatSliderVal(roundToNode(v, step), step,sidebarBlurSlider2);
    document.body.style.setProperty('--sidebar-blur', v);
    localStorage.setItem(LS_SIDEBAR_BLUR, v);
    updateSliderTrack(sidebarBlurSlider2);
  });

  sidebarBlurSlider2.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = getNodeStep(sidebarBlurSlider2);
    const delta = e.deltaY > 0 ? -step : step;
    sidebarBlurSlider2.value = Math.max(parseFloat(sidebarBlurSlider2.min), Math.min(parseFloat(sidebarBlurSlider2.max), parseFloat(sidebarBlurSlider2.value) + delta));
    sidebarBlurSlider2.dispatchEvent(new Event('input'));
  });

  // 搜索框：启用/禁用开关
  (function() {
    const toggle = document.getElementById('searchBoxToggle');
    const controls = document.getElementById('searchBoxControls');
    const searchContainer = document.querySelector('.search-container');
    const key = 'searchBoxEnabled';

    function apply(enabled) {
      controls.classList.toggle('hidden', !enabled);
      if (searchContainer) searchContainer.classList.toggle('hidden', !enabled);
      toggle.checked = enabled;
    }

    toggle.addEventListener('change', () => {
      apply(toggle.checked);
      localStorage.setItem(key, toggle.checked ? 'true' : 'false');
    });

    // 初始化：默认启用
    const saved = localStorage.getItem(key);
    apply(saved !== 'false');
  })();

  // 搜索框：上下移动滑块
  (function() {
    const slider = document.getElementById('searchOffsetYSlider');
    const label = document.getElementById('searchOffsetYVal');
    const key = 'searchOffsetY';
    const cssVar = '--search-offset-y';
    const unit = 'px';

    const saved = localStorage.getItem(key);
    if (saved != null) {
      slider.value = saved;
      document.documentElement.style.setProperty(cssVar, saved + unit);
    }
    label.textContent = slider.value + 'px';
    updateSliderTrack(slider);

    slider.addEventListener('input', () => {
      const v = slider.value;
      const step = getNodeStep(slider);
      label.textContent = formatSliderVal(roundToNode(v, step), step,slider);
      document.documentElement.style.setProperty(cssVar, v + unit);
      localStorage.setItem(key, v);
      updateSliderTrack(slider);
    });

    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = getNodeStep(slider);
      const delta = e.deltaY > 0 ? -step : step;
      slider.value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), parseFloat(slider.value) + delta));
      slider.dispatchEvent(new Event('input'));
    });
  })();

  // 搜索框：左右移动滑块
  (function() {
    const slider = document.getElementById('searchOffsetXSlider');
    const label = document.getElementById('searchOffsetXVal');
    const key = 'searchOffsetX';
    const cssVar = '--search-offset-x';
    const unit = 'px';

    const saved = localStorage.getItem(key);
    if (saved != null) {
      slider.value = saved;
      document.documentElement.style.setProperty(cssVar, saved + unit);
    }
    label.textContent = slider.value + 'px';
    updateSliderTrack(slider);

    slider.addEventListener('input', () => {
      const v = slider.value;
      const step = getNodeStep(slider);
      label.textContent = formatSliderVal(roundToNode(v, step), step,slider);
      document.documentElement.style.setProperty(cssVar, v + unit);
      localStorage.setItem(key, v);
      updateSliderTrack(slider);
    });

    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = getNodeStep(slider);
      const delta = e.deltaY > 0 ? -step : step;
      slider.value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), parseFloat(slider.value) + delta));
      slider.dispatchEvent(new Event('input'));
    });
  })();

  // 搜索框：长度滑块
  (function() {
    const slider = document.getElementById('searchWidthSlider');
    const label = document.getElementById('searchWidthVal');
    const key = 'searchWidth';
    const cssVar = '--search-width';
    const unit = 'px';

    const saved = localStorage.getItem(key);
    if (saved != null) {
      slider.value = saved;
      document.documentElement.style.setProperty(cssVar, saved + unit);
    }
    label.textContent = slider.value + 'px';
    updateSliderTrack(slider);

    slider.addEventListener('input', () => {
      const v = slider.value;
      const step = getNodeStep(slider);
      label.textContent = formatSliderVal(roundToNode(v, step), step,slider);
      document.documentElement.style.setProperty(cssVar, v + unit);
      localStorage.setItem(key, v);
      updateSliderTrack(slider);
    });

    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = getNodeStep(slider);
      const delta = e.deltaY > 0 ? -step : step;
      slider.value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), parseFloat(slider.value) + delta));
      slider.dispatchEvent(new Event('input'));
    });
  })();

  // 搜索框：圆角滑块
  (function() {
    const slider = document.getElementById('searchRadiusSlider');
    const label = document.getElementById('searchRadiusVal');
    const key = 'searchRadius';
    const cssVar = '--search-radius';
    const unit = 'px';

    const saved = localStorage.getItem(key);
    if (saved != null) {
      slider.value = saved;
      document.documentElement.style.setProperty(cssVar, saved + unit);
    }
    label.textContent = slider.value + 'px';
    updateSliderTrack(slider);

    slider.addEventListener('input', () => {
      const v = slider.value;
      const step = getNodeStep(slider);
      label.textContent = formatSliderVal(roundToNode(v, step), step,slider);
      document.documentElement.style.setProperty(cssVar, v + unit);
      localStorage.setItem(key, v);
      updateSliderTrack(slider);
    });

    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = getNodeStep(slider);
      const delta = e.deltaY > 0 ? -step : step;
      slider.value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), parseFloat(slider.value) + delta));
      slider.dispatchEvent(new Event('input'));
    });
  })();

  // 搜索框：重置按钮
  (function() {
    const btn = document.getElementById('searchBoxResetBtn');
    btn.addEventListener('click', () => {
      const defaults = [
        { slider: 'searchOffsetYSlider', label: 'searchOffsetYVal', cssVar: '--search-offset-y', value: '0', key: 'searchOffsetY' },
        { slider: 'searchOffsetXSlider', label: 'searchOffsetXVal', cssVar: '--search-offset-x', value: '0', key: 'searchOffsetX' },
        { slider: 'searchWidthSlider',   label: 'searchWidthVal',   cssVar: '--search-width',   value: '800', key: 'searchWidth' },
        { slider: 'searchRadiusSlider',  label: 'searchRadiusVal',  cssVar: '--search-radius',  value: '25', key: 'searchRadius' }
      ];
      defaults.forEach(d => {
        document.getElementById(d.slider).value = d.value;
        document.getElementById(d.label).textContent = d.value + 'px';
        document.documentElement.style.setProperty(d.cssVar, d.value + 'px');
        localStorage.removeItem(d.key);
      });
    });
  })();

  // 自定义搜索引擎表单（侧边栏内下拉展开）
  const customEngineForm = document.getElementById('customEngineForm');
  const customEngineName = document.getElementById('customEngineName');
  const customEngineUrl = document.getElementById('customEngineUrl');
  const customEngineIconWhite = document.getElementById('customEngineIconWhite');
  const customEngineIconDefault = document.getElementById('customEngineIconDefault');
  const customEngineIconWhiteName = document.getElementById('customEngineIconWhiteName');
  const customEngineIconDefaultName = document.getElementById('customEngineIconDefaultName');
  const customEngineSave = document.getElementById('customEngineSave');
  const customEngineCancel = document.getElementById('customEngineCancel');
  let ceWhiteData = null;
  let ceDefaultData = null;
  let ceEditingId = null;
  let ceOpenFor = null; // 记录当前为哪个触发器展开：null | 'add' | engineId

  const ceIconWhitePreview = document.getElementById('customEngineIconWhitePreview');
  const ceIconDefaultPreview = document.getElementById('customEngineIconDefaultPreview');

  function readIconFile(file, inputEl, nameEl, previewEl, onDone) {
    if (!file.type.includes('svg')) {
      showToast('请选择 SVG 格式图标', 3000);
      inputEl.value = '';
      return;
    }
    if (file.size > 512 * 1024) {
      showToast('图标文件过大，请选择小于 512KB 的文件', 3000);
      inputEl.value = '';
      return;
    }
    nameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => { onDone(reader.result); previewEl.src = reader.result; };
    reader.onerror = () => { showToast('图标读取失败', 3000); inputEl.value = ''; };
    reader.readAsDataURL(file);
  }

  customEngineIconWhite.addEventListener('change', () => {
    const file = customEngineIconWhite.files[0];
    if (!file) return;
    readIconFile(file, customEngineIconWhite, customEngineIconWhiteName, ceIconWhitePreview, (data) => { ceWhiteData = data; });
  });

  customEngineIconDefault.addEventListener('change', () => {
    const file = customEngineIconDefault.files[0];
    if (!file) return;
    readIconFile(file, customEngineIconDefault, customEngineIconDefaultName, ceIconDefaultPreview, (data) => { ceDefaultData = data; });
  });

  function openCustomEngineForm(editId) {
    const triggerKey = editId || 'add';

    // 重复点击同一触发器 → 关闭
    if (ceOpenFor === triggerKey && customEngineForm.classList.contains('open')) {
      closeCustomEngineForm();
      return;
    }

    // 先关闭旧状态，归位
    closeCustomEngineForm();

    ceEditingId = editId || null;
    ceOpenFor = triggerKey;

    const saveBtn = document.getElementById('customEngineSave');
    const deleteBtn = document.getElementById('customEngineDelete');
    const title = document.getElementById('customEngineFormTitle');
    customEngineIconWhite.value = '';
    customEngineIconDefault.value = '';
    customEngineIconWhiteName.textContent = '';
    customEngineIconDefaultName.textContent = '';
    ceIconWhitePreview.src = '';
    ceIconDefaultPreview.src = '';
    ceWhiteData = null;
    ceDefaultData = null;

    if (ceEditingId) {
      const list = getCustomEngines();
      const ce = list.find(e => e.id === ceEditingId);
      if (ce) {
        customEngineName.value = ce.name;
        customEngineUrl.value = ce.url;
        ceIconWhitePreview.src = ce.iconWhite;
        ceIconDefaultPreview.src = ce.iconDefault;
        ceWhiteData = ce.iconWhite;
        ceDefaultData = ce.iconDefault;
        title.textContent = '编辑自定义搜索引擎';
        saveBtn.textContent = '更新';
        deleteBtn.style.display = '';
      }
    } else {
      customEngineName.value = '';
      customEngineUrl.value = '';
      title.textContent = '添加自定义搜索引擎';
      saveBtn.textContent = '添加';
      deleteBtn.style.display = 'none';
    }

    // 定位到触发项下方
    let anchor;
    if (ceEditingId) {
      const cb = engineManager.querySelector(`input[type="checkbox"][data-engine="${ceEditingId}"]`);
      anchor = cb ? cb.closest('.engine-toggle') : null;
    } else {
      anchor = engineManager.querySelector('.sidebar-action-btn');
    }
    if (anchor) {
      anchor.insertAdjacentElement('afterend', customEngineForm);
    }

    // requestAnimationFrame 确保浏览器先渲染 max-height:0，再触发过渡
    requestAnimationFrame(() => {
      customEngineForm.classList.add('open');
    });
  }

  function closeCustomEngineForm() {
    customEngineForm.classList.remove('open');
    ceOpenFor = null;
    // 表单归位到 engineManager 外部，防止 innerHTML='' 时被销毁
    if (customEngineForm.parentNode === engineManager) {
      const panel = document.getElementById('sidebarPanelEngines');
      const lastLabel = panel && panel.querySelector('.sidebar-section-label:last-of-type');
      if (lastLabel) {
        panel.insertBefore(customEngineForm, lastLabel);
      }
    }
  }

  customEngineCancel.addEventListener('click', closeCustomEngineForm);

  // 点击表单外部区域 → 关闭
  document.addEventListener('click', (e) => {
    if (!customEngineForm.classList.contains('open')) return;
    if (customEngineForm.contains(e.target)) return;
    closeCustomEngineForm();
  });

  const customEngineDelete = document.getElementById('customEngineDelete');
  customEngineDelete.addEventListener('click', () => {
    if (!ceEditingId) return;
    closeCustomEngineForm();
    let list = getCustomEngines();
    list = list.filter(e => e.id !== ceEditingId);
    saveCustomEngines(list);
    injectCustomEngines();
    if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
    showToast('删除成功');
  });

  customEngineSave.addEventListener('click', () => {
    const name = customEngineName.value.trim();
    const url = customEngineUrl.value.trim();
    if (!name || !url) { showToast('请填写名称和搜索 URL'); return; }
    if (!ceWhiteData || !ceDefaultData) { showToast('请选择白色和彩色图标'); return; }
    const slug = nameToSlug(name);
    let list = getCustomEngines();

    // 检查名称重复（含内置引擎）
    const allNames = ['必应', 'Google', 'GitHub', '百度'];
    list.forEach(e => { if (e.id !== ceEditingId) allNames.push(e.name); });
    if (allNames.some(n => n === name)) { showToast('该名称已存在'); return; }

    // 检查 URL 重复
    const dupUrl = list.find(e => e.url === url && e.id !== ceEditingId);
    if (dupUrl) { showToast(`该 URL 已被「${dupUrl.name}」使用`); return; }

    if (ceEditingId) {
      const idx = list.findIndex(e => e.id === ceEditingId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], name, slug, url, iconWhite: ceWhiteData, iconDefault: ceDefaultData };
      }
    } else {
      const maxNum = list.reduce((max, ce) => {
        const n = parseInt(ce.id.replace('custom_', ''), 10);
        return n >= max ? n + 1 : max;
      }, 0);
      list.push({ id: `custom_${maxNum}`, name, slug, url, iconWhite: ceWhiteData, iconDefault: ceDefaultData });
    }

    closeCustomEngineForm();
    saveCustomEngines(list);
    injectCustomEngines();
    if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
    showToast(ceEditingId ? `更新成功「${name}」` : `添加成功「${name}」`, 2000, 'success');
  });

  // 重置设置按钮
  const resetSettingsBtn = document.getElementById('sidebarResetBtn');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('确定要恢复所有设置为默认值吗？\n此操作将清除壁纸、自定义引擎等所有更改。')) return;
      localStorage.removeItem(LS_BG);
      localStorage.removeItem(LS_WH);
      localStorage.removeItem(LS_WRP);
      localStorage.removeItem(LS_WALLPAPER_ROTATE);
      localStorage.removeItem(LS_DISABLED);
      localStorage.removeItem(LS_DEFAULT_ENGINE);
      localStorage.removeItem(LS_SEARCH_HISTORY_ENABLED);
      localStorage.removeItem(LS_SEARCH_HISTORY);
      localStorage.removeItem(LS_CLOCK_VISIBLE);
      localStorage.removeItem('clockPosition');
      localStorage.removeItem('clockFollow');
      localStorage.removeItem('clockCustomPos');
      localStorage.removeItem(LS_CUSTOM_ENGINES);
      localStorage.removeItem('overlayOpacity');
      localStorage.removeItem(LS_BLUR);
      localStorage.removeItem(LS_ACCENT);
      localStorage.removeItem(LS_THEME_MODE);
      localStorage.removeItem(LS_SIDEBAR_OPACITY);
      localStorage.removeItem(LS_SIDEBAR_BLUR);
      localStorage.removeItem('searchOffsetY');
      localStorage.removeItem('searchOffsetX');
      localStorage.removeItem('searchWidth');
      localStorage.removeItem('searchRadius');
      localStorage.removeItem('searchBoxEnabled');

      resetWallpaper();
      sidebarOverlaySlider.value = '0.3';
      sidebarOverlayVal.textContent = '30%';
      document.body.style.setProperty('--overlay-opacity', '0.3');
      updateSliderTrack(sidebarOverlaySlider);
      sidebarBlurSlider.value = '0';
      sidebarBlurVal.textContent = '0px';
      document.body.style.setProperty('--blur-px', '0px');
      updateSliderTrack(sidebarBlurSlider);
      sidebarOpacitySlider.value = '1';
      applySidebarOpacity('1');
      sidebarOpacityVal.textContent = '100%';
      updateSliderTrack(sidebarOpacitySlider);
      sidebarBlurSlider2.value = '0';
      sidebarBlurVal2.textContent = '0px';
      document.body.style.setProperty('--sidebar-blur', '0');
      updateSliderTrack(sidebarBlurSlider2);
      document.documentElement.style.setProperty('--search-offset-y', '0px');
      document.documentElement.style.setProperty('--search-offset-x', '0px');
      document.documentElement.style.setProperty('--search-width', '800px');
      document.documentElement.style.setProperty('--search-radius', '25px');
      const sySlider = document.getElementById('searchOffsetYSlider');
      const sxSlider = document.getElementById('searchOffsetXSlider');
      const swSlider = document.getElementById('searchWidthSlider');
      const srSlider = document.getElementById('searchRadiusSlider');
      if (sySlider) { sySlider.value = '0'; document.getElementById('searchOffsetYVal').textContent = '0px'; updateSliderTrack(sySlider); }
      if (sxSlider) { sxSlider.value = '0'; document.getElementById('searchOffsetXVal').textContent = '0px'; updateSliderTrack(sxSlider); }
      if (swSlider) { swSlider.value = '800'; document.getElementById('searchWidthVal').textContent = '800px'; updateSliderTrack(swSlider); }
      if (srSlider) { srSlider.value = '25'; document.getElementById('searchRadiusVal').textContent = '25px'; updateSliderTrack(srSlider); }
      if (document.getElementById('searchBoxToggle')) {
        document.getElementById('searchBoxToggle').checked = true;
        document.getElementById('searchBoxControls').classList.remove('hidden');
        const sc = document.querySelector('.search-container');
        if (sc) sc.classList.remove('hidden');
      }
      updateWallpaperThumb();
      applyAccent('#0066cc');
      highlightSwatch('#0066cc');

      if (historyToggle) historyToggle.checked = true;
      hideHistoryDropdown();

      if (clockToggle) clockToggle.checked = true;
      showDigitalClock();
      applyClockPosition('below');
      if (clockFollowToggle) { clockFollowToggle.checked = true; applyClockFollow(true); }
      applyClockCustomPos('center');
      updateClockCascade();

      setThemeMode('system');

      if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
      injectCustomEngines();

      const bingItem = document.querySelector('.engine-item[data-engine="bing"]');
      if (bingItem) {
        document.querySelectorAll('.engine-item').forEach(i => i.classList.remove('active'));
        bingItem.classList.add('active');
        currentEngine = 'bing';
        currentEngineIcons = { white: bingItem.dataset.white, default: bingItem.dataset.default };
        if (typeof updateEngineIcon === 'function') updateEngineIcon();
      }

      selectRotation('off');
      if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
      showToast('设置已恢复默认');
    });
  }

  // 动态生成"搜索引擎"子菜单的复选框列表
  function populateEngineManager() {
    const items = Array.from(document.querySelectorAll('.engine-item'))
      .sort((a, b) => (Number(a.getAttribute('data-index') || 9999) - Number(b.getAttribute('data-index') || 9999)));
    const disabled = new Set(JSON.parse(localStorage.getItem(LS_DISABLED) || '[]'));
    engineManager.innerHTML = '';
    items.forEach(it => {
      const key = it.getAttribute('data-engine') || '';
      const name = (it.querySelector('span') && it.querySelector('span').textContent) || key;
      const isCustom = key.startsWith('custom_');

      const row = document.createElement('label');
      row.className = 'engine-toggle';

      const span = document.createElement('span');
      span.textContent = name;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-engine', key);
      cb.checked = !disabled.has(key);
      cb.addEventListener('click', (ev) => ev.stopPropagation());
      cb.addEventListener('change', () => {
        const def = localStorage.getItem(LS_DEFAULT_ENGINE) || 'bing';
        if (!cb.checked && key === def) { cb.checked = true; showToast('当前默认引擎无法关闭'); return; }
        const cur = new Set(JSON.parse(localStorage.getItem(LS_DISABLED) || '[]'));
        if (!cb.checked) cur.add(key); else cur.delete(key);
        localStorage.setItem(LS_DISABLED, JSON.stringify(Array.from(cur)));
        if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
      });
      const toggleSwitch = document.createElement('span');
      toggleSwitch.className = 'toggle-switch';

      if (isCustom) {
        row.appendChild(span);
        const editBtn = document.createElement('span');
        editBtn.className = 'engine-edit-btn';
        editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
        editBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          openCustomEngineForm(key);
        });
        row.appendChild(editBtn);
        row.appendChild(cb);
        row.appendChild(toggleSwitch);
      } else {
        row.appendChild(span);
        row.appendChild(cb);
        row.appendChild(toggleSwitch);
      }
      engineManager.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'sidebar-action-btn';
    addBtn.innerHTML = '手动添加<img class="add-icon" src="./icons/add-white.svg" alt="">';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCustomEngineForm();
    });
    engineManager.appendChild(addBtn);
  }
  // 增量同步：仅更新复选框选中态，不重建 DOM，保证 CSS transition 正常播放
  function syncEngineManager() {
    const items = Array.from(document.querySelectorAll('.engine-item'))
      .sort((a, b) => (Number(a.getAttribute('data-index') || 9999) - Number(b.getAttribute('data-index') || 9999)));
    const disabled = new Set(JSON.parse(localStorage.getItem(LS_DISABLED) || '[]'));
    const cbs = engineManager.querySelectorAll('input[type="checkbox"]');
    if (cbs.length !== items.length) { populateEngineManager(); return; }
    cbs.forEach(cb => {
      const key = cb.getAttribute('data-engine');
      if (key) cb.checked = !disabled.has(key);
    });
  }
  window.syncEngineManager = syncEngineManager;

  // 增量同步：仅更新单选框选中态，不重建 DOM
  function syncDefaultEngineManager() {
    const def = localStorage.getItem(LS_DEFAULT_ENGINE) || 'bing';
    const radios = defaultEngineManager.querySelectorAll('input[type="radio"]');
    const items = Array.from(document.querySelectorAll('.engine-item'))
      .sort((a, b) => (Number(a.getAttribute('data-index') || 9999) - Number(b.getAttribute('data-index') || 9999)));
    const disabled = new Set(JSON.parse(localStorage.getItem(LS_DISABLED) || '[]'));
    const enabledKeys = items.map(it => it.getAttribute('data-engine') || '').filter(k => !disabled.has(k));
    if (radios.length !== enabledKeys.length) { populateDefaultEngineManager(); return; }
    radios.forEach(radio => { radio.checked = (radio.value === def); });
  }
  window.syncDefaultEngineManager = syncDefaultEngineManager;

  window.populateEngineManager = populateEngineManager;
})();


// 引擎可见性管理：禁用引擎移入archive隐藏容器，启用时按data-index还原位置
(function(){
  const el = document.getElementById('engineList');
  if (!el) return;
  let archive = document.getElementById('engineArchive');
  if (!archive) {
    archive = document.createElement('div');
    archive.id = 'engineArchive';
    archive.style.display = 'none';
    document.body.appendChild(archive);
  }
  // 初始化data-index，保证所有引擎项有唯一序号用于排序还原
  Array.from(document.querySelectorAll('.engine-item')).forEach((item, idx) => {
    if (!item.hasAttribute('data-index')) item.setAttribute('data-index', idx);
  });

  function applyEngineVisibility() {
    const disabled = new Set(JSON.parse(localStorage.getItem(LS_DISABLED) || '[]'));
    // 遍历所有引擎项：禁用的移入archive，启用的移回engine-column
    Array.from(document.querySelectorAll('.engine-item')).forEach(item => {
      const key = item.getAttribute('data-engine') || '';
      const inList = !!item.closest('#engineList');
      if (disabled.has(key)) {
        if (inList) archive.appendChild(item);
      } else if (!inList) {
        const column = el.querySelector('.engine-column');
        if (!column) { el.appendChild(item); return; }
        const idx = Number(item.getAttribute('data-index') || 9999);
        const siblings = Array.from(column.querySelectorAll('.engine-item'));
        let inserted = false;
        for (const sib of siblings) {
          if (Number(sib.getAttribute('data-index') || 9999) > idx) {
            column.insertBefore(item, sib); inserted = true; break;
          }
        }
        if (!inserted) column.appendChild(item);
      }
    });
    // 确保engine-column内始终保持data-index排序
    const column = el.querySelector('.engine-column');
    if (column) {
      Array.from(column.querySelectorAll('.engine-item'))
        .sort((a, b) => (Number(a.getAttribute('data-index') || 9999) - Number(b.getAttribute('data-index') || 9999)))
        .forEach(item => column.appendChild(item));
    }
    // 如果当前活跃引擎被禁用，自动切换到第一个可见引擎
    const active = el.querySelector('.engine-item.active');
    if (!active || disabled.has(active.getAttribute('data-engine'))) {
      const first = el.querySelector('.engine-item');
      if (first) {
        document.querySelectorAll('.engine-item').forEach(i => i.classList.remove('active'));
        first.classList.add('active');
        const wIcon = document.getElementById('currentEngineIconWhite');
        const dIcon = document.getElementById('currentEngineIconDefault');
        if (wIcon) wIcon.src = first.getAttribute('data-white') || first.getAttribute('data-default') || wIcon.src;
        if (dIcon) dIcon.src = first.getAttribute('data-default') || first.getAttribute('data-white') || dIcon.src;
      }
    }
    // 侧边栏打开时增量同步，避免 innerHTML='' 打断 CSS transition
    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl && sidebarEl.classList.contains('open')) {
      if (typeof syncEngineManager === 'function') syncEngineManager();
      if (typeof syncDefaultEngineManager === 'function') syncDefaultEngineManager();
    }
  }
  applyEngineVisibility();
  window.applyEngineVisibility = applyEngineVisibility;
})();

injectCustomEngines();

document.getElementById('clear-history-btn').addEventListener('click', () => {
  clearSearchHistory();
  hideHistoryDropdown();
});

// 点击搜索框外部 → 隐藏历史下拉
document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.search-input-wrap');
  if (wrap && !wrap.contains(e.target)) hideHistoryDropdown();
});

const defaultEngineManager = document.getElementById('sidebarDefaultEngineList');

// 动态生成"默认引擎"子菜单的radio列表（仅显示启用的引擎）
function populateDefaultEngineManager() {
  if (!defaultEngineManager) return;
  const items = Array.from(document.querySelectorAll('.engine-item'))
    .sort((a, b) => (Number(a.getAttribute('data-index') || 9999) - Number(b.getAttribute('data-index') || 9999)));
  const disabled = new Set(JSON.parse(localStorage.getItem(LS_DISABLED) || '[]'));
  const def = localStorage.getItem(LS_DEFAULT_ENGINE) || 'bing';
  defaultEngineManager.innerHTML = '';
  let first = null;
  items.forEach(it => {
    const key = it.getAttribute('data-engine') || '';
    if (disabled.has(key)) return; // 禁用的引擎不显示
    const name = (it.querySelector('span') && it.querySelector('span').textContent) || key;
    if (!first) first = key;
    const row = document.createElement('label');
    row.className = 'engine-toggle';
    const span = document.createElement('span');
    span.textContent = name;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'defaultEngine';
    radio.value = key;
    radio.checked = (key === def);
    radio.addEventListener('click', (ev) => ev.stopPropagation());
    const toggleSwitch = document.createElement('span');
    toggleSwitch.className = 'toggle-switch';
    row.appendChild(span);
    row.appendChild(radio);
    row.appendChild(toggleSwitch);
    defaultEngineManager.appendChild(row);
  });
  // 如果当前默认引擎被禁用，回退到第一个启用的引擎
  if (!defaultEngineManager.querySelector('input[name="defaultEngine"]:checked') && first) {
    const fb = defaultEngineManager.querySelector(`input[name="defaultEngine"][value="${first}"]`);
    if (fb) fb.checked = true;
  }
}

// 选择默认引擎 → 保存并切换
defaultEngineManager.addEventListener('change', (e) => {
  const radio = e.target;
  if (!radio || radio.name !== 'defaultEngine') return;
  localStorage.setItem(LS_DEFAULT_ENGINE, radio.value);
  const item = engineListEl.querySelector(`.engine-item[data-engine="${radio.value}"]`);
  if (item) {
    engineListEl.querySelectorAll('.engine-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentEngine = radio.value;
    currentEngineIcons = { white: item.dataset.white, default: item.dataset.default };
    updateEngineIcon();
  }
  if (typeof syncDefaultEngineManager === 'function') syncDefaultEngineManager();
});
