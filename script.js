// 页面加载后禁用搜索框的浏览器自动补全
window.addEventListener('load', () => {
  const input = document.getElementById('search-input');
  input.setAttribute('autocomplete', 'off');
  setTimeout(() => input.setAttribute('autocomplete', 'off'), 100);
});

// 数字时钟:每秒刷新时间显示
function updateDigitalClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  document.getElementById('digital-clock').textContent = `${h}:${m}:${s}`;
}

// 隐藏/显示数字时钟
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
let suggestionTimer = null;
let dropdownSelectedIndex = -1;
// 底部提示气泡,自动消失,可指定成功/错误样式
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

// 内置搜索引擎及搜索 URL
const engines = {
  bing:  { url: 'https://cn.bing.com/search?q=' },
  google: { url: 'https://www.google.com/search?q=' },
  github: { url: 'https://github.com/search?q=' },
  baidu:  { url: 'https://www.baidu.com/s?wd=' }
};

// 当前选中引擎及其图标
let currentEngine = 'bing';
let currentEngineIcon = './icons/bing-default.svg';

// localStorage 存储键常量
const LS_DEFAULT_ENGINE = 'preferredDefaultEngine';
const LS_DISABLED = 'disabledEngines';
const LS_SEARCH_HISTORY = 'searchHistory';
const LS_SEARCH_HISTORY_ENABLED = 'searchHistoryEnabled';
const LS_CLOCK_VISIBLE = 'clockVisible';
const LS_CLOCK_COLOR = 'clockColor';
const LS_SEARCH_COLOR = 'searchColor';
const LS_CLOCK_SEARCH_LINK = 'clockSearchLink';
const LS_SUGGESTION_PROVIDER = 'suggestionProvider';
const LS_CUSTOM_ENGINES = 'customEngines';
const MAX_WALLPAPER_HISTORY = 12;
const MAX_HISTORY_ITEMS = 20;

// 搜索历史:保存、读取、开关控制(最多 20 条,去重)
function saveSearchHistory(keyword) {
  if (!isSearchHistoryEnabled() || !keyword.trim()) return;
  let history = getSearchHistory().filter(item => item !== keyword);
  history.unshift(keyword);
  if (history.length > MAX_HISTORY_ITEMS) history = history.slice(0, MAX_HISTORY_ITEMS);
  localStorage.setItem(LS_SEARCH_HISTORY, JSON.stringify(history));
}

// 读取 localStorage 中的 JSON 数组,缺失/非法时返回空数组
function readJsonArray(key) {
  try {
    const d = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(d) ? d : [];
  } catch (e) { return []; }
}

// hex 颜色(#rrggbb)转 {r,g,b}(0-255)
function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function getSearchHistory() {
  return readJsonArray(LS_SEARCH_HISTORY);
}

function isSearchHistoryEnabled() {
  return localStorage.getItem(LS_SEARCH_HISTORY_ENABLED) !== 'false';
}

function setSearchHistoryEnabled(enabled) {
  localStorage.setItem(LS_SEARCH_HISTORY_ENABLED, enabled.toString());
}

// 搜索结果是否在新标签页打开
function isOpenInNewTab() {
  return localStorage.getItem('openInNewTab') !== 'false';
}

function getSuggestionProvider() {
  return localStorage.getItem(LS_SUGGESTION_PROVIDER) || 'off';
}

function isSuggestionEnabled() {
  return getSuggestionProvider() !== 'off';
}

// 时钟显示开关的读写
function isClockVisible() {
  return localStorage.getItem(LS_CLOCK_VISIBLE) !== 'false';
}

function setClockVisible(visible) {
  localStorage.setItem(LS_CLOCK_VISIBLE, visible.toString());
}

// 名称转 slug:中文逐字转拼音,其余按小写字母/数字
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

// 自定义搜索引擎的读写
function getCustomEngines() {
  return readJsonArray(LS_CUSTOM_ENGINES);
}

function saveCustomEngines(list) {
  localStorage.setItem(LS_CUSTOM_ENGINES, JSON.stringify(list));
}

// 把自定义引擎渲染进引擎列表
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
    item.setAttribute('data-default', ce.iconDefault);
    item.setAttribute('data-index', 100 + i);
    const icon = document.createElement('img');
    icon.className = 'engine-icon sm';
    icon.src = ce.iconDefault;
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

function cancelSuggestions() {
  if (suggestionTimer) { clearTimeout(suggestionTimer); suggestionTimer = null; }
}

// 按提供商拉取搜索建议(百度/谷歌/必应)
function fetchSuggestions(query) {
  cancelSuggestions();
  if (!query || !isSuggestionEnabled()) { renderHistoryList(query); return; }

  var provider = getSuggestionProvider();
  var url;

  if (provider === 'baidu') {
    url = 'https://suggestion.baidu.com/su?wd=' + encodeURIComponent(query) + '&p=3';
  } else if (provider === 'google') {
    url = 'https://suggestqueries.google.com/complete/search?client=chrome&q=' + encodeURIComponent(query);
  } else if (provider === 'bing') {
    url = 'https://api.bing.com/osjson.aspx?query=' + encodeURIComponent(query);
  } else {
    renderHistoryList(query);
    return;
  }

  fetch(url, { signal: AbortSignal.timeout(5000) })
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      if (provider === 'baidu') return response.arrayBuffer();
      return response.text();
    })
    .then(function(data) {
      var text;
      if (provider === 'baidu') {
        var decoder = new TextDecoder('gbk');
        text = decoder.decode(new Uint8Array(data));
      } else {
        text = data;
      }
      var suggestions = [];
      if (provider === 'baidu') {
        var m = text.match(/s\s*:\s*(\[[\s\S]*?\])/);
        if (m) {
          try { suggestions = JSON.parse(m[1]); } catch(e) {}
        }
      } else {
        try {
          var d = JSON.parse(text);
          suggestions = (d && Array.isArray(d[1])) ? d[1] : [];
        } catch(e) {}
      }
      renderSuggestionsList(suggestions);
    })
    .catch(function() {
      renderSuggestionsList([]);
    });
}

// 高亮键盘选中的下拉项并滚动到可见
function updateDropdownSelection() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const items = list.querySelectorAll('.history-item');
  items.forEach(function(item, i) {
    item.classList.toggle('active', i === dropdownSelectedIndex);
  });
  if (dropdownSelectedIndex >= 0 && items[dropdownSelectedIndex]) {
    items[dropdownSelectedIndex].scrollIntoView({ block: 'nearest' });
  }
}

// 渲染搜索建议下拉列表
function renderSuggestionsList(suggestions) {
  var dd = document.getElementById('history-dropdown');
  var list = document.getElementById('history-list');
  var title = document.getElementById('dropdown-title');
  var clearBtn = document.getElementById('clear-history-btn');
  if (!dd || !list) return;

  dropdownSelectedIndex = -1;

  if (!suggestions || suggestions.length === 0) {
    if (isSearchHistoryEnabled()) {
      renderHistoryList(searchInput.value.trim());
    } else {
      hideHistoryDropdown();
    }
    return;
  }

  if (title) { title.setAttribute('data-i18n', 'suggestionTitle'); title.textContent = t('suggestionTitle'); }
  if (clearBtn) clearBtn.style.display = 'none';
  dd.classList.add('suggestions');

  list.innerHTML = '';
  suggestions.forEach(function(item) {
    var row = document.createElement('div');
    row.className = 'history-item';

    var icon = document.createElement('img');
    icon.className = 'history-icon';
    icon.src = './icons/history-black.svg';
    icon.alt = '';
    row.appendChild(icon);

    var text = document.createElement('span');
    text.className = 'history-text';
    text.textContent = item;
    row.appendChild(text);

    row.addEventListener('click', function() {
      searchInput.value = item;
      hideHistoryDropdown();
      search();
    });
    list.appendChild(row);
  });

  showHistoryDropdown();
}

function showHistoryDropdown() {
  const dd = document.getElementById('history-dropdown');
  if (dd) { dd.classList.add('show'); searchInput.classList.add('expanded'); }
}

function hideHistoryDropdown() {
  const dd = document.getElementById('history-dropdown');
  if (dd) { dd.classList.remove('show'); searchInput.classList.remove('expanded'); }
  dropdownSelectedIndex = -1;
}

// 把命中区间 hits([[start,end),...])渲染进历史文本,命中段用 <span class="hl"> 高亮
function appendHighlighted(el, text, hits) {
  let pos = 0;
  for (const [s, e] of hits) {
    if (s > pos) el.appendChild(document.createTextNode(text.slice(pos, s)));
    const hl = document.createElement('span');
    hl.className = 'hl';
    hl.textContent = text.slice(s, e);
    el.appendChild(hl);
    pos = e;
  }
  if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
}

