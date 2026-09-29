// 整页翻译设置的**单一来源**(扩展页面与网页内容脚本共用同一份)
//
// 为什么要有这个文件:同一批设置在原先分散成四份 —— 侧栏 translation.js 里一份 state 初值
// 与一份读取回落、内容脚本 content/page-translate.js 里一份 state 初值与一串三元回落,
// 外加两边的键名清单。后果不是报错,而是**静默失灵**:加一个设置项要改 3~4 处,
// 漏掉的往往是"页面不重扫"这种没有任何提示的地方。
// 现在两边都从这里派生:新增一项设置 = 在 FIELDS 加一行 + 各自接一下 UI 与消费点。
//
// 加载方式必须与 dom-utils.js 同路(理由见 PROJECT_SUMMARY「共享模块」一节):
//   ① 扩展页面:translation.html 的 <script> 排在 translation.js 之前;
//   ② 内容脚本:manifest.json 的 content_scripts.js 排在 content/page-translate.js 之前。
// 两个上下文隔离、函数无法跨上下文复用,故只能用这种"各自加载同一份文件"的方式共享。
// ⚠️ 与 translate-engine.js 一样**不要写 ESM 的 export**:它同时被普通 <script> 与
// content_scripts 加载,出现顶层 export 会让整份文件 SyntaxError 失效。
(function (root) {
  'use strict';

  // [存储键, 默认值, 取值口径] —— 默认值与键名都只在这里写一次。
  // 第三项是"脏值怎么归一",复刻各处原先各自写的那些 `|| 默认值` / `!!v` / `!== false`:
  //   string = 缺省、null、空串一律回落默认值(原写法是 `cfg[k] || def`)
  //   bool   = 一律转真布尔(原写法是 `!!cfg[k]`)
  //   ball   = 只有显式 false 才算关闭(缺省、导入的旧备份缺键一律视为开)
  //   mode   = 只认 'bilingual',其余回 'replace'
  var FIELDS = [
    ['pageTrans.target', 'sidebar', 'string'],   // 'sidebar'(跟随侧栏目标语言)或某个语言代码
    ['pageTrans.ball', true, 'ball'],            // 网页翻译悬浮球
    ['pageTrans.mode', 'replace', 'mode'],       // 'replace'(仅译文) / 'bilingual'(双语对照)
    ['pageTrans.fontColor', '', 'string'],
    ['pageTrans.lineColor', '', 'string'],
    ['pageTrans.italic', false, 'bool'],
    ['pageTrans.bold', false, 'bool'],
    ['pageTrans.style', 'none', 'string']
  ];

  var PREFIX = 'pageTrans.';
  var KEYS = [];
  var DEFAULTS = {};
  var KINDS = {};
  FIELDS.forEach(function (f) {
    KEYS.push(f[0]);
    DEFAULTS[f[0]] = f[1];
    KINDS[f[0]] = f[2];
  });

  // 与整页翻译有关、但不属于上面这批设置的两个键(变化时要重读配置)
  var RELATED_KEYS = ['trans.engine', 'trans.targetLang'];

  // 归一化:按该键的取值口径把 storage 里的脏值收成可用值(口径见 FIELDS 的第三项)
  function normalize(key, raw) {
    switch (KINDS[key]) {
      case 'ball': return raw !== false;
      case 'mode': return raw === 'bilingual' ? 'bilingual' : 'replace';
      case 'bool': return !!raw;
      default: return (raw === undefined || raw === null || raw === '') ? DEFAULTS[key] : raw;
    }
  }

  // 读单个键:storage 形态 → 默认值兜底 → 归一化
  function value(cfg, key) {
    var raw = (cfg && cfg[key] !== undefined) ? cfg[key] : DEFAULTS[key];
    return normalize(key, raw);
  }

  // 键名 → 状态字段名('pageTrans.fontColor' → 'fontColor')
  function fieldName(key) { return key.slice(PREFIX.length); }

  // storage 形态 → 一份完整设置(侧栏 pageTransState 就是这个形状;内容脚本按需取用其中几项)
  function read(cfg) {
    var out = {};
    KEYS.forEach(function (key) { out[fieldName(key)] = value(cfg, key); });
    return out;
  }

  // 状态 → storage 写回负载(侧栏保存用);缺键/脏值一律按默认值归一化后再写
  function toStore(values) {
    var out = {};
    KEYS.forEach(function (key) {
      out[key] = normalize(key, values ? values[fieldName(key)] : undefined);
    });
    return out;
  }

  // 引擎配置字段(凭证/区域/模型/提示词…)统一按前缀认定:**所有 trans.* 都是翻译配置**,
  // 只有 trans.sourceLang 例外 —— 整页翻译固定自动检测源语言,改它无需重扫。
  // 这样引擎新增字段(trans.xxx)不必回来改白名单:后台那份从 TranslateEngine.ENGINES 派生,
  // 这里是前缀口径,两边不会再各写一份字段清单而悄悄漂移。
  function isEngineFieldKey(k) {
    return k.indexOf('trans.') === 0 && RELATED_KEYS.indexOf(k) === -1 && k !== 'trans.sourceLang';
  }

  root.PageTransSpec = {
    FIELDS: FIELDS,
    KEYS: KEYS,                        // 8 个设置键
    DEFAULTS: DEFAULTS,
    RELATED_KEYS: RELATED_KEYS,        // 引擎选择 + 侧栏目标语言
    WATCH_KEYS: KEYS.concat(RELATED_KEYS),   // 变化后需要重读配置的全部键
    BALL_POS_KEY: 'pageTrans.ballPos', // 悬浮球拖拽位置(不属于设置,单独一个键)
    value: value,
    read: read,
    toStore: toStore,
    normalize: normalize,
    isEngineFieldKey: isEngineFieldKey
  };
})(typeof self !== 'undefined' ? self : this);
