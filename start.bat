@echo off
echo ================================
echo   ChemLit AI - 启动中...
echo ================================
cd /d %~dp0
if not exist node_modules (
    echo [1/2] 安装依赖...
    npm install
)
echo [2/2] 启动开发服务器...
start http://localhost:3000
npm run dev
