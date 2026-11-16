'use strict';

// workbuddyEVA 安装 / 卸载入口。以 GUI 子系统打包，双击不出现控制台窗口。
// 安装：选择安装位置与数据存储位置（默认避开系统盘）→ 复制应用与卸载器 → 写 data-path.txt
//      → 建快捷方式、写卸载注册表 → 启动应用。
// 卸载：把自己复制到临时目录再以 --purge 运行，确保安装目录里的文件都能删掉。
// 参数：--silent 静默；--dir <安装目录>；--data <数据目录>；--no-start 安装后不启动；--uninstall；--purge <目录>。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const TITLE = 'workbuddyEVA';
const APP_NAME = 'workbuddyEVA.exe';
const UNINSTALL_NAME = 'Uninstall.exe';
const DATA_PATH_FILE = 'data-path.txt';
const DEFAULT_INSTALL_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'workbuddyEVA');
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\workbuddyEVA';

const ARGV = process.argv.slice(2);
const SILENT = ARGV.includes('--silent');
const NO_START = ARGV.includes('--no-start');

function argValue(name) {
  const index = ARGV.indexOf(name);
  return index >= 0 && ARGV[index + 1] ? ARGV[index + 1] : '';
}

let META = { version: '0.0.0', productName: 'workbuddyEVA' };
try {
  META = Object.assign(META, JSON.parse(fs.readFileSync(path.join(__dirname, 'meta.json'), 'utf8')));
} catch (_) {}

function psLiteral(text) {
  return "'" + String(text).replace(/'/g, "''") + "'";
}

function runPS(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
  ], { windowsHide: true, encoding: 'utf8' });
}

function info(text) {
  if (SILENT) return;
  runPS('Add-Type -AssemblyName System.Windows.Forms;'
    + '[System.Windows.Forms.MessageBox]::Show(' + psLiteral(text) + ',' + psLiteral(TITLE) + ",'OK','Information') | Out-Null");
}

function fail(text) {
  if (SILENT) process.exit(1);
  runPS('Add-Type -AssemblyName System.Windows.Forms;'
    + '[System.Windows.Forms.MessageBox]::Show(' + psLiteral(text) + ',' + psLiteral(TITLE) + ",'OK','Error') | Out-Null");
  process.exit(1);
}

function confirm(text, defaultButton) {
  const button = defaultButton === 'No' ? 'Button2' : 'Button1';
  const result = runPS('Add-Type -AssemblyName System.Windows.Forms;'
    + '$r=[System.Windows.Forms.MessageBox]::Show(' + psLiteral(text) + ',' + psLiteral(TITLE) + ",'YesNo','Question','" + button + "');"
    + "if($r -eq 'Yes'){exit 0}else{exit 1}");
  return result.status === 0;
}

