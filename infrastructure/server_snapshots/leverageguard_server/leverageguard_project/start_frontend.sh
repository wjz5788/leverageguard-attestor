#!/bin/bash

# 设置脚本执行出错时立即退出
set -e

# 确保脚本在项目根目录执行
cd "$(dirname "$0")"

# 输出当前工作目录
echo "当前工作目录: $(pwd)"

# 进入前端目录
cd frontend

# 检查是否已安装Node.js依赖
if [ ! -d "node_modules" ]; then
    echo "安装Node.js依赖..."
    npm install
fi

# 检查.env文件是否存在
if [ ! -f ".env" ]; then
    echo "警告: .env文件不存在，将使用默认配置"
    echo "VITE_API_URL=http://localhost:5000" > .env
fi

# 启动Vite开发服务器
echo "启动LeverageGuard前端服务..."
npm run dev