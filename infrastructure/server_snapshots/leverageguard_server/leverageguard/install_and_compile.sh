#!/bin/bash

# 安装和编译脚本

# 确保脚本以root用户运行
if [ "$(id -u)" != "0" ]; then
   echo "This script must be run as root" 1>&2
   exit 1
fi

# 安装项目依赖
install_dependencies() {
    echo "[1/4] 安装Node.js依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "错误：Node.js依赖安装失败"
        exit 1
    fi
    echo "Node.js依赖安装成功!"
    
    echo "\n[2/4] 安装Python依赖..."
    cd backend
    pip3 install web3 python-dotenv
    if [ $? -ne 0 ]; then
        echo "错误：Python依赖安装失败"
        exit 1
    fi
    cd ..
    echo "Python依赖安装成功!"
}

# 编译智能合约
compile_contracts() {
    echo "\n[3/4] 编译智能合约..."
    npx hardhat compile
    if [ $? -ne 0 ]; then
        echo "错误：智能合约编译失败"
        exit 1
    fi
    echo "智能合约编译成功!"
}

# 检查环境变量
check_env() {
    echo "\n[4/4] 检查环境变量..."
    if [ ! -f .env ]; then
        echo "警告：.env文件不存在，将创建默认.env文件"
        cp .env .env.backup
        echo "# 部署钱包私钥（用于部署合约）"
        echo "PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" >> .env
        echo "" >> .env
        echo "# Owner钱包私钥（用于执行payout操作）" >> .env
        echo "OWNER_PRIVATE_KEY=0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" >> .env
        echo "" >> .env
        echo "# Arbitrum Sepolia测试网RPC端点" >> .env
        echo "ARBITRUM_RPC=https://sepolia-rollup.arbitrum.io/rpc" >> .env
        echo "" >> .env
        echo "# 合约地址（部署后会自动填充）" >> .env
        echo "LEVERAGEGUARD_ADDRESS=" >> .env
        echo "默认.env文件创建成功，请务必更新私钥和RPC端点!"
    else
        echo ".env文件已存在，跳过创建..."
        
        # 检查必要的环境变量
        MISSING=false
        if ! grep -q "PRIVATE_KEY=" .env; then
            echo "警告：.env文件中缺少PRIVATE_KEY"
            MISSING=true
        fi
        if ! grep -q "OWNER_PRIVATE_KEY=" .env; then
            echo "警告：.env文件中缺少OWNER_PRIVATE_KEY"
            MISSING=true
        fi
        if ! grep -q "ARBITRUM_RPC=" .env; then
            echo "警告：.env文件中缺少ARBITRUM_RPC"
            MISSING=true
        fi
        
        if [ "$MISSING" = true ]; then
            echo "请在部署前更新.env文件中的缺失变量!"
        fi
    fi
}

# 主函数
main() {
    echo "==============================================="
    echo "开始安装和配置LeverageGuard项目..."
    echo "==============================================="
    
    install_dependencies
    compile_contracts
    check_env
    
    echo "\n==============================================="
    echo "LeverageGuard项目安装和配置完成！"
    echo "下一步："
    echo "1. 更新.env文件中的私钥和RPC端点"
    echo "2. 运行 'npx hardhat run scripts/deploy.js --network arbitrumSepolia' 部署合约"
    echo "3. 将部署成功的合约地址添加到.env文件中的LEVERAGEGUARD_ADDRESS"
    echo "4. 运行 'npx hardhat run scripts/fund.js --network arbitrumSepolia' 向合约注入资金"
    echo "5. 运行 'python3 backend/event_listener.py' 启动事件监听器"
    echo "==============================================="
}

# 执行主函数
main