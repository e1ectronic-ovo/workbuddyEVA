# workbuddyEVA

用自有启动器把 **Wallpaper Engine** 的 Web / 视频 / Scene / 图片壁纸通过 **CDP 注入** 铺进 WorkBuddy，并在同一个控制面板里管理 WorkBuddy 的账号、会话、模型、增强与电源策略。没有独立的 Electron 窗口，也不打开浏览器：界面只在 WorkBuddy 页面里。启动时会自动唤起 WorkBuddy，WorkBuddy 退出后本程序随之退出。打包后的可执行文件名为 **`workbuddyEVA.exe`**。

> **功能范围**：壁纸 + 注入壳 + 重写后的 WorkBuddy 管理面板（账号 / 会话 / 模型 / 增强 / 电脑 / 关于）。所有模块都是本仓库自有实现。「关于」页面向使用者说明功能、用法与数据位置。

## 依赖

- 已安装 **WorkBuddy** 桌面客户端
- **Wallpaper Engine**（Steam 431960），已订阅工坊壁纸
- **Node.js 22+**，或直接使用 WorkBuddy 自带的托管 Node（`start.cmd` 会优先选择）
- 首次运行前：`npm install`

## 启动

安装版（推荐）：双击 `dist/workbuddyEVA-Setup.exe`。安装过程可以**选择安装位置**和**数据存储位置**：

- 安装位置默认 `%LOCALAPPDATA%\Programs\workbuddyEVA`，可改到任意盘；
- 数据目录默认放在本机第一个可写的**非系统盘**（例如 `D:\workbuddyEVA-data`），没有其他盘时才回落到安装目录下的 `data`；
- 安装器把数据目录写进安装目录的 `data-path.txt`，之后任何时候都可以编辑它来换位置（绝对路径，或相对安装目录的路径）。

安装完成后会在桌面、开始菜单创建「workbuddyEVA」快捷方式，启动时不会出现控制台窗口。卸载走「设置 → 应用」或安装目录里的 `Uninstall.exe`，卸载时会询问是否一并删除数据目录（默认保留）。

源码运行：双击仓库根目录的 `start.cmd`（推荐），或：

```powershell
npm start
node app\daemon.js
```

启动器只允许运行一个实例（Windows 命名管道锁，重复双击会提示已在运行并退出，避免多端口冲突），随后做三件事：

1. 在 `127.0.0.1:47850` 启动壁纸 HTTP 服务（只监听本机，不打开浏览器）；
2. **WorkBuddy 没运行就自动带 `--remote-debugging-port` 启动它**，并复用已有的 CDP 端口（`9222-9232`、进程命令行、本程序写入的端口文件）；
3. 发现 WorkBuddy 已经运行时，弹出一个原生 Windows 对话框提示先退出 WorkBuddy；确认后由本程序强制重启 WorkBuddy 再注入（未保存的会话可能丢失，默认「否」，拒绝则本程序直接退出）。也可以事先授权：

```powershell
start.cmd --restart-workbuddy
```

`--restart-workbuddy` 会关闭当前 WorkBuddy 再以调试模式启动，未保存的会话可能丢失，只在需要时使用。

WorkBuddy 退出后（托盘退出、崩溃或被关闭），本程序会在约 12 秒内自动退出并清理注入层。面板「连接 → 退出本程序」也会先撤掉 WorkBuddy 里的注入层再关闭服务；安装版也可从任务管理器结束 `workbuddyEVA.exe`。

## 用法

1. 启动后 WorkBuddy 窗口右下角常驻一个桌面图标，点击即可在右下角打开控制面板；面板默认停在「账号」页，壁纸库切过去时才渲染。
2. 面板里点任意壁纸卡片即时生效；「清除壁纸」只移除壁纸层，不删除工坊文件。
3. 面板右上角关闭按钮或 `Esc` 退出面板；底部图标始终保留，方便随时打开。
4. 下次启动恢复上次壁纸；WorkBuddy 重启或页面刷新后，2 秒内自动补回壁纸层或右下角图标。
5. 每个会话的消息末尾下方会显示本会话累计的积分与 Token（输入 / 输出）；点击即可刷新，没有转录时回退显示上下文占用。

### 控制面板

| 分组 | 区域 | 能力 |
| --- | --- | --- |
| WorkBuddy | 账号 | 列出登录账号与当前账号、自动查询额度、自动确认今日签到、备份 / 切换 / 删除；「新增账号」会先备份当前账号，再重启 WorkBuddy 到登录页，登录后自动入库 |
| WorkBuddy | 会话 | 按账号列出会话（含已删除），自动同步，搜索、重命名、软删除、恢复、彻底删除、单个或批量导出 JSON（含用量与转录） |
| WorkBuddy | 模型 | 读取 / 编辑 `models.json`，自定义模型增删、启用开关 |
| WorkBuddy | 增强 | 免打扰（抑制系统通知）、自动继续（自动点「继续 / 重试 / Resume」） |
| 壁纸 | 壁纸库 / 外观 / 播放 / 自动轮播 / 壁纸目录 / 预设 / 连接 | 壁纸选择与播放、暗色遮罩 / 液态玻璃、轮播间隔、Steam 库与自定义目录、预设、CDP 连接状态 |
| 系统 | 电脑 | 休眠策略：允许休眠 / 阻止休眠 / 有任务时阻止；阻止时可选择是否允许息屏；支持「立即休眠」 |
| 系统 | 关于 | 面向使用者的说明：这是什么、怎么用、数据保存在哪里，以及版本与运行信息（含实际数据目录） |

