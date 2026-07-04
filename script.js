window.addEventListener('load', () => {
  const input = document.getElementById('search-input');
  input.setAttribute('autocomplete', 'off');
  setTimeout(() => input.setAttribute('autocomplete', 'off'), 100);
});

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

const engines = {
  bing:  { url: 'https://cn.bing.com/search?q=' },
  google: { url: 'https://www.google.com/search?q=' },
  github: { url: 'https://github.com/search?q=' },
  baidu:  { url: 'https://www.baidu.com/s?wd=' }
};

let currentEngine = 'bing';
let currentEngineIcons = { white: './icons/bing-white.svg', default: './icons/bing-default.svg' };

const LS_DEFAULT_ENGINE = 'preferredDefaultEngine';
const LS_DISABLED = 'disabledEngines';
const LS_SEARCH_HISTORY = 'searchHistory';
const LS_SEARCH_HISTORY_ENABLED = 'searchHistoryEnabled';
const LS_CLOCK_VISIBLE = 'clockVisible';
const LS_CUSTOM_ENGINES = 'customEngines';
const MAX_WALLPAPER_HISTORY = 12;
const MAX_HISTORY_ITEMS = 20;

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

function showHistoryDropdown() {
  const dd = document.getElementById('history-dropdown');
  if (dd) { dd.classList.add('show'); searchInput.classList.add('expanded'); }
}

function hideHistoryDropdown() {
  const dd = document.getElementById('history-dropdown');
  if (dd) { dd.classList.remove('show'); searchInput.classList.remove('expanded'); }
}

