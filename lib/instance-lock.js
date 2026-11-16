'use strict';

// 单实例锁：Windows 命名管道只能被一个进程监听，第二个实例会 EADDRINUSE；
// 进程退出（含崩溃）后系统自动释放，不会留下需要人工清理的残留锁文件。
const net = require('net');

const PIPE = '\\\\.\\pipe\\workbuddyEVA-single-instance';
let server = null;

function acquire() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(true);
    const candidate = net.createServer((socket) => socket.destroy());
    candidate.once('error', () => resolve(false));
    candidate.once('listening', () => {
      server = candidate;
      resolve(true);
    });
    candidate.listen(PIPE);
  });
}

function release() {
  if (!server) return;
  try { server.close(); } catch (_) {}
  server = null;
}

module.exports = { acquire, release };
