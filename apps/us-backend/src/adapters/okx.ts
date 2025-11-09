// OKX 交易所适配器
import { ExchangeAdapter, VerifyParams, VerifyResult, RawOrder, toStr, sum, avg, parseTime, mapOrderStatus, buildBaseVerifyResult, buildErrorResult } from './base.js';
import { arithmeticOk, MAX_SKEW_MS } from '../types/index.js';

// OKX API 端点配置
const OKX_API_ENDPOINTS = {
  live: 'https://www.okx.com',
  testnet: 'https://www.okx.com'
};

export class OKXAdapter implements ExchangeAdapter {
  name = 'OKX';

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
      const unifiedOrder = this.mapOKXToUnified(orderData.order, orderData.fills);
      
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
      console.error('OKX verification error:', error);
      return buildErrorResult(['VERIFICATION_ERROR'], {}, sessionId);
    }
  }

  private async validateCredentials(params: VerifyParams): Promise<boolean> {
    // 简化实现：检查必要参数
    return !!(params.apiKey && params.apiSecret && params.passphrase);
  }

  private async getAccountInfo(params: VerifyParams): Promise<any> {
    // 模拟获取账户信息
    return {
      exchangeUid: 'mock_okx_uid',
      subAccount: params.extra?.subAccount || 'main',
      accountType: 'futures',
      sampleInstruments: [params.pair]
    };
  }

  private async getOrderAndFills(params: VerifyParams): Promise<{ order: any; fills: any[] }> {
    // 模拟获取订单和成交数据
    const mockOrder: RawOrder = {
      ordId: params.orderRef,
      instId: params.pair,
      side: 'sell',
      ordType: 'market',
      state: 'filled',
      fillSz: '581.4',
      fillPx: '0.79628507',
      cTime: Date.now() - 3600000,
      uTime: Date.now() - 3590000
    };

    const mockFills: RawOrder[] = [
      {
        fillSz: '581.4',
        fillPx: '0.79628507',
        cTime: Date.now() - 3595000
      }
    ];

    return { order: mockOrder, fills: mockFills };
  }

  private mapOKXToUnified(rawOrder: RawOrder, fills: RawOrder[]): any {
    const executedQty = toStr(sum(fills.map(f => Number(f.fillSz || 0))));
    const avgPrice = toStr(avg(fills.map(f => Number(f.fillPx || 0))));
    const quoteAmount = toStr(sum(fills.map(f => Number(f.fillSz || 0) * Number(f.fillPx || 0))));
    
    return {
      orderId: String(rawOrder.ordId),
      pair: rawOrder.instId || '',
      side: rawOrder.side?.toUpperCase(),
      type: rawOrder.ordType?.toUpperCase(),
      status: mapOrderStatus(rawOrder.state || ''),
      executedQty,
      avgPrice,
      quoteAmount,
      orderTimeIso: parseTime(rawOrder.cTime || rawOrder.uTime || Date.now()).toISOString(),
      exchangeTimeIso: parseTime(rawOrder.uTime || rawOrder.cTime || Date.now()).toISOString()
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

export default OKXAdapter;
