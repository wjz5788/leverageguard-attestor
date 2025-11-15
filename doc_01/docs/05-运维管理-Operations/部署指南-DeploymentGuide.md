# 部署指南

## 概述

本文档提供LiqPass系统的完整部署指南，涵盖开发环境、测试环境和生产环境的部署流程。

## 环境要求

### 硬件要求

| 环境 | CPU | 内存 | 存储 | 网络 |
|------|-----|------|------|------|
| 开发环境 | 4核 | 8GB | 100GB | 100Mbps |
| 测试环境 | 8核 | 16GB | 500GB | 1Gbps |
| 生产环境 | 16核 | 32GB | 1TB+ | 10Gbps |

### 软件要求

#### 必需软件
- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+
- PostgreSQL 14+
- Redis 6+

#### 可选软件
- Nginx 1.20+
- Prometheus 2.30+
- Grafana 8.0+

## 开发环境部署

### 1. 环境准备

```bash
# 克隆代码库
git clone https://github.com/liqpass/liqpass.git
cd liqpass

# 检查环境要求
./scripts/check-environment.sh
```

### 2. 配置环境变量

创建环境配置文件：

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置
vim .env
```

配置内容示例：
```env
# 数据库配置
POSTGRES_DB=liqpass_dev
POSTGRES_USER=liqpass_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# 区块链配置
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your_project_id
POLYGON_RPC_URL=https://polygon-mainnet.infura.io/v3/your_project_id

# API配置
API_PORT=3000
API_HOST=localhost
JWT_SECRET=your_jwt_secret
```

### 3. 启动服务

使用Docker Compose启动所有服务：

```bash
# 启动开发环境
docker-compose -f docker-compose.dev.yml up -d

# 检查服务状态
docker-compose ps

# 查看日志
docker-compose logs -f api
```

### 4. 数据库初始化

```bash
# 运行数据库迁移
npm run db:migrate

# 初始化测试数据
npm run db:seed
```

### 5. 验证部署

```bash
# 健康检查
curl http://localhost:3000/api/v1/healthz

# API测试
curl http://localhost:3000/api/v1/orders
```

## 测试环境部署

### 1. 服务器准备

```bash
# 创建部署用户
sudo useradd -m -s /bin/bash liqpass
sudo passwd liqpass

# 添加sudo权限
sudo usermod -aG sudo liqpass

# 切换到部署用户
su - liqpass
```

### 2. 安装依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 3. 部署应用

```bash
# 创建应用目录
mkdir -p /opt/liqpass/{data,logs,config}
cd /opt/liqpass

# 克隆代码
git clone https://github.com/liqpass/liqpass.git .

# 配置环境
cp .env.test .env
vim .env  # 编辑测试环境配置
```

### 4. 启动服务

```bash
# 使用生产配置启动
docker-compose -f docker-compose.test.yml up -d

# 等待服务启动
sleep 30

# 检查服务状态
docker-compose ps
```

### 5. 配置反向代理

```nginx
# /etc/nginx/sites-available/liqpass-test
server {
    listen 80;
    server_name test.liqpass.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 健康检查
    location /healthz {
        access_log off;
        proxy_pass http://localhost:3000/api/v1/healthz;
    }
}
```

## 生产环境部署

### 1. 基础设施准备

#### 高可用架构

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  api:
    image: liqpass/api:latest
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3

  database:
    image: postgres:14
    deploy:
      placement:
        constraints: [node.role == manager]
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    deploy:
      replicas: 2
```

### 2. 安全配置

#### SSL证书配置

```bash
# 使用Let's Encrypt获取证书
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d liqpass.com -d www.liqpass.com
```

#### 防火墙配置

```bash
# 配置UFW防火墙
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
sudo ufw status
```

### 3. 监控配置

#### Prometheus配置

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'liqpass-api'
    static_configs:
      - targets: ['api:3000']
    metrics_path: '/metrics'

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

#### Grafana仪表板

导入预配置的监控仪表板：
- API性能监控
- 数据库性能监控
- 业务指标监控

### 4. 备份策略

#### 数据库备份

