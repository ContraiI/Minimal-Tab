// background.js 的假 chrome 集成测试(纯 Node 运行)
//
// 目的:background.js 是经典 Service Worker,不能直接 import,故这里用 vm 造一个假 chrome 环境跑它,
// 再通过 onMessage 监听器验证清缓存那条消息:PAGE_TRANSLATE_RESET_CACHE
// (悬浮球的圆形按钮与侧边栏设置里的「清除缓存」都走它,后者带 tabId 时应补发 PAGE_TRANSLATE_RESCAN)。
//
// 覆盖不到的部分(需要真浏览器):content script 的悬浮球几何、右键开合与拖动手势。
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
function eq(a, b, name) { ok(a === b, name + ' (期望 ' + JSON.stringify(b) + ', 实际 ' + JSON.stringify(a) + ')'); }

// ---- 假 chrome 环境 ----
const calls = { storageSet: [] };
const messageListeners = [];
const storageListeners = [];
const tabMessages = [];   // 后台发给标签页的消息(断言侧边栏清缓存会通知当前页重扫)

const chrome = {
  runtime: {
    id: 'test',
    lastError: null,
    onMessage: { addListener: (fn) => messageListeners.push(fn) }
  },
  storage: {
    local: {
      get: (keys, cb) => cb({}),
      set: (obj, cb) => { calls.storageSet.push(obj); if (cb) cb(); },
      remove: (k, cb) => { calls.storageRemove.push(k); if (cb) cb(); }
    },
    session: { get: (k, cb) => cb({}), set: () => {} },
    onChanged: { addListener: (fn) => storageListeners.push(fn) }
  },
  tabs: {
    onRemoved: { addListener: () => {} },
    sendMessage: (id, msg) => { tabMessages.push({ id: id, msg: msg }); }
  },

};

const sandbox = {
  chrome,
  console,
  setTimeout,
  clearTimeout,
  Promise,
  URL,
  AbortController,
  fetch: () => Promise.reject(new Error('no network in test'))
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// importScripts:按经典脚本执行,接口挂到同一个全局(与浏览器 SW 行为一致)
sandbox.importScripts = function () {
  for (const f of arguments) {
    const code = readFileSync(join(root, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
};

vm.runInContext(readFileSync(join(root, 'background.js'), 'utf8'), sandbox, { filename: 'background.js' });

ok(typeof sandbox.TranslateEngine === 'object', 'importScripts 把 TranslateEngine 挂到全局');
ok(typeof sandbox.TranslationCache === 'object', 'importScripts 把 TranslationCache 挂到全局');
eq(messageListeners.length, 1, 'onMessage 监听器已注册');

// ---- 消息工具:模拟 chrome 的 sendMessage 应答 ----
let lastResponse;
function send(msg, sender) {
  lastResponse = undefined;
  messageListeners[0](msg, sender || {}, (resp) => { lastResponse = resp; });
}

console.log('1. PAGE_TRANSLATE_RESET_CACHE');
{
  const c = sandbox.TranslationCache;
  c.store(c.keyOf('google', 'zh-CN', 'auto', 'Hello'), '你好');
  c.store(c.keyOf('google', 'zh-CN', 'auto', 'World'), '世界');
  eq(c.stats().size, 2, '预置两条缓存');
  eq(lastResponse, undefined, '发送前无应答');
  send({ type: 'PAGE_TRANSLATE_RESET_CACHE' });
  ok(lastResponse && lastResponse.ok === true, '同步应答 ok');
  eq(lastResponse.cleared, 2, '回报清掉的条数');
  eq(c.stats().size, 0, '缓存已清空');
  const genBefore = c.stats().gen;
  send({ type: 'PAGE_TRANSLATE_RESET_CACHE' });
  eq(c.stats().gen, genBefore + 1, '每次清空都自增代号(在飞的旧代号结果不会被后续命中)');
  eq(lastResponse.cleared, 0, '空缓存回报 0');
}

console.log('2. 未知消息类型不被应答(也不会抛错)');
{
  send({ type: 'NOPE' });
  eq(lastResponse, undefined, '未知类型不应答');
}

console.log('3. 侧边栏发起清缓存:带 tabId 时把条数一并带给该标签页,由页面弹同一条提示');
{
  const c = sandbox.TranslationCache;
  c.store(c.keyOf('google', 'zh-CN', 'auto', 'Sidebar'), '侧边栏');
  tabMessages.length = 0;
  send({ type: 'PAGE_TRANSLATE_RESET_CACHE', tabId: 42 });
  ok(lastResponse && lastResponse.ok === true, '照常同步应答 ok');
  eq(tabMessages.length, 1, '向标签页发了一条通知');
  eq(tabMessages[0].id, 42, '发给指定的 tabId');
  eq(tabMessages[0].msg.type, 'PAGE_TRANSLATE_RESCAN', '消息类型为 PAGE_TRANSLATE_RESCAN');
  eq(tabMessages[0].msg.cleared, 1, '把清掉的条数带给页面(页面据此弹与悬浮球相同的那条提示)');
  // 内容脚本(悬浮球按钮)自己发起时不带 tabId:它自己提示 + 还原重扫,后台不要再插手
  tabMessages.length = 0;
  send({ type: 'PAGE_TRANSLATE_RESET_CACHE' }, { tab: { id: 7 } });
  eq(tabMessages.length, 0, '无 tabId 时(内容脚本自己发起)不发重扫通知');
}

console.log('4. 翻译请求仍走缓存链路(不联网,只验证协议分支)');
{
  const c = sandbox.TranslationCache;
  const k = c.keyOf('google', 'zh-CN', 'auto', 'Cached text');
  c.store(k, '缓存译文');
  send({ type: 'PAGE_TRANSLATE', text: 'Cached text', to: 'zh-CN' });
  // 命中缓存的应答是异步的(engineSettingsReady → check),等一个微任务轮次
  await new Promise((r) => setTimeout(r, 0));
  ok(lastResponse && lastResponse.ok === true, '命中缓存直接应答 ok');
  eq(lastResponse.text, '缓存译文', '返回缓存译文');
  eq(lastResponse.cached, true, '带 cached 标记');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
