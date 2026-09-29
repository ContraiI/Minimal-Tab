// 引擎列表可见性的静态 lint
//
// 背景:引擎的"启用/禁用"曾经**编码在 DOM 位置上** —— 禁用项被搬进一个现造的隐藏容器
// #engineArchive。那种做法下,engineListEl 作用域的查询会自动"看不见"禁用项,而 document
// 作用域的查询又看得见,两套语义必须各自记牢;顺序还要靠 data-index 反复重排。现已改成
// **状态即类名**:禁用项留在原地、只打 .engine-hidden,由 CSS 收起来(见 style.css)。
//
// 新规矩只有一条,但漏了就会静默出错(选到隐藏引擎、或隐藏项被当成当前引擎):
//   **engineListEl 作用域的 .engine-item 查询,一律带 `:not(.engine-hidden)`。**
// script.js 没有任何运行时测试覆盖(需要真实 DOM),故这条规矩用静态检查守住。
//
// 运行:node tests/engine-visibility-test.mjs   (退出码 0 = 通过)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok   - ' + name); }
  else { fail++; console.log('  FAIL - ' + name); }
}

// 去掉注释再查:这些标记在注释里出现是正常的(注释正是用来解释历史的)
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

const scriptSrc = readFileSync(join(root, 'script.js'), 'utf8');
const scriptCode = stripComments(scriptSrc);
const styleSrc = readFileSync(join(root, 'style.css'), 'utf8');

console.log('1. 隐藏机制是类名,不是"搬节点进隐藏容器"');
ok(!/engineArchive/.test(scriptCode), 'script.js 的代码里不再出现 engineArchive(隐藏容器已删除)');
ok(!/window\.applyEngineVisibility/.test(scriptCode), '不再把 applyEngineVisibility 挂到 window(改为文件顶层函数)');
ok(!/typeof applyEngineVisibility/.test(scriptCode), '不再需要 typeof 守卫(定义已提前到顶层,可直接调用)');
ok(/^function applyEngineVisibility\(\)/m.test(scriptCode), 'applyEngineVisibility 是文件顶层的函数声明');
const callCount = (scriptCode.match(/\bapplyEngineVisibility\(\)/g) || []).length;
ok(callCount >= 4, 'applyEngineVisibility() 被调用 ' + callCount + ' 次(初始化 1 次 + 增删改与开关 3 次)');

console.log('2. CSS 里必须有对应的隐藏规则');
ok(/\.engine-item\.engine-hidden\s*\{[^}]*display:\s*none/.test(styleSrc),
  'style.css 有 .engine-item.engine-hidden { display: none }');

console.log('3. engineListEl 作用域的查询一律带 :not(.engine-hidden)');
const scoped = scriptCode.split(/\r?\n/)
  .map((line, i) => ({ line: line.trim(), no: i + 1 }))
  .filter((l) => /engineListEl\.querySelector(All)?\(/.test(l.line) && /\.engine-item/.test(l.line));
const unfiltered = scoped.filter((l) => !l.line.includes(':not(.engine-hidden)'));
ok(scoped.length >= 6, '找到 ' + scoped.length + ' 处 engineListEl 作用域的 .engine-item 查询');
ok(unfiltered.length === 0,
  '全部 ' + scoped.length + ' 处都带过滤' +
  (unfiltered.length ? ' —— 漏了:' + unfiltered.map((l) => 'script.js:' + l.no).join('、') : ''));

console.log('4. document 作用域的查询仍应看见全部引擎(两个管理列表要列出禁用项)');
const docWide = scriptCode.split(/\r?\n/)
  .filter((l) => /document\.querySelectorAll\('\.engine-item'\)/.test(l));
ok(docWide.length >= 3, 'document 作用域的 .engine-item 查询有 ' + docWide.length + ' 处(未被误加过滤)');

console.log('5. 顺序归 DOM 顺序,不再有 data-index 这套顺序号');
const dataIndexLines = scriptCode.split(/\r?\n/)
  .map((l, i) => ({ line: l.trim(), no: i + 1 }))
  .filter((l) => /data-index/.test(l.line));
ok(dataIndexLines.length === 0,
  'script.js 的代码里不再出现 data-index' +
  (dataIndexLines.length ? ' —— 残留:script.js:' + dataIndexLines.map((l) => l.no).join('、') : ''));

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
