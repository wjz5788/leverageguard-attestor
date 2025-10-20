# 用户文件整理

本文档详细说明了从服务器上整理的所有用户创建的文件和项目。

## 目录结构

- **markdown文档/** - 包含所有Markdown格式的文档
- **项目文件夹/** - 包含所有完整的项目目录
- **脚本文件/** - 包含独立的脚本文件
- **配置文件/** - 包含重要的配置文件

## Markdown文档说明

### 核心文档

- **核心代码.md** - 可能包含项目的核心代码说明或设计文档
- **前端.md** - 前端开发相关的文档

### 项目文档

- **项目4.md** - 第4个项目的相关文档
- **项目10.md** - 第10个项目的相关文档
- **讨论5.md** - 可能是第5次讨论的记录或会议纪要

### 其他文档

- **2.md, 8.md, 10.md, 30.md** - 可能是按编号组织的其他文档

## 项目说明

### leverageguard

这似乎是一个基于以太坊的DeFi项目，包含以下组件：
- **contracts/** - 智能合约代码
- **backend/** - 后端服务
- **frontend/** - 前端界面
- **hardhat.config.js** - Hardhat配置文件，用于智能合约开发
- **scripts/** - 项目相关脚本
- **.env** - 环境配置文件

#### 如何使用：
1. 进入项目目录：`cd leverageguard`
2. 安装依赖：`npm install`
3. 编译合约：`npx hardhat compile`
4. 启动本地节点：`npx hardhat node`
5. 部署合约：`npx hardhat run scripts/deploy.js --network localhost`
6. 启动前端：参考前端目录中的说明

### leverageguard_project

这似乎是leverageguard项目的另一个版本或分支：
- **contracts/** - 智能合约
- **backend/** - Python后端服务
- **frontend/** - 前端界面
- **requirements.txt** - Python依赖
- **start_backend.sh** - 启动后端的脚本
- **start_frontend.sh** - 启动前端的脚本

#### 如何使用：
1. 进入项目目录：`cd leverageguard_project`
2. 安装Python依赖：`pip install -r requirements.txt`
3. 启动后端：`bash start_backend.sh`
4. 启动前端：`bash start_frontend.sh`

## 脚本文件

- **verify_monthly_trades.py** - 验证月度交易的Python脚本
  - 可能用于分析或验证交易数据

## Web应用

### 部署版本
在 `/srv/web/releases/` 目录下发现了多个版本的Web应用：
- **v0.1.0/** - 第一个版本
- **v0.1.1/** - 第二个版本
- **v0.1.2/** - 第三个版本

这些可能是leverageguard项目的前端部署版本。

### 网站文件
在 `/var/www/` 目录下发现了多个网站：
- **html/** - 默认的nginx网站目录
- **liqpass/** - Liquid Pass网站
- **wjz5788.com/** - wjz5788.com域名的网站
- **wjz5788/** - 可能是Next.js应用，包含多个页面和静态资源

## 服务器配置

### Nginx配置
在 `/etc/nginx/` 目录下包含了完整的Nginx服务器配置：
- **nginx.conf** - 主配置文件
- **sites-available/** - 可用站点配置
- **sites-enabled/** - 已启用站点配置
- **conf.d/** - 额外配置文件目录

## 注意事项

1. 请确保在使用这些文件前备份重要数据
2. 环境文件(.env)可能包含敏感信息，请妥善保管
3. 运行脚本前请检查权限设置
4. 某些项目可能需要特定版本的依赖包