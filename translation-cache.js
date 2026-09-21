// 网页翻译结果缓存(纯逻辑,不依赖任何 chrome API)
//
// 解决的问题:内容脚本按文本节点逐条请求翻译,节点一旦被页面重建(SPA 路由切换、信息流回收)就是
// 全新节点,原文与目标语言却都没变,于是同一段文字被反复翻译。缓存放在后台 Service Worker 而不是
// 内容脚本,因为内容脚本每次完整导航都是新实例,而后台是全局的:同一段文字在另一个页面出现同样命中。
//
// 三个要点:
// 1. 缓存键 = 引擎 + 目标语言 + 源语言 + 原文,配置代号(gen)只体现在条目内部:调用方在引擎/配置
//    变化时 bumpGeneration(),旧条目在 check() 时按代号失配(查到也当未命中)并顺手回收,无需清表。
//    不把自定义引擎的提示词拼进键:它可能有几百字且含换行,会让键比译文还长;也不让调用方自己
//    拼键带上代号 —— 那样"忘了重新取键"就会拿到旧配置的译文(键与失效口径只留一处,不给误用留口子)。
// 2. 容量有上限(默认 LRU 1000 条):命中时把键重新 set 一次即算刷新,超限时淘汰最旧一条。
// 3. 同键并发合并:同一段文字的重复请求共用一个 Promise,不各发一次。这一条对首屏同样有效
//    (同一页里多处相同的按钮/菜单文案),且不占用后台的全局并发名额。
//
// 调用方(background.js)只需三步:keyOf() 取键、check() 命中直接用、fetch() 未命中或并发中 + store()。

