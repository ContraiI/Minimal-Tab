// 页面加载后禁用搜索框的浏览器自动补全
window.addEventListener('load', () => {
  const input = document.getElementById('search-input');
  input.setAttribute('autocomplete', 'off');
  setTimeout(() => input.setAttribute('autocomplete', 'off'), 100);
});

// 数字时钟:每秒刷新时间显示
// 元素引用缓存一次(原先每秒 getElementById 一次);名称与设置区内的 clockEl 区分,避免遮蔽
const clockTextEl = document.getElementById('digital-clock');
let clockTicker = null;

function updateDigitalClock() {
  if (!clockTextEl) return;
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  clockTextEl.textContent = `${h}:${m}:${s}`;
}

// 只在时钟真正可见时走定时器:隐藏期间(搜索框聚焦时、或时钟开关关闭时)直接停表,
// 不再每秒做一次看不见的 DOM 写入;重新显示时立刻补一次当前时间,显示不会是旧值。
// 因此时钟的显隐必须一律走 showDigitalClock()/hideDigitalClock() 这两个入口。
function startClockTicker() {
  if (clockTicker) return;
  updateDigitalClock();
  clockTicker = setInterval(updateDigitalClock, 1000);
}

function stopClockTicker() {
  if (clockTicker) { clearInterval(clockTicker); clockTicker = null; }
}

// 隐藏/显示数字时钟
function hideDigitalClock() {
  stopClockTicker();
  if (clockTextEl) { clockTextEl.style.opacity = '0'; clockTextEl.style.visibility = 'hidden'; }
}

function showDigitalClock() {
  if (!isClockVisible()) { stopClockTicker(); return; }
  if (clockTextEl) { clockTextEl.style.opacity = '1'; clockTextEl.style.visibility = 'visible'; }
  startClockTicker();
}

updateDigitalClock();   // 首帧先写上时间;定时器由初始化路径按开关状态启停

let toastTimer = null;
let suggestionTimer = null;
// 建议请求序号:每次取消/发起新请求都自增,响应回来时序号不符即丢弃
// (否则乱序响应会用旧前缀的建议覆盖新的,失焦后到达的响应还会把下拉重新弹出)
let suggestionSeq = 0;
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
// currentEngineIcon 用于搜索框聚焦时的彩色图标;currentEngineIconMask 用于未聚焦时的白色剪影
// 不透明位图(如 JPG)自身当蒙版会糊成实心方块,导入时另存一张剪影,存在引擎的 iconMask 字段
let currentEngine = 'bing';
let currentEngineIcon = './icons/bing-default.svg';
let currentEngineIconMask = './icons/bing-default.svg';

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

// 已移除引擎的本地残留键:引擎实现删掉不等于存储键会消失——存量用户的设备上仍留着这些键
// (腾讯云 TMT 于 v1.4.2 移除)。其中 secretId/secretKey 仍是真凭证,却已没有任何消费者(界面里也没有删除入口),
// 不该继续躺在设备上,故在每次初始化时幂等清掉。新增/移除翻译引擎时须在此登记其存储键。
// 刻意不用"一次性标记位":①配置导入是合并语义,会把旧备份里的这些键原样写回 localStorage;
// ②「恢复默认设置」只保留 language,会把标记位一并清掉。二者都会让标记位失效,幂等执行反而更简单可靠。
// 两处存储都要清:localStorage 是主副本,chrome.storage.local 只是侧栏 syncTransToStorage() 的 trans.* 镜像,
// 只清后者会被侧栏下次打开时按 trans. 前缀重新灌回来。
const REMOVED_ENGINE_KEYS = [
  'trans.tencent.secretId',
  'trans.tencent.secretKey',
  'trans.tencent.region',
  'ui.trans.locked.tencent'
];

// 删除不存在的键既不产生 chrome.storage.onChanged 事件(后台不会因此重载引擎配置),也无写入配额限制,
// 故每次打开新标签页无条件执行,不给"是否残留过"留任何判断分支
(function purgeRemovedEngineKeys() {
  REMOVED_ENGINE_KEYS.forEach((k) => localStorage.removeItem(k));
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.remove(REMOVED_ENGINE_KEYS);
  }
})();

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

