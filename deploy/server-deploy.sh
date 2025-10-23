#!/bin/bash

# 服务器端部署脚本
# 在服务器上运行，用于自动部署

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 部署配置
DEPLOY_PATH="/home/deploy/app"
LOG_FILE="/var/log/deploy.log"

# 记录部署日志
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 开始部署
log "开始部署..."

# 切换到部署目录
cd "$DEPLOY_PATH"

# 拉取最新代码
log "拉取最新代码..."
git fetch origin
git reset --hard origin/main

# 安装依赖
log "安装依赖..."
npm install

# 构建前端（如果存在）
if [ -d "packages/us-frontend" ]; then
    log "构建前端..."
    cd packages/us-frontend
    npm run build
    cd "$DEPLOY_PATH"
fi

# 重启服务
log "重启服务..."

# 重启美国后端服务
if [ -d "packages/us-backend" ]; then
    pm2 restart us-backend || pm2 start packages/us-backend/src/server.js --name us-backend
fi

# 重启日本验证服务
if [ -d "packages/jp-verify" ]; then
    pm2 restart jp-verify || pm2 start packages/jp-verify/src/server.js --name jp-verify
fi

# 重启前端服务（如果使用PM2）
if [ -d "packages/us-frontend" ]; then
    pm2 restart us-frontend || pm2 serve packages/us-frontend/dist 5173 --name us-frontend
fi

log "${GREEN}✅ 部署完成${NC}"

# 显示服务状态
log "当前服务状态："
pm2 list