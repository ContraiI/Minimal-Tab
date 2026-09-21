// translation-cache.js 的假数据测试(纯 Node 运行,不依赖 chrome API)
// 位置说明:必须放在 tests/ 下,不能放扩展根目录 —— 以 "_" 开头的文件名被 Chrome 保留
// (如 _locales),先前叫 "_cache-test.mjs" 会让扩展直接加载失败。
// 该模块按传统脚本写、接口挂在 globalThis 上(浏览器里由 SW 用 importScripts 引入),
// 故这里用副作用导入再取全局对象,而不是读 import 的命名空间
import '../translation-cache.js';
const shared = globalThis.TranslationCache;
const normalizeLang = shared.normalizeLang;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok   - ' + name); }
  else { fail++; console.log('  FAIL - ' + name); }
}
function eq(a, b, name) { ok(a === b, name + ' (期望 ' + JSON.stringify(b) + ', 实际 ' + JSON.stringify(a) + ')'); }

console.log('1. 命中/未命中');
{
  const c = shared.create({ max: 10 });
  const k = c.keyOf('google', 'zh-CN', 'auto', 'Hello');
  eq(c.check(k), null, '未命中返回 null');
  eq(c.store(k, '你好'), true, '写入成功');
  eq(c.check(k), '你好', '命中返回译文');
  eq(c.stats().hits, 1, '命中计数');
  eq(c.stats().misses, 1, '未命中计数');
}

console.log('2. 键的构成:引擎/目标语言/源语言 任一不同即不命中');
{
  const c = shared.create({ max: 10 });
  const k = c.keyOf('google', 'zh-CN', 'auto', 'Hello');
  c.store(k, '你好');
  eq(c.check(c.keyOf('bing', 'zh-CN', 'auto', 'Hello')), null, '换引擎不命中');
  eq(c.check(c.keyOf('google', 'ja', 'auto', 'Hello')), null, '换目标语言不命中');
  eq(c.check(c.keyOf('google', 'zh-CN', 'en', 'Hello')), null, '换源语言不命中');
  eq(c.check(c.keyOf('google', 'ZH_CN', 'auto', 'Hello')), '你好', '语言写法归一后仍命中(ZH_CN = zh-CN)');
  eq(normalizeLang('zh_CN'), 'zh-cn', 'normalizeLang 归一');
}

console.log('3. 配置代号变化后旧条目失效(无需清表)');
{
  const c = shared.create({ max: 10 });
  const k = c.keyOf('google', 'zh-CN', 'auto', 'Hello');
  c.store(k, '旧配置的译文');
  c.bumpGeneration();
  eq(c.check(k), null, '旧代号条目按未命中处理');
  eq(c.stats().size, 0, '失配条目被顺手回收,不留在表里');
  eq(c.total.size, 0, '前缀计数同时清理');
  c.store(k, '新配置的译文');
  eq(c.check(k), '新配置的译文', '同键可在新代号下写入并命中');
  eq(c.stats().hits, 1, '只有新代号的命中被计数');
}

console.log('4. 前缀计数与失效前缀回收(反复切引擎/语言不涨内存)');
{
  const c = shared.create({ max: 10 });
  for (let i = 0; i < 400; i++) {
    c.bumpGeneration();
    c.store(c.keyOf('google', 'zh-CN', 'auto', 'text' + i), 'v' + i);
  }
  ok(c.total.size <= 100, '前缀计数表被回收,当前 ' + c.total.size + ' 条');
  eq(c.check(c.keyOf('google', 'zh-CN', 'auto', 'text399')), 'v399', '最新一代条目仍可命中');
}

