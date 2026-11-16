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

// pkg 会把包入口 .js 当脚本重写，静态路由再读同一路径时可能拿到被转换过的版本。
// 这里复制一份非 .js 后缀的资源，打包后按原样读取并作为 text/javascript 返回。
const engine = path.join(__dirname, '..', 'node_modules', 'webwallgl', 'webwallgl.global.min.js');
const bundledEngine = path.join(__dirname, '..', 'scene-live', 'webwallgl.global.min.js.bin');
const engineSource = fs.readFileSync(engine);
if (!engineSource.includes('createScene') || !engineSource.includes('httpSource')) {
  throw new Error('WebWallGL 引擎文件不完整');
}
fs.copyFileSync(engine, bundledEngine);
console.log('scene engine asset written: ' + engineSource.length + ' bytes');