// 现代文件夹选择框（IFileOpenDialog）：Win10/11 原生样式，替换旧的树状 FolderBrowserDialog。
const PICKER_CS = [
  'using System;',
  'using System.Runtime.InteropServices;',
  'public static class WbweFolderPicker {',
  '  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]',
  '  private class FileOpenDialogRCW { }',
  '  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  '  private interface IFileDialog {',
  '    [PreserveSig] int Show(IntPtr parent);',
  '    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);',
  '    void SetFileTypeIndex(uint iFileType);',
  '    void GetFileTypeIndex(out uint piFileType);',
  '    void Advise(IntPtr pfde, out uint pdwCookie);',
  '    void Unadvise(uint dwCookie);',
  '    void SetOptions(uint fos);',
  '    void GetOptions(out uint pfos);',
  '    void SetDefaultFolder(IShellItem psi);',
  '    void SetFolder(IShellItem psi);',
  '    void GetFolder(out IShellItem ppsi);',
  '    void GetCurrentSelection(out IShellItem ppsi);',
  '    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);',
  '    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);',
  '    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);',
  '    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);',
  '    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);',
  '    void GetResult(out IShellItem ppsi);',
  '    void AddPlace(IShellItem psi, int fdap);',
  '    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);',
  '    void Close(int hr);',
  '    void SetClientGuid(ref Guid guid);',
  '    void ClearClientData();',
  '    void SetFilter(IntPtr pFilter);',
  '  }',
  '  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
  '  private interface IShellItem {',
  '    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);',
  '    void GetParent(out IShellItem ppsi);',
  '    void GetDisplayName(uint sigdnName, out IntPtr ppszName);',
  '    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);',
  '    void Compare(IShellItem psi, uint hint, out int piOrder);',
  '  }',
  '  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]',
  '  private static extern void SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid,',
  '    [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);',
  '  public static string Pick(string title, string initial) {',
  '    var dialog = (IFileDialog)new FileOpenDialogRCW();',
  '    uint options;',
  '    dialog.GetOptions(out options);',
  '    dialog.SetOptions(options | 0x20 | 0x40 | 0x800);',
  '    dialog.SetTitle(title);',
  '    if (!string.IsNullOrEmpty(initial)) {',
  '      try {',
  '        Guid iid = typeof(IShellItem).GUID;',
  '        IShellItem folder;',
  '        SHCreateItemFromParsingName(initial, IntPtr.Zero, ref iid, out folder);',
  '        dialog.SetFolder(folder);',
  '      } catch { }',
  '    }',
  '    if (dialog.Show(IntPtr.Zero) != 0) return null;',
  '    IShellItem result;',
  '    dialog.GetResult(out result);',
  '    IntPtr name;',
  '    result.GetDisplayName(0x80058000, out name);',
  '    string path = Marshal.PtrToStringUni(name);',
  '    Marshal.FreeCoTaskMem(name);',
  '    return path;',
  '  }',
  '}',
].join('\n');

// 原生「选择文件夹」对话框；结果经临时 UTF-8 文件回传，避免控制台代码页把中文路径弄坏。
function pickFolder(description, initial) {
  const out = path.join(os.tmpdir(), 'workbuddy-eva-folder-' + Date.now() + '.txt');
  try { fs.mkdirSync(initial, { recursive: true }); } catch (_) {}
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    "if(-not ('WbweFolderPicker' -as [type])){",
    "Add-Type -TypeDefinition @'\n" + PICKER_CS + "\n'@",
    '}',
    '$r=[WbweFolderPicker]::Pick(' + psLiteral(description) + ',' + psLiteral(initial) + ')',
    "if($r){[IO.File]::WriteAllText(" + psLiteral(out)
      + ",$r,(New-Object System.Text.UTF8Encoding $false));exit 0}",
    'exit 1',
  ].join('\n');
  let picked = '';
  try {
    const result = runPS(script);
    if (result.status === 0) picked = fs.readFileSync(out, 'utf8').trim();
  } catch (_) {
    picked = '';
  } finally {
    try { fs.unlinkSync(out); } catch (_) {}
  }
  return picked;
}

function killApp() {
  spawnSync('taskkill', ['/IM', APP_NAME, '/F'], { windowsHide: true });
}

function shortcut(folder, installDir) {
  const lnk = path.join(folder, TITLE + '.lnk');
  runPS([
    '$w=New-Object -ComObject WScript.Shell',
    '$s=$w.CreateShortcut(' + psLiteral(lnk) + ')',
    '$s.TargetPath=' + psLiteral(path.join(installDir, APP_NAME)),
    '$s.WorkingDirectory=' + psLiteral(installDir),
    '$s.IconLocation=' + psLiteral(path.join(installDir, 'app.ico') + ',0'),
    '$s.Description=' + psLiteral('workbuddyEVA'),
    '$s.Save()',
  ].join(';'));
  return fs.existsSync(lnk);
}

function removeShortcut(folder) {
  try { fs.unlinkSync(path.join(folder, TITLE + '.lnk')); } catch (_) {}
}

function desktopDir() {
  const result = runPS("[Environment]::GetFolderPath('Desktop')");
  const dir = (result.stdout || '').trim();
  return dir || path.join(os.homedir(), 'Desktop');
}

function startMenuDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
}

function reg(args) {
  return spawnSync('reg', args, { windowsHide: true, encoding: 'utf8' });
}

function installedDir() {
  const result = reg(['query', UNINSTALL_KEY, '/v', 'InstallLocation']);
  const match = /InstallLocation\s+REG_SZ\s+(.+)/i.exec(result.stdout || '');
  const dir = match ? match[1].trim() : '';
  return dir && fs.existsSync(path.join(dir, APP_NAME)) ? dir : '';
}

function readDataPath(installDir) {
  try {
    const value = fs.readFileSync(path.join(installDir, DATA_PATH_FILE), 'utf8').trim();
    if (value) return path.resolve(installDir, value);
  } catch (_) {}
  return path.join(installDir, 'data');
}

