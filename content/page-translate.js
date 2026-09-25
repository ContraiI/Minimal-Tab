(function () {
  'use strict';

  // 整页翻译内容脚本:扫描可见文本/属性,经后台翻译后替换,可整体还原

  // 跳过扩展自身页面,避免重复注入
  if (location.protocol === 'chrome-extension:' || location.protocol === 'chrome:' ||
      location.protocol === 'devtools:' || location.protocol === 'about:') return;

  var isTop = window === window.top;


  // 运行时状态与常量配置
  var state = {
    enabled: false,
    ball: true,
    target: 'zh-CN',
    engine: 'google',
    mode: 'replace',
    fontColor: '',
    lineColor: '',
    italic: false,
    bold: false,
    style: 'none'
  };

  var ENGINE_CONFIG_KEYS = [
    'trans.msKey', 'trans.msRegion',
    'trans.custom.url', 'trans.custom.key', 'trans.custom.model', 'trans.custom.prompt'
  ];
  var RELEVANT_KEYS = ['pageTrans.ball', 'pageTrans.target', 'pageTrans.mode', 'trans.engine', 'trans.targetLang',
    'pageTrans.fontColor', 'pageTrans.lineColor', 'pageTrans.italic', 'pageTrans.bold', 'pageTrans.style'];
  var ATTR_NAMES = ['title', 'placeholder', 'alt', 'aria-label'];
  var CONCURRENCY = 6;      // 本页并发翻译数(全局另有后台限流)
  var SCAN_DEBOUNCE = 150;  // 扫描防抖毫秒数



  // 翻译记录:原文→译文,用于还原
  var textRecords = new Map();
  var attrRecords = new Map();
  var processedText = new WeakSet();   // 已处理的文本节点
  var failedAttrs = new WeakMap();     // 翻译失败的属性
  var skippedAttrs = new WeakMap();    // 空译文(成功但无内容)的属性,不算失败
  var inFlightAttrs = new WeakMap();   // 翻译中的属性
  var inFlight = new Map();
  var loadingSpinners = new Map();     // 正在翻译的文本节点 → 其加载图标元素(用于移除)
  var targetVersion = 0;               // 状态版本,用于丢弃过期结果

  // 待扫描节点缓存与翻译队列
  var nodeCache = null;
  var elementCache = null;
  var observedShadowRoots = new WeakSet();   // 已 observe 过的 shadow root,避免每次重建重复注册
  var cachesDirty = true;
  var scanTimer = null;
  var queue = [];
  var running = 0;




  // 扩展上下文是否存活
  function alive() {
    return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
  }

  // 封装 chrome.storage 读写,避免上下文失效时报错
  function setStore(obj) {
    try { if (alive()) chrome.storage.local.set(obj); } catch (e) {}
  }

  function getStore(keys, cb) {
    try { if (alive()) chrome.storage.local.get(keys, cb); } catch (e) {}
  }


  // 重建文本节点与元素缓存(含 shadow DOM)
  function rebuildCaches() {
    var texts = [], els = [];
    function walkRoot(root) {
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      var n;
      while ((n = w.nextNode())) {
        if (n.nodeType === 3) { texts.push(n); }
        else {
          els.push(n);
          if (n.shadowRoot) {
            // 同一个 shadow root 只 observe 一次:重建缓存很频繁,重复 observe 会不断累加内部记录
            if (mutationObserver && !observedShadowRoots.has(n.shadowRoot)) {
              observedShadowRoots.add(n.shadowRoot);
              mutationObserver.observe(n.shadowRoot, { childList: true, subtree: true, characterData: true });
            }
            walkRoot(n.shadowRoot);
          }
        }
      }
    }
    walkRoot(document.documentElement);
    nodeCache = texts;
    elementCache = els;
    cachesDirty = false;
  }

  function rebuildCachesIfDirty() {
    if (cachesDirty) rebuildCaches();
  }



  // 需跳过的元素选择器
  var SKIP_SELECTOR = 'script, style, noscript, template, textarea, input, select, option, datalist, code, pre, kbd, samp, var, head, [contenteditable], [translate="no"], [data-page-trans-bilingual]';

  // 是否值得翻译的文本(至少 2 个字符且含字母)
  function isTranslatableText(text) {
    var t = text.trim();
    if (t.length < 2) return false;
    return /[\p{L}]/u.test(t);
  }

  // 判断元素是否应跳过翻译
  function isSkippedElement(el) {
    if (!el) return true;
    if (el.closest(SKIP_SELECTOR)) return true;

    if (el.namespaceURI === 'http://www.w3.org/2000/svg' && (el.tagName === 'TITLE' || el.tagName === 'DESC')) return true;
    return false;
  }

  // 规范化 lang 标签(小写,下划线转连字符)
  function normalizeLangTag(code) {
    return String(code || '').toLowerCase().replace(/_/g, '-');
  }

  // 元素是否已属于目标语言
  function isInTargetLang(el) {
    var l = el.closest('[lang]');
    if (!l) return false;
    var lang = normalizeLangTag(l.getAttribute('lang'));
    var target = normalizeLangTag(state.target);
    return lang === target || lang.indexOf(target + '-') === 0;
  }

  // 元素是否在可视区域内(含 40px 缓冲)
  function inViewport(el) {
    var r = el.getBoundingClientRect();
    var m = 40;
    if (r.width <= 0 && r.height <= 0) return false;
    return r.bottom > -m && r.top < window.innerHeight + m &&
           r.right > -m && r.left < window.innerWidth + m;
  }

  // 元素是否实际可见(非隐藏/透明)
  function isVisible(el) {
    if (el.hidden) return false;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
    var s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    return true;
  }


  // 元素是否挂着任一待翻译属性(零成本判断,用于在昂贵的视口/可见性检查之前先筛掉绝大多数元素)
  function hasAnyTranslatableAttr(el) {
    for (var i = 0; i < ATTR_NAMES.length; i++) {
      if (el.hasAttribute(ATTR_NAMES[i])) return true;
    }
    return false;
  }


  // 扫描可见节点,收集待翻译的文本与属性任务
  function processVisible() {
    if (!state.enabled || !alive()) return;
    rebuildCachesIfDirty();

    var textJobs = [];
    for (var i = 0; i < nodeCache.length; i++) {
      var node = nodeCache[i];
      if (processedText.has(node) || inFlight.has(node)) continue;
      var text = node.nodeValue;
      if (!isTranslatableText(text)) { processedText.add(node); continue; }
      var el = node.parentElement;
      if (!el) { processedText.add(node); continue; }
      // 视口判断最廉价,且屏外文本本来就不会被翻译;先做它可省下每个屏外节点的两次祖先链查询
      // (isSkippedElement 要匹配 18 个选择器,isInTargetLang 要 closest('[lang]')),
      // 而屏外节点不会被写入 processedText,原先每轮扫描都要为它们重算一遍
      if (!inViewport(el)) continue;
      if (isSkippedElement(el) || isInTargetLang(el)) {
        processedText.add(node);
        continue;
      }
      if (!isVisible(el)) { processedText.add(node); continue; }
      textJobs.push(node);
    }

    var attrJobs = [];
    for (var j = 0; j < elementCache.length; j++) {
      var e = elementCache[j];
      if (e.id === 'pageTransBall') continue;
      // 零成本判断先行:绝大多数元素四个待翻译属性一个都没有,不必为它们付
      // getBoundingClientRect + getComputedStyle(后者会强制样式解析)
      if (!hasAnyTranslatableAttr(e)) continue;
      if (!inViewport(e) || !isVisible(e)) continue;
      var recs = attrRecords.get(e);
      var failed = failedAttrs.get(e);
      var skipped = skippedAttrs.get(e);
      var skippedEl = null;   // 每轮显式重置:var 是函数作用域,不重置会把上一个元素的结果带进来
      for (var a = 0; a < ATTR_NAMES.length; a++) {
        var name = ATTR_NAMES[a];
        if (recs && recs.has(name)) continue;
        if (failed && failed.has(name)) continue;
        if (skipped && skipped.has(name)) continue;
        var pending = inFlightAttrs.get(e);
        if (pending && pending.has(name)) continue;
        if (name === 'placeholder') {
          if (e.tagName !== 'INPUT' && e.tagName !== 'TEXTAREA') continue;
        } else {
          if (skippedEl === null) skippedEl = isSkippedElement(e);
          if (skippedEl) continue;
        }
        var val = e.getAttribute(name);
        if (!val || !isTranslatableText(val) || isInTargetLang(e)) continue;
        attrJobs.push({ el: e, attr: name, text: val });
      }
    }

    enqueueAll(textJobs, attrJobs);
  }


  // 在文本节点末尾插入一个加载中图标(仅实际翻译中的文本)
  function addLoadingSpinner(node) {
    if (!node || !node.parentNode) return null;
    var sp = document.createElement('span');
    sp.className = 'page-trans-loading';
    sp.setAttribute('data-page-trans-loading', '1');
    node.parentNode.insertBefore(sp, node.nextSibling);
    loadingSpinners.set(node, sp);
    return sp;
  }

  function removeLoadingSpinner(node, spinner) {
    var sp = loadingSpinners.get(node);
    if (spinner && sp === spinner) {
      if (sp.parentNode) sp.parentNode.removeChild(sp);
      loadingSpinners.delete(node);
    }
  }

  // 把任务加入队列并启动并发处理
  function enqueueAll(textJobs, attrJobs) {
    textJobs.forEach(function (n) {
      var job = { type: 'text', node: n, text: n.nodeValue };
      inFlight.set(n, job);
      queue.push(job);
    });
    attrJobs.forEach(function (a) {
      if (!inFlightAttrs.has(a.el)) inFlightAttrs.set(a.el, new Map());
      var job = { type: 'attr', el: a.el, attr: a.attr, text: a.text };
      inFlightAttrs.get(a.el).set(a.attr, job);
      queue.push(job);
    });
    pump();
  }

  // 按并发上限消费队列
  function pump() {
    while (running < CONCURRENCY && queue.length) {
      var job = queue.shift();
      running++;
      translateJob(job).finally(function () {
        running--;
        pump();
      });
    }
  }

  // 发送单个翻译请求到后台,成功后应用结果
  function translateJob(job) {
    var version = targetVersion;
    var text = job.text;

    var p;
    var spinner = null;
    try {
      if (job.type === 'text') spinner = addLoadingSpinner(job.node);
      p = chrome.runtime.sendMessage({ type: 'PAGE_TRANSLATE', text: text, to: state.target });
    } catch (e) {
      p = Promise.reject(e);
    }
    return p.then(function (resp) {
      if (!state.enabled || version !== targetVersion) return;
      if (!resp || !resp.ok) throw new Error((resp && resp.error) || 'translate failed');
      // 命中后台缓存时立刻收掉加载图标:这次实际没有等待,图标会一闪而过
      if (resp.cached) removeLoadingSpinner(job.node, spinner);
      // 属性任务没有加载图标,其空译文判空照旧(与 cached 标记无关)
      if (job.type !== 'text' || resp.text) applyResult(job, resp.text);
      else markSkipped(job); // 空译文:不算失败,仅标记已处理避免反复重扫提交
    }).catch(function () {
      if (state.enabled && version === targetVersion) markFailed(job);
    }).finally(function () {
      if (job.type === 'text') {
        if (inFlight.get(job.node) === job) inFlight.delete(job.node);
        removeLoadingSpinner(job.node, spinner);
      } else {
        var pending = inFlightAttrs.get(job.el);
        if (pending && pending.get(job.attr) === job) {
          pending.delete(job.attr);
          if (!pending.size) inFlightAttrs.delete(job.el);
        }
      }
    });
  }

  // 标记任务失败,避免重复重试
  function markFailed(job) {
    if (job.type === 'text') {
      processedText.add(job.node);
    } else {
      if (!failedAttrs.has(job.el)) failedAttrs.set(job.el, new Set());
      failedAttrs.get(job.el).add(job.attr);
    }
  }

  // 标记空译文为已跳过(与失败分离),避免该段反复被重扫提交
  function markSkipped(job) {
    if (job.type === 'text') {
      processedText.add(job.node);
    } else {
      if (!skippedAttrs.has(job.el)) skippedAttrs.set(job.el, new Set());
      skippedAttrs.get(job.el).add(job.attr);
    }
  }


  // 写入译文(文本 / 属性)
  function applyText(node, translated) {
    node.textContent = translated;
  }

  function applyAttribute(el, attr, translated) {
    el.setAttribute(attr, translated);
  }

  // 写入内联 CSS 变量由共享模块承担(翻译边栏里那份同样的实现也走它;内容脚本与扩展页面上下文隔离,
  // 故 dom-utils.js 同时列在 manifest 的 content_scripts 里),此处只留同名别名
  var setStyleVar = DomUtils.setStyleVar;

  // 全部译文样式类(下划线 + 边框)
  var BILINGUAL_STYLE_CLASSES = ['pt-underlineA', 'pt-underlineB', 'pt-underlineC', 'pt-borderA', 'pt-borderB'];

  // 按当前译文样式设置重涂译文文本(字体颜色/斜体/粗体/下划线/边框)
  function applyBilingualStyle(el) {
    for (var i = 0; i < BILINGUAL_STYLE_CLASSES.length; i++) el.classList.remove(BILINGUAL_STYLE_CLASSES[i]);
    if (state.style !== 'none') el.classList.add('pt-' + state.style);
    setStyleVar(el, '--pt-color', state.fontColor);
    setStyleVar(el, '--pt-italic', state.italic ? 'italic' : '');
    setStyleVar(el, '--pt-bold', state.bold ? 'bold' : '');
    setStyleVar(el, '--pt-line', state.lineColor);
  }

  // 纯样式变化时重涂所有已有双语译文文本(含 shadow DOM),不触发重扫/重译
  function restyleBilingual() {
    var targets = [];
    (function walkRoot(root) {
      var found = root.querySelectorAll('.page-trans-bilingual .page-trans-text');
      for (var i = 0; i < found.length; i++) targets.push(found[i]);
      var all = root.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) {
        if (all[j].shadowRoot) walkRoot(all[j].shadowRoot);
      }
    })(document);
    for (var k = 0; k < targets.length; k++) applyBilingualStyle(targets[k]);
  }

  // 记录原文并应用翻译结果
  function applyResult(job, translated) {
    if (job.type === 'text') {
      var node = job.node;
      // 必须查 isConnected 而非只看 parentNode:祖先被移除时文本节点自身的 parentNode 仍非空,
      // 若放行就会给一个已不在文档里的节点写记录 —— 而移除那一刻的清理早已跑过(当时还没有这条记录),
      // 于是成为永久失效记录(实测表现为 textRecords 失效数缓慢攀升)。属性分支本就查了 isConnected。
      // 节点若稍后被重新插回,它不在 processedText 里,下一轮扫描会重新翻译,不会漏译。
      if (!node.isConnected || node.nodeValue !== job.text) return;
      var rec;
      if (state.mode === 'bilingual') {
        // 双语对照:保留原文,在原文后追加含 <br> 的译文块(span 打标记避免被重译/触发重扫)
        var span = document.createElement('span');
        span.className = 'page-trans-bilingual';
        span.setAttribute('data-page-trans-bilingual', '1');
        span.appendChild(document.createElement('br'));
        var textSpan = document.createElement('span');
        textSpan.className = 'page-trans-text';
        textSpan.textContent = translated;
        span.appendChild(textSpan);
        node.parentNode.insertBefore(span, node.nextSibling);
        applyBilingualStyle(textSpan);
        rec = { mode: 'bilingual', span: span };
      } else {
        rec = { mode: 'replace', original: node.nodeValue, translated: translated };
        applyText(node, translated);
      }
      textRecords.set(node, rec);
      processedText.add(node);
    } else {
      if (!job.el.isConnected || job.el.getAttribute(job.attr) !== job.text) return;
      var rec2 = { original: job.text, translated: translated };
      if (!attrRecords.has(job.el)) attrRecords.set(job.el, new Map());
      attrRecords.get(job.el).set(job.attr, rec2);
      applyAttribute(job.el, job.attr, translated);
    }
  }


  // 还原全部翻译并清空状态
  function revertAll() {
    textRecords.forEach(function (rec, node) {
      if (rec.mode === 'bilingual') {
        // 双语对照:原文从未被改动,只需移除插入的译文块
        if (rec.span && rec.span.parentNode) rec.span.parentNode.removeChild(rec.span);
      } else if (node.parentNode && node.nodeValue === rec.translated) {
        node.textContent = rec.original;
      }
    });
    attrRecords.forEach(function (map, el) {
      map.forEach(function (rec, attr) {
        if (el.isConnected && el.getAttribute(attr) === rec.translated) el.setAttribute(attr, rec.original);
      });
    });
    textRecords = new Map();
    attrRecords = new Map();
    processedText = new WeakSet();
    failedAttrs = new WeakMap();
    skippedAttrs = new WeakMap();
    inFlightAttrs = new WeakMap();
    loadingSpinners.forEach(function (sp) {
      if (sp && sp.parentNode) sp.parentNode.removeChild(sp);
    });
    loadingSpinners = new Map();
    inFlight.clear();
    queue = [];
    clearTimeout(scanTimer);
    scanTimer = null;
    targetVersion++;
  }

  // 页面回收 DOM 时清掉对应记录:文本/属性记录都是强引用 Map,条目只增不减会让长会话页面
  // (信息流、虚拟列表、SPA 路由切换)里已脱离文档的节点无法回收,记录数随时间无上限增长。
  // 判定放在 mutation 回调内(DOM 已结算):被"移动"的节点此时仍然 isConnected,所以不会被误清,
  // 也就不会重复翻译;真正被移除的节点则连同 processedText 一起清掉——只清记录不清 processedText
  // 会留下"译过、却再也译不了也还原不了"的死节点。
  // (loadingSpinners/inFlight/failedAttrs 等不在此列:前两个随请求结算而清理、有并发上限,
  //  后三个是 WeakMap,都不会把已脱离节点长期钉住。)
  function purgeDetachedRecords(removedRoots) {
    if (!textRecords.size && !attrRecords.size) return;
    for (var i = 0; i < removedRoots.length; i++) {
      var root = removedRoots[i];
      if (!root || root.isConnected) continue;   // 已移回文档(移动而非移除),整棵子树都还在
      var stack = [root];
      while (stack.length) {
        var n = stack.pop();
        // 逐个节点判断:框架可能把被移除子树的子节点重新插回文档(移动/Fragment 搬运),
        // 这些节点仍然连着,清了会导致重复翻译
        if (!n.isConnected) {
          if (n.nodeType === 3) {
            if (textRecords.has(n)) textRecords.delete(n);
            processedText.delete(n);
          } else if (n.nodeType === 1 && attrRecords.has(n)) {
            attrRecords.delete(n);
          }
        }
        for (var c = n.firstChild; c; c = c.nextSibling) stack.push(c);
      }
    }
  }


  // 开始翻译:安装监听、重建缓存并启动扫描
  function startTranslate() {
    installObservers();
    rebuildCaches();
    scheduleScan();
    updateBallVisual();
  }

  // 停止翻译:还原内容并移除监听
  function stopTranslate() {
    revertAll();
    tearDownObservers();
    updateBallVisual();
  }

  // 防抖调度一次扫描
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(function () {
      if (state.enabled) processVisible();
    }, SCAN_DEBOUNCE);
  }


  var mutationObserver = null;
  var scrollTicking = false;

  // 滚动/缩放时触发重扫
  function onScroll() {
    if (!state.enabled || scrollTicking) return;
    scrollTicking = true;
    setTimeout(function () {
      scrollTicking = false;
      scheduleScan();
    }, 120);
  }

  // 监听 DOM 变化(含 shadow DOM)与滚动,保持内容同步
  function installObservers() {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver(function (records) {

      var meaningful = false;
      var removedRoots = [];   // 本轮被移除的子树根,待判定确有脱离后清理其记录
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'characterData') {
          if (r.target && r.target.nodeType === 3 && processedText.has(r.target)) continue;
          meaningful = true;
        } else {
          // 忽略仅插入/移除自身节点(加载图标、双语译文块)的 childList 变更,避免扫描循环
          var onlySelfInserted = true;
          var affected = [];
          if (r.addedNodes) { for (var a = 0; a < r.addedNodes.length; a++) affected.push(r.addedNodes[a]); }
          if (r.removedNodes) {
            for (var b = 0; b < r.removedNodes.length; b++) {
              affected.push(r.removedNodes[b]);
              removedRoots.push(r.removedNodes[b]);
            }
          }
          for (var k = 0; k < affected.length; k++) {
            var n = affected[k];
            var selfInserted = n && n.nodeType === 1 && n.getAttribute &&
              (n.getAttribute('data-page-trans-loading') === '1' || n.getAttribute('data-page-trans-bilingual') === '1');
            if (!selfInserted) { onlySelfInserted = false; break; }
          }
          if (!onlySelfInserted) meaningful = true;
        }
      }
      if (!meaningful) return;
      // 只处理自身增删(加载图标/译文块)时上面已返回,那时不会有记录失效;真正有页面增删时才清理
      purgeDetachedRecords(removedRoots);
      cachesDirty = true;
      scheduleScan();
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
  }

  // 移除全部监听器
  function tearDownObservers() {
    if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
    observedShadowRoots = new WeakSet();   // observer 已断开,重新安装时需重新 observe
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
  }


  // 页面上的翻译悬浮球:左键点击切换翻译,可拖动;右键展开一个圆形图标按钮
  var ballEl = null;
  var ballDown = false;     // 指针是否按下
  var ballDragged = false;  // 本次按下是否实际拖动(移动超过阈值),拖动结束不触发开关
  var dragOffset = null;
  var dragDownAt = null;    // 按下时的指针坐标(判定拖动阈值用,避免每次移动读布局)
  var dragBounds = null;    // 按下时缓存的球体尺寸与活动范围(避免拖动中反复读 offsetWidth 触发同步布局)
  var ballMenu = null;      // 右键展开的圆形图标按钮(球的独立兄弟元素,不在球内)

  // 读取 i18n 文案(subs 为占位符替换值数组,对应 messages.json 里的 $1)
  function getMsg(key, subs) {
    try { return chrome.i18n.getMessage(key, subs) || key; } catch (e) { return key; }
  }

  // 页面内轻提示(清缓存结果):固定定位挂在 documentElement 上,2 秒后淡出移除
  var toastEl = null;
  var toastTimer = null;
  function showPageToast(text) {
    if (!document.documentElement) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'page-trans-toast';   // 外观见 content/page-translate.css
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.opacity = '1';   // 淡出只改内联 opacity,过渡写在 .page-trans-toast 里
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (!toastEl) return;
      toastEl.style.opacity = '0';
      // 等过渡(0.2s)走完再摘节点;这期间又来一条提示会被上面的 clearTimeout 取消并复用本节点
      toastTimer = setTimeout(function () {
        if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
        toastEl = null;
      }, 220);
    }, 2000);
  }

  // 清缓存的结果提示:悬浮球右键展开的圆形按钮与侧边栏设置里的「清除缓存」共用同一条
  // (文案按本页翻译开关取:开着是"已清除 N 条译文缓存,正在重新翻译",关着只说清掉多少条)
  function showClearCacheToast(cleared) {
    showPageToast(getMsg(state.enabled ? 'ballMenuClear' : 'toastCacheClearedKeep', [String(cleared)]));
  }

  // 清除译文缓存并重译当前页:入口是右键展开的圆形按钮(见 background 的 PAGE_TRANSLATE_RESET_CACHE)
  function resetCacheAndRetranslate() {
    var done = function (resp) {
      // 后台回报本次清掉的条数(缓存全局共用,这个数包含所有标签页)
      showClearCacheToast(resp && typeof resp.cleared === 'number' ? resp.cleared : 0);
      if (!state.enabled) return;   // 翻译没开时只清缓存:没有可重译的页面内容
      revertAll();
      scheduleScan();
    };
    try {
      chrome.runtime.sendMessage({ type: 'PAGE_TRANSLATE_RESET_CACHE' }, function (resp) {
        // 扩展上下文刚失效时 sendMessage 会以 runtime.lastError 结束,此时不做任何界面动作
        if (chrome.runtime.lastError) return;
        done(resp);
      });
    } catch (e) {}
  }

  // 展开球下方那个圆形图标按钮:独立元素,位置在这里按球的矩形算一次
  // (函数/变量仍沿用 ballMenu / openBallMenu 这些名字,形态已不是文字菜单,别被名字带偏)
  function openBallMenu() {
    if (!ballEl || !ballMenu) return;
    // 布局只在展开这一刻读一次(按钮此时 visibility:hidden,仍有布局尺寸)
    var r = ballEl.getBoundingClientRect();
    var w = ballMenu.offsetWidth;
    var h = ballMenu.offsetHeight;
    var gap = 8;   // 按钮与球之间的空隙
    var pad = 8;   // 与视口边缘至少留出的间距
    // 水平:按钮右缘对齐球的右缘(两者同宽,故对齐即天然同轴),再夹进视口
    var left = r.right - w;
    var maxLeft = window.innerWidth - w - pad;
    if (left > maxLeft) left = maxLeft;
    if (left < pad) left = pad;
    // 垂直:默认贴在球下缘 8px;下方放不下时翻到球正上方(JS 给它加 .page-trans-open-up)
    var up = window.innerHeight - r.bottom < h + gap + pad;
    var top = up ? r.top - gap - h : r.bottom + gap;
    var maxTop = window.innerHeight - h - pad;
    if (top > maxTop) top = maxTop;
    if (top < pad) top = pad;
    ballMenu.style.left = Math.round(left) + 'px';
    ballMenu.style.top = Math.round(top) + 'px';
    ballMenu.classList.toggle('page-trans-open-up', up);
    ballMenu.classList.add('page-trans-open');
    ballEl.setAttribute('aria-expanded', 'true');
    // 下面两个监听器只在展开期间挂在 document 上(收起即摘),不常驻:页面上的每次指针按下
    // 都要过一遍它们。捕获阶段注册是为了拿到最早的一次按下 —— 页面上任何 stopPropagation
    // 都挡不住"点别处收起"这件事
    document.addEventListener('pointerdown', onMenuOutsidePointerDown, true);
    document.addEventListener('keydown', onMenuKeyDown, true);
  }

  // 点在按钮之外:收起。球本体要排除掉 —— 球上的按下由它自己的 pointerdown/contextmenu
  // 处理(左键收起并拖动、右键收起),若这里也插一手,右键会先被关掉再被 contextmenu 重新打开,
  // 表现为"右键永远收不回按钮"
  function onMenuOutsidePointerDown(e) {
    if (e.target === ballEl) return;
    if (ballMenu && ballMenu.contains && ballMenu.contains(e.target)) return;
    closeBallMenu();
  }

  // Esc 收起按钮
  function onMenuKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') closeBallMenu();
  }

  function closeBallMenu() {
    if (!ballMenu || !ballMenu.classList.contains('page-trans-open')) return;
    ballMenu.classList.remove('page-trans-open');
    if (ballEl) ballEl.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onMenuOutsidePointerDown, true);
    document.removeEventListener('keydown', onMenuKeyDown, true);
  }

  // 创建悬浮球并绑定点击/右键/拖拽事件
  function createBall() {
    if (ballEl || !isTop) return;
    // 上一次扩展实例可能留下同 id 的节点(扩展重载会撤掉注入的 CSS,却不会移除已插入的 DOM),
    // 先摘干净再建,避免页面上叠出两个球(pageTransBallBtn 是旧版刷子按钮的 id,一并清掉)
    ['pageTransBall', 'pageTransBallBtn', 'pageTransMenu'].forEach(function (id) {
      var stale = document.getElementById(id);
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    });
    ballEl = document.createElement('div');
    ballEl.id = 'pageTransBall';
    ballEl.setAttribute('role', 'button');
    // 弹出的是一个纯图标按钮(不是菜单),故用 aria-controls 关联它,不写 aria-haspopup="menu"
    ballEl.setAttribute('aria-controls', 'pageTransMenu');
    // 展开态由 openBallMenu()/closeBallMenu() 翻转,这里先给个初始值,别让属性缺席
    ballEl.setAttribute('aria-expanded', 'false');
    // 几何属性在这里内联写死一份,不把"不被撑大"寄托在 content/page-translate.css 上:
    // 那份 CSS 由浏览器注入,扩展一重载就被撤掉,而内容脚本插进 DOM 的节点还在,老标签页里于是
    // 只剩一个裸 div —— position 退回 static、尺寸约束全丢,内联 SVG 又没有 width/height,
    // 便按容器宽度铺开成两千像素、把页面撑出滚动的空白。
    // 只内联几何:背景色/悬停/过渡/不透明度一律留给 CSS —— 内联优先级高于类选择器,
    // 一旦把 background 写死,updateBallVisual() 靠 .page-trans-off 换灰底色就会静默失效。
    // 默认位置(right/top)仍只由 CSS 定义,故这里刻意不写,避免默认值出现两个来源。
    ballEl.style.cssText =
      'position:fixed;width:36px;height:36px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;' +
      'box-sizing:border-box;overflow:hidden;z-index:2147483647;';
    // width/height 是兜底:CSS 在时由 #pageTransBall svg 覆盖(类/元素选择器优先于表现属性),
    // CSS 没了也不至于让 24×24 的 viewBox 按容器宽度等比放大
    ballEl.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';
    // 右键展开的「清除缓存并重译」:与球同款的圆形图标按钮,**只有图标、没有文字**
    // (文案只存在于 aria-label 里,给读屏用)。它与球一样是 documentElement 上的独立固定元素
    // (不是球的子元素),位置由 openBallMenu() 按球的矩形算好,因此球的悬停/按下/拖动
    // 都不会波及它,反之亦然
    ballMenu = document.createElement('button');
    ballMenu.type = 'button';
    ballMenu.id = 'pageTransMenu';
    ballMenu.className = 'page-trans-menu';
    ballMenu.setAttribute('aria-label', getMsg('ballClearCache'));
    // 与球同理的几何内联兜底(同尺寸、同圆形、同居中);另外给一个明确的屏幕外默认位置:
    // CSS 里它只有 position:fixed,没有 left/top,展开前停在"静态位置"(跟在 <body> 之后,
    // 短页面上可能落进视口),只靠 CSS 的 visibility:hidden 遮住属碰巧不出事。
    // 展开时 openBallMenu() 会用内联 left/top 覆盖这里的默认值,故这样写不影响展开定位。
    // 特别注意:opacity / visibility / transform / background **不能**内联 ——
    // 展开靠 CSS 类 .page-trans-open 改前三个,内联会盖过类选择器让按钮永远不出现。
    // 同理不要把面板式菜单那套 padding/margin/圆角/渐变"重置"抄进来:内联优先级高于类选择器。
    ballMenu.style.cssText =
      'position:fixed;left:-9999px;top:0;width:36px;height:36px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;' +
      'box-sizing:border-box;overflow:hidden;z-index:2147483647;';
    // 图标 18px,与球内图标同规格(CSS 在时由 #pageTransMenu svg 覆盖,不在时也不放大)。
    // 图形是 Remix Icon 的 `brush-2-line`(Apache-2.0),来源见 icons/RiBrush2Line.svg ——
    // 那份 SVG **运行时不被引用**,路径是**内联**在这里的:内容脚本不能用 <img> 加载
    // chrome-extension:// 资源(manifest 没开 web_accessible_resources),而且只有内联才能在
    // 样式表失效时靠 <svg width/height> 属性兜底。**改图标要同步改这两处**
    // ⚠️ 它是**线性空心**风格,线宽按 24px 设计,缩到 18px 约 0.75px,比球上那个实心图标细一档;
    // 想加粗就给这个 path 再挂 stroke="currentColor" stroke-width="0.6"(实测 18px 下最清楚)。
    // 不要再改回自绘图形、也不要换成别的图标
    ballMenu.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m16.536 15.947l2.121-2.122l-3.182-3.182l3.536-3.535l-2.122-2.122l-3.535 3.536l-3.182-3.182L8.05 7.46zM15.12 17.36L6.637 8.875l-2.828 2.829l8.485 8.485zM13.355 5.693l2.828-2.828a1 1 0 0 1 1.414 0l3.536 3.536a1 1 0 0 1 0 1.414l-2.829 2.828l2.475 2.475a1 1 0 0 1 0 1.414L13 22.311a1 1 0 0 1-1.414 0l-9.9-9.9a1 1 0 0 1 0-1.414l7.779-7.778a1 1 0 0 1 1.414 0z"/></svg>';
    ballMenu.addEventListener('click', function () {
      closeBallMenu();
      resetCacheAndRetranslate();
    });
    document.documentElement.appendChild(ballMenu);

    // 右键 = 展开/收回下方那个圆形图标按钮(球上的右键不弹网页原生菜单)
    ballEl.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (ballMenu && ballMenu.classList.contains('page-trans-open')) closeBallMenu();
      else openBallMenu();
    });

    ballEl.addEventListener('click', function () {
      // 仅未发生拖动时视为点击切换;拖动结束不触发开关
      if (ballDragged) return;
      // 由后台按本标签页定位切换(per-tab,不影响其他标签页)
      try { chrome.runtime.sendMessage({ type: 'PAGE_TRANSLATE_TOGGLE' }); } catch (e) {}
    });

    ballEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      closeBallMenu();
      ballDown = true;
      ballDragged = false;
      // 尺寸与活动范围只在按下时读一次:pointermove 里读 offsetWidth 会因为上一帧刚写过 style.left/top
      // 而强制同步布局,拖动期间每个事件都要重排一次
      var w = ballEl.offsetWidth, h = ballEl.offsetHeight;
      dragBounds = { maxX: window.innerWidth - w, maxY: window.innerHeight - h };
      dragDownAt = { x: e.clientX, y: e.clientY };
      dragOffset = { x: e.clientX - ballEl.offsetLeft, y: e.clientY - ballEl.offsetTop };
      try { ballEl.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    ballEl.addEventListener('pointermove', function (e) {
      if (!ballDown) return;
      // 移动超过阈值判定为拖动,之后的点击不切换开关(与按下时的指针坐标比较,不读布局)
      if (!ballDragged) {
        if (Math.abs(e.clientX - dragDownAt.x) + Math.abs(e.clientY - dragDownAt.y) > 3) {
          ballDragged = true;
          ballEl.classList.add('page-trans-dragging');   // 外观见 content/page-translate.css
        }
      }
      var x = Math.min(Math.max(0, e.clientX - dragOffset.x), dragBounds.maxX);
      var y = Math.min(Math.max(0, e.clientY - dragOffset.y), dragBounds.maxY);
      ballEl.style.left = x + 'px';
      ballEl.style.top = y + 'px';
      ballEl.style.right = 'auto';
      ballEl.style.bottom = 'auto';
    });
    var endDrag = function () {
      if (!ballDown) return;
      ballDown = false;
      ballEl.classList.remove('page-trans-dragging');
      if (ballDragged) setStore({ 'pageTrans.ballPos': { x: ballEl.offsetLeft, y: ballEl.offsetTop } });
    };
    ballEl.addEventListener('pointerup', endDrag);
    ballEl.addEventListener('pointercancel', endDrag);
    document.documentElement.appendChild(ballEl);
    watchExtensionLifetime();
    // 视口尺寸一变,球可能被浏览器重新摆放(默认位置贴着右缘),按钮的固定坐标就不再对齐:
    // 直接收回,下次右键重新算。closeBallMenu 是具名函数,多次注册会被浏览器忽略
    window.addEventListener('resize', closeBallMenu);
  }

  // 恢复悬浮球保存的位置
  function applyBallPos() {
    getStore(['pageTrans.ballPos'], function (cfg) {
      if (!ballEl) return;
      var p = cfg['pageTrans.ballPos'];
      if (p && typeof p.x === 'number') {
        ballEl.style.left = p.x + 'px';
        ballEl.style.top = p.y + 'px';
        ballEl.style.right = 'auto';
        ballEl.style.bottom = 'auto';
      }
    });
  }

  // 更新悬浮球的开关样式与无障碍名称
  function updateBallVisual() {
    if (!ballEl) return;
    ballEl.classList.toggle('page-trans-off', !state.enabled);
    // 用 aria-label 而非 title:原生 tooltip 悬停约 1 秒后弹出,正好压在右键展开的按钮上
    ballEl.setAttribute('aria-label', state.enabled ? getMsg('ballCancel') : getMsg('ballTranslate'));
  }

  // 显示/隐藏悬浮球(连同它右键展开的圆形按钮)
  function toggleBall(show) {
    if (show) {
      if (isTop) { createBall(); applyBallPos(); updateBallVisual(); }
    } else {
      closeBallMenu();   // 先收起:它会摘掉展开期间挂在 document 上的两个监听器
      if (ballEl && ballEl.parentNode) ballEl.parentNode.removeChild(ballEl);
      if (ballMenu && ballMenu.parentNode) ballMenu.parentNode.removeChild(ballMenu);
      ballEl = null;
      ballMenu = null;
    }
  }

  // 扩展上下文失效(重载/更新/停用/卸载)后的自清理哨兵
  //
  // 为什么需要:content/page-translate.css 由浏览器按 manifest 注入,扩展一重载就被撤掉;
  // 而内容脚本插进 DOM 的节点属于页面,不会被回收 —— 老标签页于是永远停在一个没有样式的裸球上
  // (position 退回 static → 按容器宽度铺开,把页面撑出可滚动的两千像素空白)。
  // 内容脚本只在页面加载时注入一次,扩展重载后不会有人来收拾这个残局,所以必须自己盯着。
  //
  // 为什么用轮询而不是 runtime.connect 的 onDisconnect:MV3 下一条常开的长连接会拖住后台
  // Service Worker 不让它休眠,而这只是个收尾用的哨兵;更关键的是 SW 正常休眠同样会触发
  // onDisconnect,那条路会把**还活着**的球误删。轮询读的是 chrome.runtime.id 是否真的没了,
  // 不会误判。后台标签页里定时器会被节流,漏判的代价只是晚清几秒 —— 而单元级的内联几何兜底
  // 已经保证这几秒里页面也不会被撑坏。
  var lifeTimer = null;
  function watchExtensionLifetime() {
    if (lifeTimer !== null) return;   // 只在第一次建球时开一个:扩展开关来回切、或重建球都不重复注册
    lifeTimer = setInterval(function () {
      if (alive()) return;
      clearInterval(lifeTimer);
      lifeTimer = null;
      toggleBall(false);              // 摘掉自己插的球与圆形按钮,页面恢复原样
    }, 2000);
  }


  // 计算实际翻译目标语言(跟随侧边栏或独立指定)
  function resolveTarget(cfg) {

    return (cfg['pageTrans.target'] || 'sidebar') === 'sidebar'
      ? (cfg['trans.targetLang'] || 'zh-CN')
      : cfg['pageTrans.target'];
  }

  // 读取译文样式配置
  function styleOf(cfg) {
    return {
      fontColor: cfg['pageTrans.fontColor'] || '',
      lineColor: cfg['pageTrans.lineColor'] || '',
      italic: !!cfg['pageTrans.italic'],
      bold: !!cfg['pageTrans.bold'],
      style: cfg['pageTrans.style'] || 'none'
    };
  }

  function applyStyleState(s) {
    state.fontColor = s.fontColor;
    state.lineColor = s.lineColor;
    state.italic = s.italic;
    state.bold = s.bold;
    state.style = s.style;
  }

  // 仅样式是否发生变化
  function styleChanged(ns) {
    return state.fontColor !== ns.fontColor || state.lineColor !== ns.lineColor ||
           state.italic !== ns.italic || state.bold !== ns.bold || state.style !== ns.style;
  }

  // 依据最新配置切换翻译/悬浮球状态(enabled 由后台消息驱动,不在 storage 里)
  function onState(cfg) {
    var newBall = cfg['pageTrans.ball'] !== false;
    var newTarget = resolveTarget(cfg);
    var newEngine = cfg['trans.engine'] || 'google';
    var newMode = cfg['pageTrans.mode'] === 'bilingual' ? 'bilingual' : 'replace';
    var newStyle = styleOf(cfg);

    var modeChanged = newMode !== state.mode;

    if (state.enabled) {
      if (modeChanged) {
        // 切换呈现方式:后台会广播关闭本页翻译,这里只更新配置,不自行重扫
        state.target = newTarget;
        state.engine = newEngine;
        state.mode = newMode;
        applyStyleState(newStyle);
      } else if (newTarget !== state.target || newEngine !== state.engine) {
        // 目标语言/引擎变化:还原并重扫(保持翻译开启)
        revertAll();
        state.target = newTarget;
        state.engine = newEngine;
        state.mode = newMode;
        applyStyleState(newStyle);
        scheduleScan();
      } else if (styleChanged(newStyle)) {
        // 仅译文样式变化:直接重涂已有译文,不重译
        applyStyleState(newStyle);
        restyleBilingual();
      } else {
        state.target = newTarget;
        state.engine = newEngine;
        state.mode = newMode;
      }
    } else {
      state.target = newTarget;
      state.engine = newEngine;
      state.mode = newMode;
      applyStyleState(newStyle);
    }

    if (newBall !== state.ball) {
      state.ball = newBall;
      toggleBall(newBall);
    } else if (state.ball && isTop) {
      updateBallVisual();
    }
  }

  // 本标签页的翻译开关(由后台广播,仅本页生效)
  function onEnabledMsg(enabled) {
    var next = !!enabled;
    if (next === state.enabled) return;
    state.enabled = next;
    if (next) startTranslate(); else stopTranslate();
  }

  // 初始化:读取配置并查询本标签页翻译开关(两者就绪后才启动)
  function init() {
    var configReady = false;
    var enabledReady = false;
    function maybeStart() {
      if (configReady && enabledReady && state.enabled) startTranslate();
    }

    getStore(RELEVANT_KEYS, function (cfg) {
      state.target = resolveTarget(cfg);
      state.engine = cfg['trans.engine'] || 'google';
      state.mode = cfg['pageTrans.mode'] === 'bilingual' ? 'bilingual' : 'replace';
      state.ball = cfg['pageTrans.ball'] !== false;
      applyStyleState(styleOf(cfg));
      toggleBall(state.ball);
      configReady = true;
      maybeStart();
    });

    // 向后台查询本标签页的翻译开关(per-tab,不随其他页面联动)
    try {
      chrome.runtime.sendMessage({ type: 'PAGE_TRANSLATE_QUERY' }, function (resp) {
        state.enabled = !!(resp && resp.enabled);
        enabledReady = true;
        maybeStart();
      });
    } catch (e) { enabledReady = true; }

    if (alive()) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        var keys = Object.keys(changes);
        var hit = keys.some(function (k) { return RELEVANT_KEYS.indexOf(k) > -1; });
        if (hit) getStore(RELEVANT_KEYS, onState);
        var engineConfigChanged = keys.some(function (k) { return ENGINE_CONFIG_KEYS.indexOf(k) > -1; });
        if (engineConfigChanged && state.enabled) {
          revertAll();
          scheduleScan();
        }
      });
      chrome.runtime.onMessage.addListener(function (msg) {
        if (msg && msg.type === 'PAGE_TRANSLATE_STATE') onEnabledMsg(msg.enabled);
        // 侧边栏设置里的「清除缓存」:缓存已由后台清空,这里弹出与悬浮球完全相同的那条结果提示,
        // 翻译开着时再还原并重扫(悬浮球那颗按钮是自己清、自己重扫,不走这条消息)
        else if (msg && msg.type === 'PAGE_TRANSLATE_RESCAN') {
          showClearCacheToast(typeof msg.cleared === 'number' ? msg.cleared : 0);
          if (state.enabled) {
            revertAll();
            scheduleScan();
          }
        }
      });
    }
  }


  // 等待 DOM 就绪后启动
  function boot() {
    if (!document.documentElement) { setTimeout(boot, 0); return; }
    init();
  }
  boot();
})();
