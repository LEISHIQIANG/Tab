@echo off
chcp 65001 >nul
title 部署导航网站到服务器
echo 正在执行一键同步部署...
python "%~dp0deploy.py"
echo.
pause
