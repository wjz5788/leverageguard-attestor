import { v4 as uuid } from 'uuid';
import { ClaimRecord, ClaimStatus, ClaimType, PayoutStatus, CreateClaimRequest, UpdateClaimRequest, ClaimsStats } from '../types/claims.js';

export class ClaimsError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
    this.name = 'ClaimsError';
  }
}

import OrderService from './orderService.js';
import dbManager from '../database/db.js';
import { evidenceStorage } from '../utils/evidenceStorage.js';

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
  private readonly claimTokens = new Map<string, string>(); // claimToken -> claimId
  
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
  prepareClaim(orderId: string, userId: string): { claimToken: string; claimId: string } {
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

    const now = new Date().toISOString();
    const claimId = `claim_${uuid()}`;
    const claim: ClaimRecord = {
      id: claimId,
      orderId,
      userId,
      walletAddress: order.wallet,
      claimType: 'liquidation',
      status: 'pending',
      amountUSDC: 0,
      description: 'Prepared claim',
      evidenceFiles: [],
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    };

    this.claims.set(claimId, claim);
    this.updateUserClaimsIndex(userId, claimId);
    this.updateOrderClaimsIndex(orderId, claimId);

    const claimToken = `ct_${uuid()}`;
    this.claimTokens.set(claimToken, claimId);

    return { claimToken, claimId };
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
    evidenceId?: string;
  } {
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

    // 根据最近一次交易所验证结果判断是否强平
    const db = dbManager.getDatabase();
    const row = db.get(
      `SELECT * FROM verify_results WHERE exchange = ? AND ord_id = ? ORDER BY verified_at DESC LIMIT 1`,
      'okx',
      orderRef
    );

    let eligible = false;
    let pair = '';
    let eventTime = new Date().toISOString();
    try {
      const normalized = row?.normalized_json ? JSON.parse(row.normalized_json) : null;
      const position = normalized?.position || normalized?.normalized?.position || null;
      const liquidated = Boolean(position?.liquidated);
      eligible = liquidated;
      pair = normalized?.order?.pair || normalized?.meta?.instId || '';
      eventTime = position?.liquidatedAt || new Date().toISOString();
    } catch {}

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    const claimIdFromToken = this.claimTokens.get(claimToken);
    const evidenceId = evidenceStorage.generateEvidenceId();
    const evidencePayload = {
      request: { orderId, orderRef, claimToken, userId },
      result: { eligible, payout: eligible ? 48.5 : 0, currency: 'USDC' },
      evidence: { type: eligible ? 'LIQUIDATION' : 'NONE', time: eventTime, pair: pair || 'UNKNOWN' },
      raw: row || null,
      meta: { source: 'okx', verifiedAt: new Date().toISOString() }
    };
    evidenceStorage.saveEvidence(evidenceId, evidencePayload);
    const evtId = `evt_${uuid()}`;
    const eventType = eligible ? 'verify_pass' : 'verify_fail';
    const metaJson = JSON.stringify({ orderRef, pair: pair || 'UNKNOWN', time: eventTime });
    db.run(
      'INSERT INTO audit_events (id, event_type, order_id, claim_id, evidence_id, amount_usdc, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      evtId,
      eventType,
      orderId,
      (claimIdFromToken || `clm_${uuid()}`),
      evidenceId,
      eligible ? 48.5 : 0,
      metaJson
    );

    return {
      eligible,
      payout: eligible ? 48.5 : 0,
      currency: 'USDC',
      evidence: {
        type: eligible ? 'LIQUIDATION' : 'NONE',
        time: eventTime,
        pair: pair || 'UNKNOWN'
      },
      claimId: claimIdFromToken || `clm_${uuid()}`,
      expiresAt,
      evidenceId
    };
  }

  toClaimDetail(claimId: string): any {
    const claim = this.getClaim(claimId);
    if (!claim) return undefined;
    const order = this.orderService.getOrder(claim.orderId);
    const premium6d = Number(order?.premiumUSDC6d ?? 0);
    const payout6d = Number(order?.payoutUSDC6d ?? 0);
    const premiumPaid = premium6d > 0 ? premium6d / 1_000_000 : 0;
    const payoutCap = payout6d > 0 ? payout6d / 1_000_000 : 0;
    const createdAt = claim.createdAt;
    const coverageStart = createdAt;
    const coverageEnd = createdAt;
    const status: 'PENDING_VERIFY' | 'WAITING_PAYOUT' | 'PAID' = claim.status === 'paid' ? 'PAID' : 'PENDING_VERIFY';
    return {
      id: claim.id,
      orderId: claim.orderId,
      title: '24h 爆仓保',
      principal: Number(order?.principal ?? 0),
      principalCurrency: 'USDT',
      leverage: Number(order?.leverage ?? 0),
      premiumPaid,
      payoutCap,
      payoutCurrency: 'USDC',
      coverageStart,
      coverageEnd,
      createdAt,
      accountRef: null,
      status,
      orderRef: order?.orderRef || null,
      exchange: order?.exchange || null,
      symbol: order?.pair || null,
      side: null,
      size: null,
      liquidationTime: null,
      isLiquidated: null,
      pnl: null,
      evidenceId: null,
      payoutSuggest: null,
      payoutEligibleAt: null,
    };
  }

  toVerifiedClaimDetail(orderId: string, claimId: string, orderRef: string, verify: { eligible: boolean; payout: number; currency: string; evidence: { type: string; time: string; pair: string }; expiresAt?: string; evidenceId?: string }): any {
    const order = this.orderService.getOrder(orderId);
    const base = this.toClaimDetail(claimId) || { id: claimId, orderId };
    const status: 'PENDING_VERIFY' | 'WAITING_PAYOUT' | 'PAID' = verify.eligible ? 'WAITING_PAYOUT' : 'PENDING_VERIFY';
    return {
      ...base,
      orderRef: orderRef || base.orderRef || null,
      exchange: order?.exchange || 'OKX',
      symbol: verify.evidence?.pair || order?.pair || null,
      liquidationTime: verify.evidence?.time || null,
      isLiquidated: Boolean(verify.eligible),
      payoutSuggest: Number(verify.payout || 0),
      payoutEligibleAt: verify.expiresAt || null,
      evidenceId: verify.evidenceId || null,
      status,
    };
  }

  getTokenByClaimId(claimId: string): string | undefined {
    for (const [token, cid] of this.claimTokens.entries()) {
      if (cid === claimId) return token;
    }
    return undefined;
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
