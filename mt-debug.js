// 静默失败的可见性开关(**默认关闭**)
//
// 为什么需要它:内容脚本与后台为了"不打扰用户",大量失败分支是静默吞掉的 —— 点了清缓存没反应、
// 后台查询失败被当成"翻译关闭"、向标签页广播失败后悬浮球停在旧颜色…… 在用户侧只表现为
// "没反应",排查时只能临时改代码加 console。这里给一个默认关闭的开关:打开后这些分支才输出日志;
// **关闭时所有方法立即返回**,不产生任何输出、也不改变任何行为(与没有它时逐位一致)。
//
// 打开方式(在任意扩展页面的控制台,如新标签页 / 翻译边栏):
//   chrome.storage.local.set({ mtDebug: true })     关闭:chrome.storage.local.remove('mtDebug')
// 开关放在 chrome.storage.local:内容脚本、后台 SW、扩展页面三个上下文都读得到,改动即时生效。
//
// 加载方式与 dom-utils.js / page-trans-spec.js 同路(理由见 PROJECT_SUMMARY「共享模块」一节):
//   ① 扩展页面:newtab.html / translation.html / popup.html 的 <script> 排在页面脚本之前;
//   ② 内容脚本:manifest.json 的 content_scripts.js 排在 content/page-translate.js 之前;
//   ③ 后台:background.js 顶部 importScripts('mt-debug.js')。
// ⚠️ 不要写 ESM 的 export —— 它同时被 <script>、importScripts、content_scripts 三路加载。
(function (root) {
  'use strict';

  var KEY = 'mtDebug';
  var PREFIX = '[Minimal Tab]';
  var enabled = false;

  function store() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
    return chrome.storage.local;
  }

  // 读一次开关;之后开关的改动由 onChanged 即时跟进(不必刷新页面)
  function refresh() {
    var s = store();
    if (!s) return;
    try {
      s.get(KEY, function (all) { enabled = !!(all && all[KEY]); });
    } catch (e) {}
  }

  try {
    refresh();
    if (store() && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes[KEY]) enabled = !!changes[KEY].newValue;
      });
    }
  } catch (e) {}

  function emit(level, args) {
    if (!enabled) return;   // 关着的时候零开销、零输出
    try {
      var list = [PREFIX].concat(Array.prototype.slice.call(args));
      (console[level] || console.log).apply(console, list);
    } catch (e) {}
  }

  root.MtDebug = {
    isEnabled: function () { return enabled; },
    refresh: refresh,
    log: function () { emit('log', arguments); },
    warn: function () { emit('warn', arguments); },
    error: function () { emit('error', arguments); }
  };
})(typeof self !== 'undefined' ? self : this);
