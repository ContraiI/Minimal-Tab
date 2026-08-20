(function () {
  'use strict';

  // ===================== 样式跟随（立即执行，避免闪烁） =====================
  var ACCENT_DEFAULT = '#2563eb';

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

  // 其它扩展页（如 newtab）改动设置时，边栏实时同步
  window.addEventListener('storage', function (e) {
    if (e.key === 'accentColor') applyAccent(e.newValue);
    if (e.key === 'themeMode') applyThemeMode();
    if (e.key === 'language') {
      setLanguage(e.newValue || 'zh-CN');
      renderLangUI();
    }
  });

  // ===================== 语言列表 =====================
  // native 为母语名；本地名由 langKeyOf(code) 生成 i18n 词条（如 langEn），
  // 显示为「本地名(母语名)」，例如中文界面下「英语(English)」。
  var LANGS = [
    { code: 'auto', native: '' },
    { code: 'zh-CN', native: '简体中文' },
    { code: 'zh-TW', native: '繁體中文' },
    { code: 'en', native: 'English' },
    { code: 'ja', native: '日本語' },
    { code: 'ko', native: '한국어' },
    { code: 'fr', native: 'Français' },
    { code: 'de', native: 'Deutsch' },
    { code: 'es', native: 'Español' },
    { code: 'ru', native: 'Русский' },
    { code: 'it', native: 'Italiano' },
    { code: 'pt', native: 'Português' },
    { code: 'vi', native: 'Tiếng Việt' },
    { code: 'th', native: 'ไทย' },
    { code: 'ar', native: 'العربية' },
    { code: 'hi', native: 'हिन्दी' },
    { code: 'nl', native: 'Nederlands' },
    { code: 'pl', native: 'Polski' },
    { code: 'tr', native: 'Türkçe' },
    { code: 'sv', native: 'Svenska' },
    { code: 'da', native: 'Dansk' },
    { code: 'fi', native: 'Suomi' },
    { code: 'no', native: 'Norsk' },
    { code: 'el', native: 'Ελληνικά' },
    { code: 'cs', native: 'Čeština' },
    { code: 'hu', native: 'Magyar' },
    { code: 'ro', native: 'Română' },
    { code: 'uk', native: 'Українська' },
    { code: 'id', native: 'Bahasa Indonesia' },
    { code: 'ms', native: 'Bahasa Melayu' },
    { code: 'fil', native: 'Filipino' },
    { code: 'bn', native: 'বাংলা' },
    { code: 'ur', native: 'اردو' },
    { code: 'fa', native: 'فارسی' },
    { code: 'he', native: 'עברית' },
    { code: 'ta', native: 'தமிழ்' },
    { code: 'te', native: 'తెలుగు' },
    { code: 'ml', native: 'മലയാളം' },
    { code: 'kn', native: 'ಕನ್ನಡ' },
    { code: 'mr', native: 'मराठी' },
    { code: 'pa', native: 'ਪੰਜਾਬੀ' },
    { code: 'sw', native: 'Kiswahili' }
  ];

  function langKeyOf(code) {
    return 'lang' + code.split('-').map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join('');
  }

  function labelOf(code) {
    var entry = LANGS.find(function (l) { return l.code === code; });
    if (!entry) return code;
    if (code === 'auto') return t('transDetect');
    return t(langKeyOf(code)) + '(' + entry.native + ')';
  }

  // ===================== 独立翻译设置（trans_*，与 newtab 隔离） =====================
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

  function saveSettings() {
    localStorage.setItem(LS.source, sourceLang);
    localStorage.setItem(LS.target, targetLang);
  }

  var srcDropdown = null;
  var tgtDropdown = null;

  function renderLangUI() {
    if (srcDropdown) srcDropdown.updateTrigger();
    if (tgtDropdown) tgtDropdown.updateTrigger();
  }

  function nativeName(code) {
    var entry = LANGS.find(function (l) { return l.code === code; });
    return entry ? entry.native : code;
  }

  function engineName(eng) {
    return eng.nameKey ? t(eng.nameKey) : eng.name;
  }

  // 读取引擎在设置页配置的字段值（fields 中按 id 找）
  function engineField(eng, id) {
    var f = (eng.fields || []).find(function (x) { return x.id === id; });
    return f ? (localStorage.getItem(f.key) || '') : '';
  }

  // 非官方 Bing 翻译：抓取翻译页解析反滥用 token（IG/key/token），免费但可能随页面改版失效
  var BING_AUTH = { host: 'www.bing.com', ig: '', token: '', key: '', iid: 'translator.5028', fetchedAt: 0 };

  function getBingAuth() {
    if (BING_AUTH.token && Date.now() - BING_AUTH.fetchedAt < 30 * 60 * 1000) {
      return Promise.resolve(BING_AUTH);
    }
    return fetch('https://www.bing.com/translator').then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text().then(function (html) {
        var ig = (html.match(/IG:"([A-Za-z0-9]+)"/) || [])[1];
        var m = html.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)",\d+\]/);
        if (!ig || !m || !m[1] || !m[2]) {
          var e = new Error('BING_AUTH_PARSE');
          e.code = 'BING_AUTH_PARSE';
          throw e;
        }
        BING_AUTH.host = res.url ? new URL(res.url).host : BING_AUTH.host;
        BING_AUTH.ig = ig;
        BING_AUTH.key = m[1];
        BING_AUTH.token = m[2];
        BING_AUTH.fetchedAt = Date.now();
        return BING_AUTH;
      });
    });
  }

  // ===================== 翻译引擎（可插拔） =====================
  // 每个引擎：name / nameKey(可选) / fields(可选，设置页动态渲染) / codes(可选，语言码映射) / translate
  var ENGINES = {
    google: {
      name: 'Google',
      translate: function (text, from, to) {
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
          from + '&tl=' + to + '&dt=t&q=' + encodeURIComponent(text);
        return fetch(url).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        }).then(function (data) {
          if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('bad response');
          return data[0]
            .map(function (seg) { return Array.isArray(seg) ? seg[0] : ''; })
            .filter(Boolean)
            .join('');
        });
      }
    },
    microsoft: {
      name: 'Microsoft Translator',
      fields: [
        { id: 'key', key: 'trans.msKey', labelKey: 'transSettingsKey', type: 'password' },
        {
          id: 'region', key: 'trans.msRegion', labelKey: 'transSettingsRegion', type: 'select',
          emptyLabelKey: 'transRegionNone',
          options: [
            '', 'eastasia', 'southeastasia', 'eastus', 'eastus2', 'westus', 'westus2', 'westus3',
            'centralus', 'southcentralus', 'northcentralus', 'westcentralus', 'northeurope', 'westeurope',
            'japaneast', 'japanwest', 'koreacentral', 'koreasouth', 'australiaeast', 'australiasoutheast',
            'brazilsouth', 'southafricanorth', 'uaenorth', 'centralindia', 'southindia', 'westindia',
            'canadacentral', 'canadaeast', 'francecentral', 'germanywestcentral', 'norwayeast',
            'switzerlandnorth', 'swedencentral', 'qatarcentral', 'polandcentral', 'italynorth', 'israelcentral'
          ]
        }
      ],
      codes: { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant' },
      translate: function (text, from, to) {
        var key = engineField(this, 'key');
        if (!key) {
          var err = new Error('NEED_KEY');
          err.code = 'NEED_KEY';
          return Promise.reject(err);
        }
        var region = engineField(this, 'region');
        var toCode = this.codes[to] || to;
        var fromCode = from === 'auto' ? '' : (this.codes[from] || from);
        var url = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=' +
          encodeURIComponent(toCode);
        if (fromCode) url += '&from=' + encodeURIComponent(fromCode);
        var headers = {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };
        if (region) headers['Ocp-Apim-Subscription-Region'] = region;
        return fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify([{ Text: text }])
        }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        }).then(function (data) {
          if (!Array.isArray(data) || !data[0] || !data[0].translations || !data[0].translations[0]) {
            throw new Error('bad response');
          }
          return data[0].translations[0].text;
        });
      }
    },
    bing: {
      name: 'Microsoft (Unofficial)',
      nameKey: 'transEngineBing',
      codes: { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant' },
      translate: function (text, from, to) {
        var self = this;
        var doRequest = function () {
          return getBingAuth().then(function (auth) {
            var toCode = self.codes[to] || to;
            var fromCode = from === 'auto' ? 'auto-detect' : (self.codes[from] || from);
            var url = 'https://' + auth.host + '/ttranslatev3?isVertical=1&&IG=' + encodeURIComponent(auth.ig) +
              '&IID=' + encodeURIComponent(auth.iid) + '&token=' + encodeURIComponent(auth.token) +
              '&key=' + encodeURIComponent(auth.key);
            var body = 'fromLang=' + encodeURIComponent(fromCode) +
              '&text=' + encodeURIComponent(text) +
              '&to=' + encodeURIComponent(toCode);
            return fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body
            }).then(function (res) {
              if (res.status === 205 || res.status === 401 || res.status === 403) {
                var e = new Error('BING_AUTH_STALE');
                e.code = 'BING_AUTH_STALE';
                throw e;
              }
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            }).then(function (data) {
              if (!Array.isArray(data) || !data[0] || !data[0].translations || !data[0].translations[0]) {
                throw new Error('bad response');
              }
              return data[0].translations[0].text;
            });
          });
        };
        return doRequest().catch(function (err) {
          // token 过期/被拦 → 强制重新获取后再试一次
          if (err && err.code === 'BING_AUTH_STALE') {
            BING_AUTH.fetchedAt = 0;
            return doRequest();
          }
          throw err;
        });
      }
    },
    custom: {
      name: 'Custom (OpenAI compatible)',
      nameKey: 'transEngineCustom',
      fields: [
        { id: 'url', key: 'trans.custom.url', labelKey: 'transCustomUrl', type: 'text', placeholderKey: 'transCustomUrlPlaceholder' },
        { id: 'key', key: 'trans.custom.key', labelKey: 'transSettingsKey', type: 'password' },
        { id: 'model', key: 'trans.custom.model', labelKey: 'transCustomModel', type: 'text', placeholderKey: 'transCustomModelPlaceholder', fetchModels: true },
        { id: 'prompt', key: 'trans.custom.prompt', labelKey: 'transCustomPrompt', type: 'text' }
      ],
      translate: function (text, from, to) {
        var url = engineField(this, 'url');
        var key = engineField(this, 'key');
        var model = engineField(this, 'model');
        if (!url || !key || !model) {
          var err = new Error('MISSING_CONFIG');
          err.code = 'MISSING_CONFIG';
          return Promise.reject(err);
        }
        var srcName = from === 'auto' ? '' : nativeName(from);
        var tgtName = nativeName(to);
        var customPrompt = engineField(this, 'prompt');
        var systemPrompt = customPrompt
          ? customPrompt.replace(/\{source\}/g, srcName || 'auto').replace(/\{target\}/g, tgtName)
          : 'You are a professional translation engine. ' +
            (srcName
              ? 'Translate the text from ' + srcName + ' to ' + tgtName + '.'
              : 'Detect the source language and translate the text into ' + tgtName + '.') +
            ' Output only the translated text, without quotes or explanations.';
        var headers = { 'Content-Type': 'application/json' };
        if (key) headers['Authorization'] = 'Bearer ' + key;
        var body = {
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          temperature: 0.3
        };
        var endpoint = url.replace(/\/+$/, '') + '/chat/completions';
        return fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body)
        }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        }).then(function (data) {
          if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) throw new Error('bad response');
          return data.choices[0].message.content;
        });
      }
    }
  };

  // 容错：localStorage 可能残留已移除引擎的 id，归一化回默认引擎
  if (!ENGINES[ENGINE]) ENGINE = 'google';

  // ===================== DOM 就绪后初始化 =====================
  document.addEventListener('DOMContentLoaded', function () {
    var inputEl = document.getElementById('transInput');
    var resultText = document.getElementById('resultText');
    var resultStatus = document.getElementById('resultStatus');
    var clearBtn = document.getElementById('clearBtn');
    var swapBtn = document.getElementById('swapBtn');

    var debounceTimer = null;
    var seq = 0;

    function setStatus(text, isError) {
      resultStatus.textContent = text || '';
      resultStatus.classList.toggle('hidden', !text);
      resultStatus.classList.toggle('error', !!isError);
    }

    function clearResult() {
      seq++;                     // 使在途请求失效
      clearTimeout(debounceTimer);
      resultText.textContent = '';
      setStatus('');
    }

    function renderResult(text) {
      resultText.textContent = text;
      setStatus('');
    }

    function doTranslate(text) {
      var id = ++seq;
      setStatus(t('transTranslating'));
      ENGINES[ENGINE].translate(text, sourceLang, targetLang).then(function (out) {
        if (id !== seq) return;  // 丢弃过期响应
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

    function scheduleTranslate() {
      clearTimeout(debounceTimer);
      var text = inputEl.value.trim();
      if (!text) { clearResult(); return; }
      debounceTimer = setTimeout(function () { doTranslate(text); }, DEBOUNCE_MS);
    }

    function retranslate() { scheduleTranslate(); }

    // ---- 语言下拉（轻量自定义 dropdown，样式对齐 newtab） ----
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

    // ---- 快捷调换 ----
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

    // ---- 输入交互 ----
    var justFocused = false;

    inputEl.addEventListener('focus', function () {
      inputEl.select();
      justFocused = true;
    });

    // 仅拦截触发全选那一次点击，避免浏览器把光标定位到点击处覆盖全选；之后再点击仍可取消全选做局部编辑
    inputEl.addEventListener('mouseup', function (e) {
      if (justFocused) {
        e.preventDefault();
        justFocused = false;
      }
    });

    inputEl.addEventListener('blur', function () {
      justFocused = false;
    });

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

    // ---- 设置页（仅控制翻译模块，完全覆盖翻译界面） ----
    var settingsBtn = document.getElementById('settingsBtn');
    var settingsOverlay = document.getElementById('settingsOverlay');
    var settingsCloseBtn = document.getElementById('settingsCloseBtn');

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

    var engineDropdown = buildDropdown(
      document.getElementById('engineSelect'),
      document.getElementById('engineList'),
      Object.keys(ENGINES),
      function (code) { return ENGINES[code] ? engineName(ENGINES[code]) : code; },
      function () { return ENGINE; },
      function (code) {
        ENGINE = code;
        localStorage.setItem(LS.engine, code);
        renderEngineFields();
        retranslate();
      }
    );
    engineDropdown.updateTrigger();

    // 引擎配置字段：按所选引擎的 fields 动态渲染（key/区域/自定义配置等）
    var engineFieldsEl = document.getElementById('engineFields');

    function buildFieldInput(f) {
      var input = document.createElement('input');
      input.className = 'setting-input';
      input.type = f.type || 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (f.placeholderKey) input.placeholder = t(f.placeholderKey);
      input.value = localStorage.getItem(f.key) || '';
      input.addEventListener('change', function () {
        localStorage.setItem(f.key, input.value.trim());
      });
      return input;
    }

    function renderModelHint(listEl, msg) {
      listEl.innerHTML = '';
      var div = document.createElement('div');
      div.className = 'model-hint';
      div.textContent = msg;
      listEl.appendChild(div);
      listEl.classList.add('open');
    }

    function renderModelList(listEl, ids, f, input) {
      listEl.innerHTML = '';
      ids.forEach(function (id) {
        var item = document.createElement('div');
        item.className = 'model-option' + (id === input.value ? ' active' : '');
        item.textContent = id;
        item.addEventListener('click', function () {
          input.value = id;
          localStorage.setItem(f.key, id);
          listEl.classList.remove('open');
        });
        listEl.appendChild(item);
      });
      listEl.classList.add('open');
    }

    // 兼容中转站 /models 的多种返回格式：data.data[].id、data.models[]、顶层数组、
    // 元素为字符串或含 id/model/name/model_id 字段的对象
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

    // OpenAI 兼容接口的 GET {base}/models 拉取模型列表
    function fetchModels(eng, listEl, f, input) {
      var url = engineField(eng, 'url');
      var key = engineField(eng, 'key');
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
        // 中转站常把未实现的 /models 返回为 HTML 页面而非 JSON，先按 Content-Type 拦截
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
        renderModelList(listEl, ids, f, input);
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

    function renderEngineFields() {
      engineFieldsEl.innerHTML = '';
      var eng = ENGINES[ENGINE];
      (eng.fields || []).forEach(function (f) {
        var row = document.createElement('div');
        row.className = 'setting-row';
        var label = document.createElement('label');
        label.className = 'setting-label';
        label.textContent = t(f.labelKey);
        row.appendChild(label);

        if (f.type === 'select') {
          // 下拉选择字段（复用语言下拉组件），例如 Azure 区域
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
            function () { return localStorage.getItem(f.key) || ''; },
            function (v) { localStorage.setItem(f.key, v); }
          ).updateTrigger();
          row.appendChild(selWrap);
        } else if (f.fetchModels) {
          var wrap = document.createElement('div');
          wrap.className = 'setting-model-wrap';
          var input = buildFieldInput(f);
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'setting-fetch-btn';
          btn.title = t('transFetchModels');
          btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
          var listEl = document.createElement('div');
          listEl.className = 'model-list';
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            fetchModels(eng, listEl, f, input);
          });
          wrap.appendChild(input);
          wrap.appendChild(btn);
          wrap.appendChild(listEl);
          row.appendChild(wrap);
        } else {
          row.appendChild(buildFieldInput(f));
        }
        engineFieldsEl.appendChild(row);
      });
    }

    // 统一点击外部关闭：语言下拉与模型列表（仅注册一次）
    document.addEventListener('click', function () {
      document.querySelectorAll('.lang-select.open').forEach(function (w) { w.classList.remove('open'); });
      document.querySelectorAll('.model-list.open').forEach(function (el) { el.classList.remove('open'); });
    });

    renderEngineFields();
    renderLangUI();
    inputEl.focus();
  });
})();
