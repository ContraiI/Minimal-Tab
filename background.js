
// 引入翻译引擎模块
importScripts('translate-engine.js');


// 从 chrome.storage 读取当前翻译引擎及其配置字段
function loadEngineSettings() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(['trans.engine'], function (base) {
      var engine = base['trans.engine'] || 'google';
      var eng = TranslateEngine.ENGINES[engine] || TranslateEngine.ENGINES.google;
      var fields = {};
      var keys = (eng.fields || []).map(function (f) { return f.key; });
      chrome.storage.local.get(keys, function (all) {
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
  if (relevant) engineSettingsReady = loadEngineSettings();
  // 切换呈现方式时关闭所有标签页翻译(目标语言/引擎变化不影响开关)
  if (changes['pageTrans.mode']) resetAllTabs();
});


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
    var item = globalQueue.shift();
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
  }
}


// 响应内容脚本的整页翻译请求(经全局限流),并处理标签页级开关消息
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'PAGE_TRANSLATE') {
    runTranslateLimited(function () {
      return engineSettingsReady.then(function () {
        return TranslateEngine.translateText(msg.text, 'auto', msg.to);
      });
    }).then(
      function (out) { sendResponse({ ok: true, text: out }); },
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
});
