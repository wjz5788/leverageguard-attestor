#!/usr/bin/env node

/**
 * 系统监控脚本
 * 监控合约状态、RPC连接、服务健康等
 */

const { ethers } = require('ethers');
const axios = require('axios');

// 配置参数
const CONFIG = {
  CHECKOUT_USDC_ADDRESS: "0xc423c34b57730ba87fb74b99180663913a345d68",
  RPC_URL: "https://mainnet.base.org",
  BACKEND_URL: "http://localhost:3000",
  
  // 监控间隔（秒）
  MONITOR_INTERVAL: 60,
  
  // 告警阈值
  RPC_TIMEOUT_THRESHOLD: 5000, // 5秒
  BLOCK_LAG_THRESHOLD: 10,     // 10个区块
  SERVICE_DOWN_THRESHOLD: 3    // 连续3次失败
};

// CheckoutUSDC合约ABI
const CHECKOUT_USDC_ABI = [
  "function paused() public view returns (bool)",
  "function owner() public view returns (address)",
  "function treasury() public view returns (address)",
  "function usdc() public view returns (address)"
];

class SystemMonitor {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    this.contract = new ethers.Contract(CONFIG.CHECKOUT_USDC_ADDRESS, CHECKOUT_USDC_ABI, this.provider);
    
    // 监控状态
    this.metrics = {
      rpcErrors: 0,
      serviceErrors: 0,
      lastBlockNumber: 0,
      lastCheckTime: 0
    };
  }

  /**
   * 启动监控
   */
  async start() {
    console.log("🚀 启动系统监控...\n");
    
    // 初始检查
    await this.runFullCheck();
    
    // 定时监控
    setInterval(async () => {
      await this.runFullCheck();
    }, CONFIG.MONITOR_INTERVAL * 1000);
  }

  /**
   * 执行完整检查
   */
  async runFullCheck() {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 执行系统检查...`);
    
    try {
      // 1. RPC连接检查
      await this.checkRpcConnection();
      
      // 2. 合约状态检查
      await this.checkContractStatus();
      
      // 3. 后端服务检查
      await this.checkBackendService();
      
      // 4. 区块同步检查
      await this.checkBlockSync();
      
      console.log("✅ 系统检查完成\n");
      
      // 重置错误计数
      this.metrics.rpcErrors = 0;
      this.metrics.serviceErrors = 0;
      
    } catch (error) {
      console.error("❌ 系统检查失败:", error.message);
      await this.handleError(error);
    }
  }

  /**
   * 检查RPC连接
   */
  async checkRpcConnection() {
    const startTime = Date.now();
    
    try {
      const blockNumber = await this.provider.getBlockNumber();
      const responseTime = Date.now() - startTime;
      
      console.log(`   🔗 RPC连接: 正常 (响应时间: ${responseTime}ms, 最新区块: ${blockNumber})`);
      
      // 检查响应时间
      if (responseTime > CONFIG.RPC_TIMEOUT_THRESHOLD) {
        throw new Error(`RPC响应时间过长: ${responseTime}ms`);
      }
      
      this.metrics.lastBlockNumber = blockNumber;
      
    } catch (error) {
      this.metrics.rpcErrors++;
      throw new Error(`RPC连接失败: ${error.message}`);
    }
  }

  /**
   * 检查合约状态
   */
  async checkContractStatus() {
    try {
      const isPaused = await this.contract.paused();
      const owner = await this.contract.owner();
      const treasury = await this.contract.treasury();
      const usdc = await this.contract.usdc();
      
      console.log(`   📋 合约状态: ${isPaused ? '🔴 已暂停' : '🟢 运行中'}`);
      console.log(`       • Owner: ${owner}`);
      console.log(`       • Treasury: ${treasury}`);
      console.log(`       • USDC: ${usdc}`);
      
      if (isPaused) {
        console.log("   ⚠️  合约处于暂停状态");
      }
      
    } catch (error) {
      throw new Error(`合约状态检查失败: ${error.message}`);
    }
  }

  /**
   * 检查后端服务
   */
  async checkBackendService() {
    try {
      const response = await axios.get(`${CONFIG.BACKEND_URL}/health`, {
        timeout: 5000
      });
      
      if (response.status === 200) {
        console.log("   🖥️  后端服务: 正常");
      } else {
        throw new Error(`服务响应异常: ${response.status}`);
      }
      
    } catch (error) {
      this.metrics.serviceErrors++;
      throw new Error(`后端服务检查失败: ${error.message}`);
    }
  }

  /**
   * 检查区块同步
   */
  async checkBlockSync() {
    if (this.metrics.lastBlockNumber === 0) return;
    
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const blockLag = currentBlock - this.metrics.lastBlockNumber;
      
      console.log(`   📦 区块同步: 正常 (滞后: ${blockLag} 个区块)`);
      
      if (blockLag > CONFIG.BLOCK_LAG_THRESHOLD) {
        throw new Error(`区块同步滞后过多: ${blockLag} 个区块`);
      }
      
    } catch (error) {
      throw new Error(`区块同步检查失败: ${error.message}`);
    }
  }

  /**
   * 处理错误
   */
  async handleError(error) {
    const errorType = this.classifyError(error);
    
    switch (errorType) {
      case 'rpc_error':
        if (this.metrics.rpcErrors >= CONFIG.SERVICE_DOWN_THRESHOLD) {
          await this.sendCriticalAlert('RPC服务异常', `连续${this.metrics.rpcErrors}次RPC连接失败`);
        }
        break;
        
      case 'service_error':
        if (this.metrics.serviceErrors >= CONFIG.SERVICE_DOWN_THRESHOLD) {
          await this.sendCriticalAlert('后端服务异常', `连续${this.metrics.serviceErrors}次服务检查失败`);
        }
        break;
        
      default:
        await this.sendWarningAlert('系统监控异常', error.message);
        break;
    }
  }

  /**
   * 错误分类
   */
  classifyError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('rpc') || message.includes('connection')) {
      return 'rpc_error';
    } else if (message.includes('service') || message.includes('backend')) {
      return 'service_error';
    } else {
      return 'other_error';
    }
  }

  /**
   * 发送严重告警
   */
  async sendCriticalAlert(title, message) {
    console.log(`🚨 严重告警: ${title} - ${message}`);
    // TODO: 集成实际告警系统
  }

  /**
   * 发送警告告警
   */
  async sendWarningAlert(title, message) {
    console.log(`⚠️  警告告警: ${title} - ${message}`);
    // TODO: 集成实际告警系统
  }

  /**
   * 获取监控指标
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: Date.now()
    };
  }
}

// 命令行接口
if (require.main === module) {
  const monitor = new SystemMonitor();
  
  // 处理退出信号
  process.on('SIGINT', async () => {
    console.log('\n🛑 停止监控...');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 停止监控...');
    process.exit(0);
  });
  
  // 启动监控
  monitor.start().catch(console.error);
}

module.exports = SystemMonitor;