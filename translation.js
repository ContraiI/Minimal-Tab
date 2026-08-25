(function () {
  'use strict';


  // 颜色工具函数(移植自标签页 script.js,供取色器使用)
  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

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


  var ACCENT_DEFAULT = '#2563eb';

  // 应用主题色到 CSS 变量,并根据亮度选择对比文字色
  function applyAccent(hex) {
    var h = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : ACCENT_DEFAULT;
    var r = parseInt(h.slice(1, 3), 16);
    var g = parseInt(h.slice(3, 5), 16);
    var b = parseInt(h.slice(5, 7), 16);
    document.body.style.setProperty('--accent', h);
    document.body.style.setProperty('--accent-rgb', r + ', ' + g + ', ' + b);
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    document.body.style.setProperty('--accent-text', lum > 0.55 ? '#1a1a1a' : '#ffffff');
  }

  function getSystemDark() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // 应用主题模式(系统/浅色/深色)
  function applyThemeMode() {
    var mode = localStorage.getItem('themeMode') || 'system';
    var isDark = mode === 'system' ? getSystemDark() : mode === 'dark';
    document.body.classList.toggle('light', !isDark);
  }

  applyAccent(localStorage.getItem('accentColor'));
  applyThemeMode();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if ((localStorage.getItem('themeMode') || 'system') === 'system') applyThemeMode();
  });


  // 同步其他标签页对主题/语言的修改
  window.addEventListener('storage', function (e) {
    if (e.key === 'accentColor') applyAccent(e.newValue);
    if (e.key === 'themeMode') applyThemeMode();
    if (e.key === 'language') {
      setLanguage(e.newValue || 'zh-CN');
      renderLangUI();
    }
  });



  var LANGS = TranslateEngine.LANGS;

  // 语言代码转 i18n key(如 zh-CN → langZhCn)
  function langKeyOf(code) {
    return 'lang' + code.split('-').map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join('');
  }

  // 语言选项的显示文本(本地化名 + 原生名)
  function labelOf(code) {
    var entry = LANGS.find(function (l) { return l.code === code; });
    if (!entry) return code;
    if (code === 'auto') return t('transDetect');
    return t(langKeyOf(code)) + '(' + entry.native + ')';
  }


  // 翻译设置与当前语言状态
  var LS = {
    source: 'trans.sourceLang',
    target: 'trans.targetLang',
    engine: 'trans.engine'
  };
  var ENGINE = localStorage.getItem(LS.engine) || 'google';
  var sourceLang = localStorage.getItem(LS.source) || 'auto';
  var targetLang = localStorage.getItem(LS.target) || 'zh-CN';
  var lastRealSource = sourceLang !== 'auto' ? sourceLang : null;
  var DEBOUNCE_MS = 600;

  // 保存源/目标语言并同步到 chrome.storage
  function saveSettings() {
    localStorage.setItem(LS.source, sourceLang);
    localStorage.setItem(LS.target, targetLang);
    syncTransToStorage();
  }


  // 把全部 trans.* 设置同步给后台(供整页翻译使用)
  function syncTransToStorage() {
    var obj = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('trans.') === 0) obj[k] = localStorage.getItem(k);
    }
    chrome.storage.local.set(obj);
  }

  var srcDropdown = null;
  var tgtDropdown = null;
  var pageDropdowns = [];

  function renderLangUI() {
    if (srcDropdown) srcDropdown.updateTrigger();
    if (tgtDropdown) tgtDropdown.updateTrigger();
    pageDropdowns.forEach(function (d) { d.updateTrigger(); });
  }

  // 引擎显示名(优先 i18n key)
  function engineName(eng) {
    return eng.nameKey ? t(eng.nameKey) : eng.name;
  }



  var ENGINES = TranslateEngine.ENGINES;

  // 把侧边栏的引擎配置同步给 TranslateEngine
  function syncSidebarEngine() {
    var eng = ENGINES[ENGINE] || ENGINES.google;
    var fields = {};
    (eng.fields || []).forEach(function (f) { fields[f.id] = localStorage.getItem(f.key) || ''; });
    TranslateEngine.setSettings(ENGINE, fields);
  }


  if (!ENGINES[ENGINE]) ENGINE = 'google';


  document.addEventListener('DOMContentLoaded', function () {
    // 翻译输入/输出与结果状态 DOM
    var inputEl = document.getElementById('transInput');
    var resultText = document.getElementById('resultText');
    var resultStatus = document.getElementById('resultStatus');
    var clearBtn = document.getElementById('clearBtn');
    var swapBtn = document.getElementById('swapBtn');

    var debounceTimer = null;
    var seq = 0;

    // 显示翻译状态/错误信息
    function setStatus(text, isError) {
      resultStatus.textContent = text || '';
      resultStatus.classList.toggle('hidden', !text);
      resultStatus.classList.toggle('error', !!isError);
    }

    // 清空结果并取消进行中的翻译
    function clearResult() {
      seq++;
      clearTimeout(debounceTimer);
      resultText.textContent = '';
      setStatus('');
    }

    function renderResult(text) {
      resultText.textContent = text;
      setStatus('');
    }

    // 执行翻译,通过序号丢弃过期结果
    function doTranslate(text) {
      var id = ++seq;
      setStatus(t('transTranslating'));
      syncSidebarEngine();
      TranslateEngine.translateText(text, sourceLang, targetLang).then(function (out) {
        if (id !== seq) return;
        renderResult(out);
      }).catch(function (err) {
        if (id !== seq) return;
        var code = err && err.code;
        if (code === 'NEED_KEY' || code === 'MISSING_CONFIG') {
          setStatus(code === 'NEED_KEY' ? t('transNeedKey') : t('transNeedConfig'), true);
          return;
        }
        setStatus(t('transError'), true);
        console.error('翻译失败', err);
      });
    }

    // 输入防抖后触发翻译
    function scheduleTranslate() {
      clearTimeout(debounceTimer);
      var text = inputEl.value.trim();
      if (!text) { clearResult(); return; }
      debounceTimer = setTimeout(function () { doTranslate(text); }, DEBOUNCE_MS);
    }

    function retranslate() { scheduleTranslate(); }


    // 下拉选择框工厂:渲染选项、更新触发器文案、点击关闭
    function buildDropdown(wrapEl, listEl, options, labelFn, getActive, onChange) {
      function render() {
        listEl.innerHTML = '';
        options.forEach(function (code) {
          var item = document.createElement('div');
          item.className = 'lang-option' + (code === getActive() ? ' active' : '');
          item.textContent = labelFn(code);
          item.dataset.code = code;
          item.addEventListener('click', function () {
            onChange(code);
            updateTrigger();
            wrapEl.classList.remove('open');
          });
          listEl.appendChild(item);
        });
      }
      function updateTrigger() {
        wrapEl.querySelector('.lang-trigger-label').textContent = labelFn(getActive());
      }
      wrapEl.querySelector('.lang-trigger').addEventListener('click', function (e) {
        e.stopPropagation();
        document.querySelectorAll('.lang-select.open').forEach(function (w) {
          if (w !== wrapEl) w.classList.remove('open');
        });
        wrapEl.classList.toggle('open');
        render();
      });
      return { render: render, updateTrigger: updateTrigger };
    }

    var sourceOptions = LANGS.map(function (l) { return l.code; });
    var targetOptions = LANGS.filter(function (l) { return l.code !== 'auto'; }).map(function (l) { return l.code; });

    srcDropdown = buildDropdown(
      document.getElementById('sourceLangSelect'),
      document.getElementById('sourceLangList'),
      sourceOptions,
      labelOf,
      function () { return sourceLang; },
      function (code) {
        sourceLang = code;
        if (code !== 'auto') lastRealSource = code;
        saveSettings();
        retranslate();
      }
    );

    tgtDropdown = buildDropdown(
      document.getElementById('targetLangSelect'),
      document.getElementById('targetLangList'),
      targetOptions,
      labelOf,
      function () { return targetLang; },
      function (code) {
        targetLang = code;
        saveSettings();
        retranslate();
        renderStylePreviews();
      }
    );


    // 交换源/目标语言(自动检测时取上次真实源语言)
    swapBtn.addEventListener('click', function () {
      if (sourceLang === 'auto') {
        var oldTarget = targetLang;
        sourceLang = oldTarget;
        targetLang = (lastRealSource && lastRealSource !== oldTarget)
          ? lastRealSource
          : (oldTarget === 'en' ? 'zh-CN' : 'en');
      } else {
        var s = sourceLang;
        sourceLang = targetLang;
        targetLang = s;
      }
      lastRealSource = sourceLang !== 'auto' ? sourceLang : lastRealSource;
      saveSettings();
      renderLangUI();
      retranslate();
    });


    var justFocused = false;

    // 聚焦时全选文本(先聚焦不选中,避免破坏选择)
    inputEl.addEventListener('focus', function () {
      inputEl.select();
      justFocused = true;
    });


    inputEl.addEventListener('mouseup', function (e) {
      if (justFocused) {
        e.preventDefault();
        justFocused = false;
      }
    });

    inputEl.addEventListener('blur', function () {
      justFocused = false;
    });

    // 输入时防抖翻译,并按内容显示/隐藏清空按钮
    inputEl.addEventListener('input', function () {
      scheduleTranslate();
      clearBtn.style.display = inputEl.value ? 'flex' : 'none';
    });

    clearBtn.addEventListener('click', function () {
      inputEl.value = '';
      inputEl.focus();
      clearResult();
      clearBtn.style.display = 'none';
    });


    var settingsBtn = document.getElementById('settingsBtn');
    var settingsOverlay = document.getElementById('settingsOverlay');
    var settingsCloseBtn = document.getElementById('settingsCloseBtn');

    // 关闭设置面板:收起浮层,并让译文样式回到折叠、打开的色盘关闭
    // (styleSection/取色器在下文声明,var 提升 + 空值判断,调用时必已赋值)
    function closeSettingsPanel() {
      settingsOverlay.classList.remove('open');
      if (styleSection) styleSection.classList.add('collapsed');
      if (pageTransFontPicker && pageTransFontPicker.isOpen()) pageTransFontPicker.close();
      if (pageTransLinePicker && pageTransLinePicker.isOpen()) pageTransLinePicker.close();
    }

    // 设置弹窗的打开/关闭(带淡入淡出)
    if (settingsBtn && settingsOverlay) {
      settingsBtn.addEventListener('click', function () {
        settingsOverlay.classList.add('open');
      });
      settingsCloseBtn.addEventListener('click', closeSettingsPanel);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSettingsPanel();
      });
    }



    // 渲染当前引擎的配置字段(文本框/下拉/模型拉取按钮)
    function renderEngineSection(containerEl, store) {
      containerEl.innerHTML = '';
      var eng = TranslateEngine.ENGINES[store.engine()] || TranslateEngine.ENGINES.google;
      (eng.fields || []).forEach(function (f) {
        var fullKey = f.key;
        var row = document.createElement('div');
        row.className = 'setting-row' + (f.wideLabel ? ' setting-row-stacked' : '');
        var label = document.createElement('label');
        label.className = 'setting-label';
        label.textContent = t(f.labelKey);
        row.appendChild(label);

        if (f.type === 'select') {

          var selWrap = document.createElement('div');
          selWrap.className = 'lang-select';
          var trigger = document.createElement('button');
          trigger.type = 'button';
          trigger.className = 'lang-trigger';
          trigger.innerHTML = '<span class="lang-trigger-label"></span>';
          var listEl = document.createElement('div');
          listEl.className = 'lang-list';
          selWrap.appendChild(trigger);
          selWrap.appendChild(listEl);
          buildDropdown(
            selWrap, listEl, f.options,
            function (v) { return v === '' ? t(f.emptyLabelKey || '') : v; },
            function () { return store.get(fullKey); },
            function (v) { store.set(fullKey, v); store.onFieldChange && store.onFieldChange(); }
          ).updateTrigger();
          row.appendChild(selWrap);
        } else if (f.fetchModels) {
          var wrap = document.createElement('div');
          wrap.className = 'setting-model-wrap';
          var input = buildFieldInput(f, fullKey, store);
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'setting-fetch-btn';
          btn.title = t('transFetchModels');
          btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
          var listEl = document.createElement('div');
          listEl.className = 'model-list';
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            fetchModels(store, listEl, f, input);
          });
          wrap.appendChild(input);
          wrap.appendChild(btn);
          wrap.appendChild(listEl);
          row.appendChild(wrap);
        } else {
          row.appendChild(buildFieldInput(f, fullKey, store));
        }
        containerEl.appendChild(row);
      });
    }

    // 构建单个配置输入框
    function buildFieldInput(f, fullKey, store) {
      var input = document.createElement('input');
      input.className = 'setting-input';
      input.type = f.type || 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (f.placeholderKey) input.placeholder = t(f.placeholderKey);
      input.value = store.get(fullKey);
      input.addEventListener('change', function () {
        store.set(fullKey, input.value.trim());
        store.onFieldChange && store.onFieldChange();
      });
      return input;
    }

    // 模型列表区域的提示信息
    function renderModelHint(listEl, msg) {
      listEl.innerHTML = '';
      var div = document.createElement('div');
      div.className = 'model-hint';
      div.textContent = msg;
      listEl.appendChild(div);
      listEl.classList.add('open');
    }

    // 渲染可选择的模型列表
    function renderModelList(listEl, ids, f, input, store) {
      listEl.innerHTML = '';
      var fullKey = f.key;
      ids.forEach(function (id) {
        var item = document.createElement('div');
        item.className = 'model-option' + (id === input.value ? ' active' : '');
        item.textContent = id;
        item.addEventListener('click', function () {
          input.value = id;
          store.set(fullKey, id);
          store.onFieldChange && store.onFieldChange();
          listEl.classList.remove('open');
        });
        listEl.appendChild(item);
      });
      listEl.classList.add('open');
    }



    // 从各种响应结构里提取模型 ID 并去重
    function extractModelIds(data) {
      var ids = [];
      var push = function (v) {
        if (typeof v === 'string' && v) { ids.push(v); }
        else if (v && typeof v === 'object') {
          var id = v.id || v.model || v.name || v.model_id || v.slug;
          if (typeof id === 'string' && id) ids.push(id);
        }
      };
      var arr = null;
      if (Array.isArray(data)) arr = data;
      else if (data && Array.isArray(data.data)) arr = data.data;
      else if (data && Array.isArray(data.models)) arr = data.models;
      else if (data && data.data && Array.isArray(data.data.data)) arr = data.data.data;
      if (arr) arr.forEach(push);
      return ids.filter(function (v, i) { return ids.indexOf(v) === i; });
    }

    // 读取自定义引擎的某配置字段
    function engineStoreField(store, id) {
      var eng = TranslateEngine.ENGINES.custom;
      var fd = (eng.fields || []).find(function (x) { return x.id === id; });
      if (!fd) return '';
      return store.get(fd.key);
    }


    // 调用自定义引擎的 /models 接口拉取可用模型
    function fetchModels(store, listEl, f, input) {
      var url = engineStoreField(store, 'url');
      var key = engineStoreField(store, 'key');
      if (!url || !key) {
        renderModelHint(listEl, t('transModelNeedUrlKey'));
        return;
      }
      renderModelHint(listEl, t('transModelLoading'));
      fetch(url.replace(/\/+$/, '') + '/models', {
        headers: { 'Authorization': 'Bearer ' + key }
      }).then(function (res) {
        if (res.status === 401 || res.status === 403) {
          var e = new Error('AUTH');
          e.code = 'AUTH';
          throw e;
        }
        if (!res.ok) {
          var e2 = new Error('NOT_SUPPORTED');
          e2.code = 'NOT_SUPPORTED';
          e2.status = res.status;
          throw e2;
        }

        var ctype = (res.headers && res.headers.get && res.headers.get('Content-Type')) || '';
        if (ctype && ctype.indexOf('json') === -1) {
          var e3 = new Error('NOT_SUPPORTED');
          e3.code = 'NOT_SUPPORTED';
          e3.status = res.status;
          throw e3;
        }
        return res.json();
      }).then(function (data) {
        var ids = extractModelIds(data);
        if (!ids.length) {
          var e4 = new Error('NO_MODELS');
          e4.code = 'NO_MODELS';
          throw e4;
        }
        renderModelList(listEl, ids, f, input, store);
      }).catch(function (err) {
        var code = err && err.code;
        if (code === 'AUTH') {
          renderModelHint(listEl, t('transModelAuthFailed'));
          return;
        }
        if (code === 'NOT_SUPPORTED' || code === 'NO_MODELS' || err instanceof SyntaxError) {
          var msg = t('transModelNotSupported');
          if (err && err.status) msg += ' (HTTP ' + err.status + ')';
          renderModelHint(listEl, msg);
          return;
        }
        renderModelHint(listEl, t('transModelFetchFailed'));
      });
    }


    var engineFieldsEl = document.getElementById('engineFields');
    // 引擎配置的读写封装(读写 localStorage 并同步给引擎)
    var sidebarStore = {
      get: function (fullKey) { return localStorage.getItem(fullKey) || ''; },
      set: function (fullKey, val) { localStorage.setItem(fullKey, val); },
      engine: function () { return ENGINE; },
      setEngine: function (id) { ENGINE = id; localStorage.setItem(LS.engine, id); },
      onEngineChange: function () {
        syncSidebarEngine();
        renderEngineSection(engineFieldsEl, sidebarStore);
        retranslate();
        syncTransToStorage();
      },
      onFieldChange: function () { syncSidebarEngine(); syncTransToStorage(); }
    };

    var engineDropdown = buildDropdown(
      document.getElementById('engineSelect'),
      document.getElementById('engineList'),
      Object.keys(ENGINES),
      function (code) { return ENGINES[code] ? engineName(ENGINES[code]) : code; },
      function () { return ENGINE; },
      function (code) { sidebarStore.setEngine(code); sidebarStore.onEngineChange(); }
    );
    engineDropdown.updateTrigger();


    // 整页翻译设置(目标语言、悬浮球、呈现方式、译文样式)
    var pageTransState = {
      target: 'sidebar',
      ball: true,
      mode: 'replace',
      fontColor: '',
      italic: false,
      bold: false,
      style: 'none',
      styleColors: {}
    };

    function savePageTrans() {
      chrome.storage.local.set({
        'pageTrans.target': pageTransState.target,
        'pageTrans.ball': pageTransState.ball,
        'pageTrans.mode': pageTransState.mode,
        'pageTrans.fontColor': pageTransState.fontColor,
        'pageTrans.italic': pageTransState.italic,
        'pageTrans.bold': pageTransState.bold,
        'pageTrans.style': pageTransState.style,
        'pageTrans.styleColors': pageTransState.styleColors
      });
      renderStylePreviews();
    }

    var pageTargetDropdown = buildDropdown(
      document.getElementById('pageTargetSelect'),
      document.getElementById('pageTargetList'),
      ['sidebar'].concat(targetOptions),
      function (code) { return code === 'sidebar' ? t('pageTransFollowSidebar') : labelOf(code); },
      function () { return pageTransState.target; },
      function (code) { pageTransState.target = code; savePageTrans(); }
    );
    pageDropdowns.push(pageTargetDropdown);

    var pageBallToggle = document.getElementById('pageBallToggle');
    pageBallToggle.addEventListener('change', function () {
      pageTransState.ball = pageBallToggle.checked;
      savePageTrans();
    });

    var pageModeSelect = document.getElementById('pageModeSelect');
    var pageModeOptions = [].slice.call(pageModeSelect.querySelectorAll('.theme-mode-opt'));
    pageModeOptions.forEach(function (btn) {
      btn.addEventListener('click', function () {
        pageTransState.mode = btn.getAttribute('data-mode');
        pageModeOptions.forEach(function (b) { b.classList.toggle('active', b === btn); });
        updateStyleSectionVisibility();
        savePageTrans();
      });
    });


    // ===== 译文样式(双语对照) =====

    var styleSection = document.getElementById('pageTransStyleSection');
    var styleToggle = document.getElementById('pageTransStyleToggle');

    // 译文样式区块仅双语对照时显示,默认折叠;显隐带 max-height+opacity 过渡(参考标签页时钟条件行)
    function updateStyleSectionVisibility() {
      if (styleSection) styleSection.classList.toggle('mode-show', pageTransState.mode === 'bilingual');
    }

    if (styleToggle && styleSection) {
      styleToggle.addEventListener('click', function () {
        styleSection.classList.toggle('collapsed');
      });
    }

    // canvas 取色器工厂(移植自标签页 script.js;面板用 .open 展开,颜色经 get/set 回调读写)
    function createColorPicker(cfg) {
      var panel = cfg.panel, palette = cfg.palette, hueBar = cfg.hueBar,
          hexInput = cfg.hexInput, confirmBtn = cfg.confirmBtn, trigger = cfg.trigger,
          getColor = cfg.getColor, setColor = cfg.setColor,
          preview = cfg.preview || function () {}, highlight = cfg.highlight || function () {};
      var DEFAULT_HEX = cfg.defaultColor || '#2563eb';
      if (!panel || !palette || !hueBar) return null;
      var pctx = palette.getContext('2d');
      var hctx = hueBar.getContext('2d');
      var hue = 0, sat = 100, val = 100, size = 160, origColor = DEFAULT_HEX;

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

      function updateFromPicker() {
        var rgb = hsvToRgb(hue, sat, val);
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

      palette.addEventListener('mousedown', function (e) {
        onPaletteMove(e);
        document.addEventListener('mousemove', onPaletteMove);
        document.addEventListener('mouseup', function () {
          document.removeEventListener('mousemove', onPaletteMove);
        }, { once: true });
      });

      hueBar.addEventListener('mousedown', function (e) {
        onHueMove(e);
        document.addEventListener('mousemove', onHueMove);
        document.addEventListener('mouseup', function () {
          document.removeEventListener('mousemove', onHueMove);
        }, { once: true });
      });

      hexInput.addEventListener('input', function () {
        var hex = hexInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
          var c = hexToRgb(hex), hsv = rgbToHsv(c.r, c.g, c.b);
          hue = hsv.h; sat = hsv.s; val = hsv.v;
          drawPalette();
          drawHueBar();
          preview(hex.toLowerCase());
        }
      });

      confirmBtn.addEventListener('click', function () {
        var hex = hexInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
          setColor(hex.toLowerCase());
          highlight(hex.toLowerCase());
          panel.classList.remove('open');
        }
      });

      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = panel.classList.contains('open');
        if (isOpen) {
          panel.classList.remove('open');
          preview(origColor);
          highlight(origColor);
          return;
        }
        panel.classList.add('open');
        origColor = getColor() || '';          // '' 表示默认,取消时恢复
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
        updateFromPicker();
      });

      return {
        isOpen: function () { return panel.classList.contains('open'); },
        close: function () { panel.classList.remove('open'); preview(origColor); highlight(origColor); }
      };
    }

    // 字体颜色 / 边框颜色:「恢复默认」按钮的状态渲染(值为空→置灰)
    function makeColorDefaultRender(btn) {
      return function (value) { btn.classList.toggle('is-default', !value); };
    }
    var pageTransFontColorDefault = document.getElementById('pageTransFontColorDefault');
    var pageTransLineColorDefault = document.getElementById('pageTransLineColorDefault');
    var fontRowRender = makeColorDefaultRender(pageTransFontColorDefault);
    var lineRowRender = makeColorDefaultRender(pageTransLineColorDefault);

    // 字体颜色:恢复默认 + 自定义取色
    pageTransFontColorDefault.addEventListener('click', function () {
      if (!pageTransState.fontColor) return;
      pageTransState.fontColor = '';
      savePageTrans();
      fontRowRender('');
    });

    var pageTransFontPicker = createColorPicker({
      panel: document.getElementById('pageTransFontColorPanel'),
      palette: document.getElementById('pageTransFontPalette'),
      hueBar: document.getElementById('pageTransFontHueBar'),
      hexInput: document.getElementById('pageTransFontHex'),
      confirmBtn: document.getElementById('pageTransFontConfirm'),
      trigger: document.getElementById('pageTransFontColorTrigger'),
      getColor: function () { return pageTransState.fontColor; },
      setColor: function (hex) { pageTransState.fontColor = hex; savePageTrans(); },
      preview: fontRowRender,
      highlight: fontRowRender
    });

    // 边框颜色(绑定当前样式,各样式颜色独立)
    var pageTransLineColorBlock = document.getElementById('pageTransLineColorBlock');

    function lineColorCurrent() {
      return pageTransState.styleColors[pageTransState.style] || '';
    }
    pageTransLineColorDefault.addEventListener('click', function () {
      if (!lineColorCurrent()) return;
      pageTransState.styleColors[pageTransState.style] = '';
      savePageTrans();
      lineRowRender('');
    });

    var pageTransLinePicker = createColorPicker({
      panel: document.getElementById('pageTransLineColorPanel'),
      palette: document.getElementById('pageTransLinePalette'),
      hueBar: document.getElementById('pageTransLineHueBar'),
      hexInput: document.getElementById('pageTransLineHex'),
      confirmBtn: document.getElementById('pageTransLineConfirm'),
      trigger: document.getElementById('pageTransLineColorTrigger'),
      getColor: lineColorCurrent,
      setColor: function (hex) { pageTransState.styleColors[pageTransState.style] = hex; savePageTrans(); },
      preview: lineRowRender,
      highlight: lineRowRender
    });

    // 带线条的样式开启时显示边框颜色块,切换样式时刷新该样式独立的颜色
    function updateLineColorBlock() {
      var hasLine = pageTransState.style !== 'none';
      if (pageTransLineColorBlock) pageTransLineColorBlock.hidden = !hasLine;
      if (hasLine) lineRowRender(lineColorCurrent());
    }

    // B 区:译文样式单选(radio 开关列表)
    var pageTransStyleSelect = document.getElementById('pageTransStyleSelect');
    var pageTransStyleRadios = [].slice.call(pageTransStyleSelect.querySelectorAll('input[name="pageTransStyle"]'));
    pageTransStyleRadios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        pageTransState.style = radio.value;
        updateLineColorBlock();
        savePageTrans();
      });
    });

    // A 区:斜体 / 粗体
    var pageTransItalicToggle = document.getElementById('pageTransItalic');
    var pageTransBoldToggle = document.getElementById('pageTransBold');
    pageTransItalicToggle.addEventListener('change', function () {
      pageTransState.italic = pageTransItalicToggle.checked;
      savePageTrans();
    });
    pageTransBoldToggle.addEventListener('change', function () {
      pageTransState.bold = pageTransBoldToggle.checked;
      savePageTrans();
    });


    // 译文预览样本(按目标语言)
    var PREVIEW_SAMPLES = {
      'zh-CN': '译文预览示例', 'zh-TW': '譯文預覽範例', 'en': 'Translation preview',
      'ja': '翻訳プレビュー', 'ko': '번역 미리보기', 'fr': 'Aperçu de traduction',
      'de': 'Übersetzungsvorschau', 'es': 'Vista previa', 'ru': 'Предпросмотр перевода',
      'it': 'Anteprima di traduzione', 'pt': 'Pré-visualização', 'vi': 'Xem trước bản dịch',
      'th': 'ตัวอย่างคำแปล', 'ar': 'معاينة الترجمة', 'hi': 'अनुवाद पूर्वावलोकन',
      'nl': 'Vertalingsvoorbeeld', 'pl': 'Podgląd tłumaczenia', 'tr': 'Çeviri önizleme',
      'sv': 'Förhandsvisning', 'da': 'Oversættelsesvisning', 'fi': 'Käännösesikatselu',
      'el': 'Προεπισκόπηση μετάφρασης', 'cs': 'Náhled překladu'
    };

    // 实际目标语言(跟随侧边栏时取侧边栏目标语言)
    function effectiveTarget() {
      return pageTransState.target === 'sidebar'
        ? (localStorage.getItem('trans.targetLang') || 'zh-CN')
        : pageTransState.target;
    }

    // 写入内联 CSS 变量,空值则移除
    function setStyleVar(el, name, value) {
      if (value) el.style.setProperty(name, value);
      else el.style.removeProperty(name);
    }

    // 重绘各样式选项的译文预览(文本随目标语言,样式随 A 区设置与该选项的线条装饰)
    function renderStylePreviews() {
      var previews = [].slice.call(document.querySelectorAll('.style-preview'));
      if (!previews.length) return;
      var text = PREVIEW_SAMPLES[effectiveTarget()] || 'Translation preview';
      previews.forEach(function (el) {
        el.textContent = text;
        var key = (el.classList.contains('pt-underlineA') && 'underlineA') ||
                  (el.classList.contains('pt-underlineB') && 'underlineB') ||
                  (el.classList.contains('pt-underlineC') && 'underlineC') ||
                  (el.classList.contains('pt-borderA') && 'borderA') ||
                  (el.classList.contains('pt-borderB') && 'borderB') || 'none';
        setStyleVar(el, '--pt-color', pageTransState.fontColor);
        setStyleVar(el, '--pt-italic', pageTransState.italic ? 'italic' : '');
        setStyleVar(el, '--pt-bold', pageTransState.bold ? 'bold' : '');
        setStyleVar(el, '--pt-line', (pageTransState.styleColors && pageTransState.styleColors[key]) || '');
      });
    }


    // 从 chrome.storage 恢复整页翻译设置
    function loadPageTransSettings() {
      chrome.storage.local.get(['pageTrans.target', 'pageTrans.ball', 'pageTrans.mode', 'pageTrans.fontColor', 'pageTrans.italic', 'pageTrans.bold', 'pageTrans.style', 'pageTrans.styleColors'], function (all) {
        pageTransState.target = all['pageTrans.target'] || 'sidebar';
        pageTransState.ball = all['pageTrans.ball'] !== false;
        pageTransState.mode = all['pageTrans.mode'] === 'bilingual' ? 'bilingual' : 'replace';
        pageTransState.fontColor = all['pageTrans.fontColor'] || '';
        pageTransState.italic = !!all['pageTrans.italic'];
        pageTransState.bold = !!all['pageTrans.bold'];
        pageTransState.style = all['pageTrans.style'] || 'none';
        pageTransState.styleColors = all['pageTrans.styleColors'] || {};
        pageTargetDropdown.updateTrigger();
        pageBallToggle.checked = pageTransState.ball;
        pageModeOptions.forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-mode') === pageTransState.mode);
        });
        pageTransItalicToggle.checked = pageTransState.italic;
        pageTransBoldToggle.checked = pageTransState.bold;
        pageTransStyleRadios.forEach(function (r) {
          r.checked = (r.value === pageTransState.style);
        });
        fontRowRender(pageTransState.fontColor);
        updateLineColorBlock();
        updateStyleSectionVisibility();
        renderStylePreviews();
      });
    }

    document.addEventListener('click', function () {
      document.querySelectorAll('.lang-select.open').forEach(function (w) { w.classList.remove('open'); });
      document.querySelectorAll('.model-list.open').forEach(function (el) { el.classList.remove('open'); });
    });

    renderEngineSection(engineFieldsEl, sidebarStore);
    renderLangUI();
    inputEl.focus();
    loadPageTransSettings();
    syncSidebarEngine();
    syncTransToStorage();
  });
})();
