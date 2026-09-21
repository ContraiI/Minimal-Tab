// 扩展加载冒烟测试(纯 Node 运行):按 Chrome 的方式执行一遍全部脚本
//
// 目的:语法检查(node --check)看不出"运行期一加载就抛错"。若两个背景脚本或内容脚本在顶层
// 或初始化路径上抛错,扩展在浏览器里就是**整体不工作**(比如悬浮球根本不出现),而控制台
// 可能只给一条容易忽略的报错。这里用最小的假环境把四个脚本按 manifest 的顺序执行一遍,
// 并断言:背景脚本注册了消息监听、内容脚本完成初始化并建出了悬浮球。
//
// 覆盖不到:真实的样式、事件命中、跨进程通信(必须真浏览器)。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok   - ' + name); }
  else { fail++; console.log('  FAIL - ' + name); }
}

// ---------- 最小假 DOM ----------
let seq = 0;
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), nodeType: 1, id: '', className: '', style: {},
    children: [], parentNode: null, attrs: {}, listeners: {},
    offsetWidth: 32, offsetHeight: 32, offsetLeft: 1264, offsetTop: 16,
    nodeValue: null, isConnected: true, _seq: ++seq,
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    hasAttribute(k) { return this.attrs[k] !== undefined; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i > -1) this.children.splice(i, 1); c.parentNode = null; return c; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = this.listeners[t] || []; const i = a.indexOf(fn); if (i > -1) a.splice(i, 1); },
    dispatch(t, ev) { (this.listeners[t] || []).slice().forEach((fn) => fn(ev || {})); },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false; },
    getBoundingClientRect() { return { left: 1264, top: 16, right: 1296, bottom: 48, width: 32, height: 32 }; },
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
    contains() { return false; }, focus() {},
    get classList() {
      const self = this;
      return {
        add(c) { if (!self._cls().includes(c)) self.className = (self.className ? self.className + ' ' : '') + c; },
        remove(c) { self.className = self._cls().filter((x) => x !== c).join(' '); },
        toggle(c, on) { if (on === undefined) on = !self._cls().includes(c); if (on) this.add(c); else this.remove(c); },
        contains(c) { return self._cls().includes(c); }
      };
    },
    _cls() { return String(this.className || '').split(/\s+/).filter(Boolean); },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ''; },
    set textContent(v) { this._text = v; }, get textContent() { return this._text || ''; }
  };
  return el;
}

const htmlEl = makeEl('html');
const bodyEl = makeEl('body');
htmlEl.appendChild(bodyEl);
const docListeners = {};
const timers = [];
const document = {
  documentElement: htmlEl, body: bodyEl, createElement: makeEl,
  createTreeWalker: () => ({ nextNode: () => null }),
  addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
  removeEventListener() {},
  querySelectorAll() { return []; }, querySelector() { return null; },
  getElementById(id) {
    const stack = [htmlEl];
    while (stack.length) { const n = stack.pop(); if (n.id === id) return n; for (const c of n.children) stack.push(c); }
    return null;
  }
};

// ---------- 假 chrome(记录监听器注册情况) ----------
const reg = { bgMessage: 0, csMessage: 0, storageChanged: 0, sent: [] };
function makeChrome(isBackground) {
  return {
    runtime: {
      id: 'test', lastError: null,
      getURL: (p) => 'chrome-extension://test/' + p,
      sendMessage: (msg, cb) => { reg.sent.push(msg); if (cb) cb({ enabled: false }); },
      onMessage: { addListener: () => { if (isBackground) reg.bgMessage++; else reg.csMessage++; } }
    },
    storage: {
      local: { get: (k, cb) => cb({}), set: () => {}, remove: () => {} },
      session: { get: (k, cb) => cb({}), set: () => {} },
      onChanged: { addListener: () => { reg.storageChanged++; } }
    },
    tabs: { onRemoved: { addListener: () => {} }, sendMessage: () => {} },
    i18n: { getMessage: (k) => k }
  };
}

function makeSandbox(isBackground) {
  const s = {
    console, document, Promise, Map, Set, WeakMap, WeakSet, Date, Math, JSON, String, Number, Array, Object, RegExp, Error,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: (fn) => { fn(); return 1; }, cancelAnimationFrame: () => {},
    NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 },
    MutationObserver: class { observe() {} disconnect() {} },
    location: { protocol: 'https:', href: 'https://example.com/' },
    navigator: { userAgent: 'node' },
    innerWidth: 1280, innerHeight: 800,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    chrome: makeChrome(isBackground)
  };
  s.window = s;
  s.self = s;
  s.globalThis = s;
  s.top = s;
  s.addEventListener = () => {};
  s.removeEventListener = () => {};
  // 扩展页面(Console/边栏)会读 localStorage
  const store = {};
  s.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; }
  };
  vm.createContext(s);
  return s;
}

