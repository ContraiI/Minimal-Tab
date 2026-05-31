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
const LS_WALLPAPER_HISTORY = 'wallpaperHistory';
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
    try { searchInput.focus(); } catch (err) {}
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
  const settingsMenu = document.getElementById('settingsMenu');
  const importBtn = document.getElementById('importWallpaperBtn');
  const manageEnginesBtn = document.getElementById('manageEnginesBtn');
  const engineManager = document.getElementById('engineManager');
  const moreSettingsBtn = document.getElementById('moreSettingsBtn');
  const moreSettingsManager = document.getElementById('moreSettingsManager');
  const settingsWrap = document.getElementById('settingsWrap');
  const historyToggle = document.getElementById('searchHistoryToggle');
  const LS_BG = 'customBg';
  const bgLayerA = document.getElementById('bgLayerA');
  const bgLayerB = document.getElementById('bgLayerB');
  let bgActive = 'a';

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
  }

  if (historyToggle) {
    historyToggle.checked = isSearchHistoryEnabled();
    historyToggle.addEventListener('change', () => {
      setSearchHistoryEnabled(historyToggle.checked);
      if (!historyToggle.checked) hideHistoryDropdown();
    });
  }

  const clockToggle = document.getElementById('clockToggle');
  if (clockToggle) {
    clockToggle.checked = isClockVisible();
    if (!isClockVisible()) hideDigitalClock();
    clockToggle.addEventListener('change', () => {
      setClockVisible(clockToggle.checked);
      if (clockToggle.checked) showDigitalClock();
      else hideDigitalClock();
    });
  }

  const nightModeToggle = document.getElementById('nightModeToggle');
  const LS_NIGHT_MODE = 'nightMode';
  if (nightModeToggle) {
    nightModeToggle.checked = localStorage.getItem(LS_NIGHT_MODE) !== 'false';
    if (!nightModeToggle.checked) { settingsWrap.classList.add('light'); document.body.classList.add('light-mode'); }
    if (!nightModeToggle.checked) document.body.classList.add('light-mode');
    nightModeToggle.addEventListener('change', () => {
      localStorage.setItem(LS_NIGHT_MODE, nightModeToggle.checked.toString());
      settingsWrap.classList.toggle('light', !nightModeToggle.checked);
      document.body.classList.toggle('light-mode', !nightModeToggle.checked);
    });
  }

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const show = settingsMenu.classList.toggle('show');
    if (!show) {
      engineManager.classList.remove('show');
      moreSettingsManager.classList.remove('show');
    }
  });
  // 壁纸管理
  const wallpaperModal = document.getElementById('wallpaperModal');
  const wallpaperGrid = document.getElementById('wallpaperGrid');
  const wallpaperImportBtn = document.getElementById('wallpaperImportBtn');
  const wallpaperFileInput = document.getElementById('wallpaperFileInput');
  const wallpaperCancel = document.getElementById('wallpaperCancel');
  const LS_WH = 'wallpaperHistory';

  function getWallpaperHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(LS_WH) || '[]');
      return Array.isArray(h) ? h : [];
    } catch (e) { return []; }
  }

  function saveWallpaperHistory(list) {
    localStorage.setItem(LS_WH, JSON.stringify(list.slice(0, MAX_WALLPAPER_HISTORY)));
  }

  function addWallpaperToHistory(dataUrl) {
    let list = getWallpaperHistory().filter(item => item !== dataUrl);
    list.unshift(dataUrl);
    saveWallpaperHistory(list);
  }

  function renderWallpaperGrid() {
    const history = getWallpaperHistory();
    const current = localStorage.getItem(LS_BG);
    wallpaperGrid.innerHTML = '';
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
      item.addEventListener('click', () => {
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
        renderWallpaperGrid();
      });
      item.appendChild(delBtn);
      wallpaperGrid.appendChild(item);
    });
  }

  importBtn.addEventListener('click', () => {
    renderWallpaperGrid();
    wallpaperModal.classList.add('show');
  });

  wallpaperImportBtn.addEventListener('click', () => wallpaperFileInput.click());

  wallpaperFileInput.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      addWallpaperToHistory(reader.result);
      applyWallpaper(reader.result);
      renderWallpaperGrid();
      showToast('导入成功', 2000, 'success');
    };
    reader.readAsDataURL(file);
  });

  wallpaperCancel.addEventListener('click', () => wallpaperModal.classList.remove('show'));
  wallpaperModal.addEventListener('click', (e) => {
    if (e.target === wallpaperModal) wallpaperModal.classList.remove('show');
  });

  document.getElementById('wallpaperResetBtn').addEventListener('click', () => {
    resetWallpaper();
    renderWallpaperGrid();
    overlaySlider.value = '0.3';
    overlayVal.textContent = '0.30';
    document.body.style.setProperty('--overlay-opacity', '0.3');
    localStorage.removeItem('overlayOpacity');
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

  // 遮罩透明度滑块
  const overlaySlider = document.getElementById('overlayOpacity');
  const overlayVal = document.getElementById('overlayOpacityVal');
  const savedOpacity = localStorage.getItem('overlayOpacity');
  if (savedOpacity) {
    overlaySlider.value = savedOpacity;
    document.body.style.setProperty('--overlay-opacity', savedOpacity);
  }
  overlayVal.textContent = parseFloat(overlaySlider.value).toFixed(2);

  overlaySlider.addEventListener('input', () => {
    const v = overlaySlider.value;
    overlayVal.textContent = parseFloat(v).toFixed(2);
    document.body.style.setProperty('--overlay-opacity', v);
    localStorage.setItem('overlayOpacity', v);
  });

  overlaySlider.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = parseFloat(overlaySlider.step);
    const delta = e.deltaY > 0 ? -step : step;
    overlaySlider.value = Math.max(0, Math.min(0.5, parseFloat(overlaySlider.value) + delta));
    overlaySlider.dispatchEvent(new Event('input'));
  });

  manageEnginesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    engineManager.classList.toggle('show');
    defaultEngineManager.classList.remove('show');
    moreSettingsManager.classList.remove('show');
    populateEngineManager();
  });
  moreSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    moreSettingsManager.classList.toggle('show');
    engineManager.classList.remove('show');
    defaultEngineManager.classList.remove('show');
  });

  // 自定义搜索引擎弹窗
  const customEngineModal = document.getElementById('customEngineModal');
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

  const ceIconWhitePreview = document.getElementById('customEngineIconWhitePreview');
  const ceIconDefaultPreview = document.getElementById('customEngineIconDefaultPreview');

  customEngineIconWhite.addEventListener('change', () => {
    const file = customEngineIconWhite.files[0];
    if (!file) return;
    customEngineIconWhiteName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => { ceWhiteData = reader.result; ceIconWhitePreview.src = reader.result; };
    reader.readAsDataURL(file);
  });

  customEngineIconDefault.addEventListener('change', () => {
    const file = customEngineIconDefault.files[0];
    if (!file) return;
    customEngineIconDefaultName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => { ceDefaultData = reader.result; ceIconDefaultPreview.src = reader.result; };
    reader.readAsDataURL(file);
  });

  function openCustomEngineModal(editId) {
    ceEditingId = editId || null;
    const saveBtn = document.getElementById('customEngineSave');
    const deleteBtn = document.getElementById('customEngineDelete');
    const title = document.querySelector('.modal-title');
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
    customEngineModal.classList.add('show');
  }

  function closeCustomEngineModal() {
    customEngineModal.classList.remove('show');
  }

  customEngineCancel.addEventListener('click', closeCustomEngineModal);
  customEngineModal.addEventListener('click', (e) => {
    if (e.target === customEngineModal) closeCustomEngineModal();
  });

  const customEngineDelete = document.getElementById('customEngineDelete');
  customEngineDelete.addEventListener('click', () => {
    if (!ceEditingId) return;
    let list = getCustomEngines();
    list = list.filter(e => e.id !== ceEditingId);
    saveCustomEngines(list);
    injectCustomEngines();
    if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
    closeCustomEngineModal();
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

    saveCustomEngines(list);
    injectCustomEngines();
    if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
    closeCustomEngineModal();
    showToast(ceEditingId ? `更新成功「${name}」` : `添加成功「${name}」`, 2000, 'success');
  });

  // 重置设置按钮
  const resetSettingsBtn = document.getElementById('resetSettingsBtn');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('确定要恢复所有设置为默认值吗？\n此操作将清除壁纸、自定义引擎等所有更改。')) return;
      localStorage.removeItem(LS_BG);
      localStorage.removeItem('wallpaperHistory');
      localStorage.removeItem('disabledEngines');
      localStorage.removeItem('preferredDefaultEngine');
      localStorage.removeItem('searchHistoryEnabled');
      localStorage.removeItem('searchHistory');
      localStorage.removeItem('clockVisible');
      localStorage.removeItem('customEngines');
      localStorage.removeItem('overlayOpacity');
      localStorage.removeItem('nightMode');

      resetWallpaper();
      overlaySlider.value = '0.3';
      overlayVal.textContent = '0.30';
      document.body.style.setProperty('--overlay-opacity', '0.3');

      if (historyToggle) historyToggle.checked = true;
      hideHistoryDropdown();

      if (clockToggle) clockToggle.checked = true;
      showDigitalClock();

      if (nightModeToggle) { nightModeToggle.checked = true; settingsWrap.classList.remove('light'); document.body.classList.remove('light-mode'); }

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

      showToast('设置已恢复默认');
    });
  }

  // 点击设置面板外部关闭
  document.addEventListener('click', (e) => {
    if (!settingsWrap.contains(e.target)) {
      settingsMenu.classList.remove('show');
      engineManager.classList.remove('show');
      defaultEngineManager.classList.remove('show');
      moreSettingsManager.classList.remove('show');
    }
  });

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
          openCustomEngineModal(key);
        });
        row.appendChild(editBtn);
        toggleSwitch.style.marginLeft = 'auto';
        row.appendChild(cb);
        row.appendChild(toggleSwitch);
      } else {
        row.appendChild(span);
        toggleSwitch.style.marginLeft = 'auto';
        row.appendChild(cb);
        row.appendChild(toggleSwitch);
      }
      engineManager.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.id = 'customEngineBtn';
    addBtn.className = 'reset-settings-btn';
    addBtn.innerHTML = '手动添加<img class="add-icon" src="./icons/add-white.svg" alt="">';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCustomEngineModal();
    });
    engineManager.appendChild(addBtn);
  }
  if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
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
    // 如果默认引擎菜单正打开则刷新内容
    const dfltMgr = document.getElementById('defaultEngineManager');
    if (dfltMgr && dfltMgr.classList.contains('show')) populateDefaultEngineManager();
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

const defaultEngineBtn = document.getElementById('defaultEngineBtn');
const defaultEngineManager = document.getElementById('defaultEngineManager');

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
    toggleSwitch.style.marginLeft = 'auto';
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

if (defaultEngineBtn && defaultEngineManager) {
  defaultEngineBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    defaultEngineManager.classList.toggle('show');
    document.getElementById('engineManager').classList.remove('show');
    moreSettingsManager.classList.remove('show');
    if (defaultEngineManager.classList.contains('show')) populateDefaultEngineManager();
  });
}

// 点击默认引擎菜单外部关闭
document.addEventListener('click', (e) => {
  if (!defaultEngineBtn.contains(e.target) && !defaultEngineManager.contains(e.target)) {
    defaultEngineManager.classList.remove('show');
  }
  if (!moreSettingsBtn.contains(e.target) && !moreSettingsManager.contains(e.target)) {
    moreSettingsManager.classList.remove('show');
  }
});

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
  defaultEngineManager.classList.remove('show');
});
