import { ProductModel, Product, CreateQuoteRequest, QuoteResponse } from '../models/product';
import { QuoteModel, CreateQuoteData } from '../models/quote';

export class QuoteService {
  /**
   * 创建报价
   * @param userId 用户ID
   * @param request 报价请求
   * @returns 报价响应
   */
  static async createQuote(userId: string, request: CreateQuoteRequest): Promise<QuoteResponse> {
    // 1. 验证产品是否存在
    const product = await ProductModel.findById(request.product_id);
    if (!product) {
      throw new Error('产品不存在');
    }

    // 2. 验证请求参数
    const validationError = ProductModel.validateQuoteRequest(
      product, 
      request.principal, 
      request.leverage
    );
    if (validationError) {
      throw new Error(validationError);
    }

    // 3. 计算保费和赔付金额
    const { premium, payout } = ProductModel.calculatePremium(
      product,
      request.principal,
      request.leverage
    );

    // 4. 设置报价过期时间（5分钟后过期）
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟

    // 5. 创建报价记录
    const quoteData: CreateQuoteData = {
      user_id: userId,
      product_id: request.product_id,
      principal: request.principal,
      leverage: request.leverage,
      premium,
      payout,
      params: {
        product_id: request.product_id,
        principal: request.principal,
        leverage: request.leverage,
        probability: product.probability,
        base_load: product.base_load,
        op_fee: product.op_fee
      },
      expires_at: expiresAt
    };

    const quote = await QuoteModel.create(quoteData);

    // 6. 返回报价响应
    const response: QuoteResponse = {
      id: quote.id,
      premium,
      payout,
      expires_at: expiresAt.toISOString(),
      params: quoteData.params
    };

    return response;
  }

  /**
   * 获取产品列表
   * @returns 产品列表
   */
  static async getProducts(): Promise<Product[]> {
    return await ProductModel.findAllActive();
  }

  /**
   * 根据产品代码获取产品
   * @param code 产品代码
   * @returns 产品信息
   */
  static async getProductByCode(code: string): Promise<Product | null> {
    return await ProductModel.findByCode(code);
  }

  /**
   * 验证报价是否有效
   * @param quoteId 报价ID
   * @returns 报价是否有效
   */
  static async validateQuote(quoteId: string): Promise<boolean> {
    const quote = await QuoteModel.findValidById(quoteId);
    return quote !== null;
  }

  /**
   * 清理过期报价
   * @returns 清理的报价数量
   */
  static async cleanupExpiredQuotes(): Promise<number> {
    return await QuoteModel.cleanupExpiredQuotes();
  }

  /**
   * 获取报价统计信息
   * @param productId 产品ID
   * @returns 统计信息
   */
  static async getQuoteStats(productId: string) {
    return await QuoteModel.getQuoteStats(productId);
  }

  /**
   * 批量创建报价（用于测试）
   * @param userId 用户ID
   * @param requests 报价请求数组
   * @returns 报价响应数组
   */
  static async batchCreateQuotes(userId: string, requests: CreateQuoteRequest[]): Promise<QuoteResponse[]> {
    const results: QuoteResponse[] = [];
    
    for (const request of requests) {
      try {
        const quote = await this.createQuote(userId, request);
        results.push(quote);
      } catch (error) {
        console.error(`创建报价失败: ${error}`);
        // 继续处理其他请求
      }
    }

    return results;
  }
}

export default QuoteService;