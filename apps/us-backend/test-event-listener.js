import { ContractListenerService } from './src/services/contractListenerService.ts';

async function testEventListener() {
  console.log('🧪 测试事件监听服务...');
  
  try {
    const listener = new ContractListenerService();
    
    // 健康检查
    const health = await listener.healthCheck();
    console.log('✅ 健康检查:', health);
    
    if (!health.healthy) {
      console.error('❌ 健康检查失败，无法启动监听');
      return;
    }
    
    // 启动监听
    await listener.startListening();
    console.log('🎯 事件监听已启动');
    
    // 检查监听状态
    const status = listener.getStatus();
    console.log('📊 监听状态:', status);
    
    // 保持运行一段时间
    console.log('⏰ 监听服务运行中，等待事件...');
    console.log('💡 按 Ctrl+C 停止监听');
    
    // 设置定时器，每30秒检查一次状态
    const interval = setInterval(() => {
      const currentStatus = listener.getStatus();
      console.log(`🔄 监听状态检查: ${currentStatus.isListening ? '运行中' : '已停止'}`);
    }, 30000);
    
    // 处理退出信号
    process.on('SIGINT', async () => {
      console.log('\n🛑 收到停止信号，正在关闭监听...');
      clearInterval(interval);
      await listener.stopListening();
      console.log('✅ 事件监听已停止');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

testEventListener();