// hex 颜色换算统一走 color-utils.js(共享模块,与翻译边栏、扩展弹窗同一份),此处只留同名别名,调用点不变
const hexToRgb = ColorUtils.hexToRgb;

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
    if (ce.iconMask) item.setAttribute('data-mask', ce.iconMask);
    item.setAttribute('data-index', 100 + i);
    const icon = document.createElement('img');
    icon.className = 'engine-icon sm';
    // 下拉列表里的图标被 CSS 强制染白(filter),不透明位图换成剪影才不会糊成白方块
    icon.src = ce.iconMask || ce.iconDefault;
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
  suggestionSeq++;   // 作废在途请求的渲染权(失焦、清空输入、发起新请求都会走到这里)
}

// 按提供商拉取搜索建议(百度/谷歌/必应)
function fetchSuggestions(query) {
  cancelSuggestions();
  if (!query || !isSuggestionEnabled()) { renderHistoryList(query); return; }
  var seq = suggestionSeq;   // 本次请求的序号;期间若输入变化或失焦,序号会被 cancelSuggestions 推高

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
      if (seq !== suggestionSeq) return;   // 过期响应:输入已变或已失焦,丢弃不渲染
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
      if (seq !== suggestionSeq) return;   // 过期请求失败同样不动作,避免清掉新的建议列表
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

// 取引擎项的蒙版地址:自定义位图引擎有独立剪影(data-mask),其余直接用图标自身
function iconMaskOf(el) {
  if (!el) return '';
  return el.getAttribute('data-mask') || el.getAttribute('data-default') || '';
}

// 白色图标靠 mask-image 染色,蒙版用剪影、缺省回退到图标自身
function applyEngineMask(url) {
  if (!engineIconWhite || !url) return;
  engineIconWhite.style.maskImage = 'url(' + url + ')';
  engineIconWhite.style.webkitMaskImage = 'url(' + url + ')';
}

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
      currentEngineIconMask = iconMaskOf(el);
      return;
    }
  }
  const active = engineListEl.querySelector('.engine-item.active');
  if (active) {
    currentEngine = active.dataset.engine;
    currentEngineIcon = active.dataset.default;
    currentEngineIconMask = iconMaskOf(active);
  }
}
// 先注入自定义引擎,使 initEngineFromDOM 能恢复自定义默认引擎,且禁用引擎能被 applyEngineVisibility 正确归档
injectCustomEngines();
initEngineFromDOM();

if (engineIconWhite && engineIconDefault) {
  applyEngineMask(currentEngineIconMask);
  engineIconDefault.src = currentEngineIcon;
}

