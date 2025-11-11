# LiqPass 部署说明文档

## 概述

本文档详细说明了LiqPass系统在美国（US）和日本（JP）两地的部署流程、配置要求和运维指南。

## 1. 部署架构

### 1.1 系统组件

```
US 部署:
├── us-frontend (前端界面)
├── us-backend (业务逻辑API)
└── 数据库 (SQLite/PostgreSQL)

JP 部署:
└── jp-verify (验证服务)
```

### 1.2 网络拓扑

```
用户 → CDN → us-frontend → us-backend → jp-verify → OKX API
                                    ↓
                                数据库
```

## 2. US 部署说明

### 2.1 服务器要求

**硬件要求**:
- CPU: 2核心以上
- 内存: 4GB以上
- 存储: 50GB SSD
- 网络: 100Mbps带宽

**软件要求**:
- Node.js 18+ 
- npm 8+
- SQLite3 或 PostgreSQL 13+
- Nginx 1.18+

### 2.2 环境配置

创建环境变量文件 `.env`:

```bash
# 应用配置
NODE_ENV=production
PORT=3000
API_PREFIX=/api/v1

# 数据库配置
DB_TYPE=sqlite
DB_PATH=/data/liqpass.db
# 如果使用PostgreSQL:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=liqpass
# DB_USER=liqpass_user
# DB_PASSWORD=your_secure_password

# 验证服务配置
JP_VERIFY_BASE_URL=https://jp-verify.liqpass.com
JP_VERIFY_API_KEY=your_jp_service_key

# 安全配置
JWT_SECRET=your_jwt_secret_key
BCRYPT_ROUNDS=12
CORS_ORIGIN=https://your-frontend-domain.com

# 日志配置
LOG_LEVEL=info
LOG_FILE=/var/log/liqpass/backend.log

# 监控配置
PROMETHEUS_PORT=9090
HEALTH_CHECK_PATH=/health
```

### 2.3 部署步骤

#### 步骤1: 服务器准备
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装PM2
sudo npm install -g pm2

# 创建应用目录
sudo mkdir -p /opt/liqpass/{backend,frontend,logs}
sudo chown -R $USER:$USER /opt/liqpass
```

#### 步骤2: 部署后端
```bash
# 进入后端目录
cd /opt/liqpass/backend

# 克隆代码
git clone https://github.com/your-org/liqpass-backend .

# 安装依赖
npm ci --only=production

# 配置环境变量
cp .env.example .env
nano .env  # 编辑配置

# 初始化数据库
npm run db:migrate

# 启动服务
pm2 start npm --name "liqpass-backend" -- run start

# 设置开机自启
pm2 startup
pm2 save
```

#### 步骤3: 部署前端
```bash
# 进入前端目录
cd /opt/liqpass/frontend

# 克隆代码
git clone https://github.com/your-org/liqpass-frontend .

# 安装依赖
npm ci --only=production

# 构建应用
npm run build

# 配置Nginx
sudo nano /etc/nginx/sites-available/liqpass-frontend
```

Nginx配置示例:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /opt/liqpass/frontend/dist;
    index index.html;
    
    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # API代理
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # SPA路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

#### 步骤4: SSL配置
```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d your-domain.com

# 测试证书续期
sudo certbot renew --dry-run
```

## 3. JP 部署说明

### 3.1 服务器要求

**硬件要求**:
- CPU: 2核心以上
- 内存: 2GB以上
- 存储: 20GB SSD
- 网络: 日本本地带宽

**软件要求**:
- Python 3.9+
- pip 20+
- Nginx 1.18+

### 3.2 环境配置

创建环境变量文件 `.env`:

```bash
# 应用配置
APP_ENV=production
HOST=0.0.0.0
PORT=8082

# 安全配置
API_KEY=your_secure_api_key
CORS_ORIGINS=https://us-backend.liqpass.com

# OKX API配置
OKX_BASE_URL=https://www.okx.com
OKX_TIMEOUT=30

# 日志配置
LOG_LEVEL=info
LOG_FILE=/var/log/jp-verify/verify.log

# 性能配置
WORKERS=4
MAX_REQUESTS=1000
REQUEST_TIMEOUT=30
```

### 3.3 部署步骤

#### 步骤1: 服务器准备
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Python
sudo apt install python3.9 python3-pip python3-venv

# 创建应用目录
sudo mkdir -p /opt/jp-verify/{app,logs,venv}
sudo chown -R $USER:$USER /opt/jp-verify
```