function load(sandbox, file, { asClassicScript } = {}) {
  const code = readFileSync(join(root, file), 'utf8');
  if (asClassicScript) {
    return vm.runInContext(code, sandbox, { filename: file });
  }
  vm.runInContext(code, sandbox, { filename: file });
}

console.log('1. 背景脚本(经典 SW:importScripts 两个共享模块 + background.js)');
{
  const s = makeSandbox(true);
  s.importScripts = function () { for (const f of arguments) load(s, f, { asClassicScript: true }); };
  load(s, 'background.js');
  ok(typeof s.TranslateEngine === 'object', 'TranslateEngine 已挂到全局');
  ok(typeof s.TranslationCache === 'object', 'TranslationCache 已挂到全局');
  ok(typeof s.TranslationCache.keyOf === 'function' && typeof s.TranslationCache.check === 'function', '缓存的取键/查询接口存在');
  ok(typeof s.TranslateEngine.translateText === 'function', '引擎的 translateText 存在');
  ok(reg.bgMessage === 1, '注册了 1 个 runtime.onMessage 监听(' + reg.bgMessage + ')');
  ok(reg.storageChanged === 1, '注册了 storage.onChanged 监听(' + reg.storageChanged + ')');
}

console.log('2. 内容脚本(dom-utils.js → content/page-translate.js)');
{
  const s = makeSandbox(false);
  load(s, 'dom-utils.js', { asClassicScript: true });
  load(s, 'content/page-translate.js');
  ok(typeof s.DomUtils === 'object' && typeof s.DomUtils.setStyleVar === 'function', 'DomUtils 已挂到全局(内容脚本依赖它)');
  // 内容脚本把 init 排在定时器里,跑一遍排队的定时器
  let n = 0;
  while (timers.length && n++ < 30) timers.shift()();
  ok(reg.csMessage === 1, '注册了 1 个 runtime.onMessage 监听(接收开关广播)');
  const ball = document.getElementById('pageTransBall');
  ok(!!ball, '初始化为顶层 frame 后建出了悬浮球');
  if (ball) {
    ok(ball.listeners.click && ball.listeners.click.length === 1, '悬浮球绑定了左键 click(开关翻译)');
    ok(ball.listeners.contextmenu && ball.listeners.contextmenu.length === 1, '悬浮球绑定了 contextmenu(右键展开/收回清除缓存按钮)');
    ok(ball.listeners.pointerdown && ball.listeners.pointermove && ball.listeners.pointerup, '悬浮球绑定了拖动所需的 pointer 事件');
    ok(!ball.listeners.mouseenter && !ball.listeners.mouseleave, '悬浮球不再靠悬停展开(改为右键)');
    ok(ball._html.indexOf('<svg') === 0, '悬浮球内含图标 SVG');
    const ballBtn = document.getElementById('pageTransBallBtn');
    ok(!!ballBtn, '页面里建出了右键展开的「清除缓存」按钮');
    ok(!!ballBtn && !ball.children.some((c) => c === ballBtn), '清除缓存按钮是独立元素(不在球内,两者不透明度/悬停互不影响)');
    ok(!!ballBtn && ballBtn._html.indexOf('<svg') === 0, '清除缓存按钮内含刷子图标 SVG');
    if (ballBtn) {
      // 右键展开 → 按球的位置定位 → 再右键收回
      ball.dispatch('contextmenu', { preventDefault() {} });
      ok(ballBtn.classList.contains('page-trans-open'), '右键悬浮球后展开清除缓存按钮');
      ok(ballBtn.style.left === '1264px' && ballBtn.style.top === '54px', '按钮按球的矩形定位(贴球正下方 6px)');
      ball.dispatch('contextmenu', { preventDefault() {} });
      ok(!ballBtn.classList.contains('page-trans-open'), '再右键一次收回清除缓存按钮');
      // 展开后点按钮:走通清缓存整条链路(showPageToast 曾缺失,这条断言能在 Node 侧兜住)
      ball.dispatch('contextmenu', { preventDefault() {} });
      ballBtn.dispatch('click', {});
      const toast = htmlEl.children.filter((c) => String(c.className || '').indexOf('page-trans-toast') > -1)[0];
      ok(!!toast, '点刷子按钮清缓存后建出了结果提示(.page-trans-toast)');
    }
  }
}

console.log('3. 扩展页面(translation.html 的经典 <script> 顺序)');
{
  const s = makeSandbox(false);
  // translation.html 的顺序:lang.js → translate-engine.js → color-utils.js → color-picker.js → dom-utils.js → translation.js
  for (const f of ['lang.js', 'translate-engine.js', 'color-utils.js', 'color-picker.js', 'dom-utils.js']) {
    load(s, f, { asClassicScript: true });
  }
  ok(typeof s.TranslateEngine === 'object', 'translate-engine.js 以经典脚本方式仍挂全局(不是 ESM)');
  ok(typeof s.ColorUtils === 'object', 'ColorUtils 已挂到全局');
  ok(typeof s.ColorPicker === 'object', 'ColorPicker 已挂到全局');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
