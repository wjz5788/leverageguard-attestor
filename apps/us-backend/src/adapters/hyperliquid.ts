// Hyperliquid 交易所适配器
import { ExchangeAdapter, VerifyParams, VerifyResult, RawOrder, toStr, sum, avg, parseTime, mapOrderStatus, buildBaseVerifyResult, buildErrorResult } from './base.js';
import { arithmeticOk, MAX_SKEW_MS } from '../types/index.js';

// Hyperliquid API 端点配置
const HYPERLIQUID_API_ENDPOINTS = {
  live: 'https://api.hyperliquid.xyz',
  testnet: 'https://api.hyperliquid-testnet.xyz'
};

export class HyperliquidAdapter implements ExchangeAdapter {
  name = 'Hyperliquid';

  getSupportedCaps() {
    return {
      orders: true,
      fills: true,
      positions: true,
      liquidations: true
    };
  }

  async verifyAccount(params: VerifyParams): Promise<VerifyResult> {
    const sessionId = `sess_${Date.now()}`;
    
    try {
      // 1. 验证凭证
      const authValid = await this.validateCredentials(params);
      if (!authValid) {
        return buildErrorResult(['INVALID_CREDENTIALS'], {}, sessionId);
      }

      // 2. 获取账户信息
      const accountInfo = await this.getAccountInfo(params);
      
      // 3. 获取订单信息
      const orderData = await this.getOrderAndFills(params);
      
      if (!orderData.order) {
        return buildErrorResult(['MISSING_ORDER_REF'], accountInfo, sessionId);
      }

      // 4. 映射到统一格式
      const unifiedOrder = this.mapHyperliquidToUnified(orderData.order, orderData.fills);
      
      // 5. 执行验证检查
      const checks = this.performChecks(params, unifiedOrder, orderData.fills);
      
      // 6. 构建最终结果
      const result = buildBaseVerifyResult(
        checks.verdict === 'pass' ? 'verified' : 'failed',
        accountInfo,
        this.getSupportedCaps(),
        sessionId
      );

      result.order = unifiedOrder;
      result.checks = checks;
      result.proof = {
        echo: {
          firstOrderIdLast4: params.orderRef.slice(-4),
          firstFillQty: unifiedOrder.executedQty,
          firstFillTime: unifiedOrder.orderTimeIso
        },
        hash: this.generateProofHash(unifiedOrder)
      };
      result.liquidation = { status: 'none' };

      return result;

    } catch (error) {
      console.error('Hyperliquid verification error:', error);
      return buildErrorResult(['VERIFICATION_ERROR'], {}, sessionId);
    }
  }

  private async validateCredentials(params: VerifyParams): Promise<boolean> {
    // 简化实现：检查必要参数
    return !!(params.apiKey && params.apiSecret);
  }

  private async getAccountInfo(params: VerifyParams): Promise<any> {
    // 模拟获取账户信息
    return {
      exchangeUid: 'mock_hyperliquid_uid',
      subAccount: params.extra?.subAccount || 'main',
      accountType: 'perpetual',
      sampleInstruments: [params.pair]
    };
  }

  private async getOrderAndFills(params: VerifyParams): Promise<{ order: any; fills: any[] }> {
    // 模拟获取订单和成交数据
    const mockOrder: RawOrder = {
      orderId: params.orderRef,
      coin: params.pair,
      side: 'S',
      type: 'market',
      status: 'filled',
      sz: '581.4',
      px: '0.79628507',
      time: Date.now() - 3600000
    };

    const mockFills: RawOrder[] = [
      {
        sz: '581.4',
        px: '0.79628507',
        time: Date.now() - 3595000
      }
    ];

    return { order: mockOrder, fills: mockFills };
  }

  private mapHyperliquidToUnified(rawOrder: RawOrder, fills: RawOrder[]): any {
    const executedQty = toStr(sum(fills.map(f => Number(f.sz || 0))));
    const avgPrice = toStr(avg(fills.map(f => Number(f.px || 0))));
    const quoteAmount = toStr(sum(fills.map(f => Number(f.sz || 0) * Number(f.px || 0))));
    
    // 映射side
    const sideMap: Record<string, string> = {
      'B': 'BUY',
      'S': 'SELL',
      'buy': 'BUY',
      'sell': 'SELL'
    };
    
    return {
      orderId: String(rawOrder.orderId),
      pair: rawOrder.coin || '',
      side: sideMap[rawOrder.side || ''] || rawOrder.side?.toUpperCase(),
      type: rawOrder.type?.toUpperCase(),
      status: mapOrderStatus(rawOrder.status || ''),
      executedQty,
      avgPrice,
      quoteAmount,
      orderTimeIso: parseTime(rawOrder.time || Date.now()).toISOString(),
      exchangeTimeIso: parseTime(rawOrder.time || Date.now()).toISOString()
    };
  }

  private performChecks(params: VerifyParams, order: any, fills: any[]): any {
    const timeSkewMs = Math.abs(Date.now() - Date.parse(order.orderTimeIso));
    
      const checks = {
        authOk: true,
        capsOk: true,
        orderFound: !!order.orderId,
        echoLast4Ok: params.orderRef.slice(-4) === order.orderId.slice(-4),
        arithmeticOk: arithmeticOk(order.executedQty, order.avgPrice, order.quoteAmount),
        pairOk: params.pair.toUpperCase() === order.pair.toUpperCase(),
        timeSkewMs,
        verdict: 'pass'
      };

    // 如果任何检查失败，设置verdict为fail
    if (!checks.authOk || !checks.orderFound || !checks.echoLast4Ok || 
        !checks.arithmeticOk || !checks.pairOk || timeSkewMs > MAX_SKEW_MS) {
      checks.verdict = 'fail';
    }

    return checks;
  }

  private generateProofHash(order: any): string {
    // 简化实现：生成订单数据的哈希
    const data = `${order.orderId}-${order.executedQty}-${order.avgPrice}`;
    return `keccak256(0x${Buffer.from(data).toString('hex')})`;
  }
}

export default HyperliquidAdapter;
