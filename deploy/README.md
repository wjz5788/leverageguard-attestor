# 简单Git部署方案

## 概述
通过Git仓库直接部署代码到服务器，无需复杂CI/CD配置。

## 快速开始

### 1. 本地部署
```bash
# 部署到美国服务器
./deploy/git-deploy.sh us

# 部署到日本服务器  
./deploy/git-deploy.sh jp
```

### 2. 服务器设置

#### 在服务器上创建裸仓库
```bash
# 登录服务器
ssh deploy@us.example.com

# 创建裸仓库
mkdir -p /home/deploy/repo.git
cd /home/deploy/repo.git
git init --bare

# 设置post-receive钩子
cp /path/to/post-receive hooks/post-receive
chmod +x hooks/post-receive
```

#### 在服务器上设置部署目录
```bash
# 创建部署目录
mkdir -p /home/deploy/app
cd /home/deploy/app

# 克隆仓库
git clone /home/deploy/repo.git .

# 安装依赖
npm install

# 安装PM2（推荐）
npm install -g pm2

# 启动服务
pm2 start packages/us-backend/src/server.js --name us-backend
pm2 start packages/jp-verify/src/server.js --name jp-verify
pm2 save
pm2 startup
```

### 3. 本地配置远程仓库

```bash
# 添加美国服务器仓库
git remote add us deploy@us.example.com:/home/deploy/repo.git

# 添加日本服务器仓库
git remote add jp deploy@jp.example.com:/home/deploy/repo.git

# 查看远程仓库
git remote -v
```

## 部署流程

1. **本地开发** → 代码修改完成
2. **提交代码** → `git add . && git commit -m "部署描述"`
3. **推送到服务器** → `git push us main` 或 `git push jp main`
4. **自动部署** → 服务器自动拉取代码并重启服务

## 文件说明

- `git-deploy.sh` - 本地一键部署脚本
- `server-deploy.sh` - 服务器端手动部署脚本  
- `post-receive` - Git钩子，自动部署
- `servers.conf` - 服务器配置模板

## 优势

- ✅ 简单直接，无需复杂配置
- ✅ 快速部署，git push即可
- ✅ 版本控制，可回滚
- ✅ 适合小型项目

## 注意事项

1. 确保服务器已安装Node.js、Git、PM2
2. 配置SSH密钥免密登录
3. 生产环境建议使用HTTPS和认证
4. 重要配置文件（如.env）不要提交到Git