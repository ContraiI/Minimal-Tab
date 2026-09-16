// 颜色工具与主题色变量写入(共享模块)
// 使用方:newtab 页(script.js)、翻译边栏(translation.js)、扩展弹窗(popup.js)
// 背景:这三处原本各有一份 hexToRgb/hsvToRgb/rgbToHsv,以及各一份"主题色 → CSS 变量"实现。
// 颜色换算必须逐位一致,否则两个页面的同一颜色会算出不同结果;"对比文字色"的口径更是必须一致,
// 否则把主题色设成浅色时,某一个页面会出现白字压浅底(v1.4.3 修过弹窗那一处)。
// 故统一到这里,调用方只保留同名别名,调用点与各自的取色器实现都不必改动。
(function (root) {
  'use strict';

  // hex 颜色(#rrggbb)转 {r,g,b}(0-255);不校验输入,非法值会得到 NaN 分量(调用方自行保证格式)
  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  // HSV → RGB(色盘按 HSV 布局:横=饱和度,竖=明度)
  function hsvToRgb(h, s, v) {
    s = s / 100; v = v / 100;
    var c = v * s;
    var hh = (h / 60) % 6;
    var x = c * (1 - Math.abs(hh % 2 - 1));
    var m = v - c;
    var r0, g0, b0;
    if (hh < 1) { r0 = c; g0 = x; b0 = 0; }
    else if (hh < 2) { r0 = x; g0 = c; b0 = 0; }
    else if (hh < 3) { r0 = 0; g0 = c; b0 = x; }
    else if (hh < 4) { r0 = 0; g0 = x; b0 = c; }
    else if (hh < 5) { r0 = x; g0 = 0; b0 = c; }
    else { r0 = c; g0 = 0; b0 = x; }
    return { r: Math.round((r0 + m) * 255), g: Math.round((g0 + m) * 255), b: Math.round((b0 + m) * 255) };
  }

  // RGB → HSV(h 为 0~360,s/v 为 0~100)
  function rgbToHsv(r, g, b) {
    r = r / 255; g = g / 255; b = b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
  }

  // 主题色默认值与对比文字色阈值:三处 CSS(style.css/translation.css/popup.css)的 --accent* 默认值同源
  var ACCENT_DEFAULT = '#2563eb';
  var ACCENT_TEXT_DARK = '#1a1a1a';
  var ACCENT_TEXT_LIGHT = '#ffffff';
  // 相对亮度用 BT.601 加权(0.299/0.587/0.114),阈值 0.55 —— 与三处历史实现逐位一致,不要随手改
  var ACCENT_TEXT_LUM_THRESHOLD = 0.55;

  // 依据主题色算对比文字色(浅色底用深字,深色底用白字)
  function accentTextColor(r, g, b) {
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > ACCENT_TEXT_LUM_THRESHOLD ? ACCENT_TEXT_DARK : ACCENT_TEXT_LIGHT;
  }

  // 把主题色写进 CSS 变量(写到 document.body 的内联样式,与三处历史实现一致),返回算出的对比文字色。
  // 非法或缺失的值回落到 ACCENT_DEFAULT,而不是把 NaN 写进变量——三处 CSS 的默认值本就是它,故外观无变化
  function applyAccentVars(hex) {
    var h = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : ACCENT_DEFAULT;
    var c = hexToRgb(h);
    document.body.style.setProperty('--accent', h);
    document.body.style.setProperty('--accent-rgb', c.r + ', ' + c.g + ', ' + c.b);
    var text = accentTextColor(c.r, c.g, c.b);
    document.body.style.setProperty('--accent-text', text);
    return text;
  }

  // 对外暴露(供 newtab / 翻译边栏 / 弹窗三个页面共用)
  root.ColorUtils = {
    hexToRgb: hexToRgb,
    hsvToRgb: hsvToRgb,
    rgbToHsv: rgbToHsv,
    applyAccentVars: applyAccentVars
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
