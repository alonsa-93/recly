@echo off
cd /d "%~dp0"
start "Recly server" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
