import { v4 as uuid } from 'uuid';
import { ClaimRecord, ClaimStatus, ClaimType, PayoutStatus, CreateClaimRequest, UpdateClaimRequest, ClaimsStats } from '../types/claims.js';

export class ClaimsError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
    this.name = 'ClaimsError';
  }
}

import OrderService from './orderService.js';

export interface ClaimsServiceOptions {
  maxEvidenceFiles?: number;
  maxFileSizeMB?: number;
  allowedFileTypes?: string[];
}

export default class ClaimsService {
  private readonly claims = new Map<string, ClaimRecord>();
  private readonly payouts = new Map<string, any>();
  private readonly userClaims = new Map<string, string[]>(); // userId -> claimIds
  private readonly orderClaims = new Map<string, string[]>(); // orderId -> claimIds
  
  private readonly options: ClaimsServiceOptions;
  private readonly orderService: OrderService;

  constructor(orderService: OrderService, options: ClaimsServiceOptions = {}) {
    this.orderService = orderService;
    this.options = {
      maxEvidenceFiles: 5,
      maxFileSizeMB: 10,
      allowedFileTypes: ['.jpg', '.jpeg', '.png', '.pdf', '.txt', '.log'],
      ...options
    };
  }

  /**
   * 创建赔付申请
   */
  createClaim(userId: string, request: CreateClaimRequest): ClaimRecord {
    // 验证输入
    this.validateClaimRequest(request);

    // 检查订单是否存在
    const order = this.orderService.getOrder(request.orderId);
    if (!order) {
      throw new ClaimsError('ORDER_NOT_FOUND', '订单不存在');
    }

    // 检查订单是否属于当前用户
    if (order.wallet.toLowerCase() !== userId.toLowerCase()) {
      throw new ClaimsError('ORDER_NOT_OWNED', '无权操作此订单');
    }

    // 检查是否已有赔付申请
    const existingClaims = this.orderClaims.get(request.orderId) || [];
    const activeClaims = existingClaims
      .map(id => this.claims.get(id))
      .filter(claim => claim && ['pending', 'submitted', 'under_review'].includes(claim.status));
    
    if (activeClaims.length > 0) {
      throw new ClaimsError('ACTIVE_CLAIM_EXISTS', '该订单已有活跃的赔付申请');
    }

    const now = new Date().toISOString();
    const claimId = `claim_${uuid()}`;
    
    const claim: ClaimRecord = {
      id: claimId,
      orderId: request.orderId,
      userId,
      walletAddress: order.wallet, // 从订单获取钱包地址
      claimType: request.claimType,
      status: 'pending',
      amountUSDC: request.amountUSDC,
      description: request.description,
      evidenceFiles: request.evidenceFiles,
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    };

    // 保存赔付申请
    this.claims.set(claimId, claim);
    
    // 更新索引
    this.updateUserClaimsIndex(userId, claimId);
    this.updateOrderClaimsIndex(request.orderId, claimId);

    return claim;
  }

  /**
   * 获取赔付申请详情
   */
  getClaim(claimId: string): ClaimRecord | undefined {
    return this.claims.get(claimId);
  }

  /**
   * 获取用户的赔付申请列表
   */
  getUserClaims(userId: string, page = 1, pageSize = 20): { claims: ClaimRecord[]; total: number } {
    const claimIds = this.userClaims.get(userId) || [];
    const allClaims = claimIds
      .map(id => this.claims.get(id))
      .filter(claim => claim !== undefined) as ClaimRecord[];
    
    // 按创建时间倒序排序
    allClaims.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // 分页
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedClaims = allClaims.slice(startIndex, endIndex);

    return {
      claims: paginatedClaims,
      total: allClaims.length
    };
  }

  /**
   * 获取所有赔付申请（管理员用）
   */
  getAllClaims(page = 1, pageSize = 20, status?: ClaimStatus): { claims: ClaimRecord[]; total: number } {
    const allClaims = Array.from(this.claims.values());
    
    // 按状态过滤
    const filteredClaims = status 
      ? allClaims.filter(claim => claim.status === status)
      : allClaims;
    
    // 按创建时间倒序排序
    filteredClaims.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // 分页
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedClaims = filteredClaims.slice(startIndex, endIndex);

    return {
      claims: paginatedClaims,
      total: filteredClaims.length
    };
  }

