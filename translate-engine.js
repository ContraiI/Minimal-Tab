(function (root) {
  'use strict';

  // 支持的语言列表(含自动检测项)
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

  // 获取语言代码对应的原生名称
  function nativeName(code) {
    var entry = LANGS.find(function (l) { return l.code === code; });
    return entry ? entry.native : code;
  }



  // 当前选中引擎与引擎配置字段
  var current = { engine: 'google', fields: {} };

  // 读取某引擎配置字段的值
  function getField(eng, id) {
    var f = (eng.fields || []).find(function (x) { return x.id === id; });
    if (!f) return '';
    var v = current.fields[id];
    if (v === undefined || v === null || v === '') return f.defaultValue || '';
    return String(v);
  }


  // 必应翻译认证参数缓存(30 分钟内复用)
  var BING_AUTH = { host: 'www.bing.com', ig: '', token: '', key: '', iid: 'translator.5028', fetchedAt: 0 };

  // 抓取必应翻译页并解析认证参数
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




  // 腾讯云 TC3-HMAC-SHA256 签名所需工具(WebCrypto 异步实现,扩展页与服务工均为安全上下文)
  function bytesToHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += ('0' + bytes[i].toString(16)).slice(-2);
    return s;
  }

  function tc3Hmac(keyBytes, msg) {
    return crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (key) { return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)); });
  }

  function tc3Sha256Hex(data) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)).then(function (buf) {
      return bytesToHex(new Uint8Array(buf));
    });
  }

  // 腾讯云 TMT 文本翻译请求(TextTranslate,TC3 签名)
  function tencentTmtFetch(cfg) {
    var host = 'tmt.tencentcloudapi.com';
    var service = 'tmt';
    var action = 'TextTranslate';
    var version = '2018-03-21';
    var timestamp = Math.floor(Date.now() / 1000);
    var date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    var payload = JSON.stringify({ SourceText: cfg.text, Source: cfg.from, Target: cfg.to, ProjectId: 0 });
    var canonicalHeaders = 'content-type:application/json; charset=utf-8\n' +
      'host:' + host + '\n' +
      'x-tc-action:' + action.toLowerCase() + '\n' +
      'x-tc-timestamp:' + timestamp + '\n';
    var signedHeaders = 'content-type;host;x-tc-action;x-tc-timestamp';
    return tc3Sha256Hex(payload).then(function (payloadHash) {
      var canonicalRequest = 'POST\n/\n\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + payloadHash;
      return tc3Sha256Hex(canonicalRequest).then(function (requestHash) {
        var credentialScope = date + '/' + service + '/tc3_request';
        var stringToSign = 'TC3-HMAC-SHA256\n' + timestamp + '\n' + credentialScope + '\n' + requestHash;
        // 签名链:SecretDate → SecretService → SecretSigning → Signature
        return Promise.resolve(new TextEncoder().encode('TC3' + cfg.secretKey))
          .then(function (baseKey) { return tc3Hmac(baseKey, date); })
          .then(function (k) { return tc3Hmac(k, service); })
          .then(function (k) { return tc3Hmac(k, 'tc3_request'); })
          .then(function (k) { return tc3Hmac(k, stringToSign); })
          .then(function (sigBuf) {
            var signature = bytesToHex(new Uint8Array(sigBuf));
            var authorization = 'TC3-HMAC-SHA256 Credential=' + cfg.secretId + '/' + credentialScope +
              ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
            return waitTencentSlot().then(function () {
              return fetch('https://' + host + '/', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  'X-TC-Action': action,
                  'X-TC-Version': version,
                  'X-TC-Timestamp': String(timestamp),
                  'X-TC-Region': cfg.region,
                  'Authorization': authorization
                },
                body: payload
              });
            }).then(function (res) {
              return res.json().catch(function () {
                var e = new Error('HTTP ' + res.status);
                e.code = 'HTTP_' + res.status;
                e.status = res.status;
                throw e;
              }).then(function (data) {
                var resp = data && data.Response;
                if (resp && resp.Error) {
                  var apiErr = new Error(resp.Error.Message || resp.Error.Code || 'Tencent API error');
                  apiErr.code = resp.Error.Code || ('HTTP_' + res.status);
                  apiErr.status = res.status;
                  throw apiErr;
                }
                if (!res.ok) {
                  var httpErr = new Error('HTTP ' + res.status);
                  httpErr.code = 'HTTP_' + res.status;
                  httpErr.status = res.status;
                  throw httpErr;
                }
                if (resp == null || resp.TargetText == null) throw new Error('bad response');
                return resp.TargetText;
              });
            });
          });
      });
    });
  }


  // 各翻译引擎实现,统一 translate(text, from, to) 接口
  var ENGINES = {
    google: {
      name: 'Google',
      // 免费 Google 翻译接口(无需密钥)
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
      // 需配置订阅密钥,可选区域
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
        var key = getField(this, 'key');
        if (!key) {
          var err = new Error('NEED_KEY');
          err.code = 'NEED_KEY';
          return Promise.reject(err);
        }
        var region = getField(this, 'region');
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
      // 非官方必应翻译,自动抓取认证参数,令牌过期时重试一次
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

          if (err && err.code === 'BING_AUTH_STALE') {
            BING_AUTH.fetchedAt = 0;
            return doRequest();
          }
          throw err;
        });
      }
    },
    tencent: {
      name: 'Tencent Cloud',
      nameKey: 'transEngineTencent',
      // 腾讯云机器翻译 TMT,需 SecretId/SecretKey,使用 TC3-HMAC-SHA256 签名
      fields: [
        { id: 'secretId', key: 'trans.tencent.secretId', labelKey: 'transTencentSecretId', type: 'password' },
        { id: 'secretKey', key: 'trans.tencent.secretKey', labelKey: 'transTencentSecretKey', type: 'password' },
        {
          id: 'region', key: 'trans.tencent.region', labelKey: 'transSettingsRegion', type: 'select',
          defaultValue: 'ap-guangzhou',
          options: ['ap-guangzhou', 'ap-shanghai', 'ap-beijing', 'ap-hongkong', 'na-siliconvalley', 'na-ashburn']
        }
      ],
      codes: { 'zh-CN': 'zh', 'zh-TW': 'zh-TW' },
      translate: function (text, from, to) {
        var secretId = getField(this, 'secretId');
        var secretKey = getField(this, 'secretKey');
        if (!secretId || !secretKey) {
          var err = new Error('NEED_KEY');
          err.code = 'NEED_KEY';
          return Promise.reject(err);
        }
        return tencentTmtFetch({
          secretId: secretId,
          secretKey: secretKey,
          region: getField(this, 'region') || 'ap-guangzhou',
          from: from === 'auto' ? 'auto' : (this.codes[from] || from),
          to: this.codes[to] || to,
          text: text
        });
      }
    },
    custom: {
      name: 'Custom (OpenAI compatible)',
      nameKey: 'transEngineCustom',
      // 兼容 OpenAI 接口的自定义引擎,需 URL/密钥/模型
      fields: [
        { id: 'url', key: 'trans.custom.url', labelKey: 'transCustomUrl', type: 'text', placeholderKey: 'transCustomUrlPlaceholder' },
        { id: 'key', key: 'trans.custom.key', labelKey: 'transSettingsKey', type: 'password' },
        { id: 'model', key: 'trans.custom.model', labelKey: 'transCustomModel', type: 'text', placeholderKey: 'transCustomModelPlaceholder', fetchModels: true },
        { id: 'prompt', key: 'trans.custom.prompt', labelKey: 'transCustomPrompt', type: 'text', wideLabel: true }
      ],
      translate: function (text, from, to) {
        var url = getField(this, 'url');
        var key = getField(this, 'key');
        var model = getField(this, 'model');
        if (!url || !key || !model) {
          var err = new Error('MISSING_CONFIG');
          err.code = 'MISSING_CONFIG';
          return Promise.reject(err);
        }
        var srcName = from === 'auto' ? '' : nativeName(from);
        var tgtName = nativeName(to);
        var customPrompt = getField(this, 'prompt');
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


  // 切换当前引擎并更新其配置字段
  function setSettings(engineId, fieldsById) {
    current.engine = ENGINES[engineId] ? engineId : 'google';
    current.fields = fieldsById || {};
  }

  // 使用当前引擎翻译文本
  function translateText(text, from, to) {
    return ENGINES[current.engine].translate(text, from, to);
  }

  // 对外暴露引擎模块接口(供 service worker / 页面脚本使用)
  root.TranslateEngine = {
    LANGS: LANGS,
    ENGINES: ENGINES,
    setSettings: setSettings,
    translateText: translateText
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
