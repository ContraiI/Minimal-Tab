// page-trans-spec.js(整页翻译设置的单一来源)的等价性测试
//
// 这个文件现在同时被侧栏 translation.js 与内容脚本 content/page-translate.js 消费,
// 一旦它的默认值或"脏值归一"口径变了,两边的表现会**同时**静默变掉(开关点了没反应、
// 页面不重扫、旧备份导入后样式丢失……)。所以把这些口径逐条钉在这里:
// 下面每条断言的取值,都对应重构前散落在两侧的四份实现各自写过的写法。
//
// 运行:node tests/page-trans-spec-test.mjs   (退出码 0 = 通过)
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

// 按内容脚本/扩展页面的加载方式跑一遍:经典脚本 + 全局 window/self
const sandbox = { console };
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(root, 'page-trans-spec.js'), 'utf8'), sandbox, { filename: 'page-trans-spec.js' });

const PT = sandbox.PageTransSpec;
ok(!!PT && Array.isArray(PT.KEYS), 'PageTransSpec 已挂到全局并暴露 KEYS');

console.log('1. 键清单与默认值');
const EXPECT_KEYS = ['pageTrans.target', 'pageTrans.ball', 'pageTrans.mode', 'pageTrans.fontColor',
  'pageTrans.lineColor', 'pageTrans.italic', 'pageTrans.bold', 'pageTrans.style'];
ok(EXPECT_KEYS.every((k) => PT.KEYS.indexOf(k) > -1) && PT.KEYS.length === EXPECT_KEYS.length,
  'KEYS 就是这 8 个设置键(' + PT.KEYS.join(', ') + ')');
ok(PT.BALL_POS_KEY === 'pageTrans.ballPos', 'BALL_POS_KEY 是 pageTrans.ballPos');
ok(PT.WATCH_KEYS.length === PT.KEYS.length + PT.RELATED_KEYS.length &&
   PT.RELATED_KEYS.indexOf('trans.engine') > -1 && PT.RELATED_KEYS.indexOf('trans.targetLang') > -1,
  'WATCH_KEYS = 8 个设置键 + 引擎选择 + 侧栏目标语言');

console.log('2. read(null) 的默认状态(侧栏 pageTransState 的形状)');
const def = PT.read(null);
const expectDef = {
  target: 'sidebar', ball: true, mode: 'replace', fontColor: '',
  lineColor: '', italic: false, bold: false, style: 'none'
};
ok(JSON.stringify(def) === JSON.stringify(expectDef), '默认值与重构前两侧各自写的初值一致');

console.log('3. 脏值归一(逐条对应重构前散落的写法)');
const cases = [
  ['pageTrans.ball', false, false, 'ball: 显式 false 才算关闭(原 `!== false`)'],
  ['pageTrans.ball', undefined, true, 'ball: 缺省视为开'],
  ['pageTrans.ball', 'false', true, 'ball: 字符串 false 仍视为开(原写法就是 !== false)'],
  ['pageTrans.mode', 'bilingual', 'bilingual', 'mode: 只认 bilingual'],
  ['pageTrans.mode', 'replace', 'replace', 'mode: replace 原样'],
  ['pageTrans.mode', 'BILINGUAL', 'replace', 'mode: 大小写不同按脏值回 replace'],
  ['pageTrans.mode', undefined, 'replace', 'mode: 缺省回 replace'],
  ['pageTrans.italic', '', false, 'italic: 空串按假(原 `!!v`)'],
  ['pageTrans.italic', 'x', true, 'italic: 任意真值按真(原 `!!v`)'],
  ['pageTrans.bold', 0, false, 'bold: 0 按假'],
  ['pageTrans.target', '', 'sidebar', 'target: 空串回落默认(原 `|| "sidebar"`)'],
  ['pageTrans.target', 'ja', 'ja', 'target: 正常语言码原样'],
  ['pageTrans.fontColor', '', '', 'fontColor: 空串即默认空(原 `|| ""`)'],
  ['pageTrans.style', undefined, 'none', 'style: 缺省回 none(原 `|| "none"`)'],
  ['pageTrans.style', 'underlineA', 'underlineA', 'style: 正常样式名原样']
];
for (const [key, raw, want, label] of cases) {
  const got = PT.value({ [key]: raw }, key);
  ok(got === want, label + ' —— 期望 ' + JSON.stringify(want) + ',实际 ' + JSON.stringify(got));
}

console.log('4. toStore / read 往返');
const state = { target: 'ja', ball: false, mode: 'bilingual', fontColor: '#fff', lineColor: '#000', italic: true, bold: false, style: 'underlineB' };
const stored = PT.toStore(state);
ok(Object.keys(stored).length === 8 && stored['pageTrans.target'] === 'ja' && stored['pageTrans.ball'] === false &&
   stored['pageTrans.italic'] === true && stored['pageTrans.style'] === 'underlineB',
  'toStore 按存储键写出 8 项');
ok(JSON.stringify(PT.read(stored)) === JSON.stringify(state), 'read(toStore(s)) 与 s 逐字段相等(往返无损)');
const partial = PT.toStore({ target: 'ja' });
ok(partial['pageTrans.ball'] === true && partial['pageTrans.mode'] === 'replace' && partial['pageTrans.style'] === 'none',
  'toStore 遇到缺字段时补默认值(不会写出 undefined 把 storage 弄脏)');

console.log('5. 引擎配置字段的认定口径');
const engineKeyCases = [
  ['trans.msKey', true, '微软引擎的 Key'],
  ['trans.msRegion', true, '微软引擎的区域'],
  ['trans.custom.model', true, '自定义引擎的模型'],
  ['trans.engine', false, '引擎选择本身已由 RELATED_KEYS 覆盖,不算"配置字段"'],
  ['trans.targetLang', false, '侧栏目标语言同上'],
  ['trans.sourceLang', false, '侧栏源语言:整页翻译固定自动检测,改它无需重扫'],
  ['pageTrans.ball', false, '整页翻译设置不是引擎字段'],
  ['ui.trans.locked.microsoft', false, 'UI 锁状态不是引擎字段(前缀不是 trans.)']
];
for (const [key, want, label] of engineKeyCases) {
  ok(PT.isEngineFieldKey(key) === want, 'isEngineFieldKey("' + key + '") = ' + want + ' —— ' + label);
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