(function (root) {
  'use strict';

  // 键分隔符:正常文本节点不可能包含 NUL 字符,故键不可能因拼接而碰撞
  var SEP = '\u0000';

  var DEFAULT_MAX = 1000;       // 缓存条目上限(约 300~400KB 内存)
  var DEFAULT_TEXT_MAX = 1000;  // 原文长度上限:超长文本基本不会重复出现,缓存只是白占内存
  var PREFIX_SCAN_MAX = 100;    // 前缀计数表的条目上限,超过就回收计数已归零的前缀

  // 语言代码归一(小写 + 下划线转连字符),避免 zh-CN / zh_cn 这类等价写法分裂成两条缓存
  function normalizeLang(code) {
    return String(code == null ? '' : code).toLowerCase().replace(/_/g, '-');
  }

  // 从键里取配置前缀 / 原文(键形如 引擎 \0 目标语言 \0 源语言 \0 原文)
  // 函数名不要叫 prefixOf:那是 prototype 上的方法名,同名会让方法调用短路到这个内部实现上
  function prefixFromKey(key) { return key.slice(0, key.lastIndexOf(SEP)); }
  function textFromKey(key) { return key.slice(key.lastIndexOf(SEP) + 1); }

  // 所有方法都挂在同一个 prototype 上,实例只放自己的数据,故实例之间互不影响
  var proto = {

    // 配置代号自增:调用方在「引擎 / 目标语言 / 任意引擎配置字段」变化时调用。
    // 不需要清表 —— 旧代号条目在 check() 时失配并顺手回收
    bumpGeneration: function () {
      this.gen++;
      return this.gen;
    },

    // 缓存键:这是唯一的取键入口,调用方不要再自行拼接
    keyOf: function (engine, to, from, text) {
      return [String(engine || ''), normalizeLang(to), normalizeLang(from), String(text)].join(SEP);
    },

    // 查缓存:命中则刷新 LRU 序(Map 的插入序即 LRU 序,先删后插即移到最新)。
    // 代号不符的老条目按未命中处理,并在这里顺手回收(省得留在表里既占内存又计错前缀)
    check: function (key) {
      var rec = this.map.get(key);
      if (rec !== undefined && rec.gen !== this.gen) {
        this.map.delete(key);
        this.shrinkPrefix(prefixFromKey(key));
        rec = undefined;
      }
      if (rec === undefined) { this.count.misses++; return null; }
      this.map.delete(key);
      this.map.set(key, rec);
      this.count.hits++;
      return rec.text;
    },

    // 写缓存。返回是否写入(false = 本次不缓存,调用方无需关心)
    store: function (key, value) {
      if (typeof value !== 'string') return false;   // 空串是合法译文(纯符号等),null/undefined 不是
      if (textFromKey(key).length > this.textMax) return false;
      if (this.map.has(key)) this.map.delete(key);   // 覆盖时不计新增,只刷新 LRU 序
      else {
        var p = prefixFromKey(key);
        this.total.set(p, (this.total.get(p) || 0) + 1);
        this.effective.set(p, (this.effective.get(p) || 0) + 1);
        this.trimPrefixes();
      }
      // 条目内记下写入时的代号:同一段原文在配置变化后不会被旧译文命中
      this.map.set(key, { text: value, gen: this.gen });
      this.count.stores++;
      while (this.map.size > this.max) this.evictOldest();
      return true;
    },

    // 淘汰最旧一条,并同步前缀计数
    evictOldest: function () {
      var oldest = this.map.keys().next().value;
      if (oldest === undefined) return;
      this.map.delete(oldest);
      this.shrinkPrefix(prefixFromKey(oldest));
      this.count.evicts++;
    },

    // 某前缀下少了一条:计数为 0 时删掉该前缀的登记
    shrinkPrefix: function (p) {
      var left = (this.total.get(p) || 0) - 1;
      if (left > 0) this.total.set(p, left); else this.total.delete(p);
      if (this.effective.has(p)) {
        var e = this.effective.get(p) - 1;
        if (e > 0) this.effective.set(p, e); else this.effective.delete(p);
      }
    },

    // 前缀计数表本身也要有上限:反复切换引擎/目标语言会让「已失效前缀」越积越多。
    // 只回收有效条目为 0 的前缀,故不会动到任何还能命中的条目
    trimPrefixes: function () {
      if (this.total.size <= PREFIX_SCAN_MAX) return;
      var self = this;
      this.total.forEach(function (n, p) {
        if (self.total.size <= PREFIX_SCAN_MAX) return;
        if ((self.effective.get(p) || 0) === 0) {
          self.total.delete(p);
          self.effective.delete(p);
        }
      });
    },

    // 同键并发合并:第一个请求真正执行 task,其余共用同一个 Promise,不各发一次
    fetch: function (key, task) {
      var running = this.pending.get(key);
      if (running) { this.count.joins++; return running; }
      var promise = Promise.resolve().then(task);
      this.pending.set(key, promise);
      var self = this;
      var done = function () { if (self.pending.get(key) === promise) self.pending.delete(key); };
      promise.then(done, done);
      return promise;
    },

    // 清空全部条目。进行中的请求不取消:它结束时仍会写入,而那次请求本身就是有效翻译
    clear: function () {
      this.map.clear();
      this.effective.clear();
      this.total.clear();
    },

    stats: function () {
      var c = this.count;
      return {
        size: this.map.size, gen: this.gen, pending: this.pending.size,
        hits: c.hits, misses: c.misses, stores: c.stores, evicts: c.evicts, joins: c.joins
      };
    },

    // 起一个独立实例(便于测试),不传参时与默认实例同参数
    create: function (opts) {
      var inst = Object.create(proto);
      inst.map = new Map();          // key → { text, gen }
      inst.effective = new Map();    // 前缀 → 仍有未失效条目的键数量(代号变化后老条目不删,靠它判定可回收)
      inst.total = new Map();        // 前缀 → 该前缀下的条目总数(含已失效的)
      inst.pending = new Map();      // key → 进行中的 Promise
      inst.gen = 0;
      inst.max = (opts && opts.max) || DEFAULT_MAX;
      inst.textMax = (opts && opts.textMax) || DEFAULT_TEXT_MAX;
      inst.count = { hits: 0, misses: 0, stores: 0, evicts: 0, joins: 0 };
      return inst;
    }
  };

  var cache = proto.create({});
  cache.SEP = SEP;
  cache.normalizeLang = normalizeLang;
  root.TranslationCache = cache;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// 本文件按**传统脚本**执行,接口挂在全局 `TranslationCache` 上(由 background.js 用 importScripts
// 同步引入)。这里**不要**写 export:文件既可能被翻译边栏那类普通 <script> 加载,出现顶层 export
// 会直接 SyntaxError 并让整份实现失效(v1.4.5 在 translate-engine.js 上踩过此坑)。
// Node 侧做假数据测试时改用 `import './translation-cache.js'` 再读 globalThis.TranslationCache。
