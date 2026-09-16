// 取色器工厂(共享模块)
// 使用方:newtab 页 3 套(主题色/时钟色/搜索框色,script.js)、翻译边栏 2 套(译文样式字体色/边框色,translation.js)
// 面板与触发色块都由本模块生成(原先两侧各手写了一份标记),样式集中在 color-picker.css,
// 因此两边的类名、结构与外观完全一致,新增一套取色器只需一次 create 调用。
// 依赖 color-utils.js(先于本文件引入)。
//
// 契约(cfg):
//   anchor        必填:面板插到该元素之后(通常是颜色行 .theme-color-row / .style-color-row)
//   triggerHost   触发色块追加到该元素末尾;与 triggerBefore 二选一(默认用 anchor)
//   triggerBefore 触发色块插到该元素之前(行尾另有按钮时用,如时钟/搜索框行末的联动按钮)
//   defaultColor  getColor() 为空时的兜底色(默认 #2563eb)
//   getColor()    取当前已提交的颜色;返回 '' 表示"跟随默认",取消时回滚为空而非某个具体色
//   setColor(hex) 确认时提交(是否落盘、怎么落盘由调用方决定)
//   preview(hex)  仅预览,不落盘(拖动中每个 mousemove 都会调,必须便宜)
//   highlight(hex) 同步预设色块的高亮
//   live(hex, immediate) 拖动/输入时实时生效;immediate=true 表示立即落盘(取消回滚用)
// 展开态统一用 .open(不要改用 .hidden,理由见 color-picker.css 顶部说明)
// 返回:{ isOpen(), close(), setFromHex(hex) }
(function (root) {
  'use strict';

  var CU = root.ColorUtils;
  var hexToRgb = CU.hexToRgb;
  var hsvToRgb = CU.hsvToRgb;
  var rgbToHsv = CU.rgbToHsv;

  // 文案:两个使用方都先引入了 lang.js(全局 t()),这里只做存在性兜底,便于模块单独测试
  var FALLBACK_TEXT = { btnConfirm: '确定', colorPicker: '取色器' };
  function tr(key) {
    if (typeof root.t === 'function') return root.t(key);
    return FALLBACK_TEXT[key] || key;
  }

  function createColorPicker(cfg) {
    var anchor = cfg.anchor;
    if (!anchor || !anchor.parentNode) return null;
    var getColor = cfg.getColor || function () { return ''; },
        setColor = cfg.setColor || function () {},
        preview = cfg.preview || function () {},
        highlight = cfg.highlight || function () {},
        live = cfg.live || function () {};
    var DEFAULT_HEX = cfg.defaultColor || '#2563eb';
    var active = false;   // 是否被打开过(避免没打开就 close() 时误回滚)

    // 触发色块:点它展开/收起。i18n 走 data-i18n-title,与手写标记一致,切语言时由 lang.js 重绘
    var trigger = document.createElement('span');
    trigger.className = 'theme-color-swatch picker-trigger';
    trigger.setAttribute('data-i18n-title', 'colorPicker');
    trigger.title = tr('colorPicker');
    if (cfg.triggerBefore) cfg.triggerBefore.parentNode.insertBefore(trigger, cfg.triggerBefore);
    else (cfg.triggerHost || anchor).appendChild(trigger);

    // 面板:色盘 + 色相条 + hex 输入 + 确定(结构与原先手写标记一致,含 canvas 初始尺寸与 maxlength)
    var panel = document.createElement('div');
    panel.className = 'color-picker-panel';
    var pickerRow = document.createElement('div');
    pickerRow.className = 'picker-row';
    var palette = document.createElement('canvas');
    palette.className = 'picker-palette';
    palette.width = 160;
    palette.height = 160;
    var hueBar = document.createElement('canvas');
    hueBar.className = 'picker-hue-bar';
    hueBar.width = 20;
    hueBar.height = 160;
    pickerRow.appendChild(palette);
    pickerRow.appendChild(hueBar);
    var inputRow = document.createElement('div');
    inputRow.className = 'picker-input-row';
    var hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'picker-hex-input';
    hexInput.placeholder = '#000000';
    hexInput.maxLength = 7;
    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'picker-confirm-btn';
    confirmBtn.setAttribute('data-i18n', 'btnConfirm');
    confirmBtn.textContent = tr('btnConfirm');
    inputRow.appendChild(hexInput);
    inputRow.appendChild(confirmBtn);
    panel.appendChild(pickerRow);
    panel.appendChild(inputRow);
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);

    var pctx = palette.getContext('2d');
    var hctx = hueBar.getContext('2d');
    var hue = 0, sat = 100, val = 100, size = 160, origColor = DEFAULT_HEX;

    function isPanelOpen() {
      return panel.classList.contains('open');
    }
    function setPanelOpen(open) {
      panel.classList.toggle('open', open);
    }

    function drawHueBar() {
      for (var y = 0; y < size; y++) {
        var rgb = hsvToRgb(y / size * 360, 100, 100);
        hctx.fillStyle = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
        hctx.fillRect(0, y, 20, 1);
      }
      var hy = Math.round(hue / 360 * size);
      var irgb = hsvToRgb(hue, 100, 100);
      var l = (0.299 * irgb.r + 0.587 * irgb.g + 0.114 * irgb.b) / 255;
      hctx.fillStyle = l > 0.65 ? '#333' : '#fff';
      hctx.fillRect(0, hy - 3, 20, 5);
    }

    function drawPalette() {
      var prgb = hsvToRgb(hue, 100, 100);
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
      var py = Math.round((100 - val) / 100 * size);
      var crgb = hsvToRgb(hue, sat, val);
      var plum = (0.299 * crgb.r + 0.587 * crgb.g + 0.114 * crgb.b) / 255;
      pctx.strokeStyle = plum > 0.55 ? '#333' : '#fff';
      pctx.lineWidth = 2;
      pctx.beginPath();
      pctx.arc(px, py, 3.5, 0, Math.PI * 2);
      pctx.stroke();
    }

    function updateFromPicker(notify) {
      var rgb = hsvToRgb(hue, sat, val);
      var hex = '#' + ((1 << 24) | (rgb.r << 16) | (rgb.g << 8) | rgb.b).toString(16).slice(1);
      hexInput.value = hex;
      preview(hex);
      // 用户滑动/输入时实时生效(打开初始化不触发,由调用方传 false)
      if (notify !== false) live(hex);
    }

    function onPaletteMove(e) {
      var rect = palette.getBoundingClientRect();
      var x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
      var y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
      x = Math.max(0, Math.min(size, x));
      y = Math.max(0, Math.min(size, y));
      sat = Math.round(x / size * 100);
      val = Math.round(100 - y / size * 100);
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

    // 拖动收尾:鼠标可能在本窗口之外松开(拖到屏幕边缘时很常见),那时 document 收不到 mouseup,
    // mousemove 监听器会永久残留,之后"未按键的鼠标移动"也会继续改颜色。故:注册前先清旧引用,
    // 用同一个具名 handler 作 mouseup(同名同参的重复注册会被浏览器忽略,不会累加),并在窗口失焦时兜底清理。
    function endPickerDrag() {
      document.removeEventListener('mousemove', onPaletteMove);
      document.removeEventListener('mousemove', onHueMove);
    }
    window.addEventListener('blur', endPickerDrag);

    palette.addEventListener('mousedown', function (e) {
      onPaletteMove(e);
      document.removeEventListener('mousemove', onPaletteMove);
      document.addEventListener('mousemove', onPaletteMove);
      document.addEventListener('mouseup', endPickerDrag, { once: true });
    });

    hueBar.addEventListener('mousedown', function (e) {
      onHueMove(e);
      document.removeEventListener('mousemove', onHueMove);
      document.addEventListener('mousemove', onHueMove);
      document.addEventListener('mouseup', endPickerDrag, { once: true });
    });

    hexInput.addEventListener('input', function () {
      var hex = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        var c = hexToRgb(hex), hsv = rgbToHsv(c.r, c.g, c.b);
        hue = hsv.h; sat = hsv.s; val = hsv.v;
        drawPalette();
        drawHueBar();
        preview(hex.toLowerCase());
        live(hex.toLowerCase());
      }
    });

    confirmBtn.addEventListener('click', function () {
      var hex = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        setColor(hex.toLowerCase());
        highlight(hex.toLowerCase());
        setPanelOpen(false);
        active = false;
      }
    });

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isPanelOpen()) {
        setPanelOpen(false);
        preview(origColor);
        highlight(origColor);
        // 回滚要立即落盘:拖动期间走的是节流,不收尾就会把中间值留在存储里
        if (active) { active = false; live(origColor, true); }
        return;
      }
      setPanelOpen(true);
      origColor = getColor() || '';          // '' 表示默认,取消时恢复
      active = true;
      var initHex = origColor || DEFAULT_HEX;
      var row = panel.querySelector('.picker-row');
      var available = row ? row.clientWidth - 26 : 160;
      size = available;
      palette.width = available; palette.height = available;
      hueBar.height = available;
      var c = hexToRgb(initHex), hsv = rgbToHsv(c.r, c.g, c.b);
      hue = hsv.h; sat = hsv.s; val = hsv.v;
      drawPalette();
      drawHueBar();
      updateFromPicker(false);
    });

    return {
      isOpen: isPanelOpen,
      close: function () {
        setPanelOpen(false);
        preview(origColor);
        highlight(origColor);
        if (active) { active = false; live(origColor, true); }
      },
      // 供外部(预设色块)在面板已展开时同步取色器内部状态:只改指向与画布,不触发预览/落盘
      setFromHex: function (hex) {
        var c = hexToRgb(hex), hsv = rgbToHsv(c.r, c.g, c.b);
        hue = hsv.h; sat = hsv.s; val = hsv.v;
        hexInput.value = hex.toLowerCase();
        drawPalette();
        drawHueBar();
      }
    };
  }

  root.ColorPicker = { create: createColorPicker };
})(typeof globalThis !== 'undefined' ? globalThis : this);