// 渲染搜索历史下拉列表(支持按拼音过滤),每项可点击/删除
function renderHistoryList(filter = '') {
  if (!isSearchHistoryEnabled()) { hideHistoryDropdown(); return; }
  const list = document.getElementById('history-list');
  const dd = document.getElementById('history-dropdown');
  if (!list || !dd) return;

  dropdownSelectedIndex = -1;

  var title = document.getElementById('dropdown-title');
  var clearBtn = document.getElementById('clear-history-btn');
  if (title) { title.setAttribute('data-i18n', 'historyTitle'); title.textContent = t('historyTitle'); }
  if (clearBtn) clearBtn.style.display = '';
  dd.classList.remove('suggestions');

  const history = getSearchHistory();
  // 评分排序:匹配质量优先,并列时按新鲜度(位置,index 0 最近)与命中位置
  let data = history.map((item, idx) => ({ item, idx, m: scorePinyinMatch(item, filter) }))
                    .filter(x => x.m);
  if (data.length === 0 && filter.trim()) {
    // 无匹配:与未输入时一致,回退显示全部历史(按最近优先,不高亮)
    data = history.map((item, idx) => ({ item, idx, m: { score: 0, first: -1, hits: [] } }));
  }
  data.sort((a, b) => b.m.score - a.m.score || a.idx - b.idx || a.m.first - b.m.first);

  list.innerHTML = '';

  if (data.length === 0) { hideHistoryDropdown(); return; }

  data.forEach(({ item, m }) => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const icon = document.createElement('img');
    icon.className = 'history-icon';
    icon.src = './icons/history-black.svg';
    icon.alt = '';
    row.appendChild(icon);

    const text = document.createElement('span');
    text.className = 'history-text';
    appendHighlighted(text, item, m.hits);
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

// 从 DOM/存储恢复当前选中引擎
function initEngineFromDOM() {
  const saved = localStorage.getItem(LS_DEFAULT_ENGINE);
  if (saved) {
    const el = engineListEl.querySelector(`.engine-item[data-engine="${saved}"]`);
    if (el) {
      engineListEl.querySelectorAll('.engine-item').forEach(i => i.classList.remove('active'));
      el.classList.add('active');
      currentEngine = saved;
      currentEngineIcon = el.dataset.default;
      return;
    }
  }
  const active = engineListEl.querySelector('.engine-item.active');
  if (active) {
    currentEngine = active.dataset.engine;
    currentEngineIcon = active.dataset.default;
  }
}
// 先注入自定义引擎,使 initEngineFromDOM 能恢复自定义默认引擎,且禁用引擎能被 applyEngineVisibility 正确归档
injectCustomEngines();
initEngineFromDOM();

if (engineIconWhite && engineIconDefault) {
  engineIconWhite.style.maskImage = 'url(' + currentEngineIcon + ')';
  engineIconWhite.style.webkitMaskImage = 'url(' + currentEngineIcon + ')';
  engineIconDefault.src = currentEngineIcon;
}

// 同步当前引擎图标(白色掩码 + 彩色图)与列表选中态
function updateEngineIcon() {
  if (!engineIconWrap || !searchInput) return;
  if (engineIconWhite) {
    engineIconWhite.style.maskImage = 'url(' + currentEngineIcon + ')';
    engineIconWhite.style.webkitMaskImage = 'url(' + currentEngineIcon + ')';
  }
  if (engineIconDefault && engineIconDefault.src !== currentEngineIcon) {
    engineIconDefault.src = currentEngineIcon;
  }
  const focused = document.activeElement === searchInput || searchInput.matches(':focus');
  engineIconWrap.classList.toggle('focused', focused);
  engineListEl.querySelectorAll('.engine-item').forEach(item => {
    const icon = item.querySelector('.engine-icon');
    if (!icon) return;
    const target = item.dataset.default;
    if (icon.src !== target) icon.src = target;
  });
}

const clearBtn = document.getElementById('clear-btn');
const searchBtn = document.getElementById('search-btn');

// 根据输入内容显示/隐藏清空与搜索按钮
function toggleBtns() {
  const has = searchInput.value.trim() !== '';
  clearBtn.style.display = has ? 'flex' : 'none';
  searchBtn.style.display = has ? 'flex' : 'none';
  updateEngineIcon();
}

// 执行搜索:记录历史并按设置在当前/新标签打开
function search() {
  const kw = searchInput.value.trim();
  if (!kw) return;
  saveSearchHistory(kw);
  const url = engines[currentEngine].url + encodeURIComponent(kw);
  if (isOpenInNewTab()) {
    window.open(url, '_blank');
  } else {
    window.location.href = url;
  }
  searchInput.value = '';
  toggleBtns();
}

// 输入时:更新按钮,防抖拉取建议或过滤历史
searchInput.addEventListener('input', function() {
  toggleBtns(); // 内部已调用 updateEngineIcon
  var value = searchInput.value.trim();

  if (suggestionTimer) clearTimeout(suggestionTimer);

  if (!value) {
    cancelSuggestions();
    if (isSuggestionEnabled() && isSearchHistoryEnabled() && getSearchHistory().length > 0) {
      renderHistoryList();
    } else {
      hideHistoryDropdown();
    }
    return;
  }

  suggestionTimer = setTimeout(function() {
    suggestionTimer = null;
    if (isSuggestionEnabled()) {
      fetchSuggestions(value);
    } else if (isSearchHistoryEnabled()) {
      var history = getSearchHistory();
      if (history.length === 0) { hideHistoryDropdown(); return; }
      renderHistoryList(value);
    } else {
      hideHistoryDropdown();
    }
  }, 100);
});

searchInput.addEventListener('change', () => setTimeout(toggleBtns, 100));
searchInput.addEventListener('webkitFillAvailable', toggleBtns);
searchInput.addEventListener('autocomplete', toggleBtns);

// 聚焦时展示建议/历史并隐藏时钟
searchInput.addEventListener('focus', function() {
  updateEngineIcon();
  var value = searchInput.value.trim();
  if (isSuggestionEnabled() && value) {
    fetchSuggestions(value);
  } else if (isSearchHistoryEnabled() && getSearchHistory().length > 0) {
    renderHistoryList(value);
  }
  hideDigitalClock();
});
// 失焦时取消建议并延迟收起下拉,恢复时钟显示
searchInput.addEventListener('blur', function() {
  updateEngineIcon();
  cancelSuggestions();
  setTimeout(hideHistoryDropdown, 150);
  showDigitalClock();
});
// 键盘控制:回车搜索,上下键选下拉项,Esc 关闭
searchInput.addEventListener('keydown', function(e) {
  const dd = document.getElementById('history-dropdown');
  const isOpen = dd && dd.classList.contains('show');

  if (e.key === 'Enter') {
    if (isOpen && dropdownSelectedIndex >= 0) {
      const items = dd.querySelectorAll('.history-item');
      if (items[dropdownSelectedIndex]) {
        searchInput.value = items[dropdownSelectedIndex].querySelector('.history-text').textContent;
        hideHistoryDropdown();
      }
    }
    search();
    e.preventDefault();
    return;
  }

  if (!isOpen) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const items = dd.querySelectorAll('.history-item');
    if (items.length === 0) return;
    dropdownSelectedIndex = Math.min(dropdownSelectedIndex + 1, items.length - 1);
    updateDropdownSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const items = dd.querySelectorAll('.history-item');
    if (items.length === 0) return;
    dropdownSelectedIndex = Math.max(dropdownSelectedIndex - 1, 0);
    updateDropdownSelection();
  } else if (e.key === 'Escape') {
    hideHistoryDropdown();
  }
});

// 清空按钮:清空输入并聚焦
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

// 引擎选择器下拉(带 300ms 防重开)
const engineSelectorEl = document.querySelector('.engine-selector');
let preventReopenUntil = 0;

if (engineSelectorEl && engineListEl) {
  // 点击引擎项:切换当前引擎并收起下拉
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
    currentEngineIcon = item.dataset.default;
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

// 侧边栏设置主逻辑(主题/壁纸/搜索/时钟/个性化等)
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

  // 打开/关闭侧边栏
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('show');
    settingsBtn.style.opacity = '1';
    populateEngineManager();
    populateDefaultEngineManager();
  }

  function closeSidebar() {
    closeAllPickers();
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('show');
    settingsBtn.style.opacity = '';
  }

  // 关闭所有打开的拾色器并恢复原色预览
  function closeAllPickers() {
    if (themePicker && themePicker.isOpen()) themePicker.close();
    if (clockPicker && clockPicker.isOpen()) clockPicker.close();
    if (searchPicker && searchPicker.isOpen()) searchPicker.close();
  }

  // 壁纸相关存储键与定时器
  const LS_WALLPAPER_SOURCE = 'wallpaperSource';
  const LS_BING_URL = 'bingWallpaperUrl';
  const LS_BING_DATE = 'bingWallpaperDate';
  const LS_BING_LIST = 'bingWallpaperList';
  const LS_BING_ROTATION = 'bingRotation';
  var rotateTimer = null;
  var bingMidnightTimer = null;

  // 不使用壁纸(纯黑背景)
  function applyNoneWallpaper() {
    [bgLayerA, bgLayerB].forEach(function(layer) {
      layer.style.backgroundImage = 'none';
      layer.style.backgroundColor = '#000';
      layer.style.opacity = '0';
    });
    bgLayerA.style.opacity = '1';
    bgActive = 'a';
  }

  var bingWallpaperCache = null;
  // 拉取必应每日壁纸列表(当日缓存,两张接口去重合并)
  function fetchBingWallpapers(callback) {
    var today = new Date().toISOString().slice(0, 10);
    var cachedDate = localStorage.getItem(LS_BING_DATE);
    var cachedList = null;
    try { cachedList = JSON.parse(localStorage.getItem(LS_BING_LIST) || 'null'); } catch(e) {}
    if (cachedDate === today && cachedList && cachedList.length) {
      bingWallpaperCache = cachedList;
      if (callback) callback(cachedList);
      return;
    }
    Promise.all([
      fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN').then(function(r) { return r.json(); }),
      fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=1&n=4&mkt=zh-CN').then(function(r) { return r.json(); })
    ])
      .then(function(results) {
        var list = [];
        var seen = {};
        results.forEach(function(data) {
          (data.images || []).forEach(function(img) {
            var url = 'https://www.bing.com' + img.url;
            if (!seen[url]) {
              seen[url] = true;
              list.push({ url: url, copyright: img.copyright || '' });
            }
          });
        });
        bingWallpaperCache = list;
        localStorage.setItem(LS_BING_DATE, today);
        localStorage.setItem(LS_BING_LIST, JSON.stringify(list));
        if (callback) callback(list);
      })
      .catch(function() {
        if (callback) callback(null);
      });
  }

  // 双图层淡入切换必应壁纸
  function applyBingWallpaper(url) {
    var img = new Image();
    img.onload = function() {
      var incoming = bgActive === 'a' ? bgLayerB : bgLayerA;
      var outgoing = bgActive === 'a' ? bgLayerA : bgLayerB;
      incoming.style.backgroundImage = 'url(' + url + ')';
      incoming.style.backgroundColor = '';
      requestAnimationFrame(function() {
        incoming.style.opacity = '1';
        outgoing.style.opacity = '0';
      });
      bgActive = bgActive === 'a' ? 'b' : 'a';
      updateWallpaperThumb();
    };
    img.onerror = function() {
      applyNoneWallpaper();
    };
    img.src = url;
  }

  // 渲染必应壁纸缩略图列表
  function renderBingList(list, activeUrl) {
    var container = document.getElementById('bingWallpaperList');
    if (!container) return;
    container.innerHTML = '';
    list.forEach(function(item) {
      var el = document.createElement('div');
      el.className = 'bing-wallpaper-item';
      if (item.url === activeUrl) el.classList.add('active');
      var thumb = document.createElement('img');
      thumb.src = item.url.replace('_1920x1080', '_320x180');
      thumb.alt = item.copyright;
      thumb.title = item.copyright;
      el.appendChild(thumb);
      el.addEventListener('click', function() {
        var idx = Array.prototype.indexOf.call(container.children, el);
        bingRotateIdx = idx;
        container.querySelectorAll('.bing-wallpaper-item').forEach(function(e) { e.classList.remove('active'); });
        el.classList.add('active');
        applyBingWallpaper(item.url);
        localStorage.setItem(LS_BING_URL, item.url);
      });
      container.appendChild(el);
    });
  }

  var bingRotateIdx = -1;
  // 轮换到下一张必应壁纸
  function rotateBingWallpaper() {
    if (!bingWallpaperCache || !bingWallpaperCache.length) return;
    bingRotateIdx = (bingRotateIdx + 1) % bingWallpaperCache.length;
    var pick = bingWallpaperCache[bingRotateIdx];
    applyBingWallpaper(pick.url);
    localStorage.setItem(LS_BING_URL, pick.url);
    var container = document.getElementById('bingWallpaperList');
    if (container) {
      container.querySelectorAll('.bing-wallpaper-item').forEach(function(e, i) {
        e.classList.toggle('active', i === bingRotateIdx);
      });
    }
  }

  // 切换壁纸来源(无/本地/必应),并联动显示对应控件
  // 轮换间隔 → i18n 词条映射(本地/Bing 共用)
  const ROTATE_I18N_MAP = { off: 'rotateOff', '1h': 'rotate1h', '6h': 'rotate6h', '12h': 'rotate12h', '24h': 'rotate24h' };

  function setWallpaperSource(source) {
    localStorage.setItem(LS_WALLPAPER_SOURCE, source);
    var seg = document.getElementById('wallpaperSourceSeg');
    if (seg) {
      seg.querySelectorAll('.theme-mode-opt').forEach(function(b) {
        b.classList.toggle('active', b.dataset.source === source);
      });
    }
    var localGroup = document.getElementById('wallpaperLocalGroup');
    var bingList = document.getElementById('bingWallpaperList');
    var overlayGroup = document.getElementById('wallpaperOverlayGroup');
    var rotateGroup = document.getElementById('wallpaperRotateGroup');
    var savedOverlay = localStorage.getItem('overlayOpacity') || '0.3';
    var savedBlur = localStorage.getItem('wallpaperBlur') || '0';
    if (source === 'none') {
      applyNoneWallpaper();
      if (localGroup) localGroup.classList.add('hidden');
      if (bingList) bingList.classList.add('hidden');
      if (overlayGroup) overlayGroup.classList.add('hidden');
      if (rotateGroup) rotateGroup.classList.add('hidden');
      document.body.style.setProperty('--overlay-opacity', '0');
      document.documentElement.style.setProperty('--blur-px', '0px');
      var ovSlider = document.getElementById('sidebarOverlaySlider');
      var ovVal = document.getElementById('sidebarOverlayVal');
      if (ovSlider) { ovSlider.value = '0'; ovVal.textContent = '0%'; }
      var blSlider = document.getElementById('sidebarBlurSlider');
      var blVal = document.getElementById('sidebarBlurVal');
      if (blSlider) { blSlider.value = '0'; blVal.textContent = '0px'; }
    } else if (source === 'local') {
      var savedBg = localStorage.getItem(LS_BG);
      if (savedBg) { applyWallpaper(savedBg); } else {
        [bgLayerA, bgLayerB].forEach(function(l) { l.style.backgroundImage = ''; l.style.backgroundColor = ''; });
        bgLayerA.style.opacity = '1'; bgLayerB.style.opacity = '0'; bgActive = 'a';
      }
      if (localGroup) localGroup.classList.remove('hidden');
      if (bingList) bingList.classList.add('hidden');
      if (overlayGroup) overlayGroup.classList.remove('hidden');
      if (rotateGroup) rotateGroup.classList.remove('hidden');
      document.body.style.setProperty('--overlay-opacity', savedOverlay);
      document.documentElement.style.setProperty('--blur-px', savedBlur + 'px');
      var ovS = document.getElementById('sidebarOverlaySlider');
      var ovV = document.getElementById('sidebarOverlayVal');
      if (ovS) { ovS.value = savedOverlay; ovV.textContent = Math.round(parseFloat(savedOverlay) * 100) + '%'; }
      var blS = document.getElementById('sidebarBlurSlider');
      var blV = document.getElementById('sidebarBlurVal');
      if (blS) { blS.value = savedBlur; blV.textContent = savedBlur + 'px'; }
      var lr = localStorage.getItem('wallpaperRotation') || 'off';
      if (lr !== 'off' && getRotationPool().length < 2) lr = 'off';
      startWallpaperRotation(lr);
      var lrKey = ROTATE_I18N_MAP[lr];
      var rt = document.getElementById('rotateTrigger');
      var rl = document.getElementById('rotateList');
      if (lrKey && rt) rt.textContent = t(lrKey);
      if (rl) rl.querySelectorAll('.rotate-option').forEach(function(o) { o.classList.toggle('active', o.getAttribute('data-value') === lr); });
    } else if (source === 'bing') {
      if (localGroup) localGroup.classList.add('hidden');
      if (bingList) bingList.classList.remove('hidden');
      if (overlayGroup) overlayGroup.classList.remove('hidden');
      if (rotateGroup) rotateGroup.classList.remove('hidden');
      document.body.style.setProperty('--overlay-opacity', savedOverlay);
      document.documentElement.style.setProperty('--blur-px', savedBlur + 'px');
      var ovS2 = document.getElementById('sidebarOverlaySlider');
      var ovV2 = document.getElementById('sidebarOverlayVal');
      if (ovS2) { ovS2.value = savedOverlay; ovV2.textContent = Math.round(parseFloat(savedOverlay) * 100) + '%'; }
      var blS2 = document.getElementById('sidebarBlurSlider');
      var blV2 = document.getElementById('sidebarBlurVal');
      if (blS2) { blS2.value = savedBlur; blV2.textContent = savedBlur + 'px'; }
      var br = localStorage.getItem('bingRotation') || 'off';
      startWallpaperRotation(br);
      var brKey = ROTATE_I18N_MAP[br];
      var rt2 = document.getElementById('rotateTrigger');
      var rl2 = document.getElementById('rotateList');
      if (brKey && rt2) rt2.textContent = t(brKey);
      if (rl2) rl2.querySelectorAll('.rotate-option').forEach(function(o) { o.classList.toggle('active', o.getAttribute('data-value') === br); });
      fetchBingWallpapers(function(list) {
        if (!list || !list.length) {
          applyNoneWallpaper();
          return;
        }
        if (localStorage.getItem(LS_WALLPAPER_SOURCE) !== 'bing') return;
        var activeUrl = localStorage.getItem(LS_BING_URL) || list[0].url;
        renderBingList(list, activeUrl);
        applyBingWallpaper(activeUrl);
        var idx = -1;
        for (var i = 0; i < list.length; i++) { if (list[i].url === activeUrl) { idx = i; break; } }
        bingRotateIdx = idx >= 0 ? idx : 0;
      });
    }
  }


  var wallpaperSourceSeg = document.getElementById('wallpaperSourceSeg');
  var savedSource = localStorage.getItem(LS_WALLPAPER_SOURCE) || 'none';
  if (wallpaperSourceSeg) {
    wallpaperSourceSeg.querySelectorAll('.theme-mode-opt').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.source === savedSource);
      btn.addEventListener('click', function() {
        setWallpaperSource(btn.dataset.source);
      });
    });
  }
  setWallpaperSource(savedSource);

  var bingListEl = document.getElementById('bingWallpaperList');
  if (bingListEl) {
    bingListEl.addEventListener('wheel', function(e) {
      e.preventDefault();
      bingListEl.scrollBy({ left: e.deltaY > 0 ? 120 : -120, behavior: 'smooth' });
    });
  }

  // 应用本地壁纸(双图层淡入),保存到存储并更新缩略图
  function applyWallpaper(dataUrl) {
    const incoming = bgActive === 'a' ? bgLayerB : bgLayerA;
    const outgoing = bgActive === 'a' ? bgLayerA : bgLayerB;
    incoming.style.backgroundImage = `url(${dataUrl})`;
    requestAnimationFrame(() => {
      incoming.style.opacity = '1';
      outgoing.style.opacity = '0';
    });
    bgActive = bgActive === 'a' ? 'b' : 'a';
    try { localStorage.setItem(LS_BG, dataUrl); } catch (e) { showToast(t('toastStorageFull'), 3000); }
    updateWallpaperThumb();
  }

  // 清除本地壁纸设置
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

  // 搜索历史开关
  if (historyToggle) {
    historyToggle.checked = isSearchHistoryEnabled();
    historyToggle.addEventListener('change', () => {
      setSearchHistoryEnabled(historyToggle.checked);
      if (!historyToggle.checked) hideHistoryDropdown();
    });
  }

  // 新标签页打开结果开关
  const newTabToggle = document.getElementById('sidebarNewTabToggle');
  if (newTabToggle) {
    newTabToggle.checked = isOpenInNewTab();
    newTabToggle.addEventListener('change', () => {
      localStorage.setItem('openInNewTab', newTabToggle.checked.toString());
    });
  }

  // 搜索建议提供商选择下拉(关闭/百度/谷歌/必应)
  (function() {
    var dropdown = document.getElementById('suggestionProviderDropdown');
    var trigger = document.getElementById('suggestionProviderTrigger');
    var list = document.getElementById('suggestionProviderList');
    if (!dropdown || !trigger || !list) return;

    var options = [
      { value: 'off',    i18nKey: 'suggestionOff' },
      { value: 'baidu',  i18nKey: 'suggestionBaidu' },
      { value: 'google', i18nKey: 'suggestionGoogle' },
      { value: 'bing',   i18nKey: 'suggestionBing' }
    ];

    options.forEach(function(opt) {
      var el = document.createElement('div');
      el.className = 'rotate-option';
      el.setAttribute('data-value', opt.value);
      el.setAttribute('data-i18n-key', opt.i18nKey);
      el.textContent = t(opt.i18nKey);
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        selectProvider(opt.value);
        dropdown.classList.remove('open');
      });
      list.appendChild(el);
    });

    function selectProvider(value) {
      var opt = options.find(function(o) { return o.value === value; });
      if (opt) trigger.textContent = t(opt.i18nKey);
      list.querySelectorAll('.rotate-option').forEach(function(o) {
        o.classList.toggle('active', o.getAttribute('data-value') === value);
      });
      localStorage.setItem(LS_SUGGESTION_PROVIDER, value);
    }

    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', function(e) {
      if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
    });

    selectProvider(getSuggestionProvider());

    window._sugOptions = options;
    window._sugTrigger = trigger;
    window._sugList = list;
    window._selectSuggestionProvider = selectProvider;
  })();

  // 时钟设置相关 DOM 与存储键
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

  // 时钟相对搜索框的上下位置
  function applyClockPosition(pos) {
    if (clockEl) {
      if (clockEl.classList.contains('follow-mode')) {
        clockEl.style.top = pos === 'above' ? 'auto' : '100%';
        clockEl.style.bottom = pos === 'above' ? '100%' : 'auto';
      }
    }
    if (clockPositionSeg) {
      clockPositionSeg.querySelectorAll('.theme-mode-opt').forEach(b => b.classList.toggle('active', b.dataset.pos === pos));
    }
    localStorage.setItem(LS_CLOCK_POS, pos);
  }

  // 按开关级联显示时钟相关设置行
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

  // 时钟自定义位置的锁定开关
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

  // 启用/禁用时钟拖拽
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

  // 拖拽中更新时钟位置并同步输入框
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

  // 应用时钟位置预设(6 个锚点)或自定义坐标
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

  // 时钟右键菜单(自定义位置时输入坐标/锁定)
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

  // 时钟是否跟随搜索框(绝对定位居中)
  function applyClockFollow(enabled) {
    if (clockEl) {
      if (enabled) {
        clockEl.style.position = 'absolute';
        clockEl.style.left = '50%';
        clockEl.style.transform = 'translateX(-50%) translate(var(--search-offset-x, 0px), var(--search-offset-y, 0px))';
        clockEl.classList.add('follow-mode');
        applyClockPosition(localStorage.getItem(LS_CLOCK_POS) || 'below');
      } else {
        clockEl.style.position = '';
        clockEl.style.left = '';
        clockEl.style.transform = '';
        clockEl.classList.remove('follow-mode');
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

  // 主题模式(系统/浅色/深色)
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

  // 界面语言切换
  const languageSeg = document.getElementById('languageSeg');
  if (languageSeg) {
    languageSeg.querySelectorAll('.theme-mode-opt').forEach(btn => {
      btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    });
  }

  // 语言切换后刷新侧边栏全部动态文案
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
    var savedSug = getSuggestionProvider();
    var sugOpt = (window._sugOptions || []).find(function(o) { return o.value === savedSug; });
    if (sugOpt && window._sugTrigger) window._sugTrigger.textContent = t(sugOpt.i18nKey);
    if (window._sugList) {
      window._sugList.querySelectorAll('.rotate-option').forEach(function(o) {
        var key = o.getAttribute('data-i18n-key');
        if (key) o.textContent = t(key);
      });
    }
    var dd = document.getElementById('history-dropdown');
    if (dd && dd.classList.contains('suggestions')) {
      var dtitle = document.getElementById('dropdown-title');
      if (dtitle) dtitle.textContent = t('suggestionTitle');
    }
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
    if (historyDD && historyDD.classList.contains('show')) {
      if (historyDD.classList.contains('suggestions')) {
        var sfilter = searchInput.value.trim();
        if (sfilter && isSuggestionEnabled()) fetchSuggestions(sfilter);
      } else if (historyToggle && historyToggle.checked) {
        const filter = searchInput.value.trim();
        renderHistoryList(filter);
      }
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
  // 主题色:保存到存储
  function applyAccent(hex) {
    previewAccent(hex);
    localStorage.setItem(LS_ACCENT, hex);
  }

  // 预览主题色:设置 CSS 变量并计算对比文字色
  function previewAccent(hex) {
    const { r, g, b } = hexToRgb(hex);
    document.body.style.setProperty('--accent', hex);
    document.body.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);

    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    var textColor = lum > 0.55 ? '#1a1a1a' : '#ffffff';
    document.body.style.setProperty('--accent-text', textColor);
    var cb = document.getElementById('pickerConfirmBtn');
    if (cb) cb.style.color = textColor;
  }

  // 时钟颜色:保存,若与搜索框联动则一并更新
  function applyClockColor(hex) {
    document.body.style.setProperty('--clock-color', hex);
    localStorage.setItem(LS_CLOCK_COLOR, hex);
    if (isClockSearchLinked) {
      previewSearchColor(hex);
      localStorage.setItem(LS_SEARCH_COLOR, hex);
      highlightSearchSwatch(hex);
    }
  }

  function previewClockColor(hex) {
    document.body.style.setProperty('--clock-color', hex);
    if (isClockSearchLinked) {
      const { r, g, b } = hexToRgb(hex);
      document.body.style.setProperty('--search-color', hex);
      document.body.style.setProperty('--search-color-rgb', r + ', ' + g + ', ' + b);
    }
  }

  // 搜索框文字颜色:保存,联动时同步时钟色
  function applySearchColor(hex) {
    previewSearchColor(hex);
    localStorage.setItem(LS_SEARCH_COLOR, hex);
    if (isClockSearchLinked) {
      document.body.style.setProperty('--clock-color', hex);
      localStorage.setItem(LS_CLOCK_COLOR, hex);
      highlightClockSwatch(hex);
    }
  }

  function previewSearchColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    document.body.style.setProperty('--search-color', hex);
    document.body.style.setProperty('--search-color-rgb', r + ', ' + g + ', ' + b);
    if (isClockSearchLinked) {
      document.body.style.setProperty('--clock-color', hex);
    }
  }

  const savedAccent = localStorage.getItem(LS_ACCENT) || '#2563eb';
  applyAccent(savedAccent);

  const themeColorRow = document.getElementById('themeColorRow');

  // 高亮当前主题色对应的预设色块
  function highlightSwatch(hex) {
    themeColorRow.querySelectorAll('.theme-color-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === hex);
    });
  }
  highlightSwatch(savedAccent);

  themeColorRow.querySelectorAll('.theme-color-swatch').forEach(s => {
    s.addEventListener('click', function() {
      if (s.id === 'colorPickerTrigger') return;
      const hex = s.dataset.color;
      applyAccent(hex);
      highlightSwatch(hex);
      if (themePicker && themePicker.isOpen()) themePicker.setFromHex(hex);
    });
  });

  const clockColorRow = document.getElementById('clockColorRow');
  const savedClockColor = localStorage.getItem(LS_CLOCK_COLOR) || '#ffffff';
  applyClockColor(savedClockColor);

  // 高亮当前时钟色预设色块
  function highlightClockSwatch(hex) {
    if (!clockColorRow) return;
    clockColorRow.querySelectorAll('.theme-color-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === hex);
    });
  }
  highlightClockSwatch(savedClockColor);

  if (clockColorRow) {
    clockColorRow.querySelectorAll('.theme-color-swatch').forEach(s => {
      s.addEventListener('click', function() {
        if (s.id === 'clockColorPickerTrigger') return;
        const hex = s.dataset.color;
        applyClockColor(hex);
        highlightClockSwatch(hex);
        if (clockPicker && clockPicker.isOpen()) clockPicker.setFromHex(hex);
      });
    });
  }

  const searchColorRow = document.getElementById('searchColorRow');
  const savedSearchColor = localStorage.getItem(LS_SEARCH_COLOR) || '#ffffff';
  applySearchColor(savedSearchColor);

  // 高亮当前搜索色预设色块
  function highlightSearchSwatch(hex) {
    if (!searchColorRow) return;
    searchColorRow.querySelectorAll('.theme-color-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === hex);
    });
  }
  highlightSearchSwatch(savedSearchColor);

  if (searchColorRow) {
    searchColorRow.querySelectorAll('.theme-color-swatch').forEach(s => {
      s.addEventListener('click', function() {
        if (s.id === 'searchColorPickerTrigger') return;
        const hex = s.dataset.color;
        applySearchColor(hex);
        highlightSearchSwatch(hex);
        if (searchPicker && searchPicker.isOpen()) searchPicker.setFromHex(hex);
      });
    });
  }


  // 主题色拾色器(HSV 画板 + 色相条)
  // ---- 取色器通用实现(主题/时钟/搜索三套共用) ----

  // HSV 颜色换算辅助函数
  function _h2rgb(pp, qq, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return pp + (qq - pp) * 6 * t;
    if (t < 1/2) return qq;
    if (t < 2/3) return pp + (qq - pp) * (2/3 - t) * 6;
    return pp;
  }

  function hslToRgb(h, s, l) {
    var ss = s / 100, ll = l / 100;
    var qq = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    var pp = 2 * ll - qq;
    var hh = h / 360;
    var r = Math.round(_h2rgb(pp, qq, hh + 1/3) * 255);
    var g = Math.round(_h2rgb(pp, qq, hh) * 255);
    var b = Math.round(_h2rgb(pp, qq, hh - 1/3) * 255);
    return {r: r, g: g, b: b};
  }

  function hslFromHex(hex) {
    const { r: r0, g: g0, b: b0 } = hexToRgb(hex);
    var r = r0 / 255, g = g0 / 255, b = b0 / 255;
    var max = Math.max(r,g,b), min = Math.min(r,g,b);
    var l = (max + min) / 2 * 100;
    var d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l / 100 - 1)) * 100;
    var hue = 0;
    if (d !== 0) {
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
    }
    hue = (hue * 60 + 360) % 360;
    return {h: hue, s: s, l: l};
  }

  // 拾色器工厂:画板/色相条/hex 输入/确认/触发器逻辑,三套共用
  function createColorPicker(cfg) {
    const { panel, palette, hueBar, hexInput, confirmBtn, trigger, savedKey, defaultColor, preview, apply, highlight } = cfg;
    if (!panel || !palette || !hueBar) return null;
    const pctx = palette.getContext('2d');
    const hctx = hueBar.getContext('2d');
    let hue = 0, sat = 100, lum = 50, size = 160, origColor = '';

    function drawHueBar() {
      for (var y = 0; y < size; y++) {
        var rgb = hslToRgb(y / size * 360, 100, 50);
        hctx.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
        hctx.fillRect(0, y, 20, 1);
      }
      var hy = Math.round(hue / 360 * size);
      var irgb = hslToRgb(hue, 100, 50);
      var l = (0.299 * irgb.r + 0.587 * irgb.g + 0.114 * irgb.b) / 255;
      hctx.fillStyle = l > 0.65 ? '#333' : '#fff';
      hctx.fillRect(0, hy - 3, 20, 5);
    }

    function drawPalette() {
      var prgb = hslToRgb(hue, 100, 50);
      pctx.clearRect(0, 0, size, size);
      var gradW = pctx.createLinearGradient(0, 0, size, 0);
      gradW.addColorStop(0, '#ffffff');
      gradW.addColorStop(1, 'rgb(' + prgb.r + ',' + prgb.g + ',' + prgb.b + ')');
      pctx.fillStyle = gradW;
      pctx.fillRect(0, 0, size, size);
      var gradB = pctx.createLinearGradient(0, 0, 0, size);
      gradB.addColorStop(0, 'transparent');
      gradB.addColorStop(1, '#000000');
      pctx.fillStyle = gradB;
      pctx.fillRect(0, 0, size, size);
      var px = Math.round(sat / 100 * size);
      var py = Math.round((100 - lum) / 100 * size);
      var crgb = hslToRgb(hue, sat, lum);
      var plum = (0.299 * crgb.r + 0.587 * crgb.g + 0.114 * crgb.b) / 255;
      pctx.strokeStyle = plum > 0.55 ? '#333' : '#fff';
      pctx.lineWidth = 2;
      pctx.beginPath();
      pctx.arc(px, py, 3.5, 0, Math.PI * 2);
      pctx.stroke();
    }

    function updateFromPicker() {
      var rgb = hslToRgb(hue, sat, lum);
      var hex = '#' + ((1 << 24) | (rgb.r << 16) | (rgb.g << 8) | rgb.b).toString(16).slice(1);
      hexInput.value = hex;
      preview(hex);
    }

    function onPaletteMove(e) {
      var rect = palette.getBoundingClientRect();
      var x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
      var y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
      x = Math.max(0, Math.min(size, x));
      y = Math.max(0, Math.min(size, y));
      sat = Math.round(x / size * 100);
      lum = Math.round(100 - y / size * 100);
      drawPalette();
      updateFromPicker();
    }

    function onHueMove(e) {
      var rect = hueBar.getBoundingClientRect();
      var y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
      y = Math.max(0, Math.min(size, y));
      hue = Math.round(y / size * 360);
      drawPalette();
      drawHueBar();
      updateFromPicker();
    }

    palette.addEventListener('mousedown', function(e) {
      onPaletteMove(e);
      document.addEventListener('mousemove', onPaletteMove);
      document.addEventListener('mouseup', function() {
        document.removeEventListener('mousemove', onPaletteMove);
      }, {once: true});
    });

    hueBar.addEventListener('mousedown', function(e) {
      onHueMove(e);
      document.addEventListener('mousemove', onHueMove);
      document.addEventListener('mouseup', function() {
        document.removeEventListener('mousemove', onHueMove);
      }, {once: true});
    });

    hexInput.addEventListener('input', function() {
      var hex = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        var hsl = hslFromHex(hex);
        hue = hsl.h; sat = hsl.s; lum = hsl.l;
        drawPalette();
        drawHueBar();
        preview(hex.toLowerCase());
      }
    });

    confirmBtn.addEventListener('click', function() {
      var hex = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        apply(hex.toLowerCase());
        highlight(hex.toLowerCase());
        panel.classList.add('hidden');
      }
    });

    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      var isHidden = panel.classList.contains('hidden');
      if (isHidden) {
        panel.classList.remove('hidden');
        origColor = localStorage.getItem(savedKey) || defaultColor;
        var row = panel.querySelector('.picker-row');
        var available = row ? row.clientWidth - 26 : 160;
        size = available;
        palette.width = available; palette.height = available;
        hueBar.height = available;
        var hsl = hslFromHex(origColor);
        hue = hsl.h; sat = hsl.s; lum = hsl.l;
        drawPalette();
        drawHueBar();
        updateFromPicker();
      } else {
        panel.classList.add('hidden');
        preview(origColor);
        highlight(origColor);
      }
    });

    return {
      isOpen: function() { return !panel.classList.contains('hidden'); },
      close: function() { panel.classList.add('hidden'); preview(origColor); highlight(origColor); },
      setFromHex: function(hex) {
        var hsl = hslFromHex(hex);
        hue = hsl.h; sat = hsl.s; lum = hsl.l;
        hexInput.value = hex.toLowerCase();
        drawPalette();
        drawHueBar();
      }
    };
  }

  // 主题色拾色器
  var themePicker = createColorPicker({
    panel: document.getElementById('colorPickerPanel'),
    palette: document.getElementById('pickerPalette'),
    hueBar: document.getElementById('pickerHueBar'),
    hexInput: document.getElementById('pickerHexInput'),
    confirmBtn: document.getElementById('pickerConfirmBtn'),
    trigger: document.getElementById('colorPickerTrigger'),
    savedKey: LS_ACCENT,
    defaultColor: '#2563eb',
    preview: previewAccent,
    apply: applyAccent,
    highlight: highlightSwatch
  });

  // 时钟色拾色器
  var clockPicker = createColorPicker({
    panel: document.getElementById('clockColorPickerPanel'),
    palette: document.getElementById('clockPickerPalette'),
    hueBar: document.getElementById('clockPickerHueBar'),
    hexInput: document.getElementById('clockPickerHexInput'),
    confirmBtn: document.getElementById('clockPickerConfirmBtn'),
    trigger: document.getElementById('clockColorPickerTrigger'),
    savedKey: LS_CLOCK_COLOR,
    defaultColor: '#ffffff',
    preview: previewClockColor,
    apply: applyClockColor,
    highlight: highlightClockSwatch
  });

  // 搜索色拾色器
  var searchPicker = createColorPicker({
    panel: document.getElementById('searchColorPickerPanel'),
    palette: document.getElementById('searchPickerPalette'),
    hueBar: document.getElementById('searchPickerHueBar'),
    hexInput: document.getElementById('searchPickerHexInput'),
    confirmBtn: document.getElementById('searchPickerConfirmBtn'),
    trigger: document.getElementById('searchColorPickerTrigger'),
    savedKey: LS_SEARCH_COLOR,
    defaultColor: '#ffffff',
    preview: previewSearchColor,
    apply: applySearchColor,
    highlight: highlightSearchSwatch
  });

  var clockLinkBtn = document.getElementById('clockLinkBtn');
  var searchLinkBtn = document.getElementById('searchLinkBtn');
  var isClockSearchLinked = localStorage.getItem(LS_CLOCK_SEARCH_LINK) !== 'false';

  // 时钟/搜索颜色联动开关
  function setLinkState(linked) {
    isClockSearchLinked = linked;
    localStorage.setItem(LS_CLOCK_SEARCH_LINK, linked ? 'true' : 'false');
    if (clockLinkBtn) clockLinkBtn.classList.toggle('active', linked);
    if (searchLinkBtn) searchLinkBtn.classList.toggle('active', linked);
  }
  setLinkState(isClockSearchLinked);

  function onLinkToggle() {
    setLinkState(!isClockSearchLinked);
  }

  if (clockLinkBtn) clockLinkBtn.addEventListener('click', onLinkToggle);
  if (searchLinkBtn) searchLinkBtn.addEventListener('click', onLinkToggle);

  var sidebarNav = sidebar.querySelector('.sidebar-nav');
  const navItems = sidebar.querySelectorAll('.sidebar-nav-item');

  // 侧边栏导航:切换面板并移动高亮条
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

      closeAllPickers();
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      moveHighlight(item);

      sidebar.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('sidebarPanel' + panelId.charAt(0).toUpperCase() + panelId.slice(1));
      if (panel) panel.classList.add('active');
    });
  });

  // 壁纸弹窗:历史网格、轮换池、导入
  const wallpaperModal = document.getElementById('wallpaperModal');
  const wallpaperGrid = document.getElementById('wallpaperGrid');
  const wallpaperImportBtn = document.getElementById('wallpaperImportBtn');
  const wallpaperRotateEditBtn = document.getElementById('wallpaperRotateEditBtn');
  const wallpaperFileInput = document.getElementById('wallpaperFileInput');
  const wallpaperCancel = document.getElementById('wallpaperCancel');
  const LS_WH = 'wallpaperHistory';
  const LS_WRP = 'wallpaperRotationPool';

  // 轮换池的读写
  function getRotationPool() {
    return readJsonArray(LS_WRP);
  }

  function saveRotationPool(pool) {
    localStorage.setItem(LS_WRP, JSON.stringify(pool));
  }

  // 壁纸历史的读写(最多 MAX_WALLPAPER_HISTORY 条)
  function getWallpaperHistory() {
    return readJsonArray(LS_WH);
  }

  function saveWallpaperHistory(list) {
    localStorage.setItem(LS_WH, JSON.stringify(list.slice(0, MAX_WALLPAPER_HISTORY)));
  }

  // 压缩壁纸图片:限制尺寸与体积(渐降 JPEG 质量)
  function compressWallpaper(dataUrl, callback) {
    const MAX_DIM = 1920;
    const MAX_BYTES = 400 * 1024;

    if (dataUrl.startsWith('data:image/svg')) {
      callback(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = function () {
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
        else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      function tryQuality(q) {
        try {
          const result = canvas.toDataURL('image/jpeg', q);
          if (result.length > MAX_BYTES && q > 0.3) { tryQuality(q - 0.15); return; }
          callback(result);
        } catch (e) {
          if (q > 0.3) { tryQuality(q - 0.15); return; }
          callback(dataUrl);
        }
      }
      tryQuality(0.85);
    };
    img.onerror = function () { callback(dataUrl); };
    img.src = dataUrl;
  }

  function addWallpaperToHistory(dataUrl) {
    let list = getWallpaperHistory().filter(item => item !== dataUrl);
    list.unshift(dataUrl);
    saveWallpaperHistory(list);
  }

  let wallpaperEditMode = false;
  let wallpaperEditChecked = new Set();

  // 渲染壁纸历史网格,编辑模式下展示轮换勾选框
  function renderWallpaperGrid() {
    const history = getWallpaperHistory();
    const current = localStorage.getItem(LS_BG);
    wallpaperGrid.innerHTML = '';
    if (history.length === 0) {
      wallpaperGrid.innerHTML = '<div class="wallpaper-empty">' + t('noHistoryWallpaper') + '</div>';
      updateStorageInfo();
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
      if (wallpaperEditChecked.has(dataUrl)) {
        check.classList.add('checked');
        item.classList.add('rotate-checked');
      }
      check.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (wallpaperEditChecked.has(dataUrl)) {
          wallpaperEditChecked.delete(dataUrl);
          check.classList.remove('checked');
          item.classList.remove('rotate-checked');
        } else {
          wallpaperEditChecked.add(dataUrl);
          check.classList.add('checked');
          item.classList.add('rotate-checked');
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
      delBtn.title = t('btnDelete');
      delBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (dataUrl === localStorage.getItem(LS_BG)) {
          showToast(t('toastWallpaperInUse'));
          return;
        }
        if (!confirm(t('confirmDeleteWallpaper'))) return;
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
    updateStorageInfo();
  }

  // 计算并显示 localStorage 占用
  function updateStorageInfo() {
    const el = document.getElementById('wallpaperStorageInfo');
    if (!el) return;
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key);
      if (val) total += (key.length + val.length) * 2;
    }
    el.textContent = total >= 1048576
      ? (total / 1048576).toFixed(1) + ' MB'
      : (total / 1024).toFixed(1) + ' KB';
  }

  // 壁纸轮换编辑模式:确认时保存选中集合为轮换池
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

      wallpaperGrid.classList.add('edit-mode-transitioning');
      setTimeout(function() {
        wallpaperEditMode = true;
        wallpaperRotateEditBtn.textContent = t('btnConfirm');
        renderWallpaperGrid();
        wallpaperGrid.classList.remove('edit-mode-transitioning');
      }, 120);
    }
  });

  wallpaperCancel.addEventListener('click', () => {
    wallpaperEditMode = false;
    wallpaperRotateEditBtn.textContent = t('wallpaperRotateEdit');
    wallpaperModal.classList.remove('show');
  });

  document.getElementById('sidebarWallpaperThumb').addEventListener('click', () => {
    if (localStorage.getItem(LS_WALLPAPER_SOURCE) !== 'local') return;
    renderWallpaperGrid();
    wallpaperModal.classList.add('show');
  });

  wallpaperImportBtn.addEventListener('click', () => wallpaperFileInput.click());

  // 导入本地壁纸:校验类型、压缩后加入历史并应用
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

  // 更新侧边栏壁纸缩略图
  function updateWallpaperThumb() {
    const thumb = document.getElementById('sidebarWallpaperThumbImg');
    if (!thumb) return;
    const bg = localStorage.getItem(LS_BG);
    thumb.src = bg || '';
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
    updateSliderTrack(sidebarOverlaySlider);
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

  // 壁纸轮换间隔下拉(关闭/1h/6h/12h/24h)
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

  // 选择轮换间隔并启动定时器(本地需先配好轮换池)
  function selectRotation(value) {

    if (value !== 'off' && localStorage.getItem(LS_WALLPAPER_SOURCE) !== 'bing' && getRotationPool().length < 2) {
      showToast(t('toastConfigPoolFirst'), 2000);
      return;
    }
    const opt = rotateOptions.find(o => o.value === value);
    if (opt) rotateTrigger.textContent = t(opt.i18nKey);
    rotateList.querySelectorAll('.rotate-option').forEach(o => o.classList.toggle('active', o.getAttribute('data-value') === value));
    var isBing = localStorage.getItem(LS_WALLPAPER_SOURCE) === 'bing';
    localStorage.setItem(isBing ? LS_BING_ROTATION : LS_WALLPAPER_ROTATE, value);
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

  // 立即执行一次轮换(本地随机/必应下一张)
  function doWallpaperRotate() {
    if (localStorage.getItem(LS_WALLPAPER_SOURCE) === 'bing') {
      rotateBingWallpaper();
      return;
    }
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

  // 启动壁纸轮换定时器(必应另有每日零点刷新)
  function startWallpaperRotation(value) {
    if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
    if (bingMidnightTimer) { clearTimeout(bingMidnightTimer); bingMidnightTimer = null; }


    if (localStorage.getItem(LS_WALLPAPER_SOURCE) === 'bing') {
      function scheduleMidnight() {
        var now = new Date();
        var midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        bingMidnightTimer = setTimeout(function() {
          fetchBingWallpapers(function(list) {
            if (!list || !list.length) return;
            if (localStorage.getItem(LS_WALLPAPER_SOURCE) !== 'bing') return;
            applyBingWallpaper(list[0].url);
            localStorage.setItem(LS_BING_URL, list[0].url);
            renderBingList(list, list[0].url);
            bingRotateIdx = 0;
            scheduleMidnight();
          });
        }, midnight.getTime() - now.getTime());
      }
      scheduleMidnight();
    }

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
    if (localStorage.getItem(LS_WALLPAPER_SOURCE) !== 'bing' && getRotationPool().length < 2) {
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

  var rotKey = localStorage.getItem(LS_WALLPAPER_SOURCE) === 'bing' ? LS_BING_ROTATION : LS_WALLPAPER_ROTATE;
  var savedRotation = localStorage.getItem(rotKey) || 'off';

  if (savedRotation !== 'off' && localStorage.getItem(LS_WALLPAPER_SOURCE) !== 'bing' && getRotationPool().length < 2) {
    localStorage.setItem(rotKey, 'off');
    selectRotation('off');
  } else {
    selectRotation(savedRotation);
  }

  // 可折叠分区的展开状态记忆
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

  // 滑杆工具:填充轨道、按步长吸附、格式化数值
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

  // 滑块通用绑定:恢复保存值、input 更新 CSS 变量/数值、滚轮步进
  function bindSlider({ slider, label, key, cssVar, root, varUnit, onChange }) {
    if (!slider) return;
    const saved = localStorage.getItem(key);
    if (saved != null) slider.value = saved;
    const initStep = getNodeStep(slider);
    label.textContent = formatSliderVal(roundToNode(parseFloat(slider.value), initStep), initStep, slider);
    if (cssVar) root.style.setProperty(cssVar, slider.value + (varUnit || ''));
    if (onChange) onChange(slider.value);
    updateSliderTrack(slider);

    slider.addEventListener('input', () => {
      const v = slider.value;
      const step = getNodeStep(slider);
      label.textContent = formatSliderVal(roundToNode(v, step), step, slider);
      if (cssVar) root.style.setProperty(cssVar, v + (varUnit || ''));
      localStorage.setItem(key, v);
      if (onChange) onChange(v);
      updateSliderTrack(slider);
    });

    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = getNodeStep(slider);
      const delta = e.deltaY > 0 ? -step : step;
      slider.value = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), parseFloat(slider.value) + delta));
      slider.dispatchEvent(new Event('input'));
    });
  }

  // 壁纸遮罩透明度滑杆
  const sidebarOverlaySlider = document.getElementById('sidebarOverlaySlider');
  const sidebarOverlayVal = document.getElementById('sidebarOverlayVal');
  bindSlider({ slider: sidebarOverlaySlider, label: sidebarOverlayVal, key: 'overlayOpacity', cssVar: '--overlay-opacity', root: document.body });

  // 壁纸模糊滑杆
  const sidebarBlurSlider = document.getElementById('sidebarBlurSlider');
  const sidebarBlurVal = document.getElementById('sidebarBlurVal');
  const LS_BLUR = 'wallpaperBlur';
  bindSlider({ slider: sidebarBlurSlider, label: sidebarBlurVal, key: LS_BLUR, cssVar: '--blur-px', root: document.body, varUnit: 'px' });

  // 侧边栏透明度滑杆(联动灰度文字色)
  const sidebarOpacitySlider = document.getElementById('sidebarOpacitySlider');
  const sidebarOpacityVal = document.getElementById('sidebarOpacityVal');
  const LS_SIDEBAR_OPACITY = 'sidebarOpacity';

  function applySidebarOpacity(v) {
    const opacity = parseFloat(v);
    document.body.style.setProperty('--sidebar-opacity', v);

    const factor = opacity;
    const mainGray = Math.round(51 * factor);
    const navGray = Math.round(51 + 71 * factor);
    const labelGray = Math.round(51 + 85 * factor);
    document.body.style.setProperty('--sidebar-main-rgb', `${mainGray},${mainGray},${mainGray}`);
    document.body.style.setProperty('--sidebar-nav-rgb', `${navGray},${navGray},${navGray}`);
    document.body.style.setProperty('--sidebar-label-rgb', `${labelGray},${labelGray},${labelGray}`);
  }

  bindSlider({ slider: sidebarOpacitySlider, label: sidebarOpacityVal, key: LS_SIDEBAR_OPACITY, onChange: applySidebarOpacity });

  // 侧边栏毛玻璃强度滑杆
  const sidebarBlurSlider2 = document.getElementById('sidebarBlurSlider2');
  const sidebarBlurVal2 = document.getElementById('sidebarBlurVal2');
  const LS_SIDEBAR_BLUR = 'sidebarBlur';
  bindSlider({ slider: sidebarBlurSlider2, label: sidebarBlurVal2, key: LS_SIDEBAR_BLUR, cssVar: '--sidebar-blur', root: document.body });

  // 搜索框启用开关
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

  // 搜索框垂直偏移滑杆
  bindSlider({ slider: document.getElementById('searchOffsetYSlider'), label: document.getElementById('searchOffsetYVal'), key: 'searchOffsetY', cssVar: '--search-offset-y', root: document.documentElement, varUnit: 'px' });

  // 搜索框水平偏移滑杆
  bindSlider({ slider: document.getElementById('searchOffsetXSlider'), label: document.getElementById('searchOffsetXVal'), key: 'searchOffsetX', cssVar: '--search-offset-x', root: document.documentElement, varUnit: 'px' });

  // 搜索框宽度滑杆
  bindSlider({ slider: document.getElementById('searchWidthSlider'), label: document.getElementById('searchWidthVal'), key: 'searchWidth', cssVar: '--search-width', root: document.documentElement, varUnit: 'px' });

  // 搜索框圆角滑杆
  bindSlider({ slider: document.getElementById('searchRadiusSlider'), label: document.getElementById('searchRadiusVal'), key: 'searchRadius', cssVar: '--search-radius', root: document.documentElement, varUnit: 'px' });

  // 自定义搜索引擎的新增/编辑表单
  const customEngineForm = document.getElementById('customEngineForm');
  const customEngineName = document.getElementById('customEngineName');
  const customEngineUrl = document.getElementById('customEngineUrl');
  const customEngineIconDefault = document.getElementById('customEngineIconDefault');
  const customEngineIconDefaultName = document.getElementById('customEngineIconDefaultName');
  const customEngineSave = document.getElementById('customEngineSave');
  const customEngineCancel = document.getElementById('customEngineCancel');
  let ceDefaultData = null;
  let ceEditingId = null;
  let ceOpenFor = null;

  const ceIconDefaultPreview = document.getElementById('customEngineIconDefaultPreview');

  // 读取自定义引擎图标 SVG 文件并校验大小
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

  customEngineIconDefault.addEventListener('change', () => {
    const file = customEngineIconDefault.files[0];
    if (!file) return;
    readIconFile(file, customEngineIconDefault, customEngineIconDefaultName, ceIconDefaultPreview, (data) => { ceDefaultData = data; });
  });

  // 打开表单(新增或编辑指定引擎),预填数据
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
    customEngineIconDefault.value = '';
    customEngineIconDefaultName.textContent = '';
    ceIconDefaultPreview.src = '';
    ceDefaultData = null;

    if (ceEditingId) {
      const list = getCustomEngines();
      const ce = list.find(e => e.id === ceEditingId);
      if (ce) {
        customEngineName.value = ce.name;
        customEngineUrl.value = ce.url;
        ceIconDefaultPreview.src = ce.iconDefault;
        ceDefaultData = ce.iconDefault;
        title.textContent = t('editCustomEngine');
        saveBtn.textContent = t('btnUpdate');
        const def = localStorage.getItem(LS_DEFAULT_ENGINE) || 'bing';
        deleteBtn.style.display = ceEditingId === def ? 'none' : '';
      } else {
        ceEditingId = null;
        customEngineName.value = '';
        customEngineUrl.value = '';
        title.textContent = t('addCustomEngine');
        saveBtn.textContent = t('btnAdd');
        deleteBtn.style.display = 'none';
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

  // 关闭表单并归还 DOM 位置
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
  // 删除自定义引擎(默认引擎不可删),并清理相关状态
  customEngineDelete.addEventListener('click', () => {
    if (!ceEditingId) return;
    const def = localStorage.getItem(LS_DEFAULT_ENGINE) || 'bing';
    if (ceEditingId === def) { showToast(t('toastDefaultEngineLocked')); return; }
    closeCustomEngineForm();
    var deletedId = ceEditingId;
    ceEditingId = null;
    ceDefaultData = null;
    var staleEl = document.querySelector('.engine-item[data-engine="' + deletedId + '"]');
    if (staleEl) staleEl.remove();
    var disabled = new Set(JSON.parse(localStorage.getItem(LS_DISABLED) || '[]'));
    if (disabled.has(deletedId)) {
      disabled.delete(deletedId);
      localStorage.setItem(LS_DISABLED, JSON.stringify(Array.from(disabled)));
    }
    let list = getCustomEngines();
    list = list.filter(e => e.id !== deletedId);
    saveCustomEngines(list);
    if (currentEngine === deletedId) {
      currentEngine = def;
      var defEl = document.querySelector('.engine-item[data-engine="' + def + '"]');
      if (defEl) {
        currentEngineIcon = defEl.getAttribute('data-default');
      }
    }
    injectCustomEngines();
    populateEngineManager();
    if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
    showToast(t('toastDeleteSuccess'));
  });

  // 保存自定义引擎:校验名称/URL/图标,去重后写入
  customEngineSave.addEventListener('click', () => {
    const name = customEngineName.value.trim();
    const url = customEngineUrl.value.trim();
    if (!name || !url) { showToast(t('toastFillNameUrl')); return; }
    if (!ceDefaultData) { showToast(t('toastSelectIcon')); return; }
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
        list[idx] = { ...list[idx], name, slug, url, iconDefault: ceDefaultData };
      }
    } else {
      const maxNum = list.reduce((max, ce) => {
        const n = parseInt(ce.id.replace('custom_', ''), 10);
        return n >= max ? n + 1 : max;
      }, 0);
      list.push({ id: `custom_${maxNum}`, name, slug, url, iconDefault: ceDefaultData });
    }

    closeCustomEngineForm();
    saveCustomEngines(list);
    injectCustomEngines();
    populateEngineManager();
    if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
    showToast(ceEditingId ? t('toastUpdateSuccess', { name: name }) : t('toastAddSuccess', { name: name }), 2000, 'success');
  });

  // 配置导出/导入(JSON 备份还原全部 localStorage)
  const exportConfigBtn = document.getElementById('exportConfigBtn');
  const importConfigBtn = document.getElementById('importConfigBtn');
  const importConfigInput = document.getElementById('importConfigInput');

  if (exportConfigBtn) {
    exportConfigBtn.addEventListener('click', () => {
      var data = {};
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
      }
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'minimal-tab-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('toastExportSuccess'), 2000, 'success');
    });
  }

  if (importConfigBtn && importConfigInput) {
    importConfigBtn.addEventListener('click', () => importConfigInput.click());
    importConfigInput.addEventListener('change', function() {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function() {
        try {
          var data = JSON.parse(reader.result);
          if (typeof data !== 'object' || Array.isArray(data)) throw new Error();
          for (var k in data) {
            if (data.hasOwnProperty(k)) localStorage.setItem(k, data[k]);
          }
          var mode = data.themeMode || 'system';
          if (mode === 'system') {
            applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
          } else {
            applyTheme(mode === 'dark');
          }
          showToast(t('toastImportSuccess'), 2000, 'success');
          setTimeout(function() { location.reload(); }, 400);
        } catch (e) {
          showToast(t('toastImportFailed'), 3000);
        }
      };
      reader.readAsText(file);
      importConfigInput.value = '';
    });
  }

  // 重置全部设置(保留语言),恢复默认值
  const resetSettingsBtn = document.getElementById('sidebarResetBtn');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(t('confirmReset'))) return;


      const PRESERVE_ON_RESET = new Set(['language']);
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!PRESERVE_ON_RESET.has(key)) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      setWallpaperSource('none');
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
      applyAccent('#2563eb');
      highlightSwatch('#2563eb');
      applyClockColor('#ffffff');
      highlightClockSwatch('#ffffff');
      applySearchColor('#ffffff');
      highlightSearchSwatch('#ffffff');
      setLinkState(true);

      if (historyToggle) historyToggle.checked = true;
      if (newTabToggle) newTabToggle.checked = true;
      hideHistoryDropdown();

      if (clockToggle) clockToggle.checked = true;
      showDigitalClock();
      applyClockCustomPos('center');
      applyClockPosition('below');
      if (clockFollowToggle) { clockFollowToggle.checked = true; applyClockFollow(true); }
      updateClockCascade();

      setThemeMode('system');

      if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
      injectCustomEngines();

      const bingItem = document.querySelector('.engine-item[data-engine="bing"]');
      if (bingItem) {
        document.querySelectorAll('.engine-item').forEach(i => i.classList.remove('active'));
        bingItem.classList.add('active');
        currentEngine = 'bing';
        currentEngineIcon = bingItem.dataset.default;
        if (typeof updateEngineIcon === 'function') updateEngineIcon();
      }

      selectRotation('off');
      if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
      if (window._selectSuggestionProvider) window._selectSuggestionProvider('off');
      showToast(t('toastSettingsReset'));
    });
  }

  // 渲染引擎管理列表(启用开关 + 自定义引擎编辑按钮)
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
        const right = document.createElement('span');
        right.className = 'engine-toggle-right';
        const editBtn = document.createElement('span');
        editBtn.className = 'engine-edit-btn';
        editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
        editBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          openCustomEngineForm(key);
        });
        right.appendChild(editBtn);
        right.appendChild(cb);
        right.appendChild(toggleSwitch);
        row.appendChild(right);
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

  // 桌面右键菜单(打开设置/切换壁纸)
  const contextMenu = document.getElementById('contextMenu');


  // 按壁纸来源切换到下一张的处理逻辑
  const nextWallpaperHandlers = {
    local: function() {
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
    },
    bing: function() {
      fetchBingWallpapers(function(list) {
        if (!list || list.length < 2) {
          showToast(t('toastNeedTwoWallpapers'), 2000);
          return;
        }
        bingRotateIdx = (bingRotateIdx + 1) % list.length;
        const pick = list[bingRotateIdx];
        applyBingWallpaper(pick.url);
        localStorage.setItem(LS_BING_URL, pick.url);
        var container = document.getElementById('bingWallpaperList');
        if (container) {
          container.querySelectorAll('.bing-wallpaper-item').forEach(function(el, i) {
            el.classList.toggle('active', i === bingRotateIdx);
          });
        }
        showToast(t('toastWallpaperSwitched'), 1500, 'success');
      });
    }
  };

  function nextWallpaperSequential() {
    const source = localStorage.getItem(LS_WALLPAPER_SOURCE) || 'none';
    const handler = nextWallpaperHandlers[source];
    if (!handler) {
      showToast(t('toastWallpaperNotEnabled'), 2000);
      return;
    }
    handler();
  }

  // 空白区域右键弹出菜单(避开交互控件)
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

