// 本文件是**普通(经典)Service Worker**:共享模块一律用 importScripts 同步引入,两个文件按
// 传统脚本模式执行、把接口挂到全局(TranslateEngine / TranslationCache)。
// 不要改用 `import` 或给 manifest 的 background 加 "type": "module" —— translate-engine.js 同时
// 被翻译边栏以普通 <script> 引入(translation.html),文件里一旦出现顶层 export,那边立刻
// "Uncaught SyntaxError: Unexpected token 'export'" 且整份引擎失效(v1.4.5 踩过此坑)。
importScripts('translate-engine.js');
importScripts('translation-cache.js');


// 从 chrome.storage 读取当前翻译引擎及其配置字段
var engineSettingsGeneration = 0;
// 当前引擎 id,只用于拼缓存键。只关心"哪个引擎"即可:API Key/区域/模型/提示词这些字段
// 一旦变化,onChanged 会同步自增缓存代号,老条目自然失配,不必把字段值拼进键里
var currentEngineId = 'google';

function loadEngineSettings() {
  var generation = ++engineSettingsGeneration;
  return new Promise(function (resolve) {
    chrome.storage.local.get(['trans.engine'], function (base) {
      var engine = base['trans.engine'] || 'google';
      var eng = TranslateEngine.ENGINES[engine] || TranslateEngine.ENGINES.google;
      currentEngineId = TranslateEngine.ENGINES[engine] ? engine : 'google';
      var fields = {};
      var keys = (eng.fields || []).map(function (f) { return f.key; });
      chrome.storage.local.get(keys, function (all) {
        if (generation !== engineSettingsGeneration) { resolve(); return; }
        (eng.fields || []).forEach(function (f) {
          fields[f.id] = all[f.key] || f.defaultValue || '';
        });
        TranslateEngine.setSettings(engine, fields);
        resolve();
      });
    });
  });
}

var engineSettingsReady = loadEngineSettings();

// 判断存储键是否为翻译引擎相关(引擎选择或引擎配置字段)
function isEngineKey(k) {
  if (k === 'trans.engine') return true;
  return Object.keys(TranslateEngine.ENGINES).some(function (id) {
    return (TranslateEngine.ENGINES[id].fields || []).some(function (f) { return f.key === k; });
  });
}


// 引擎设置变化时重新加载,保证内容脚本翻译用最新配置
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'local') return;
  var relevant = Object.keys(changes).some(isEngineKey);
  if (relevant) invalidateCacheAndReloadEngine();
  // 切换呈现方式时关闭所有标签页翻译(目标语言/引擎变化不影响开关)
  if (changes['pageTrans.mode']) resetAllTabs();
});

// 配置变化:自增缓存代号 + 重载引擎设置。
// 代号必须在这里**同步**自增,不能等 loadEngineSettings 的异步回调:那之间到达的请求若用旧代号,
// 就会把"旧配置翻出的译文"写进新代号的缓存里
function invalidateCacheAndReloadEngine() {
  TranslationCache.bumpGeneration();
  engineSettingsReady = loadEngineSettings();
}

// 用户主动重译:清空整份译文缓存(内容脚本以悬浮球下方悬停拉出的刷子按钮触发)。
// 先自增代号再清空:清空后仍在飞的请求若按旧代号写回,也不会被后续命中
function clearTranslationCache() {
  TranslationCache.bumpGeneration();
  var cleared = TranslationCache.stats().size;
  TranslationCache.clear();
  return cleared;
}


// 标签页级整页翻译开关(per-tab,存 session storage,避免全局联动)
var PAGE_TABS_KEY = 'pageTrans.tabs';

function readTabs(cb) {
  chrome.storage.session.get(PAGE_TABS_KEY, function (all) {
    cb((all && all[PAGE_TABS_KEY]) || {});
  });
}

function writeTabs(tabs) {
  var o = {};
  o[PAGE_TABS_KEY] = tabs;
  chrome.storage.session.set(o, function () {});
}

// 翻转某标签页的翻译开关,并广播给该标签页的所有 frame
function toggleTabEnabled(tabId) {
  return new Promise(function (resolve) {
    if (tabId == null) { resolve(false); return; }  // 无效 tabId 不写脏数据
    readTabs(function (tabs) {
      var enabled = !(tabs[tabId] && tabs[tabId].enabled);
      tabs[tabId] = { enabled: enabled };
      writeTabs(tabs);
      try { chrome.tabs.sendMessage(tabId, { type: 'PAGE_TRANSLATE_STATE', enabled: enabled }); } catch (e) {}
      resolve(enabled);
    });
  });
}

function tabEnabled(tabId, cb) {
  if (tabId == null) { cb(false); return; }
  readTabs(function (tabs) {
    cb(!!(tabs[tabId] && tabs[tabId].enabled));
  });
}