账号额度与签到结果会缓存到数据目录，打开账号页先显示上次结果再自动刷新；额度每次打开面板最多刷新一次，停留在页面时每 60 秒刷新。每次成功读取会话时都会把会话索引写入数据目录，读取失败时面板回退到本地缓存并标明缓存时间；会话列表在页面打开期间每 12 秒静默同步，筛选条件与勾选状态会保留。

会话与模型直接读写 WorkBuddy 自身数据（`workbuddy.db`、`models.json`）。会话写操作前会自动备份数据库与 WAL/SHM 到数据目录，保留最近 20 份；软删除只标记 `deleted_at`，可随时恢复。账号备份沿用 WorkDaddy 的 `accounts/<uid>.info` 布局，启动时会把 `%APPDATA%WorkDaddy` 里的账号文件、备注与排序持续合并进数据目录，不会因升级或切换而丢失。

增强在 WorkBuddy 页面内通过注入运行时执行；免打扰通过替换 `window.Notification` 实现，关闭后立即还原。

## 数据目录

数据目录按以下优先级决定：`WBWE_DATA_DIR` 环境变量 → 可执行文件旁的 `data-path.txt` → 默认目录（安装版为 exe 同级的 `data`，源码运行为仓库下的 `data`）。**默认不会主动写到 C 盘的用户目录。**

| 内容 | 位置 |
| --- | --- |
| 壁纸配置 / 自定义壁纸 / daemon 日志 | 数据目录（默认非系统盘，如 `D:\workbuddyEVA-data`） |
| CDP 端口缓存 | 同上目录的 `cdp-port.json` |
| 增强设置（免打扰 / 自动继续） | 同上目录的 `wb\enhance.json` |
| 额度与签到缓存 | 同上目录的 `wb\account-state.json` |
| 电源保持策略 | 同上目录的 `wb\power.json` |
| 会话索引缓存 | 同上目录的 `wb\sessions\index.json` |
| 会话数据库备份 | 同上目录的 `wb\backups\` |
| 旧配置迁移 | 首次运行自动从 `%APPDATA%\Asuka Wallpaper\data`、`%APPDATA%\WorkBuddy Wallpaper Engine\data`、`%APPDATA%\WorkDaddy\wallpaper`、`%APPDATA%\workbuddy-wallpaper-engine\data`、仓库 `data/` 迁移 |

可用 `WBWE_DATA_DIR` 覆盖数据目录，`WBWE_PORT` 覆盖面板端口，`WBWE_CDP_PORT` 强制指定 CDP 端口，`WBWE_WORKBUDDY_BIN` 指定 WorkBuddy.exe 路径，`WBWE_NO_UI=1` 关闭启动阶段的原生对话框（只写日志，便于自动化测试）。

会话模块需要 Node 22（`node:sqlite`）；如果当前 Node 低于 22，会自动改用 WorkBuddy 自带 Electron，以 `ELECTRON_RUN_AS_NODE=1` 执行受限的 SQLite 辅助脚本。

## 支持的壁纸类型

| 类型 | 支持情况 |
| --- | --- |
| Video（mp4/webm） | 本机流式播放，支持 seek、循环、暂停后台 |
| Web（网页壁纸） | 以 blob iframe 挂载，注入 Wallpaper Engine API 空实现 |
| Scene（场景） | WebWallGL 实时渲染（WebGL2），保留工程脚本 / 粒子 / 指针视差；失败时回落预览图 |
| Picture（图片/幻灯片） | 读取工程图片，单图铺满 |
| Application | 不支持（需要启动第三方程序） |

Web 壁纸的音频监听是空实现，不会随系统音乐律动；需要独立渲染进程的复杂工程可能显示不完整。

## 工作原理

```
start.cmd / workbuddyEVA.exe ──> app/daemon.js ──> server.js（壁纸服务 127.0.0.1:47850）
                                      │                    │
                                      │                    ├─ 扫描 steamapps\workshop\content\431960
                                      │                    ├─ WorkBuddy 数据：账号 / 会话 / 模型
                                      │                    └─ 增强 / 电源策略
                                      ├─ app/workbuddy.js ──> 发现 / 启动 WorkBuddy CDP
                                      └─ 轮询 WorkBuddy 进程，退出后随之退出
                                             │