// 引擎显示隐藏:禁用项移入隐藏归档,并保证始终有选中引擎
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

  // 按启用状态整理引擎列表,禁用时回退到默认引擎
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
      var defEngine = localStorage.getItem(LS_DEFAULT_ENGINE) || 'bing';
      var fallback = el.querySelector('.engine-item[data-engine="' + defEngine + '"]') || el.querySelector('.engine-item');
      if (fallback) {
        document.querySelectorAll('.engine-item').forEach(i => i.classList.remove('active'));
        fallback.classList.add('active');
        currentEngine = fallback.getAttribute('data-engine');
        currentEngineIcon = fallback.getAttribute('data-default');
        const wIcon = document.getElementById('currentEngineIconWhite');
        const dIcon = document.getElementById('currentEngineIconDefault');
        if (wIcon) { var wUrl = fallback.getAttribute('data-default'); if (wUrl) { wIcon.style.maskImage = 'url(' + wUrl + ')'; wIcon.style.webkitMaskImage = 'url(' + wUrl + ')'; } }
        if (dIcon) dIcon.src = fallback.getAttribute('data-default') || dIcon.src;
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

// 清空搜索历史按钮
document.getElementById('clear-history-btn').addEventListener('click', () => {
  clearSearchHistory();
  hideHistoryDropdown();
});

document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.search-input-wrap');
  if (wrap && !wrap.contains(e.target)) hideHistoryDropdown();
});

const defaultEngineManager = document.getElementById('sidebarDefaultEngineList');

// 默认引擎管理:单选列表,切换时更新当前引擎
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
    currentEngineIcon = item.dataset.default;
    updateEngineIcon();
  }
  if (typeof syncDefaultEngineManager === 'function') syncDefaultEngineManager();
});

(function() {
  var span = document.getElementById('aboutVersionSpan');
  if (span && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
    try { span.textContent = chrome.runtime.getManifest().version; } catch(e) {}
  }
})();
