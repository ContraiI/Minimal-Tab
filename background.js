
// 引入翻译引擎模块
importScripts('translate-engine.js');


// 从 chrome.storage 读取当前翻译引擎及其配置字段
function loadEngineSettings() {
  chrome.storage.local.get(['trans.engine'], function (base) {
    var engine = base['trans.engine'] || 'google';
    var eng = TranslateEngine.ENGINES[engine] || TranslateEngine.ENGINES.google;
    var fields = {};
    var keys = (eng.fields || []).map(function (f) { return f.key; });
    chrome.storage.local.get(keys, function (all) {
      (eng.fields || []).forEach(function (f) {
        fields[f.id] = all[f.key] || '';
      });
      TranslateEngine.setSettings(engine, fields);
    });
  });
}

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
  if (relevant) loadEngineSettings();
});


// 响应内容脚本的整页翻译请求,异步返回翻译结果
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'PAGE_TRANSLATE') {
    TranslateEngine.translateText(msg.text, 'auto', msg.to).then(
      function (out) { sendResponse({ ok: true, text: out }); },
      function (err) {
        sendResponse({ ok: false, error: (err && err.code) || String((err && err.message) || err) });
      }
    );
    return true;
  }
});

// 启动时初始化翻译引擎设置
loadEngineSettings();