// 切换呈现方式(整页翻译模式)时,关闭所有标签页的翻译
function resetAllTabs() {
  readTabs(function (tabs) {
    var ids = Object.keys(tabs).filter(function (id) { return tabs[id] && tabs[id].enabled; });
    writeTabs({});
    ids.forEach(function (id) {
      try { chrome.tabs.sendMessage(parseInt(id, 10), { type: 'PAGE_TRANSLATE_STATE', enabled: false }); } catch (e) {}
    });
  });
}

// 标签页关闭时清理其开关状态
chrome.tabs.onRemoved.addListener(function (tabId) {
  readTabs(function (tabs) {
    if (tabs[tabId]) { delete tabs[tabId]; writeTabs(tabs); }
  });
});

// 全局翻译并发限流(多标签页共享一个水位线,防止请求打爆翻译接口)
var GLOBAL_CONCURRENCY = 10;
var globalInFlight = 0;
var globalQueue = [];

function runTranslateLimited(task) {
  return new Promise(function (resolve, reject) {
    globalQueue.push({ task: task, resolve: resolve, reject: reject });
    pumpGlobal();
  });
}

function pumpGlobal() {
  while (globalInFlight < GLOBAL_CONCURRENCY && globalQueue.length) {
    // 用立即执行函数隔离每次出队的 item,避免异步回调共享循环内被反复覆盖的同一变量
    (function (item) {
      globalInFlight++;
      // 经 Promise.resolve() 调度,即便 task 同步抛错也走 reject 分支归还名额
      Promise.resolve().then(item.task).then(function (v) {
        globalInFlight--;
        item.resolve(v);
        pumpGlobal();
      }, function (e) {
        globalInFlight--;
        item.reject(e);
        pumpGlobal();
      });
    })(globalQueue.shift());
  }
}


// 译文结果缓存 + 同键请求合并(纯逻辑在 translation-cache.js)
//
// 缓存键 = 引擎 + 目标语言 + 源语言 + 原文,配置代号只记在条目内(见 translation-cache.js 顶部):
// 上面 onChanged 里自增一次代号,旧配置的条目就再也命不中,不需要显式清表;也不把自定义引擎的
// 提示词原文拼进键(可能几百字且含换行,键会比译文还长)。
//
// 命中在限流之外返回:缓存/合并省下的不只是网络往返,还有后台的全局并发名额。
// 只写回成功结果:失败(网络/限流/配置缺失)不缓存,否则临时错误会被永久化;空串是合法译文,照常缓存。
function translateWithCache(text, to) {
  return engineSettingsReady.then(function () {
    var from = 'auto';
    var key = TranslationCache.keyOf(currentEngineId, to, from, text);
    var hit = TranslationCache.check(key);
    if (hit !== null) return { text: hit, cached: true };
    return TranslationCache.fetch(key, function () {
      return runTranslateLimited(function () {
        return TranslateEngine.translateText(text, from, to);
      }).then(function (out) {
        var value = out == null ? '' : String(out);
        TranslationCache.store(key, value);
        return { text: value, cached: false };
      });
    });
  });
}


// 响应内容脚本的整页翻译请求(经全局限流),并处理标签页级开关消息
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'PAGE_TRANSLATE') {
    translateWithCache(msg.text, msg.to).then(
      function (r) { sendResponse({ ok: true, text: r.text, cached: r.cached }); },
      function (err) {
        sendResponse({ ok: false, error: (err && err.code) || String((err && err.message) || err) });
      }
    );
    return true;
  }
  if (msg && msg.type === 'PAGE_TRANSLATE_TOGGLE') {
    var tId = msg.tabId != null ? msg.tabId : (sender.tab && sender.tab.id);
    toggleTabEnabled(tId).then(function (enabled) { sendResponse({ enabled: enabled }); });
    return true;
  }
  if (msg && msg.type === 'PAGE_TRANSLATE_QUERY') {
    var qId = msg.tabId != null ? msg.tabId : (sender.tab && sender.tab.id);
    tabEnabled(qId, function (enabled) { sendResponse({ enabled: enabled }); });
    return true;
  }
  // 用户主动重译(悬浮球的刷子按钮 / 侧边栏设置里的「清除缓存」):清空缓存并回报清掉的条数。
  // 缓存是全局的,故这一步影响所有标签页,只是当前页会立刻重译一遍。
  // 带 tabId 的是扩展页面(侧边栏)发来的:它自己不在页面里,由后台把条数带给那个标签页,
  // 让内容脚本弹出与悬浮球完全相同的那条结果提示并还原重扫;
  // 内容脚本自己发起时不带 tabId,它拿到应答后自己提示 + revertAll + scheduleScan(不要重复通知)
  if (msg && msg.type === 'PAGE_TRANSLATE_RESET_CACHE') {
    var cleared = clearTranslationCache();
    if (msg.tabId != null) {
      try { chrome.tabs.sendMessage(msg.tabId, { type: 'PAGE_TRANSLATE_RESCAN', cleared: cleared }); } catch (e) {}
    }
    sendResponse({ ok: true, cleared: cleared });
    return false;   // 同步应答,不需要保持消息通道
  }
});