// 默认数据目录：优先本机第一个可写的非系统盘（不主动放 C 盘），否则放在安装目录下。
function defaultDataDir(installDir) {
  const system = String(process.env.SystemDrive || 'C:').replace(/[\\/]+$/, '').toUpperCase();
  for (let code = 68; code <= 90; code += 1) {
    const drive = String.fromCharCode(code) + ':';
    if (drive.toUpperCase() === system) continue;
    try {
      fs.accessSync(drive + '\\', fs.constants.W_OK);
      return path.join(drive + '\\', 'workbuddyEVA-data');
    } catch (_) {}
  }
  return path.join(installDir, 'data');
}

function prepareDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, '.write-test');
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
}

function writeDataPath(installDir, dataDir) {
  prepareDir(dataDir);
  const rel = path.relative(installDir, dataDir);
  const inside = Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
  fs.writeFileSync(path.join(installDir, DATA_PATH_FILE), (inside ? rel : path.resolve(dataDir)) + '\r\n');
}

function writeRegistry(installDir) {
  const quotedUninstall = '"' + path.join(installDir, UNINSTALL_NAME) + '" --uninstall';
  reg(['add', UNINSTALL_KEY, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', TITLE, '/f']);
  reg(['add', UNINSTALL_KEY, '/v', 'DisplayIcon', '/t', 'REG_SZ', '/d', path.join(installDir, 'app.ico') + ',0', '/f']);
  reg(['add', UNINSTALL_KEY, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', META.version, '/f']);
  reg(['add', UNINSTALL_KEY, '/v', 'Publisher', '/t', 'REG_SZ', '/d', TITLE, '/f']);
  reg(['add', UNINSTALL_KEY, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', installDir, '/f']);
  reg(['add', UNINSTALL_KEY, '/v', 'UninstallString', '/t', 'REG_SZ', '/d', quotedUninstall, '/f']);
  reg(['add', UNINSTALL_KEY, '/v', 'QuietUninstallString', '/t', 'REG_SZ', '/d', quotedUninstall + ' --silent', '/f']);
  reg(['add', UNINSTALL_KEY, '/v', 'NoModify', '/t', 'REG_DWORD', '/d', '1', '/f']);
  reg(['add', UNINSTALL_KEY, '/v', 'NoRepair', '/t', 'REG_DWORD', '/d', '1', '/f']);
  const size = [APP_NAME, UNINSTALL_NAME]
    .map(name => { try { return fs.statSync(path.join(installDir, name)).size; } catch (_) { return 0; } })
    .reduce((a, b) => a + b, 0);
  reg(['add', UNINSTALL_KEY, '/v', 'EstimatedSize', '/t', 'REG_DWORD', '/d', String(Math.ceil(size / 1024)), '/f']);
}

function copyInto(installDir, name) {
  const source = path.join(__dirname, 'payload', name);
  const buffer = fs.readFileSync(source);
  const target = path.join(installDir, name === APP_NAME ? APP_NAME : name);
  fs.writeFileSync(target, buffer);
}

function install() {
  const existing = installedDir();
  let installDir = '';
  let dataDir = '';

  if (existing) {
    installDir = existing;
    dataDir = readDataPath(existing);
    const ok = SILENT || confirm('已经安装过 workbuddyEVA：\n' + installDir + '\n\n继续会把程序更新为 '
      + META.version + '，壁纸配置与账号数据保留在原数据目录：\n' + dataDir + '\n\n继续升级吗？');
    if (!ok) process.exit(0);
  } else if (SILENT) {
    installDir = path.resolve(argValue('--dir') || DEFAULT_INSTALL_DIR);
    dataDir = path.resolve(argValue('--data') || defaultDataDir(installDir));
  } else {
    if (!confirm('将安装 workbuddyEVA（WorkBuddy 壁纸引擎）。\n\n接下来可以选择安装位置和数据存储位置。\n\n开始安装吗？')) {
      process.exit(0);
    }
    const chosen = pickFolder('选择 workbuddyEVA 的安装位置', DEFAULT_INSTALL_DIR);
    if (!chosen) {
      info('已取消安装。');
      process.exit(0);
    }
    const suggestedData = defaultDataDir(chosen);
    const chosenData = pickFolder('选择数据存储位置（壁纸缓存、账号缓存、日志）。\n建议放在非系统盘，默认：' + suggestedData, suggestedData);
    if (!chosenData) {
      info('已取消安装。');
      process.exit(0);
    }
    installDir = path.resolve(chosen);
    dataDir = path.resolve(chosenData);
  }

  killApp();
  try {
    prepareDir(installDir);
    copyInto(installDir, APP_NAME);
    copyInto(installDir, 'app.ico');
    fs.copyFileSync(process.execPath, path.join(installDir, UNINSTALL_NAME));
    writeDataPath(installDir, dataDir);
  } catch (error) {
    fail('安装失败：' + error.message + '\n\n如果文件被占用，请先退出正在运行的 workbuddyEVA 后重试。');
  }

  shortcut(desktopDir(), installDir);
  shortcut(startMenuDir(), installDir);
  writeRegistry(installDir);

  if (!NO_START) {
    try {
      const child = spawn(path.join(installDir, APP_NAME), [], { detached: true, stdio: 'ignore', cwd: installDir });
      child.unref();
    } catch (_) {}
  }

  info('安装完成。\n\n安装位置：' + installDir
    + '\n数据目录：' + dataDir
    + '\n\n桌面和开始菜单里已经有「workbuddyEVA」图标。启动后会自动唤起 WorkBuddy，WorkBuddy 退出时本程序也会退出。'
    + '\n\n如需更换数据目录，可以编辑安装目录里的 ' + DATA_PATH_FILE + '。');
}

function scheduleSelfDelete(file) {
  // 临时卸载器无法删除自己：交给隐藏的 PowerShell 在本进程退出后清理。
  // 先等两秒并重试，避免文件仍被占用时一次删除失败就留下垃圾。
  const literal = file.replace(/'/g, "''");
  const script = "$p='" + literal + "';"
    + 'for($i=0;$i -lt 10;$i++){'
    + 'try{Remove-Item -LiteralPath $p -Force -ErrorAction Stop;break}'
    + 'catch{Start-Sleep -Seconds 1}}';
  try {
    const child = spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (_) {}
}

function purge(installDir) {
  const dir = path.resolve(installDir || path.dirname(process.execPath));
  const self = process.execPath;
  const dataDir = readDataPath(dir);

  // 安全阀：只清理看起来确实是本程序安装目录的路径
  if (!fs.existsSync(path.join(dir, APP_NAME)) && !fs.existsSync(path.join(dir, UNINSTALL_NAME))) {
    fail('没有在下面找到 workbuddyEVA 程序文件，已停止卸载：\n' + dir);
  }

  killApp();
  removeShortcut(desktopDir());
  removeShortcut(startMenuDir());
  reg(['delete', UNINSTALL_KEY, '/f']);

  const outside = path.relative(dir, dataDir).startsWith('..');
  const removeData = SILENT ? false
    : confirm('卸载之前，是否一并删除数据目录？\n\n' + dataDir
      + '\n\n选择「否」会保留壁纸配置、账号缓存和日志，方便以后重新安装后继续使用。', 'No');
  if (removeData && outside) {
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
  }

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  if (fs.existsSync(path.join(dir, APP_NAME))) {
    fail('部分文件没能删除，可能仍被占用。\n\n请重启电脑后再运行一次卸载，或手动删除：\n' + dir);
  }

  info('workbuddyEVA 已卸载。' + (removeData ? '\n\n数据目录也已删除。' : '\n\n数据目录已保留：' + dataDir));
  if (self.toLowerCase().startsWith(path.join(os.tmpdir()).toLowerCase())) scheduleSelfDelete(self);
}

function main() {
  if (ARGV.includes('--self-check')) {
    // 打包后校验内嵌安装内容是否可读（不安装、不弹窗）
    const payload = path.join(__dirname, 'payload');
    fs.writeFileSync(path.join(os.tmpdir(), 'workbuddy-eva-setup-selfcheck.json'), JSON.stringify({
      app: fs.statSync(path.join(payload, APP_NAME)).size,
      icon: fs.statSync(path.join(payload, 'app.ico')).size,
      version: META.version,
      pkg: !!process.pkg,
    }, null, 2));
    return;
  }
  if (ARGV.includes('--uninstall')) {
    if (!SILENT && !confirm('确定要卸载 workbuddyEVA 吗？\n\n数据目录不会被卸载过程自动删除。', 'No')) return;
    const installDir = path.dirname(process.execPath);
    const temp = path.join(os.tmpdir(), 'workbuddyEVA-uninstall-' + Date.now() + '.exe');
    try {
      fs.copyFileSync(process.execPath, temp);
    } catch (error) {
      fail('无法准备卸载程序：' + error.message);
    }
    const child = spawn(temp, ['--purge', installDir].concat(SILENT ? ['--silent'] : []), { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  if (ARGV.includes('--purge')) {
    purge(argValue('--purge'));
    return;
  }
  if (SILENT && !ARGV.includes('--install')) {
    // 静默模式只用于卸载；安装必须显式带 --install
    process.exit(0);
  }
  install();
}

main();
