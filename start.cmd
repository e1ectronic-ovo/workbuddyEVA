@echo off
rem workbuddyEVA 启动器：启动壁纸服务，自动唤起 WorkBuddy 并注入面板；不打开浏览器。
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0" >nul 2>&1

echo workbuddyEVA starting...

rem 定位 node：优先本仓库内置运行时，其次 WorkBuddy 托管运行时，最后 PATH。
set "NODE="
if exist "%~dp0runtime\node\node.exe" set "NODE=%~dp0runtime\node\node.exe"
for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
  if not defined NODE if exist "%%d\node.exe" set "NODE=%%d\node.exe"
)
if not defined NODE set "NODE=node"

if not exist "%~dp0app\daemon.js" (
  echo ERROR: app\daemon.js was not found.
  pause
  exit /b 1
)

"%NODE%" "%~dp0app\daemon.js" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo Done: workbuddyEVA for WorkBuddy is ready.
  exit /b 0
) else (
  echo ERROR: daemon exited with code %EXIT_CODE%.
  echo Log: %~dp0data\daemon.log
)
pause
