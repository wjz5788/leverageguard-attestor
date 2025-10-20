#!/bin/bash

# 设置脚本执行出错时立即退出
set -e

# 确保脚本在项目根目录执行
cd "$(dirname "$0")"

# 输出当前工作目录
echo "当前工作目录: $(pwd)"

# 检查是否已安装Python虚拟环境
if [ ! -d "venv" ]; then
    echo "创建Python虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "激活虚拟环境..."
source venv/bin/activate

# 升级pip
echo "升级pip..."
pip install --upgrade pip

# 安装项目依赖
echo "安装项目依赖..."
pip install -r requirements.txt

# 创建数据目录（如果不存在）
echo "创建数据目录..."
mkdir -p data

# 检查.env文件是否存在
if [ ! -f ".env" ]; then
    echo "警告: .env文件不存在，请确保已配置环境变量"
    echo "可以参考.env文件中的示例配置进行设置"
fi

# 启动Flask应用
echo "启动LeverageGuard后端服务..."
export FLASK_APP=backend/app.py
export FLASK_ENV=development
flask run --host=0.0.0.0 --port=5000