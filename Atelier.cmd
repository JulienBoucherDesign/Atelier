@echo off
rem Atelier launcher for Windows. Double-click this file.
rem It finds Node.js (or downloads a portable copy into the "data" folder) and starts atelier.mjs.
setlocal
cd /d "%~dp0"
title Atelier
set "NODE_VERSION=v22.12.0"
set "NODE="

where node >nul 2>nul
if not errorlevel 1 (
  node -e "process.exit(Number(process.versions.node.split('.')[0])>=20?0:1)" >nul 2>nul
  if not errorlevel 1 set "NODE=node"
)
if not defined NODE if exist "data\node\npm.cmd" set "NODE=%~dp0data\node\node"
if defined NODE goto run

echo.
echo   Node.js 20 or later was not found on this computer.
echo   Downloading a portable copy into the Atelier folder (once, about 30 MB)...
echo.
if not exist "data" mkdir "data"
curl -L --fail -o "data\node.zip" "https://nodejs.org/dist/%NODE_VERSION%/node-%NODE_VERSION%-win-x64.zip"
if errorlevel 1 goto failed
tar -xf "data\node.zip" -C "data"
if errorlevel 1 goto failed
if exist "data\node" rmdir /s /q "data\node"
ren "data\node-%NODE_VERSION%-win-x64" node
del "data\node.zip"
set "NODE=%~dp0data\node\node"

:run
"%NODE%" "%~dp0atelier.mjs" %*
if errorlevel 1 pause
goto :eof

:failed
echo.
echo   [ERROR] Could not download Node.js.
echo   Install Node.js (LTS) from https://nodejs.org and start Atelier again.
echo.
pause