// 同步当前引擎图标(白色掩码 + 彩色图)与列表选中态
function updateEngineIcon() {
  if (!engineIconWrap || !searchInput) return;
  applyEngineMask(currentEngineIconMask || currentEngineIcon);
  if (engineIconDefault && engineIconDefault.src !== currentEngineIcon) {
    engineIconDefault.src = currentEngineIcon;
  }
  const focused = document.activeElement === searchInput || searchInput.matches(':focus');
  engineIconWrap.classList.toggle('focused', focused);
  engineListEl.querySelectorAll('.engine-item').forEach(item => {
    const icon = item.querySelector('.engine-icon');
    if (!icon) return;
    const target = item.dataset.mask || item.dataset.default;
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
    currentEngineIconMask = iconMaskOf(item);
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

  // 壁纸模糊时给图层外扩,否则 blur() 会把图层边缘渐变成透明,视口四周露出底色形成白边
  // 外扩量取 2 倍模糊半径(blur 的像素值即高斯核 σ),随模糊连续变化:
  // 0px 不外扩(壁纸裁切与不模糊时完全一致),0.5px 只外扩 1px,拉满 10px 时外扩 20px
  // 取 2σ 而不是 3σ:视口边缘只剩约 2% 透光,配黑色页面底色看不出来,换来更小的缩放
  const BLUR_BLEED_RATIO = 2;
  const BLUR_BLEED_MAX = 60;
  function syncBlurBleed(value) {
    const blur = parseFloat(value);
    const pad = blur > 0 ? Math.min(BLUR_BLEED_MAX, Math.ceil(blur * BLUR_BLEED_RATIO)) : 0;
    [bgLayerA, bgLayerB].forEach(function (layer) {
      if (layer) layer.style.setProperty('--blur-bleed', pad + 'px');
    });
  }

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
  const LS_WH = 'wallpaperHistory';
  const LS_WRP = 'wallpaperRotationPool';
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
      syncBlurBleed('0');
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
      syncBlurBleed(savedBlur);
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
      syncBlurBleed(savedBlur);
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
  // 系统深浅色与「系统主题切换」订阅统一走 dom-utils.js(共享模块):整个页面只建一次 MediaQueryList
  const getSystemDark = DomUtils.getSystemDark;

  function applyTheme(isDark) {
    sidebar.classList.toggle('light', !isDark);
    document.body.classList.toggle('light-mode', !isDark);
  }

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

    DomUtils.onSystemThemeChange(() => {
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

  // 预览主题色:CSS 变量与对比文字色的口径统一走 color-utils.js(与翻译边栏、扩展弹窗同一份)。
  // 取色器确认按钮的文字色不再需要内联设置——color-picker.css 里 .picker-confirm-btn 用的就是 var(--accent-text),
  // 而 --accent-text 已由 applyAccentVars 写在 body 上(原先靠 id 查那个按钮,面板改由 JS 生成后已无此 id)
  function previewAccent(hex) {
    ColorUtils.applyAccentVars(hex);
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
      // 触发色块不是预设色:跳过(它由取色器自己接管点击)。按 class 判断而不是 id——触发色块现在由 JS 生成,
      // 且生成时机在本段之后,这里按类名守卫,即使将来调整初始化顺序也不会误给它挂上预设的点击逻辑
      if (s.classList.contains('picker-trigger')) return;
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
        if (s.classList.contains('picker-trigger')) return;
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
        if (s.classList.contains('picker-trigger')) return;
        const hex = s.dataset.color;
        applySearchColor(hex);
        highlightSearchSwatch(hex);
        if (searchPicker && searchPicker.isOpen()) searchPicker.setFromHex(hex);
      });
    });
  }


  // 主题色拾色器(HSV 画板 + 色相条)
  // ---- 取色器通用实现(主题/时钟/搜索三套共用) ----

  // HSV 颜色换算统一走 color-utils.js(共享模块,与翻译边栏同一份),此处只留同名别名,调用点不变
  const hsvToRgb = ColorUtils.hsvToRgb;
  const rgbToHsv = ColorUtils.rgbToHsv;

  // 取色器工厂统一走 color-picker.js(共享模块,与翻译边栏同一份实现),
  // 此处只留同名别名,三套实例与外部对 isOpen/close/setFromHex 的调用都不用改
  const createColorPicker = ColorPicker.create;

  // 时钟/搜索框行末的联动按钮:取色器的触发色块要插在它之前(保持"预设色块 → 取色器 → 联动按钮"的顺序),
  // 故先取好引用;联动逻辑在本段之后
  var clockLinkBtn = document.getElementById('clockLinkBtn');
  var searchLinkBtn = document.getElementById('searchLinkBtn');

  // 主题色拾色器:触发色块与面板都由 color-picker.js 生成(分别插在/追加到 themeColorRow)
  var themePicker = createColorPicker({
    anchor: themeColorRow,
    // 返回具体色值而不是 ''(本页没有"跟随默认"的语义):取消时要回滚到这个色,highlightSwatch 也要照常高亮对应色块
    getColor: function () { return localStorage.getItem(LS_ACCENT) || '#2563eb'; },
    defaultColor: '#2563eb',
    preview: previewAccent,
    setColor: applyAccent,
    highlight: highlightSwatch
  });

  // 时钟色拾色器:触发色块插在行末联动按钮之前,面板插在 clockColorRow 之后
  var clockPicker = createColorPicker({
    anchor: clockColorRow,
    triggerBefore: clockLinkBtn,
    getColor: function () { return localStorage.getItem(LS_CLOCK_COLOR) || '#ffffff'; },
    defaultColor: '#ffffff',
    preview: previewClockColor,
    setColor: applyClockColor,
    highlight: highlightClockSwatch
  });

  // 搜索色拾色器:触发色块插在行末联动按钮之前,面板插在 searchColorRow 之后
  var searchPicker = createColorPicker({
    anchor: searchColorRow,
    triggerBefore: searchLinkBtn,
    getColor: function () { return localStorage.getItem(LS_SEARCH_COLOR) || '#ffffff'; },
    defaultColor: '#ffffff',
    preview: previewSearchColor,
    setColor: applySearchColor,
    highlight: highlightSearchSwatch
  });

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
  bindSlider({ slider: sidebarBlurSlider, label: sidebarBlurVal, key: LS_BLUR, cssVar: '--blur-px', root: document.body, varUnit: 'px', onChange: syncBlurBleed });

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
  let ceMaskData = '';
  let ceEditingId = null;
  let ceOpenFor = null;

  const ceIconDefaultPreview = document.getElementById('customEngineIconDefaultPreview');

  // 图标规格:SVG 原样保存;位图统一缩放重编码,避免大图撑爆本地存储
  const ICON_SVG_MAX = 512 * 1024;
  const ICON_RASTER_MAX = 5 * 1024 * 1024;
  const ICON_MAX_SIDE = 96;                // 24px 显示 × 最高 4 倍屏
  const BG_TOLERANCE = 46;                 // 与背景色的欧氏距离阈值(0-441)
  const MASK_ALPHA_MIN = 26;               // 距背景色小于该值 → 完全透明
  const MASK_ALPHA_MAX = 92;               // 距背景色大于该值 → 完全不透明
  const MIN_TRANSPARENT_RATIO = 0.05;      // 自带透明像素占比达标时,原图即可当蒙版
  const COVERAGE_MIN = 0.02;               // 剪影覆盖率合理区间,越界视为提取失败
  const COVERAGE_MAX = 0.98;

  // 按 MIME/扩展名判定图标类型(svg / raster),不支持时返回空串
  function iconFileKind(file) {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    if (type.indexOf('svg') !== -1 || /\.svgz?$/.test(name)) return 'svg';
    if (type.indexOf('image/') === 0 || /\.(png|jpe?g|webp|gif|bmp|ico|avif)$/.test(name)) return 'raster';
    return '';
  }

  function rejectIconFile(inputEl, message) {
    showToast(message, 3000);
    inputEl.value = '';
  }

  function colorDistance(pixels, i, r, g, b) {
    const dr = pixels[i * 4] - r, dg = pixels[i * 4 + 1] - g, db = pixels[i * 4 + 2] - b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // 位图缩放到显示够用的尺寸,并读出像素用于判断/生成蒙版
  function rasterToCanvas(img) {
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (!nw || !nh) return null;
    const scale = Math.min(1, ICON_MAX_SIDE / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas: canvas, w: w, h: h, pixels: ctx.getImageData(0, 0, w, h).data };
  }

  // 彩色图标优先存 WebP(体积小),浏览器不支持编码时退回 PNG
  function canvasToIconUrl(canvas) {
    const webp = canvas.toDataURL('image/webp', 0.92);
    if (webp.indexOf('data:image/webp') === 0) return webp;
    return canvas.toDataURL('image/png');
  }

  // 纯色背景识别:四角平均色即背景色,且边框像素大多接近它
  function solidBackgroundColor(pixels, w, h) {
    const corners = [0, w - 1, (h - 1) * w, w * h - 1];
    let r = 0, g = 0, b = 0;
    corners.forEach((i) => { r += pixels[i * 4]; g += pixels[i * 4 + 1]; b += pixels[i * 4 + 2]; });
    r /= corners.length; g /= corners.length; b /= corners.length;

    let near = 0, count = 0;
    const border = [];
    for (let x = 0; x < w; x++) { border.push(x, (h - 1) * w + x); }
    for (let y = 1; y < h - 1; y++) { border.push(y * w, y * w + w - 1); }
    border.forEach((i) => {
      count++;
      if (colorDistance(pixels, i, r, g, b) <= BG_TOLERANCE) near++;
    });
    if (!count || near / count < 0.6) return null;
    return { r: r, g: g, b: b };
  }

  // 统计不透明像素占比,用于判断剪影是否可用
  function alphaCoverage(alphaAt, total) {
    let opaque = 0;
    for (let i = 0; i < total; i++) if (alphaAt(i) > 128) opaque++;
    return opaque / total;
  }

  // 把每个像素的 alpha 写进新画布,得到可当 mask-image 的剪影
  function maskCanvas(w, h, alphaAt) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const a = Math.max(0, Math.min(255, Math.round(alphaAt(i))));
      out.data[i * 4] = 0;
      out.data[i * 4 + 1] = 0;
      out.data[i * 4 + 2] = 0;
      out.data[i * 4 + 3] = a;
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
  }

  // 按“离背景色越远越不透明”抠图:抗锯齿边缘平滑,字母内部的镂空也能保留
  function maskByBackground(pixels, w, h, bg) {
    const alphaAt = (i) => {
      const d = colorDistance(pixels, i, bg.r, bg.g, bg.b);
      if (d <= MASK_ALPHA_MIN) return 0;
      if (d >= MASK_ALPHA_MAX) return 255;
      return ((d - MASK_ALPHA_MIN) / (MASK_ALPHA_MAX - MASK_ALPHA_MIN)) * 255;
    };
    const coverage = alphaCoverage(alphaAt, w * h);
    if (coverage < COVERAGE_MIN || coverage > COVERAGE_MAX) return null;
    return maskCanvas(w, h, alphaAt);
  }

  // 兜底:按亮度取剪影,适合深色图标配浅色背景
  function maskByLuminance(pixels, w, h) {
    const lo = 60, hi = 235;
    const alphaAt = (i) => {
      const l = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
      if (l <= lo) return 255;
      if (l >= hi) return 0;
      return ((hi - l) / (hi - lo)) * 255;
    };
    const coverage = alphaCoverage(alphaAt, w * h);
    if (coverage < COVERAGE_MIN || coverage > COVERAGE_MAX) return null;
    return maskCanvas(w, h, alphaAt);
  }

  // 生成剪影:自带透明通道的图直接用原图当蒙版,返回空串表示无需额外剪影
  function buildIconMask(shot) {
    const pixels = shot.pixels, total = shot.w * shot.h;
    let transparent = 0;
    for (let i = 0; i < total; i++) if (pixels[i * 4 + 3] < 16) transparent++;
    if (transparent / total >= MIN_TRANSPARENT_RATIO) return '';

    const bg = solidBackgroundColor(pixels, shot.w, shot.h);
    const byBg = bg ? maskByBackground(pixels, shot.w, shot.h, bg) : null;
    if (byBg) return byBg.toDataURL('image/png');

    const byLuma = maskByLuminance(pixels, shot.w, shot.h);
    if (byLuma) return byLuma.toDataURL('image/png');
    return '';
  }

  // 位图处理:缩放重编码成彩色图标,必要时再补一张剪影
  function processRasterIcon(img) {
    const shot = rasterToCanvas(img);
    if (!shot) return null;
    return { icon: canvasToIconUrl(shot.canvas), mask: buildIconMask(shot) };
  }

  // 读取图标:SVG 直接转 data URL,位图缩放重编码(必要时附剪影),onDone(图标, 剪影)
  function readIconFile(file, inputEl, nameEl, previewEl, onDone) {
    const kind = iconFileKind(file);
    if (!kind) { rejectIconFile(inputEl, t('toastSelectImage')); return; }
    if (file.size > (kind === 'svg' ? ICON_SVG_MAX : ICON_RASTER_MAX)) {
      rejectIconFile(inputEl, t('toastIconTooLarge'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => rejectIconFile(inputEl, t('toastIconReadFailed'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (kind === 'svg') {
        nameEl.textContent = file.name;
        previewEl.src = dataUrl;
        onDone(dataUrl, '');
        return;
      }
      const img = new Image();
      img.onerror = () => rejectIconFile(inputEl, t('toastIconReadFailed'));
      img.onload = () => {
        let result = null;
        try { result = processRasterIcon(img); } catch (e) { result = null; }
        if (!result) { rejectIconFile(inputEl, t('toastIconReadFailed')); return; }
        nameEl.textContent = file.name;
        previewEl.src = result.icon;
        onDone(result.icon, result.mask);
      };
      img.src = dataUrl;
    };
    try {
      reader.readAsDataURL(file);
    } catch (e) {
      rejectIconFile(inputEl, t('toastCannotReadFile'));
    }
  }

  customEngineIconDefault.addEventListener('change', () => {
    const file = customEngineIconDefault.files[0];
    if (!file) return;
    readIconFile(file, customEngineIconDefault, customEngineIconDefaultName, ceIconDefaultPreview, (icon, mask) => {
      ceDefaultData = icon;
      ceMaskData = mask;
    });
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
    ceMaskData = '';

    if (ceEditingId) {
      const list = getCustomEngines();
      const ce = list.find(e => e.id === ceEditingId);
      if (ce) {
        customEngineName.value = ce.name;
        customEngineUrl.value = ce.url;
        ceIconDefaultPreview.src = ce.iconDefault;
        ceDefaultData = ce.iconDefault;
        ceMaskData = ce.iconMask || '';
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
        currentEngineIconMask = iconMaskOf(defEl);
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

    // iconMask 只在不透明位图需要额外剪影时存在;SVG 与透明位图直接拿图标自身当蒙版
    const iconFields = { name, slug, url, iconDefault: ceDefaultData };
    if (ceMaskData) iconFields.iconMask = ceMaskData;

    if (ceEditingId) {
      const idx = list.findIndex(e => e.id === ceEditingId);
      if (idx !== -1) {
        const next = { ...list[idx], ...iconFields };
        if (!ceMaskData) delete next.iconMask;
        list[idx] = next;
      }
    } else {
      const maxNum = list.reduce((max, ce) => {
        const n = parseInt(ce.id.replace('custom_', ''), 10);
        return n >= max ? n + 1 : max;
      }, 0);
      list.push({ id: `custom_${maxNum}`, ...iconFields });
    }

    closeCustomEngineForm();
    saveCustomEngines(list);
    injectCustomEngines();
    populateEngineManager();
    if (typeof applyEngineVisibility === 'function') applyEngineVisibility();
    // 改的是当前正在用的引擎时,立即刷新搜索框图标,不必等刷新页面
    if (ceEditingId && ceEditingId === currentEngine) {
      const cur = document.querySelector('.engine-item[data-engine="' + ceEditingId + '"]');
      if (cur) {
        currentEngineIcon = cur.dataset.default;
        currentEngineIconMask = iconMaskOf(cur);
        updateEngineIcon();
      }
    }
    showToast(ceEditingId ? t('toastUpdateSuccess', { name: name }) : t('toastAddSuccess', { name: name }), 2000, 'success');
  });

  // 配置导出/导入(JSON 备份:localStorage 全部键 + chrome.storage.local 的翻译模块设置)
  const exportConfigBtn = document.getElementById('exportConfigBtn');
  const importConfigBtn = document.getElementById('importConfigBtn');
  const importConfigInput = document.getElementById('importConfigInput');
  const exportSecretsToggle = document.getElementById('exportSecretsToggle');
  // 敏感凭证:默认不写入备份,仅当用户勾选「导出时包含密钥」时导出
  const SENSITIVE_CONFIG_KEYS = new Set([
    'trans.msKey',
    'trans.custom.key',
    // 腾讯云引擎已于 v1.4.2 移除、实现代码已清空,这两个键只可能以历史残留形式留在老用户本地;
    // 但残留的仍是真凭证,继续登记,避免默认(不含密钥)导出时被带出。
    // 本机残留由文件顶部的 REMOVED_ENGINE_KEYS 自动清除,但那不能替代这里的登记:
    // 导入一份含密钥的旧备份会把它们重新写回本机,登记在,默认导出才不会把它们再带出去
    'trans.tencent.secretId',
    'trans.tencent.secretKey'
  ]);
  // 上述开关的记忆键(记住选择,避免每次导出都要重设)
  const EXPORT_SECRETS_KEY = 'exportIncludeSecrets';
  // 备份 JSON 中承载 chrome.storage.local 设置的保留节名
  const CHROME_STORE_SECTION = '__chromeStorage';
  // 只存于 chrome.storage.local 的翻译模块键前缀(网页翻译设置,localStorage 里没有)
  const CHROME_STORE_PREFIXES = ['pageTrans.'];
  // 运行态/临时键,不属于可备份配置
  const NON_BACKUP_KEYS = new Set(['pageTrans.tabs', '__mtSettingsReset']);

  if (exportSecretsToggle) {
    exportSecretsToggle.checked = localStorage.getItem(EXPORT_SECRETS_KEY) === 'true';
    exportSecretsToggle.addEventListener('change', () => {
      localStorage.setItem(EXPORT_SECRETS_KEY, exportSecretsToggle.checked ? 'true' : 'false');
    });
  }

  if (exportConfigBtn) {
    exportConfigBtn.addEventListener('click', () => {
      // 以持久化偏好为准(而非 DOM 勾选态),避免界面状态意外不同步时把密钥写进备份
      var includeSecrets = localStorage.getItem(EXPORT_SECRETS_KEY) === 'true';
      var data = {};
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!includeSecrets && SENSITIVE_CONFIG_KEYS.has(key)) continue;
        data[key] = localStorage.getItem(key);
      }
      // 网页翻译设置只存于 chrome.storage.local,localStorage 里没有,需单独合并进备份
      chrome.storage.local.get(null, function (all) {
        var mirrored = {};
        Object.keys(all).forEach(function (k) {
          if (NON_BACKUP_KEYS.has(k)) return;
          if (!CHROME_STORE_PREFIXES.some(function (p) { return k.indexOf(p) === 0; })) return;
          mirrored[k] = all[k];
        });
        if (Object.keys(mirrored).length) data[CHROME_STORE_SECTION] = mirrored;

        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'minimal-tab-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('toastExportSuccess'), 2000, 'success');
      });
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
          var mirrored = data[CHROME_STORE_SECTION];
          for (var k in data) {
            // 保留节属于 chrome.storage.local,不写进 localStorage
            if (!data.hasOwnProperty(k) || k === CHROME_STORE_SECTION) continue;
            localStorage.setItem(k, data[k]);
          }
          var mode = data.themeMode || 'system';
          if (mode === 'system') {
            applyTheme(getSystemDark());
          } else {
            applyTheme(mode === 'dark');
          }
          // 网页翻译设置只存于 chrome.storage.local,需显式写回;写完后才刷新,避免边栏读到旧值
          var done = function () {
            showToast(t('toastImportSuccess'), 2000, 'success');
            setTimeout(function() { location.reload(); }, 400);
          };
          // 旧版本备份没有保留节,此时按原逻辑直接刷新
          if (mirrored && typeof mirrored === 'object' && !Array.isArray(mirrored)) {
            chrome.storage.local.set(mirrored, done);
          } else {
            done();
          }
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

      // 只清存储,界面交给随后的整页刷新重建:重置后的存储状态等同于全新安装(仅保留 language),
      // 由初始化路径推导出的界面必然与之自洽,故不再逐个手工复位控件——那类复位需要人工维护,
      // 漏一个就会出现「存储已清空、界面还是旧状态」的不一致(时钟锁定、折叠分区等都曾中招)
      const PRESERVE_ON_RESET = new Set(['language']);
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!PRESERVE_ON_RESET.has(key)) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // 翻译模块设置会同步一份到 chrome.storage(整页翻译/后台引擎读取),重置需一并清掉;
      // 删除 pageTrans.mode 还会触发后台 background.js 的 resetAllTabs(),关闭所有标签页的整页翻译,
      // 所以这段清理不可省略。清完再发重置标记,避免已打开的翻译侧栏抢先重载读到未清完的旧配置
      chrome.storage.local.get(null, (all) => {
        const stale = Object.keys(all).filter((k) => k.indexOf('trans.') === 0 || k.indexOf('pageTrans.') === 0);
        const done = () => {
          chrome.storage.local.set({ '__mtSettingsReset': Date.now() }, () => {
            chrome.storage.local.remove('__mtSettingsReset');
            // 刷新必须等两处存储都清完:chrome.storage 的删除是异步的,提前刷新会读到未清完的旧配置
            showToast(t('toastSettingsReset'));
            setTimeout(function() { location.reload(); }, 400);
          });
        };
        if (stale.length) chrome.storage.local.remove(stale, done);
        else done();
      });
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
        currentEngineIconMask = iconMaskOf(fallback);
        const wIcon = document.getElementById('currentEngineIconWhite');
        const dIcon = document.getElementById('currentEngineIconDefault');
        if (wIcon) { var wUrl = currentEngineIconMask; if (wUrl) { wIcon.style.maskImage = 'url(' + wUrl + ')'; wIcon.style.webkitMaskImage = 'url(' + wUrl + ')'; } }
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
    currentEngineIconMask = iconMaskOf(item);
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