function renderHistoryList(filter = '') {
  if (!isSearchHistoryEnabled()) { hideHistoryDropdown(); return; }
  const list = document.getElementById('history-list');
  const dd = document.getElementById('history-dropdown');
  if (!list || !dd) return;

  const history = getSearchHistory();
  let filtered = filter
    ? history.filter(item => matchPinyin(item, filter))
    : history;
  if (filter && filtered.length === 0) filtered = history;

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

const engineIconWhite = document.getElementById('currentEngineIconWhite');
const engineIconDefault = document.getElementById('currentEngineIconDefault');
const engineIconWrap = document.querySelector('.engine-icon-wrap');
const engineListEl = document.getElementById('engineList');
const searchInput = document.getElementById('search-input');

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

function toggleBtns() {
  const has = searchInput.value.trim() !== '';
  clearBtn.style.display = has ? 'flex' : 'none';
  searchBtn.style.display = has ? 'flex' : 'none';
  updateEngineIcon();
}

function search() {
  const kw = searchInput.value.trim();
  if (!kw) return;
  saveSearchHistory(kw);
  window.open(engines[currentEngine].url + encodeURIComponent(kw), '_blank');
  searchInput.value = '';
  toggleBtns();
}

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

searchInput.addEventListener('change', () => setTimeout(toggleBtns, 100));
searchInput.addEventListener('webkitFillAvailable', toggleBtns);
searchInput.addEventListener('autocomplete', toggleBtns);

searchInput.addEventListener('focus', () => {
  updateEngineIcon();
  if (isSearchHistoryEnabled() && getSearchHistory().length > 0) renderHistoryList();
  hideDigitalClock();
});
searchInput.addEventListener('blur', () => {
  updateEngineIcon();
  setTimeout(hideHistoryDropdown, 150);
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

window.addEventListener('load', () => setTimeout(updateEngineIcon, 200));

const engineSelectorEl = document.querySelector('.engine-selector');
let preventReopenUntil = 0;

if (engineSelectorEl && engineListEl) {

  engineSelectorEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (Date.now() < preventReopenUntil) return;
    engineSelectorEl.classList.toggle('open');
  });

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

  document.addEventListener('click', (e) => {
    if (!engineSelectorEl.contains(e.target)) engineSelectorEl.classList.remove('open');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') engineSelectorEl.classList.remove('open');
  });
}

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
  const clockCustomPanel = document.getElementById('clockCustomPanel');
  const clockCustomXInput = document.getElementById('clockCustomXInput');
  const clockCustomYInput = document.getElementById('clockCustomYInput');
  const clockCustomLock = document.getElementById('clockCustomLock');
  const clockPosDropdown = document.getElementById('clockPosDropdown');
  const clockPosTrigger = document.getElementById('clockPosTrigger');
  const clockPosList = document.getElementById('clockPosList');
  const clockEl = document.getElementById('digital-clock');
  const LS_CLOCK_POS = 'clockPosition';
  const LS_CLOCK_FOLLOW = 'clockFollow';
  const LS_CLOCK_CUSTOM_POS = 'clockCustomPos';
  const LS_CLOCK_LOCKED = 'clockCustomLocked';

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
      if (clockCustomPanel) clockCustomPanel.classList.add('hidden');
    } else {
      const followOn = clockFollowToggle ? clockFollowToggle.checked : true;
      if (clockPositionRow) clockPositionRow.classList.toggle('hidden', !followOn);
      if (clockCustomRow) clockCustomRow.classList.toggle('hidden', followOn);
      if (followOn || (localStorage.getItem(LS_CLOCK_CUSTOM_POS) || 'center') !== 'custom') {
        if (clockCustomPanel) clockCustomPanel.classList.add('hidden');
      }
    }
  }

  if (clockToggle) {
    clockToggle.checked = isClockVisible();
    if (isClockVisible()) showDigitalClock();
    else hideDigitalClock();
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

  const posMap = {
    'left-top':     { top: '40px', left: '40px', right: '', bottom: '' },
    'right-top':    { top: '40px', left: '', right: '40px', bottom: '' },
    'center':       { top: '', left: '', right: '', bottom: '' },
    'left-bottom':  { top: '', left: '40px', right: '', bottom: '40px' },
    'right-bottom': { top: '', left: '', right: '40px', bottom: '40px' },
    'custom':       { top: '', left: '', right: '', bottom: '' }
  };
  const clockPosOptions = [
    { value: 'left-top', i18nKey: 'clockLeftTop' },
    { value: 'right-top', i18nKey: 'clockRightTop' },
    { value: 'center', i18nKey: 'clockCenter' },
    { value: 'left-bottom', i18nKey: 'clockLeftBottom' },
    { value: 'right-bottom', i18nKey: 'clockRightBottom' },
    { value: 'custom', i18nKey: 'clockCustom' }
  ];

  clockPosOptions.forEach(opt => {
    const el = document.createElement('div');
    el.className = 'rotate-option';
    el.setAttribute('data-value', opt.value);
    el.setAttribute('data-i18n-key', opt.i18nKey);
    el.textContent = t(opt.i18nKey);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      applyClockCustomPos(opt.value);
      clockPosDropdown.classList.remove('open');
    });
    clockPosList.appendChild(el);
  });

  let clockDrag = null;
  const LS_CLOCK_CUSTOM_X = 'clockCustomX';
  const LS_CLOCK_CUSTOM_Y = 'clockCustomY';

  function isClockLocked() {
    return localStorage.getItem(LS_CLOCK_LOCKED) === 'true';
  }

  function setClockLocked(locked) {
    localStorage.setItem(LS_CLOCK_LOCKED, locked ? 'true' : 'false');
    if (clockCustomLock) clockCustomLock.classList.toggle('locked', locked);
    if (clockCustomXInput) { clockCustomXInput.disabled = locked; clockCustomYInput.disabled = locked; }
    if (locked) {
      disableClockDrag();
    } else {
      enableClockDrag();
    }
  }

  function syncInputsFromClock() {
    if (!clockEl) return;
    const left = parseInt(clockEl.style.left) || 0;
    const top = parseInt(clockEl.style.top) || 0;
    if (clockCustomXInput) clockCustomXInput.value = left;
    if (clockCustomYInput) clockCustomYInput.value = top;
  }

  function enableClockDrag() {
    if (!clockEl || isClockLocked()) return;
    clockEl.style.cursor = 'grab';
    clockEl.addEventListener('mousedown', onClockDragStart);
    clockEl.addEventListener('touchstart', onClockDragStart, { passive: false });
  }

  function disableClockDrag() {
    if (!clockEl) return;
    clockEl.style.cursor = '';
    clockEl.removeEventListener('mousedown', onClockDragStart);
    clockEl.removeEventListener('touchstart', onClockDragStart, { passive: false });
  }

  function onClockDragStart(e) {
    if (isClockLocked()) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = clockEl.getBoundingClientRect();
    clockDrag = {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      startX: rect.left,
      startY: rect.top
    };
    clockEl.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onClockDragMove);
    document.addEventListener('mouseup', onClockDragEnd);
    document.addEventListener('touchmove', onClockDragMove, { passive: false });
    document.addEventListener('touchend', onClockDragEnd);
  }

  function onClockDragMove(e) {
    if (!clockDrag) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = Math.max(0, Math.min(clientX - clockDrag.offsetX, window.innerWidth - clockEl.offsetWidth));
    const y = Math.max(0, Math.min(clientY - clockDrag.offsetY, window.innerHeight - clockEl.offsetHeight));
    clockEl.style.left = x + 'px';
    clockEl.style.top = y + 'px';
    clockEl.style.right = '';
    clockEl.style.bottom = '';
    syncInputsFromClock();
  }

  function onClockDragEnd() {
    if (!clockDrag) return;
    clockEl.style.cursor = 'grab';
    localStorage.setItem(LS_CLOCK_CUSTOM_X, clockEl.style.left);
    localStorage.setItem(LS_CLOCK_CUSTOM_Y, clockEl.style.top);
    clockDrag = null;
    document.removeEventListener('mousemove', onClockDragMove);
    document.removeEventListener('mouseup', onClockDragEnd);
    document.removeEventListener('touchmove', onClockDragMove);
    document.removeEventListener('touchend', onClockDragEnd);
  }

  function applyClockCustomPos(pos) {
    if (!clockEl || !posMap[pos]) return;
    disableClockDrag();
    if (pos === 'custom') {
      clockEl.style.position = 'fixed';
      clockEl.style.right = ''; clockEl.style.bottom = '';
      const sx = localStorage.getItem(LS_CLOCK_CUSTOM_X);
      const sy = localStorage.getItem(LS_CLOCK_CUSTOM_Y);
      if (sx && sy) {
        clockEl.style.left = sx;
        clockEl.style.top = sy;
      } else {
        clockEl.style.left = '40px';
        clockEl.style.top = '40px';
      }
      if (clockCustomPanel) clockCustomPanel.classList.remove('hidden');
      syncInputsFromClock();
      if (!isClockLocked()) enableClockDrag();
    } else {
      if (clockCustomPanel) clockCustomPanel.classList.add('hidden');
      if (pos === 'center') {
        clockEl.style.position = '';
        clockEl.style.top = ''; clockEl.style.left = '';
        clockEl.style.right = ''; clockEl.style.bottom = '';
      } else {
        const p = posMap[pos];
        clockEl.style.position = 'fixed';
        clockEl.style.top = p.top; clockEl.style.left = p.left;
        clockEl.style.right = p.right; clockEl.style.bottom = p.bottom;
      }
    }
    const opt = clockPosOptions.find(o => o.value === pos);
    if (opt) clockPosTrigger.textContent = t(opt.i18nKey);
    clockPosList.querySelectorAll('.rotate-option').forEach(o => {
      o.classList.toggle('active', o.getAttribute('data-value') === pos);
    });
    localStorage.setItem(LS_CLOCK_CUSTOM_POS, pos);
  }

  clockPosTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    clockPosDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!clockPosDropdown.contains(e.target)) clockPosDropdown.classList.remove('open');
  });

  if (clockCustomLock) {
    setClockLocked(isClockLocked());
    clockCustomLock.addEventListener('click', () => {
      setClockLocked(!isClockLocked());
    });
  }

  function applyInputsToClock() {
    if (!clockEl || isClockLocked()) return;
    const x = parseInt(clockCustomXInput.value) || 0;
    const y = parseInt(clockCustomYInput.value) || 0;
    const cx = Math.max(0, Math.min(x, window.innerWidth - clockEl.offsetWidth));
    const cy = Math.max(0, Math.min(y, window.innerHeight - clockEl.offsetHeight));
    clockEl.style.left = cx + 'px';
    clockEl.style.top = cy + 'px';
    clockEl.style.right = '';
    clockEl.style.bottom = '';
    localStorage.setItem(LS_CLOCK_CUSTOM_X, clockEl.style.left);
    localStorage.setItem(LS_CLOCK_CUSTOM_Y, clockEl.style.top);
    if (clockCustomXInput) clockCustomXInput.value = cx;
    if (clockCustomYInput) clockCustomYInput.value = cy;
  }

  if (clockCustomXInput) {
    clockCustomXInput.addEventListener('change', applyInputsToClock);
  }
  if (clockCustomYInput) {
    clockCustomYInput.addEventListener('change', applyInputsToClock);
  }

  const clockContextMenu = document.getElementById('clockContextMenu');
  const clockMenuX = document.getElementById('clockMenuX');
  const clockMenuY = document.getElementById('clockMenuY');
  const clockMenuApply = document.getElementById('clockMenuApply');
  const clockMenuLock = document.getElementById('clockMenuLock');

  function updateClockMenuLockIcon() {
    if (clockMenuLock) clockMenuLock.classList.toggle('locked', isClockLocked());
  }

  function showClockContextMenu(x, y) {
    if (!clockContextMenu) return;
    const rect = clockEl.getBoundingClientRect();
    const locked = isClockLocked();
    if (clockMenuX) { clockMenuX.value = Math.round(rect.left); clockMenuX.disabled = locked; }
    if (clockMenuY) { clockMenuY.value = Math.round(rect.top); clockMenuY.disabled = locked; }
    updateClockMenuLockIcon();
    let mx = x, my = y;
    if (mx + 170 > window.innerWidth) mx = window.innerWidth - 175;
    if (my + 80 > window.innerHeight) my = window.innerHeight - 85;
    clockContextMenu.style.left = mx + 'px';
    clockContextMenu.style.top = my + 'px';
    clockContextMenu.classList.add('show');
  }

  function hideClockContextMenu() {
    if (clockContextMenu) clockContextMenu.classList.remove('show');
  }

  if (clockEl) {
    clockEl.addEventListener('contextmenu', (e) => {
      if ((localStorage.getItem(LS_CLOCK_CUSTOM_POS) || 'center') !== 'custom') return;
      e.preventDefault();
      e.stopPropagation();
      showClockContextMenu(e.clientX, e.clientY);
    });
  }

  if (clockMenuApply) {
    clockMenuApply.addEventListener('click', () => {
      if (isClockLocked()) return;
      const x = parseInt(clockMenuX.value) || 0;
      const y = parseInt(clockMenuY.value) || 0;
      const cx = Math.max(0, Math.min(x, window.innerWidth - (clockEl ? clockEl.offsetWidth : 0)));
      const cy = Math.max(0, Math.min(y, window.innerHeight - (clockEl ? clockEl.offsetHeight : 0)));
      if (clockEl) {
        clockEl.style.left = cx + 'px';
        clockEl.style.top = cy + 'px';
        clockEl.style.right = '';
        clockEl.style.bottom = '';
      }
      localStorage.setItem(LS_CLOCK_CUSTOM_X, cx + 'px');
      localStorage.setItem(LS_CLOCK_CUSTOM_Y, cy + 'px');
      syncInputsFromClock();
      hideClockContextMenu();
    });
  }

  if (clockMenuLock) {
    clockMenuLock.addEventListener('click', () => {
      const locked = !isClockLocked();
      setClockLocked(locked);
      if (clockMenuX) clockMenuX.disabled = locked;
      if (clockMenuY) clockMenuY.disabled = locked;
      updateClockMenuLockIcon();
    });
  }

  document.addEventListener('click', (e) => {
    if (clockContextMenu && !clockContextMenu.contains(e.target)) hideClockContextMenu();
  });

  const savedClockPos = localStorage.getItem(LS_CLOCK_CUSTOM_POS) || 'center';
  applyClockCustomPos(savedClockPos);

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

  const languageSeg = document.getElementById('languageSeg');
  if (languageSeg) {
    languageSeg.querySelectorAll('.theme-mode-opt').forEach(btn => {
      btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    });
  }

  window.refreshI18n = function() {
    if (customEngineForm.classList.contains('open')) closeCustomEngineForm();
    populateEngineManager();
    populateDefaultEngineManager();
    renderWallpaperGrid();
    if (wallpaperRotateEditBtn) {
      wallpaperRotateEditBtn.textContent = wallpaperEditMode ? t('btnConfirm') : t('wallpaperRotateEdit');
    }
    const savedRotation = localStorage.getItem(LS_WALLPAPER_ROTATE) || 'off';
    const opt = rotateOptions.find(o => o.value === savedRotation);
    if (opt) rotateTrigger.textContent = t(opt.i18nKey);
    rotateList.querySelectorAll('.rotate-option').forEach(o => {
      const key = o.getAttribute('data-i18n-key');
      if (key) o.textContent = t(key);
    });
    rotateSizer.querySelectorAll('span').forEach((sz, i) => {
      if (rotateOptions[i]) sz.textContent = t(rotateOptions[i].i18nKey);
    });
    const savedClockPos = localStorage.getItem(LS_CLOCK_CUSTOM_POS) || 'center';
    const cOpt = clockPosOptions.find(o => o.value === savedClockPos);
    if (cOpt) clockPosTrigger.textContent = t(cOpt.i18nKey);
    clockPosList.querySelectorAll('.rotate-option').forEach(o => {
      const key = o.getAttribute('data-i18n-key');
      if (key) o.textContent = t(key);
    });
    const ceTitle = document.getElementById('customEngineFormTitle');
    const ceSave = document.getElementById('customEngineSave');
    if (ceTitle && ceSave) {
      if (ceEditingId) {
        ceTitle.textContent = t('editCustomEngine');
        ceSave.textContent = t('btnUpdate');
      } else {
        ceTitle.textContent = t('addCustomEngine');
        ceSave.textContent = t('btnAdd');
      }
    }
    const historyDD = document.getElementById('history-dropdown');
    if (historyToggle && historyToggle.checked && historyDD && historyDD.classList.contains('show')) {
      const filter = searchInput.value.trim();
      renderHistoryList(filter);
    }
  };

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  sidebarOverlay.addEventListener('click', closeSidebar);

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

  const sidebarNav = sidebar.querySelector('.sidebar-nav');
  const navItems = sidebar.querySelectorAll('.sidebar-nav-item');

  const navHighlight = document.createElement('div');
  navHighlight.className = 'nav-highlight';
  sidebarNav.appendChild(navHighlight);

  function moveHighlight(target) {
    const navRect = sidebarNav.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    navHighlight.style.top = (targetRect.top - navRect.top) + 'px';
    navHighlight.style.height = targetRect.height + 'px';
  }

  const initActive = sidebar.querySelector('.sidebar-nav-item.active');
  if (initActive) {
    requestAnimationFrame(() => moveHighlight(initActive));
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const panelId = item.dataset.panel;
      if (!panelId || item.classList.contains('active')) return;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      moveHighlight(item);

      sidebar.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('sidebarPanel' + panelId.charAt(0).toUpperCase() + panelId.slice(1));
      if (panel) panel.classList.add('active');
    });
  });

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

    if (dataUrl.startsWith('data:image/svg')) {
      callback(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = function () {
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      if (w <= MAX_DIM && h <= MAX_DIM) {
        callback(dataUrl);
        return;
      }

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
  }

  let wallpaperEditMode = false;
  let wallpaperEditChecked = new Set();

  function renderWallpaperGrid() {
    const history = getWallpaperHistory();
    const current = localStorage.getItem(LS_BG);
    wallpaperGrid.innerHTML = '';
    if (history.length === 0) {
      wallpaperGrid.innerHTML = '<div class="wallpaper-empty">' + t('noHistoryWallpaper') + '</div>';
      return;
    }
    const pool = getRotationPool();
    if (wallpaperEditMode) {
      wallpaperGrid.classList.add('edit-mode');
      wallpaperEditChecked = new Set(pool);
    } else {
      wallpaperGrid.classList.remove('edit-mode');
    }
    history.forEach(dataUrl => {
      const item = document.createElement('div');
      item.className = 'wallpaper-item';
      if (dataUrl === current) item.classList.add('active');

      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = '';
      item.appendChild(img);

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
        showToast(t('toastSwitchSuccess'), 2000, 'success');
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'wallpaper-delete';
      delBtn.textContent = t('btnDelete');
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (dataUrl === localStorage.getItem(LS_BG)) {
          showToast(t('toastWallpaperInUse'));
          return;
        }
        const list = getWallpaperHistory().filter(item => item !== dataUrl);
        saveWallpaperHistory(list);

        const p = getRotationPool().filter(u => u !== dataUrl);
        saveRotationPool(p);
        wallpaperEditChecked.delete(dataUrl);
        if (p.length < 2) selectRotation('off');
        renderWallpaperGrid();
      });
      item.appendChild(delBtn);
      wallpaperGrid.appendChild(item);
    });
  }

  wallpaperRotateEditBtn.addEventListener('click', () => {
    if (wallpaperEditMode) {

      const checked = Array.from(wallpaperEditChecked);
      saveRotationPool(checked);
      wallpaperEditMode = false;
      wallpaperRotateEditBtn.textContent = t('wallpaperRotateEdit');
      renderWallpaperGrid();
      showToast(t('toastRotateUpdated'), 2000, 'success');

      if (checked.length < 2) {
        selectRotation('off');
        return;
      }

      const rotation = localStorage.getItem(LS_WALLPAPER_ROTATE) || 'off';
      if (rotation !== 'off') {
        const cur = localStorage.getItem(LS_BG);
        if (cur && !checked.includes(cur)) doWallpaperRotate();
      }
    } else {

      wallpaperEditMode = true;
      wallpaperRotateEditBtn.textContent = t('btnConfirm');
      renderWallpaperGrid();
    }
  });

  wallpaperCancel.addEventListener('click', () => {
    wallpaperEditMode = false;
    wallpaperRotateEditBtn.textContent = t('wallpaperRotateEdit');
    wallpaperModal.classList.remove('show');
  });

  document.getElementById('sidebarWallpaperThumb').addEventListener('click', () => {
    renderWallpaperGrid();
    wallpaperModal.classList.add('show');
  });

  wallpaperImportBtn.addEventListener('click', () => wallpaperFileInput.click());

  wallpaperFileInput.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast(t('toastSelectImage'), 3000);
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
          showToast(t('toastImportSuccess'), 2000, 'success');
        } catch (e) {
          showToast(t('toastStorageFull'), 3000);
        }
      });
    };
    reader.onerror = function () {
      showToast(t('toastFileReadError'), 3000);
      wallpaperFileInput.value = '';
    };
    try {
      reader.readAsDataURL(file);
    } catch (e) {
      showToast(t('toastCannotReadFile'), 3000);
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
    selectRotation('off');
    resetWallpaper();
    renderWallpaperGrid();
    sidebarOverlaySlider.value = '0.3';
    sidebarOverlayVal.textContent = '30%';
    document.body.style.setProperty('--overlay-opacity', '0.3');
    localStorage.removeItem('overlayOpacity');
    updateWallpaperThumb();
    showToast(t('toastRestored'), 2000, 'success');
  });

  document.getElementById('wallpaperClearBtn').addEventListener('click', () => {
    const current = localStorage.getItem(LS_BG);
    if (current) {
      localStorage.setItem(LS_WH, JSON.stringify([current]));
    } else {
      localStorage.removeItem(LS_WH);
    }
    renderWallpaperGrid();
    showToast(t('toastCleared'), 2000, 'success');
  });

  const rotateDropdown = document.getElementById('wallpaperRotateDropdown');
  const rotateTrigger = document.getElementById('rotateTrigger');
  const rotateSizer = document.getElementById('rotateSizer');
  const rotateList = document.getElementById('rotateList');
  const LS_WALLPAPER_ROTATE = 'wallpaperRotation';
  const rotateOptions = [
    { value: 'off', label: '不进行轮换', i18nKey: 'rotateOff' },
    { value: '1h',  label: '每 1 小时轮换', i18nKey: 'rotate1h' },
    { value: '6h',  label: '每 6 小时轮换', i18nKey: 'rotate6h' },
    { value: '12h', label: '每 12 小时轮换', i18nKey: 'rotate12h' },
    { value: '24h', label: '每 24 小时轮换', i18nKey: 'rotate24h' }
  ];
  let rotateTimer = null;

  rotateOptions.forEach(opt => {
    const el = document.createElement('div');
    el.className = 'rotate-option';
    el.setAttribute('data-value', opt.value);
    el.setAttribute('data-i18n-key', opt.i18nKey);
    el.textContent = t(opt.i18nKey);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectRotation(opt.value);
      rotateDropdown.classList.remove('open');
    });
    rotateList.appendChild(el);

    const sz = document.createElement('span');
    sz.textContent = t(opt.i18nKey);
    rotateSizer.appendChild(sz);
  });

  function selectRotation(value) {

    if (value !== 'off' && getRotationPool().length < 2) {
      showToast(t('toastConfigPoolFirst'), 2000);
      return;
    }
    const opt = rotateOptions.find(o => o.value === value);
    if (opt) rotateTrigger.textContent = t(opt.i18nKey);
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
    const pool = getRotationPool();
    if (pool.length < 2) return;
    const history = getWallpaperHistory();
    const candidates = pool.filter(u => history.includes(u));
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
    if (getRotationPool().length < 2) {
      showToast(t('toastConfigPoolFirst'), 2000);
      return;
    }
    doWallpaperRotate();
    showToast(t('toastRotated'), 1500, 'success');
  });

  rotateTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    rotateDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!rotateDropdown.contains(e.target)) rotateDropdown.classList.remove('open');
  });

  const savedRotation = localStorage.getItem(LS_WALLPAPER_ROTATE) || 'off';

  if (savedRotation !== 'off' && getRotationPool().length < 2) {
    localStorage.setItem(LS_WALLPAPER_ROTATE, 'off');
    selectRotation('off');
  } else {
    selectRotation(savedRotation);
  }

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

  const sidebarOpacitySlider = document.getElementById('sidebarOpacitySlider');
  const sidebarOpacityVal = document.getElementById('sidebarOpacityVal');
  const LS_SIDEBAR_OPACITY = 'sidebarOpacity';
  const savedSidebarOpacity = localStorage.getItem(LS_SIDEBAR_OPACITY) || '1';

  function applySidebarOpacity(v) {
    const opacity = parseFloat(v);
    document.body.style.setProperty('--sidebar-opacity', v);

    const factor = (opacity - 0.2) / 0.8;
    const mainGray = Math.round(51 * factor);
    const navGray = Math.round(51 + 71 * factor);
    const labelGray = Math.round(51 + 85 * factor);
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

    const saved = localStorage.getItem(key);
    apply(saved !== 'false');
  })();

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

  document.getElementById('searchBoxResetBtn').addEventListener('click', () => {
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
      updateSliderTrack(document.getElementById(d.slider));
    });
    showToast(t('toastSearchReset'), 1500, 'success');
  });

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
  let ceOpenFor = null;

  const ceIconWhitePreview = document.getElementById('customEngineIconWhitePreview');
  const ceIconDefaultPreview = document.getElementById('customEngineIconDefaultPreview');

  function readIconFile(file, inputEl, nameEl, previewEl, onDone) {
    if (!file.type.includes('svg')) {
      showToast(t('toastSelectSvg'), 3000);
      inputEl.value = '';
      return;
    }
    if (file.size > 512 * 1024) {
      showToast(t('toastIconTooLarge'), 3000);
      inputEl.value = '';
      return;
    }
    nameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => { onDone(reader.result); previewEl.src = reader.result; };
    reader.onerror = () => { showToast(t('toastIconReadFailed'), 3000); inputEl.value = ''; };
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

    if (ceOpenFor === triggerKey && customEngineForm.classList.contains('open')) {
      closeCustomEngineForm();
      return;
    }

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
        title.textContent = t('editCustomEngine');
        saveBtn.textContent = t('btnUpdate');
        deleteBtn.style.display = '';
      }
    } else {
      customEngineName.value = '';
      customEngineUrl.value = '';
      title.textContent = t('addCustomEngine');
      saveBtn.textContent = t('btnAdd');
      deleteBtn.style.display = 'none';
    }

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

    requestAnimationFrame(() => {
      customEngineForm.classList.add('open');
    });
  }

  function closeCustomEngineForm() {
    customEngineForm.classList.remove('open');
    ceOpenFor = null;

    if (customEngineForm.parentNode === engineManager) {
      engineManager.parentNode.insertBefore(customEngineForm, engineManager);
    }
  }

  customEngineCancel.addEventListener('click', closeCustomEngineForm);

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
    showToast(t('toastDeleteSuccess'));
  });

  customEngineSave.addEventListener('click', () => {
    const name = customEngineName.value.trim();
    const url = customEngineUrl.value.trim();
    if (!name || !url) { showToast(t('toastFillNameUrl')); return; }
    if (!ceWhiteData || !ceDefaultData) { showToast(t('toastSelectIcons')); return; }
    const slug = nameToSlug(name);
    let list = getCustomEngines();

    const allNames = [t('engineBing'), 'Google', 'GitHub', t('engineBaidu')];
    list.forEach(e => { if (e.id !== ceEditingId) allNames.push(e.name); });
    if (allNames.some(n => n === name)) { showToast(t('toastNameExists')); return; }

    const dupUrl = list.find(e => e.url === url && e.id !== ceEditingId);
    if (dupUrl) { showToast(t('toastUrlDuplicate', { name: dupUrl.name })); return; }

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
    showToast(ceEditingId ? t('toastUpdateSuccess', { name: name }) : t('toastAddSuccess', { name: name }), 2000, 'success');
  });

  const resetSettingsBtn = document.getElementById('sidebarResetBtn');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(t('confirmReset'))) return;
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
      localStorage.removeItem('clockCustomX');
      localStorage.removeItem('clockCustomY');
      localStorage.removeItem('clockCustomLocked');
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
      showToast(t('toastSettingsReset'));
    });
  }

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
        if (!cb.checked && key === def) { cb.checked = true; showToast(t('toastDefaultEngineLocked')); return; }
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
    addBtn.innerHTML = t('btnManualAdd') + '<img class="add-icon" src="./icons/add-white.svg" alt="">';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCustomEngineForm();
    });
    engineManager.appendChild(addBtn);
  }

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

  const contextMenu = document.getElementById('contextMenu');

  function nextWallpaperSequential() {
    const pool = getRotationPool();
    const history = getWallpaperHistory();
    const candidates = pool.length >= 2 ? pool.filter(u => history.includes(u)) : history;
    if (candidates.length < 2) {
      showToast(t('toastNeedTwoWallpapers'), 2000);
      return;
    }
    const current = localStorage.getItem(LS_BG);
    const curIdx = candidates.indexOf(current);
    const nextIdx = curIdx < 0 ? 0 : (curIdx + 1) % candidates.length;
    applyWallpaper(candidates[nextIdx]);
    showToast(t('toastWallpaperSwitched'), 1500, 'success');
  }

  document.addEventListener('contextmenu', (e) => {

    if (e.target.closest('.sidebar, .sidebar-overlay, .search-input, .search-wrapper, .modal-overlay, .settings-wrap, input, button, a')) return;
    e.preventDefault();
    let x = e.clientX;
    let y = e.clientY;
    const mw = 160;
    const mh = 80;
    if (x + mw > window.innerWidth) x = window.innerWidth - mw - 4;
    if (y + mh > window.innerHeight) y = window.innerHeight - mh - 4;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('show');
  });

  contextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item) return;
    const action = item.dataset.action;
    contextMenu.classList.remove('show');
    if (action === 'settings') {
      openSidebar();
    } else if (action === 'next-wallpaper') {
      nextWallpaperSequential();
    }
  });

  document.addEventListener('click', () => {
    contextMenu.classList.remove('show');
  });
})();

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

  Array.from(document.querySelectorAll('.engine-item')).forEach((item, idx) => {
    if (!item.hasAttribute('data-index')) item.setAttribute('data-index', idx);
  });

  function applyEngineVisibility() {
    const disabled = new Set(JSON.parse(localStorage.getItem(LS_DISABLED) || '[]'));

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

    const column = el.querySelector('.engine-column');
    if (column) {
      Array.from(column.querySelectorAll('.engine-item'))
        .sort((a, b) => (Number(a.getAttribute('data-index') || 9999) - Number(b.getAttribute('data-index') || 9999)))
        .forEach(item => column.appendChild(item));
    }

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

document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.search-input-wrap');
  if (wrap && !wrap.contains(e.target)) hideHistoryDropdown();
});

const defaultEngineManager = document.getElementById('sidebarDefaultEngineList');

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
    if (disabled.has(key)) return;
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

  if (!defaultEngineManager.querySelector('input[name="defaultEngine"]:checked') && first) {
    const fb = defaultEngineManager.querySelector(`input[name="defaultEngine"][value="${first}"]`);
    if (fb) fb.checked = true;
  }
}

if (defaultEngineManager) defaultEngineManager.addEventListener('change', (e) => {
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