WorkBuddy ── CDP Runtime.evaluate ──> #wbwe-layer / 右下角图标 / 面板 iframe
```

- 壁纸层是 `position:fixed; z-index:0` 的 video / image / iframe；宿主 `#root` 提到 `z-index:2` 并透明化，壁纸在界面之下、交互照常。
- 未选择壁纸时只注入右下角图标与面板入口，不创建壁纸层、不改宿主透明度。
- 所有壁纸样式挂在 `html[data-wbwe]` 上，清除壁纸时整体移除。
- 视频走带 Range 的本机 HTTP 流，4K 文件不会整段读进内存。
- daemon 每 2 秒检查注入是否仍在；WorkBuddy 重启、账号切换或页面刷新后自动补回。
- 增强 / 电源等设置变更会即时通过注入运行时推送，无需重载 WorkBuddy 页面。

## 目录

```
start.cmd              启动入口（查找 Node → app/daemon.js）
app/daemon.js          自有常驻入口：启动壁纸服务、自动唤起 WorkBuddy、随其退出
app/workbuddy.js       WorkBuddy 查找、CDP 检测、启动与重启
server.js              HTTP 服务、面板路由与注入调度（不打开浏览器）
lib/we-scan.js         工坊 / 本地工程扫描
lib/cdp.js             CDP 发现、连接与 evaluate
lib/renderer-runtime.js 渲染进程内的壁纸层、右下角图标、增强与面板运行时
lib/inject.js          注入脚本拼装
lib/paths.js           数据目录解析（环境变量 / data-path.txt / 默认）
lib/native-ui.js       启动阶段的 Windows 原生对话框
lib/instance-lock.js   单实例锁（命名管道），防止重复启动与端口冲突
lib/data-migration.js  旧配置迁移
lib/store.js           壁纸配置读写
lib/wb-paths.js        WorkBuddy 数据目录定位
lib/wb-auth.js         账号识别、备份、切换、新增登录流程（不向面板 / 日志输出令牌）
lib/wb-account-state.js 额度与签到结果缓存
lib/wb-billing.js      积分 / 签到查询
lib/wb-models.js       模型配置读写
lib/wb-sessions.js     会话列出、重命名、软删除、恢复、导出、备份
lib/wb-enhance.js      免打扰 / 自动继续的持久化
lib/wb-power.js        阻止休眠 / 立即休眠
helpers/               交给 WorkBuddy 自带 Node 执行的外部脚本（登录密钥 / 会话 SQLite）
public/                控制面板（iframe 嵌入）
scene-live/            WebWallGL 渲染页
assets/                应用图标与界面素材
tools/                 运行时源码固化与构建脚本
installer/             安装 / 卸载程序（安装包入口）
```

## 常见问题

- **提示 WorkBuddy 没有 CDP**：启动时会弹原生对话框询问是否重启；选「是」由本程序重启，选「否」本程序退出。也可以先完全退出 WorkBuddy 再启动。
- **未找到 WorkBuddy.exe**：设置 `WBWE_WORKBUDDY_BIN` 指向完整路径。
- **数据想放到别的盘**：重新安装时选择数据目录，或编辑安装目录里的 `data-path.txt`，也可以用 `WBWE_DATA_DIR` 临时覆盖。
- **会话列表为空**：确认 WorkBuddy 已登录过，且 `~/.workbuddy`（国内版）或 `~/.workbuddy-ai` 下存在 `workbuddy.db`；切换账号后点「刷新」。
- **重命名 / 删除会话失败**：数据库被 WorkBuddy 占用时写入会失败，退出 WorkBuddy 后重试；失败不会修改任何数据。
- **面板没有壁纸**：确认 Steam 库位置被识别；可在「壁纸目录」里加入工程目录绝对路径（例如 `D:\\SteamLibrary`）。
- **网页壁纸空白**：该工程可能依赖 Wallpaper Engine 独有 API 或外部网络，换一个 Web 工程试试。
- **界面太亮 / 文字看不清**：调高「暗色遮罩」，或开启「液态玻璃」。
- **升级后仍是旧界面 / 新接口提示「未知接口」**：旧的 daemon 还在占用 47850。结束旧的 workbuddyEVA / node 进程后重新启动，程序会提示端口被旧版本占用而不会强行覆盖。
- **新增账号后打不开登录页**：确认 WorkBuddy.exe 可被找到（必要时设置 `WBWE_WORKBUDDY_BIN`）；当前登录态在流程开始前已备份，可在面板切回。
- **额度显示「查询失败」**：鼠标悬停可看原因；登录身份过期时重新登录该账号即可，失败不会清掉上次成功的额度。
- **想彻底恢复**：点「清除壁纸」，或在「连接 → 退出本程序」退出 daemon；源码运行时 `Ctrl+C` 也会尝试移除注入层。安装版在「设置 → 应用」里可以卸载。