#### 步骤2: 部署验证服务
```bash
# 进入应用目录
cd /opt/jp-verify/app

# 克隆代码
git clone https://github.com/your-org/jp-verify .

# 创建虚拟环境
python3 -m venv /opt/jp-verify/venv
source /opt/jp-verify/venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
nano .env

# 启动服务（使用Gunicorn）
gunicorn -w 4 -b 0.0.0.0:8082 main:app --access-logfile /var/log/jp-verify/access.log

# 使用Supervisor管理进程
sudo nano /etc/supervisor/conf.d/jp-verify.conf
```

Supervisor配置示例:
```ini
[program:jp-verify]
directory=/opt/jp-verify/app
command=/opt/jp-verify/venv/bin/gunicorn -w 4 -b 0.0.0.0:8082 main:app
user=www-data
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/jp-verify/app.log
```

#### 步骤3: Nginx配置
```nginx
server {
    listen 80;
    server_name jp-verify.liqpass.com;
    
    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    # 健康检查
    location /health {
        access_log off;
        proxy_pass http://127.0.0.1:8082/health;
    }
}
```

## 4. 数据库部署

### 4.1 SQLite配置（开发/小型部署）

```bash
# 确保数据库目录存在
sudo mkdir -p /data/liqpass
sudo chown -R $USER:$USER /data/liqpass

# 设置正确的文件权限
chmod 644 /data/liqpass/liqpass.db
```

### 4.2 PostgreSQL配置（生产部署）

```bash
# 安装PostgreSQL
sudo apt install postgresql postgresql-contrib

# 创建数据库和用户
sudo -u postgres psql

-- 在PostgreSQL中执行
CREATE DATABASE liqpass;
CREATE USER liqpass_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE liqpass TO liqpass_user;
\q
```

## 5. 监控和日志

### 5.1 应用监控

```bash
# 安装Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.40.0/prometheus-2.40.0.linux-amd64.tar.gz

# 配置监控目标
sudo nano /etc/prometheus/prometheus.yml
```

### 5.2 日志管理

```bash
# 配置logrotate
sudo nano /etc/logrotate.d/liqpass
```

Logrotate配置:
```
/var/log/liqpass/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
```

## 6. 备份和恢复

### 6.1 数据库备份

```bash
# 创建备份脚本
sudo nano /opt/scripts/backup-db.sh

#!/bin/bash
BACKUP_DIR="/backup/liqpass"
DATE=$(date +%Y%m%d_%H%M%S)

# SQLite备份
cp /data/liqpass/liqpass.db "$BACKUP_DIR/liqpass_$DATE.db"

# PostgreSQL备份
pg_dump -U liqpass_user liqpass > "$BACKUP_DIR/liqpass_$DATE.sql"

# 清理旧备份（保留30天）
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete
```

### 6.2 应用数据备份

```bash
# 备份证据文件
sudo nano /opt/scripts/backup-evidence.sh

#!/bin/bash
EVIDENCE_DIR="/data/liqpass/evidence"
BACKUP_DIR="/backup/evidence"
DATE=$(date +%Y%m%d)

tar -czf "$BACKUP_DIR/evidence_$DATE.tar.gz" "$EVIDENCE_DIR"
```

## 7. 安全配置

### 7.1 防火墙配置

```bash
# 配置UFW防火墙
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000  # 后端API
sudo ufw allow 8082  # 验证服务
```

### 7.2 SSL/TLS配置

```bash
# 生成Diffie-Hellman参数
sudo openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048

# 配置强加密套件
sudo nano /etc/nginx/nginx.conf
```

## 8. 故障排除

### 8.1 常见问题

**问题1**: 服务无法启动
```bash
# 检查端口占用
sudo netstat -tulpn | grep :3000

# 检查日志
tail -f /var/log/liqpass/backend.log
```

**问题2**: 数据库连接失败
```bash
# 检查数据库服务状态
sudo systemctl status postgresql

# 检查连接权限
psql -U liqpass_user -d liqpass -h localhost
```

**问题3**: 验证服务超时
```bash
# 检查网络连通性
ping jp-verify.liqpass.com

# 检查防火墙规则
sudo ufw status
```

## 9. 维护计划

### 9.1 日常维护

- 监控系统资源使用情况
- 检查日志文件错误
- 验证备份完整性
- 更新安全补丁

### 9.2 定期维护

- 每月：清理旧日志和备份
- 每季度：更新依赖包
- 每半年：安全审计
- 每年：架构评审

---

**文档版本**: v1.0  
**最后更新**: 2024-12-19  
**维护者**: LiqPass运维团队