```bash
#!/bin/bash
# /opt/liqpass/scripts/backup.sh

BACKUP_DIR="/opt/liqpass/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 数据库备份
docker exec liqpass-database pg_dump -U liqpass_user liqpass > "$BACKUP_DIR/liqpass_$DATE.sql"

# 压缩备份
gzip "$BACKUP_DIR/liqpass_$DATE.sql"

# 保留最近7天的备份
find "$BACKUP_DIR" -name "liqpass_*.sql.gz" -mtime +7 -delete
```

#### 配置文件备份

```bash
# 备份关键配置
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" /opt/liqpass/config
```

### 5. 自动化部署

#### CI/CD流水线

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker image
      run: |
        docker build -t liqpass/api:latest .
    
    - name: Deploy to production
      run: |
        scp docker-compose.prod.yml user@server:/opt/liqpass/
        ssh user@server "cd /opt/liqpass && docker-compose pull && docker-compose up -d"
```

## 环境特定配置

### 开发环境配置

```yaml
# docker-compose.dev.yml
services:
  api:
    build: .
    environment:
      - NODE_ENV=development
      - DEBUG=true
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    command: npm run dev
```

### 测试环境配置

```yaml
# docker-compose.test.yml
services:
  api:
    image: liqpass/api:test
    environment:
      - NODE_ENV=test
      - LOG_LEVEL=info
    ports:
      - "3000:3000"
    depends_on:
      - database
      - redis
```

### 生产环境配置

```yaml
# docker-compose.prod.yml
services:
  api:
    image: liqpass/api:latest
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=warn
    ports:
      - "3000:3000"
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/healthz"]
```

## 故障排除

### 常见问题

#### 服务启动失败

```bash
# 检查服务状态
docker-compose ps

# 查看详细日志
docker-compose logs api

# 检查端口占用
netstat -tulpn | grep 3000
```

#### 数据库连接问题

```bash
# 测试数据库连接
psql -h localhost -U liqpass_user -d liqpass

# 检查数据库状态
docker exec liqpass-database pg_isready
```

#### 内存不足

```bash
# 检查内存使用
docker stats

# 清理无用镜像
docker system prune -f
```

### 性能优化

#### 数据库优化

```sql
-- 创建性能索引
CREATE INDEX CONCURRENTLY idx_orders_user_status 
ON orders(user_address, status);

-- 定期清理旧数据
DELETE FROM orders WHERE created_at < NOW() - INTERVAL '1 year';
```

#### 应用优化

```javascript
// 启用连接池
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

## 回滚流程

### 紧急回滚

```bash
# 回滚到上一个版本
docker-compose down
docker-compose up -d liqpass-api:previous-version

# 验证回滚
curl -f http://localhost:3000/api/v1/healthz
```

### 数据回滚

```bash
# 恢复数据库备份
docker exec -i liqpass-database psql -U liqpass_user liqpass < backup.sql
```

## 维护计划

### 定期维护任务

| 任务 | 频率 | 负责人 |
|------|------|--------|
| 安全更新 | 每周 | 运维团队 |
| 数据库优化 | 每月 | DBA |
| 备份验证 | 每周 | 运维团队 |
| 性能监控 | 实时 | 监控系统 |

### 变更管理

所有部署变更必须经过：
1. 代码审查
2. 测试环境验证
3. 变更审批
4. 生产部署
5. 部署后验证

## 支持与联系

### 紧急支持
- **运维值班**: +86-138-0013-8000
- **技术负责人**: tech@liqpass.com
- **监控告警**: alerts@liqpass.com

### 文档资源
- [运维手册](https://docs.liqpass.com/ops)
- [故障排除指南](https://docs.liqpass.com/troubleshooting)
- [API文档](https://docs.liqpass.com/api)

## 附录

### 部署检查清单

- [ ] 环境要求验证
- [ ] 配置文件准备
- [ ] 数据库初始化
- [ ] 服务启动验证
- [ ] 健康检查通过
- [ ] 监控配置完成
- [ ] 备份策略就绪
- [ ] 安全配置完成

### 常用命令

```bash
# 查看服务状态
docker-compose ps

# 重启服务
docker-compose restart api

# 查看实时日志
docker-compose logs -f api

# 进入容器
docker-compose exec api bash

# 清理资源
docker system prune -f
```