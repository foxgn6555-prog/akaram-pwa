@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (echo تثبيت المكتبات لأول مرة... & call npm install --no-audit --no-fund)
node archive.mjs %*
