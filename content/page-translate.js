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
    engine: 'google'
  };

  var RELEVANT_KEYS = ['pageTrans.enabled', 'pageTrans.ball', 'pageTrans.target', 'trans.engine', 'trans.targetLang'];
  var ATTR_NAMES = ['title', 'placeholder', 'alt', 'aria-label'];
  var CONCURRENCY = 4;      // 并发翻译数
  var SCAN_DEBOUNCE = 150;  // 扫描防抖毫秒数



  // 翻译记录:原文→译文,用于还原
  var textRecords = new Map();
  var attrRecords = new Map();
  var processedText = new WeakSet();   // 已处理的文本节点
  var failedAttrs = new WeakMap();     // 翻译失败的属性
  var inFlightAttrs = new WeakMap();   // 翻译中的属性
  var inFlight = new Set();
  var loadingSpinners = new Map();     // 正在翻译的文本节点 → 其加载图标元素(用于移除)
  var targetVersion = 0;               // 状态版本,用于丢弃过期结果

  // 待扫描节点缓存与翻译队列
  var nodeCache = null;
  var elementCache = null;
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

            if (mutationObserver) mutationObserver.observe(n.shadowRoot, { childList: true, subtree: true, characterData: true });
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
  var SKIP_SELECTOR = 'script, style, noscript, template, textarea, input, select, option, datalist, code, pre, kbd, samp, var, head, [contenteditable], [translate="no"]';

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
      if (!el || isSkippedElement(el) || isInTargetLang(el)) {
        processedText.add(node);
        continue;
      }
      if (!inViewport(el)) continue;
      if (!isVisible(el)) { processedText.add(node); continue; }
      textJobs.push(node);
    }

    var attrJobs = [];
    for (var j = 0; j < elementCache.length; j++) {
      var e = elementCache[j];
      if (!inViewport(e) || !isVisible(e)) continue;
      if (e.id === 'pageTransBall') continue;
      var recs = attrRecords.get(e);
      var failed = failedAttrs.get(e);
      for (var a = 0; a < ATTR_NAMES.length; a++) {
        var name = ATTR_NAMES[a];
        if (recs && recs.has(name)) continue;
        if (failed && failed.has(name)) continue;
        var pending = inFlightAttrs.get(e);
        if (pending && pending.has(name)) continue;
        if (name === 'placeholder') {
          if (e.tagName !== 'INPUT' && e.tagName !== 'TEXTAREA') continue;
        } else if (isSkippedElement(e)) {
          continue;
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

  function removeLoadingSpinner(node) {
    var sp = loadingSpinners.get(node);
    if (sp) {
      if (sp.parentNode) sp.parentNode.removeChild(sp);
      loadingSpinners.delete(node);
    }
  }

  // 把任务加入队列并启动并发处理
  function enqueueAll(textJobs, attrJobs) {
    textJobs.forEach(function (n) {
      inFlight.add(n);
      queue.push({ type: 'text', node: n, text: n.nodeValue });
    });
    attrJobs.forEach(function (a) {
      if (!inFlightAttrs.has(a.el)) inFlightAttrs.set(a.el, new Set());
      inFlightAttrs.get(a.el).add(a.attr);
      queue.push({ type: 'attr', el: a.el, attr: a.attr, text: a.text });
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
    // 仅对正在翻译的文本加加载图标(排队等待中的不加)
    if (job.type === 'text') addLoadingSpinner(job.node);

    var p;
    try {
      p = chrome.runtime.sendMessage({ type: 'PAGE_TRANSLATE', text: text, to: state.target });
    } catch (e) {
      p = Promise.reject(e);
    }
    return p.then(function (resp) {
      if (!state.enabled || version !== targetVersion) return;
      if (!resp || !resp.ok) throw new Error((resp && resp.error) || 'translate failed');
      if (resp.text) applyResult(job, resp.text);
      else markFailed(job);
    }).catch(function () {
      if (state.enabled && version === targetVersion) markFailed(job);
    }).finally(function () {
      if (job.type === 'text') { inFlight.delete(job.node); removeLoadingSpinner(job.node); }
      else {
        var pending = inFlightAttrs.get(job.el);
        if (pending) {
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


  // 写入译文(文本 / 属性)
  function applyText(node, translated) {
    node.textContent = translated;
  }

  function applyAttribute(el, attr, translated) {
    el.setAttribute(attr, translated);
  }

  // 记录原文并应用翻译结果
  function applyResult(job, translated) {
    if (job.type === 'text') {
      var node = job.node;
      if (!node.parentNode || node.nodeValue !== job.text) return;
      var rec = { original: node.nodeValue, translated: translated };
      textRecords.set(node, rec);
      applyText(node, translated);
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
      if (node.parentNode && node.nodeValue === rec.translated) node.textContent = rec.original;
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
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'characterData') {
          if (r.target && r.target.nodeType === 3 && processedText.has(r.target)) continue;
          meaningful = true;
        } else {
          // 忽略仅插入/移除加载图标的 childList 变更,避免扫描循环
          var onlySpinner = true;
          var affected = [];
          if (r.addedNodes) { for (var a = 0; a < r.addedNodes.length; a++) affected.push(r.addedNodes[a]); }
          if (r.removedNodes) { for (var b = 0; b < r.removedNodes.length; b++) affected.push(r.removedNodes[b]); }
          for (var k = 0; k < affected.length; k++) {
            var n = affected[k];
            if (!(n && n.nodeType === 1 && n.getAttribute && n.getAttribute('data-page-trans-loading') === '1')) {
              onlySpinner = false; break;
            }
          }
          if (!onlySpinner) meaningful = true;
        }
      }
      if (!meaningful) return;
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
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
  }


  // 页面上的翻译悬浮球:点击切换翻译,可拖动
  var ballEl = null;
  var dragging = false;
  var dragOffset = null;

  // 读取 i18n 文案
  function getMsg(key) {
    try { return chrome.i18n.getMessage(key) || key; } catch (e) { return key; }
  }

  // 创建悬浮球并绑定点击/拖拽事件
  function createBall() {
    if (ballEl || !isTop) return;
    ballEl = document.createElement('div');
    ballEl.id = 'pageTransBall';
    ballEl.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';
    ballEl.addEventListener('click', function (e) {
      if (dragging) return;
      setStore({ 'pageTrans.enabled': !state.enabled });
    });

    ballEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      dragging = true;
      dragOffset = { x: e.clientX - ballEl.offsetLeft, y: e.clientY - ballEl.offsetTop };
      try { ballEl.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    ballEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var x = Math.min(Math.max(0, e.clientX - dragOffset.x), window.innerWidth - ballEl.offsetWidth);
      var y = Math.min(Math.max(0, e.clientY - dragOffset.y), window.innerHeight - ballEl.offsetHeight);
      ballEl.style.left = x + 'px';
      ballEl.style.top = y + 'px';
      ballEl.style.right = 'auto';
      ballEl.style.bottom = 'auto';
    });
    var endDrag = function () {
      if (!dragging) return;
      dragging = false;
      setStore({ 'pageTrans.ballPos': { x: ballEl.offsetLeft, y: ballEl.offsetTop } });
    };
    ballEl.addEventListener('pointerup', endDrag);
    ballEl.addEventListener('pointercancel', endDrag);
    document.documentElement.appendChild(ballEl);
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

  // 更新悬浮球的开关样式与提示
  function updateBallVisual() {
    if (!ballEl) return;
    ballEl.classList.toggle('page-trans-off', !state.enabled);
    ballEl.title = state.enabled ? getMsg('ballCancel') : getMsg('ballTranslate');
  }

  // 显示/隐藏悬浮球
  function toggleBall(show) {
    if (show) {
      if (isTop) { createBall(); applyBallPos(); updateBallVisual(); }
    } else {
      if (ballEl && ballEl.parentNode) ballEl.parentNode.removeChild(ballEl);
      ballEl = null;
    }
  }


  // 计算实际翻译目标语言(跟随侧边栏或独立指定)
  function resolveTarget(cfg) {

    return (cfg['pageTrans.target'] || 'sidebar') === 'sidebar'
      ? (cfg['trans.targetLang'] || 'zh-CN')
      : cfg['pageTrans.target'];
  }

  // 依据最新配置切换翻译/悬浮球状态
  function onState(cfg) {
    var newEnabled = !!cfg['pageTrans.enabled'];
    var newBall = cfg['pageTrans.ball'] !== false;
    var newTarget = resolveTarget(cfg);
    var newEngine = cfg['trans.engine'] || 'google';

    if (newEnabled !== state.enabled) {
      state.enabled = newEnabled;
      if (newEnabled) startTranslate(); else stopTranslate();
    } else if (newEnabled) {
      if (newTarget !== state.target || newEngine !== state.engine) {
        revertAll();
        state.target = newTarget;
        state.engine = newEngine;
        scheduleScan();
      }
    } else {
      state.target = newTarget;
      state.engine = newEngine;
    }

    if (newBall !== state.ball) {
      state.ball = newBall;
      toggleBall(newBall);
    } else if (state.ball && isTop) {
      updateBallVisual();
    }
  }

  // 初始化:读取配置并监听其变化
  function init() {
    getStore(RELEVANT_KEYS, function (cfg) {
      state.target = resolveTarget(cfg);
      state.engine = cfg['trans.engine'] || 'google';
      state.enabled = !!cfg['pageTrans.enabled'];
      state.ball = cfg['pageTrans.ball'] !== false;
      toggleBall(state.ball);
      if (state.enabled) startTranslate();
    });

    if (alive()) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        var hit = Object.keys(changes).some(function (k) { return RELEVANT_KEYS.indexOf(k) > -1; });
        if (hit) getStore(RELEVANT_KEYS, onState);
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
