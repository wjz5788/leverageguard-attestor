#!/bin/bash

# 简单Git部署脚本
# 使用方法：./deploy/git-deploy.sh [us|jp]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 服务器配置
US_SERVER="us.example.com"
JP_SERVER="jp.example.com"
DEPLOY_USER="deploy"
DEPLOY_PATH="/home/deploy/app"

# 检查参数
if [ $# -eq 0 ]; then
    echo -e "${RED}错误：请指定部署目标${NC}"
    echo "使用方法：$0 [us|jp]"
    echo "  us - 部署到美国服务器"
    echo "  jp - 部署到日本服务器"
    exit 1
fi

TARGET=$1

case $TARGET in
    "us")
        SERVER=$US_SERVER
        echo -e "${GREEN}准备部署到美国服务器：$SERVER${NC}"
        ;;
    "jp")
        SERVER=$JP_SERVER
        echo -e "${GREEN}准备部署到日本服务器：$SERVER${NC}"
        ;;
    *)
        echo -e "${RED}错误：无效的目标 '$TARGET'${NC}"
        echo "有效目标：us, jp"
        exit 1
        ;;
esac

# 检查Git状态
echo -e "${YELLOW}检查Git状态...${NC}"
git status --porcelain

# 确认部署
echo -e "${YELLOW}是否确认部署到 $SERVER？(y/n)${NC}"
read -r CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "部署取消"
    exit 0
fi

# 添加所有更改
echo -e "${YELLOW}添加更改到Git...${NC}"
git add .

# 提交更改
echo -e "${YELLOW}提交更改...${NC}"
git commit -m "部署到 $TARGET 服务器 - $(date +'%Y-%m-%d %H:%M:%S')"

# 推送到远程仓库
echo -e "${YELLOW}推送到远程仓库...${NC}"
git push origin main

# 在服务器上执行部署
echo -e "${YELLOW}在服务器上执行部署...${NC}"
ssh $DEPLOY_USER@$SERVER "cd $DEPLOY_PATH && git pull origin main && npm install && pm2 restart all"

echo -e "${GREEN}✅ 部署完成！${NC}"