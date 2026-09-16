// DOM 与页面环境小工具(共享模块)
// 使用方:newtab 页(script.js)、翻译边栏(translation.js)、网页内容脚本(content/page-translate.js)
// 注意引入方式:内容脚本与扩展页面运行在彼此隔离的上下文里,函数无法跨上下文直接复用,
// 所以本文件既要被两个页面的 <script> 引入,也要列进 manifest 的 content_scripts
// (在 content/page-translate.js 之前),三处都必须排在各消费者之前。
(function (root) {
  'use strict';

  // 系统深浅色:整个页面只建一个 MediaQueryList
  // (原先 script.js 与 translation.js 各建一份,且 translation.js 的 getSystemDark 每次调用都新建一次)
  var darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // 当前系统是否为深色
  function getSystemDark() {
    return darkModeQuery.matches;
  }

  // 订阅"系统主题切换"(与 getSystemDark 共用同一个 MediaQueryList,不要另建)
  function onSystemThemeChange(cb) {
    darkModeQuery.addEventListener('change', cb);
  }

  // 写/删元素的 CSS 变量:空值表示"回退到默认",直接移除该变量而非写空串
  function setStyleVar(el, name, value) {
    if (value) el.style.setProperty(name, value);
    else el.style.removeProperty(name);
  }

  root.DomUtils = {
    getSystemDark: getSystemDark,
    onSystemThemeChange: onSystemThemeChange,
    setStyleVar: setStyleVar
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