  /**
   * 更新赔付申请状态（管理员用）
   */
  updateClaim(claimId: string, request: UpdateClaimRequest, reviewerId?: string): ClaimRecord {
    const claim = this.claims.get(claimId);
    if (!claim) {
      throw new ClaimsError('CLAIM_NOT_FOUND', '赔付申请不存在');
    }

    const now = new Date().toISOString();
    const updatedClaim: ClaimRecord = {
      ...claim,
      ...request,
      updatedAt: now
    };

    // 处理状态变更
    if (request.status) {
      updatedClaim.status = request.status;
      
      if (['approved', 'rejected'].includes(request.status)) {
        updatedClaim.reviewedAt = now;
        updatedClaim.reviewedBy = reviewerId;
        updatedClaim.reviewNotes = request.reviewNotes;
      }
      
      if (request.status === 'paid' && request.payoutTxHash) {
        updatedClaim.payoutStatus = 'completed';
        updatedClaim.payoutAt = now;
      }
    }

    this.claims.set(claimId, updatedClaim);
    return updatedClaim;
  }

  /**
   * 提交赔付申请
   */
  submitClaim(claimId: string, userId: string): ClaimRecord {
    const claim = this.claims.get(claimId);
    if (!claim) {
      throw new ClaimsError('CLAIM_NOT_FOUND', '赔付申请不存在');
    }

    if (claim.userId !== userId) {
      throw new ClaimsError('UNAUTHORIZED', '无权操作此赔付申请');
    }

    if (claim.status !== 'pending') {
      throw new ClaimsError('INVALID_STATUS', '赔付申请状态不允许提交');
    }

    const now = new Date().toISOString();
    const updatedClaim: ClaimRecord = {
      ...claim,
      status: 'submitted',
      submittedAt: now,
      updatedAt: now
    };

    this.claims.set(claimId, updatedClaim);
    return updatedClaim;
  }

  /**
   * 准备理赔申请（前端需要的接口）
   */
  prepareClaim(orderId: string, userId: string): { claimToken: string } {
    // 检查订单是否存在
    const order = this.orderService.getOrder(orderId);
    if (!order) {
      throw new ClaimsError('ORDER_NOT_FOUND', '订单不存在');
    }

    // 检查订单是否属于当前用户
    if (order.wallet.toLowerCase() !== userId.toLowerCase()) {
      throw new ClaimsError('ORDER_NOT_OWNED', '无权操作此订单');
    }

    // 检查是否已有赔付申请
    const existingClaims = this.orderClaims.get(orderId) || [];
    const activeClaims = existingClaims
      .map(id => this.claims.get(id))
      .filter(claim => claim && ['pending', 'submitted', 'under_review'].includes(claim.status));
    
    if (activeClaims.length > 0) {
      throw new ClaimsError('ACTIVE_CLAIM_EXISTS', '该订单已有活跃的赔付申请');
    }

    // 生成理赔令牌（30分钟有效）
    const claimToken = `ct_${uuid()}`;
    
    // 这里可以存储令牌到临时存储，实际项目中应该使用Redis等
    // 暂时返回令牌
    
    return { claimToken };
  }

  /**
   * 验证理赔申请（前端需要的接口）
   */
  verifyClaim(orderId: string, orderRef: string, claimToken: string, userId: string): {
    eligible: boolean;
    payout: number;
    currency: string;
    evidence: {
      type: string;
      time: string;
      pair: string;
    };
    claimId: string;
    expiresAt: string;
  } {
    // 验证令牌有效性（简化实现）
    if (!claimToken.startsWith('ct_')) {
      throw new ClaimsError('INVALID_TOKEN', '无效的理赔令牌');
    }

    // 检查订单是否存在
    const order = this.orderService.getOrder(orderId);
    if (!order) {
      throw new ClaimsError('ORDER_NOT_FOUND', '订单不存在');
    }

    // 检查订单是否属于当前用户
    if (order.wallet.toLowerCase() !== userId.toLowerCase()) {
      throw new ClaimsError('ORDER_NOT_OWNED', '无权操作此订单');
    }

    // 检查订单引用是否匹配
    if (order.orderRef !== orderRef) {
      throw new ClaimsError('ORDER_REF_MISMATCH', '订单引用不匹配');
    }

    // 模拟理赔资格检查
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString(); // 30分钟有效
    
    // 这里应该有实际的理赔资格检查逻辑
    // 暂时返回模拟数据
    return {
      eligible: true,
      payout: 48.5, // 模拟赔付金额
      currency: 'USDC',
      evidence: {
        type: 'LIQUIDATION',
        time: new Date(now.getTime() - 3 * 60 * 1000).toISOString(), // 3分钟前
        pair: 'BTC-USDT-PERP'
      },
      claimId: `clm_${uuid()}`,
      expiresAt
    };
  }

