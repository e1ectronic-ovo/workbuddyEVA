'use strict';

// pkg 会把 JS 编译成字节码，Function.prototype.toString() 只剩 [native code]。
// 构建时把运行时源码固化成字符串模块，注入时不再依赖 toString()。
const fs = require('fs');
const path = require('path');
const runtime = require('../lib/renderer-runtime');

const source = runtime.toString();
if (!source.startsWith('function ') || source.includes('[native code]')) {
  throw new Error('无法读取 renderer-runtime 源码');
}
new Function('return (' + source + ')');

const out = path.join(__dirname, '..', 'lib', 'runtime-source.js');
const body = "'use strict';\n\nmodule.exports = " + JSON.stringify(source) + ';\n';
fs.writeFileSync(out, body, 'utf8');
console.log('runtime source written: ' + source.length + ' chars');