console.log('5. LRU 容量上限与淘汰序');
{
  const c = shared.create({ max: 3 });
  const ks = ['a', 'b', 'c'].map((t) => c.keyOf('google', 'zh-CN', 'auto', t));
  ks.forEach((k, i) => c.store(k, 'v' + i));
  eq(c.check(ks[0]), 'v0', '命中 a 会刷新其 LRU 序');
  c.store(c.keyOf('google', 'zh-CN', 'auto', 'd'), 'v3');
  eq(c.stats().size, 3, '容量不超过上限');
  eq(c.check(ks[0]), 'v0', '刚命中的 a 未被淘汰');
  eq(c.check(ks[1]), null, '最久未用的 b 被淘汰');
  eq(c.stats().evicts, 1, '淘汰计数');
}

console.log('6. 同键请求合并');
{
  let calls = 0;
  const c = shared.create({ max: 10 });
  const k = c.keyOf('google', 'zh-CN', 'auto', 'Hello');
  const task = () => { calls++; return new Promise((r) => setTimeout(() => r('你好'), 10)); };
  const p1 = c.fetch(k, task);
  const p2 = c.fetch(k, task);
  eq(p1 === p2, true, '同键返回同一个 Promise');
  const [r1, r2] = await Promise.all([p1, p2]);
  eq(r1, '你好', '结果 1');
  eq(r2, '你好', '结果 2');
  eq(calls, 1, '底层任务只执行一次');
  eq(c.stats().joins, 1, '合并计数');
  eq(c.stats().pending, 0, '结算后清空进行中表');
  const p3 = c.fetch(k, task);
  eq(p3 === p1, false, '结算后再次请求是新任务');
  await p3;
  eq(calls, 2, '第二次真实执行');
}

console.log('7. 请求失败不污染缓存,pending 不残留');
{
  const c = shared.create({ max: 10 });
  const k = c.keyOf('google', 'zh-CN', 'auto', 'X');
  let n = 0;
  const bad = () => { n++; return Promise.reject(Object.assign(new Error('HTTP 429'), { code: 'HTTP_429' })); };
  let caught = null;
  await c.fetch(k, bad).catch((e) => { caught = e.code; });
  eq(caught, 'HTTP_429', '失败向上抛出');
  eq(c.stats().pending, 0, '失败也不残留 pending');
  await c.fetch(k, () => { n++; return Promise.resolve('ok'); });
  eq(n, 2, '失败后重试会真的再执行');
  eq(c.check(k), null, '失败结果不被缓存(由调用方决定不 store)');
}

console.log('8. 边界:空译文 / 超长原文 / 非字符串');
{
  const c = shared.create({ max: 10, textMax: 20 });
  const k = c.keyOf('google', 'zh-CN', 'auto', 'Hi');
  eq(c.store(k, ''), true, '空串是合法译文,照常缓存');
  eq(c.check(k), '', '命中空串');
  const long = 'x'.repeat(21);
  eq(c.store(c.keyOf('google', 'zh-CN', 'auto', long), 'v'), false, '超长原文不缓存');
  eq(c.check(c.keyOf('google', 'zh-CN', 'auto', long)), null, '超长原文查不到');
  eq(c.store(c.keyOf('google', 'zh-CN', 'auto', 'ok'), null), false, 'null 不缓存');
  eq(c.store(c.keyOf('google', 'zh-CN', 'auto', 'ok'), undefined), false, 'undefined 不缓存');
}

console.log('9. 键不因拼接而碰撞');
{
  const c = shared.create({ max: 10 });
  const k1 = c.keyOf('google', 'zh-CN', 'auto', 'a');
  const k2 = c.keyOf('google', 'zh-CN', 'auto', 'a\u0000b');
  ok(k1 !== k2, '含分隔符的原文也不会与短键相同');
  c.store(k1, 'v1');
  c.store(k2, 'v2');
  eq(c.check(k1), 'v1', '短键独立');
  eq(c.check(k2), 'v2', '长键独立');
}

console.log('10. 默认实例与 create 实例互不影响');
{
  eq(typeof shared.check, 'function', '默认实例有方法');
  eq(typeof shared.create, 'function', '默认实例暴露 create');
  ok(shared.count.hits + shared.count.misses + shared.count.stores === 0, '默认实例未被上面的用例写入');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
