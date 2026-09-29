// i18n 静态检查(纯 Node:不联网、不加载浏览器、不碰 DOM)
//
// 为什么需要它:lang.js 的两份语言表(zh-CN / en)共 300+ 个键,全靠人工对齐,而下面三类
// 问题都**不会报错**,只会静默出错:
//   ① 同一个表里出现重复键 —— JS 对象字面量里后写的静默覆盖前写的,界面显示的不是你以为的那句
//      (v1.4.6 前的 toastImportSuccess 就这样:配置导入实际显示成了壁纸导入的「导入成功」);
//   ② 两份表键集合漂移 —— 缺的那份由 t() 回退成把键名直接显示给用户;
//   ③ 已移除引擎的遗留文案(腾讯云 TMT,v1.4.2 移除)被继续抄进新键里。
// ④ 顺带核对:代码/HTML 里字面量引用的键是否真的存在(拼错一个字母 = 界面上一串英文键名)。
//
// 运行:node tests/i18n-test.mjs   (退出码 0 = 通过)
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

const TABLES = ['zh-CN', 'en'];
// 遗留词:已移除引擎(腾讯云 TMT)的专有名词,不该再出现在任何语言表的值里
const LEGACY_WORD = /腾讯|tencent|SecretId|SecretKey/i;
// 字面量引用的扫描范围:用 lang.js 的页面脚本与 HTML(内容脚本走 chrome.i18n/  _locales,是另一套命名空间)
const SCAN_JS = ['script.js', 'translation.js', 'popup.js'];
const SCAN_HTML = ['newtab.html', 'translation.html', 'popup.html'];

const src = readFileSync(join(root, 'lang.js'), 'utf8');
const lines = src.split(/\r?\n/);

// 取一份语言表的行区间:块头 → 下一个块头或对象收尾
function blockRange(name) {
  const start = lines.findIndex((l) => new RegExp("^\\s*'" + name + "':\\s*\\{").test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*'[A-Za-z-]+':\s*\{/.test(lines[i]) || /^\}/.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

// 表内条目(要求扁平:所有条目同一缩进,出现更深缩进即说明结构变了,需要人工确认)
function tableEntries(name) {
  const r = blockRange(name);
  if (!r) return null;
  const out = [];
  for (let i = r.start + 1; i < r.end; i++) {
    const m = /^(\s+)([A-Za-z_$][\w$]*)\s*:/.exec(lines[i]);
    if (m) out.push({ key: m[2], indent: m[1].length, line: i + 1, value: lines[i].trim() });
  }
  return out;
}

console.log('1. 语言表结构(' + TABLES.join(' / ') + ')');
const table = {};
for (const name of TABLES) table[name] = tableEntries(name);
for (const name of TABLES) {
  ok(!!table[name] && table[name].length > 0, '解析出 ' + name + ' 表(' + (table[name] ? table[name].length : 0) + ' 个键)');
}
if (TABLES.every((n) => table[n])) {
  for (const name of TABLES) {
    const indents = new Set(table[name].map((e) => e.indent));
    ok(indents.size === 1, name + ' 表是扁平的(条目缩进一致,未见嵌套结构)');
  }
}

console.log('2. 同一份表内不得有重复键(后写的会静默覆盖前写的)');
for (const name of TABLES) {
  const seen = new Map();
  const dupes = [];
  for (const e of (table[name] || [])) {
    if (seen.has(e.key)) dupes.push(e.key + '(第 ' + seen.get(e.key) + ' 行与第 ' + e.line + ' 行)');
    else seen.set(e.key, e.line);
  }
  ok(dupes.length === 0, name + ' 表无重复键' + (dupes.length ? ' —— 重复:' + dupes.join('、') : ''));
}

console.log('3. 两份表的键集合必须一致');
if (TABLES.every((n) => table[n])) {
  const setOf = (n) => new Set(table[n].map((e) => e.key));
  const [a, b] = TABLES;
  const onlyA = [...setOf(a)].filter((k) => !setOf(b).has(k));
  const onlyB = [...setOf(b)].filter((k) => !setOf(a).has(k));
  ok(onlyA.length === 0, '仅 ' + a + ' 有的键:0 个' + (onlyA.length ? ' —— ' + onlyA.join('、') : ''));
  ok(onlyB.length === 0, '仅 ' + b + ' 有的键:0 个' + (onlyB.length ? ' —— ' + onlyB.join('、') : ''));
}

console.log('4. 不含已移除引擎(腾讯云 TMT)的遗留文案');
for (const name of TABLES) {
  const hits = (table[name] || []).filter((e) => LEGACY_WORD.test(e.value));
  ok(hits.length === 0, name + ' 表无遗留引擎词' + (hits.length ? ' —— 命中:' + hits.map((h) => h.key + '@' + h.line).join('、') : ''));
}

console.log('5. 代码/HTML 里字面量引用的键必须存在');
if (TABLES.every((n) => table[n])) {
  const all = new Set(TABLES.flatMap((n) => table[n].map((e) => e.key)));
  const used = new Map(); // key -> ['文件:行']
  const collect = (file, re) => {
    let text;
    try { text = readFileSync(join(root, file), 'utf8'); } catch (e) { return; }
    text.split(/\r?\n/).forEach((line, i) => {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(line)) !== null) {
        const key = m[1];
        if (!used.has(key)) used.set(key, []);
        used.get(key).push(file + ':' + (i + 1));
      }
    });
  };
  for (const f of SCAN_JS) collect(f, /\bt\(\s*['"]([^'"]+)['"]\s*[,)]/g);
  for (const f of SCAN_HTML) collect(f, /data-i18n(?:-title|-placeholder)?="([^"]+)"/g);

  const missing = [...used.keys()].filter((k) => !all.has(k)).sort();
  ok(missing.length === 0, '字面量引用的 ' + used.size + ' 个键都存在于语言表' +
    (missing.length ? ' —— 缺失:' + missing.map((k) => k + '(' + used.get(k).join(',') + ')').join('、') : ''));
  // 仅供参考:表里有、但没有任何字面量引用(可能是动态拼键,也可能是死文案)
  const unused = [...all].filter((k) => !used.has(k)).sort();
  console.log('  info - 未被字面量引用(可能动态拼键或已废弃)的键:' + unused.length + ' 个' +
    (unused.length ? ' [' + unused.slice(0, 8).join('、') + (unused.length > 8 ? ' …' : '') + ']' : ''));
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
