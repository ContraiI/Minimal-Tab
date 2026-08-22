(function () {
  'use strict';


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

    // 设置弹窗的打开/关闭
    if (settingsBtn && settingsOverlay) {
      settingsBtn.addEventListener('click', function () {
        settingsOverlay.classList.remove('hidden');
      });
      settingsCloseBtn.addEventListener('click', function () {
        settingsOverlay.classList.add('hidden');
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') settingsOverlay.classList.add('hidden');
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


    // 整页翻译设置(目标语言、悬浮球开关)
    var pageTransState = {
      target: 'sidebar',
      ball: true
    };

    function savePageTrans() {
      chrome.storage.local.set({
        'pageTrans.target': pageTransState.target,
        'pageTrans.ball': pageTransState.ball
      });
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


    // 从 chrome.storage 恢复整页翻译设置
    function loadPageTransSettings() {
      chrome.storage.local.get(['pageTrans.target', 'pageTrans.ball'], function (all) {
        pageTransState.target = all['pageTrans.target'] || 'sidebar';
        pageTransState.ball = all['pageTrans.ball'] !== false;
        pageTargetDropdown.updateTrigger();
        pageBallToggle.checked = pageTransState.ball;
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