  /**
   * 获取理赔统计数据
   */
  getClaimsStats(userId: string): ClaimsStats {
    const userClaimIds = this.userClaims.get(userId) || [];
    const userClaims = userClaimIds
      .map(id => this.claims.get(id))
      .filter(claim => claim !== undefined) as ClaimRecord[];
    
    const totalClaims = userClaims.length;
    const pendingClaims = userClaims.filter(claim => 
      ['pending', 'submitted', 'under_review'].includes(claim.status)
    ).length;
    const approvedClaims = userClaims.filter(claim => claim.status === 'approved').length;
    const rejectedClaims = userClaims.filter(claim => claim.status === 'rejected').length;
    
    const totalPayoutAmount = userClaims
      .filter(claim => claim.status === 'paid')
      .reduce((sum, claim) => sum + (claim.payoutAmountUSDC || 0), 0);
    
    // 计算平均处理时间（简化实现）
    const processedClaims = userClaims.filter(claim => 
      ['approved', 'rejected', 'paid'].includes(claim.status)
    );
    
    let averageProcessingTime = 0;
    if (processedClaims.length > 0) {
      const totalTime = processedClaims.reduce((sum, claim) => {
        const submitted = new Date(claim.submittedAt).getTime();
        const processed = new Date(claim.reviewedAt || claim.updatedAt).getTime();
        return sum + (processed - submitted);
      }, 0);
      averageProcessingTime = totalTime / processedClaims.length;
    }

    return {
      totalClaims,
      pendingClaims,
      approvedClaims,
      rejectedClaims,
      totalPayoutAmount,
      averageProcessingTime
    };
  }

  /**
   * 获取赔付统计（管理员接口）
   */
  getAdminClaimsStats(): ClaimsStats {
    const allClaims = Array.from(this.claims.values());
    
    const totalClaims = allClaims.length;
    const pendingClaims = allClaims.filter(c => c.status === 'pending').length;
    const submittedClaims = allClaims.filter(c => c.status === 'submitted').length;
    const underReviewClaims = allClaims.filter(c => c.status === 'under_review').length;
    const approvedClaims = allClaims.filter(c => c.status === 'approved').length;
    const rejectedClaims = allClaims.filter(c => c.status === 'rejected').length;
    const paidClaims = allClaims.filter(c => c.status === 'paid').length;

    const totalPayoutAmount = allClaims
      .filter(c => c.payoutAmountUSDC)
      .reduce((sum, c) => sum + (c.payoutAmountUSDC || 0), 0);

    // 计算平均处理时间（仅计算已完成的赔付）
    const completedClaims = allClaims.filter(c => ['approved', 'rejected', 'paid'].includes(c.status));
    const totalProcessingTime = completedClaims.reduce((sum, c) => {
      const submitted = new Date(c.submittedAt).getTime();
      const completed = new Date(c.reviewedAt || c.payoutAt || c.updatedAt).getTime();
      return sum + (completed - submitted);
    }, 0);
    
    const averageProcessingTime = completedClaims.length > 0 
      ? totalProcessingTime / completedClaims.length 
      : 0;

    return {
      totalClaims,
      pendingClaims: pendingClaims + submittedClaims + underReviewClaims,
      approvedClaims,
      rejectedClaims,
      totalPayoutAmount,
      averageProcessingTime
    };
  }

  /**
   * 验证赔付申请请求
   */
  private validateClaimRequest(request: CreateClaimRequest): void {
    if (!request.orderId) {
      throw new ClaimsError('MISSING_ORDER_ID', '订单ID是必填项');
    }

    if (!request.claimType) {
      throw new ClaimsError('MISSING_CLAIM_TYPE', '赔付类型是必填项');
    }

    if (!request.amountUSDC || request.amountUSDC <= 0) {
      throw new ClaimsError('INVALID_AMOUNT', '赔付金额必须大于0');
    }

    if (!request.description || request.description.trim().length < 10) {
      throw new ClaimsError('INVALID_DESCRIPTION', '赔付描述至少需要10个字符');
    }

    if (request.evidenceFiles.length > this.options.maxEvidenceFiles!) {
      throw new ClaimsError('TOO_MANY_FILES', `最多只能上传${this.options.maxEvidenceFiles}个证据文件`);
    }
  }

  /**
   * 更新用户赔付索引
   */
  private updateUserClaimsIndex(userId: string, claimId: string): void {
    const userClaims = this.userClaims.get(userId) || [];
    if (!userClaims.includes(claimId)) {
      userClaims.push(claimId);
      this.userClaims.set(userId, userClaims);
    }
  }

  /**
   * 更新订单赔付索引
   */
  private updateOrderClaimsIndex(orderId: string, claimId: string): void {
    const orderClaims = this.orderClaims.get(orderId) || [];
    if (!orderClaims.includes(claimId)) {
      orderClaims.push(claimId);
      this.orderClaims.set(orderId, orderClaims);
    }
  }
}