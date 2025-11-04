import { v4 as uuid } from 'uuid';
import { PaymentProof, PaymentStatus } from '../types/orders.js';

export class PaymentProofError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message);
    this.name = 'PaymentProofError';
  }
}

export interface PaymentProofInput {
  orderId: string;
  chainId: string;
  token: string;
  fromAddr: string;
  toAddr: string;
  amountMinUnit: string;
  amountUsdc: number;
  txHash: string;
}

export interface PaymentProofValidationResult {
  isValid: boolean;
  proof?: PaymentProof;
  error?: string;
}

export default class PaymentProofService {
  private readonly proofs = new Map<string, PaymentProof>();
  private readonly orderProofIndex = new Map<string, string>(); // orderId -> proofId
  private readonly txHashIndex = new Map<string, string>(); // txHash -> proofId

  /**
   * 创建支付证明
   */
  createProof(input: PaymentProofInput): PaymentProof {
    // 检查交易哈希是否已存在
    if (this.txHashIndex.has(input.txHash)) {
      throw new PaymentProofError('TX_HASH_EXISTS', 'Transaction hash already exists');
    }

    // 检查订单是否已有支付证明
    if (this.orderProofIndex.has(input.orderId)) {
      throw new PaymentProofError('ORDER_ALREADY_PAID', 'Order already has a payment proof');
    }

    const proofId = `pay_${uuid()}`;
    const nowIso = new Date().toISOString();

    const proof: PaymentProof = {
      id: proofId,
      orderId: input.orderId,
      chainId: input.chainId,
      token: input.token,
      fromAddr: input.fromAddr.toLowerCase(),
      toAddr: input.toAddr.toLowerCase(),
      amountMinUnit: input.amountMinUnit,
      amountUsdc: input.amountUsdc,
      txHash: input.txHash,
      status: 'pending',
      createdAt: nowIso
    };

    this.proofs.set(proofId, proof);
    this.orderProofIndex.set(input.orderId, proofId);
    this.txHashIndex.set(input.txHash, proofId);

    return proof;
  }

  /**
   * 验证支付证明
   */
  async validateProof(proofId: string): Promise<PaymentProofValidationResult> {
    const proof = this.proofs.get(proofId);
    if (!proof) {
      return { isValid: false, error: 'Payment proof not found' };
    }

    // 模拟链上验证（实际实现需要连接区块链节点）
    try {
      // 这里应该调用区块链RPC验证交易
      // 暂时模拟验证逻辑
      const isValid = await this.simulateChainValidation(proof);
      
      if (isValid) {
        proof.status = 'paid';
        proof.confirmedAt = new Date().toISOString();
        return { isValid: true, proof };
      } else {
        proof.status = 'failed';
        return { isValid: false, error: 'Transaction validation failed' };
      }
    } catch (error) {
      return { isValid: false, error: 'Validation error: ' + error.message };
    }
  }

  /**
   * 获取订单的支付证明
   */
  getProofByOrderId(orderId: string): PaymentProof | undefined {
    const proofId = this.orderProofIndex.get(orderId);
    return proofId ? this.proofs.get(proofId) : undefined;
  }

  /**
   * 获取交易哈希对应的支付证明
   */
  getProofByTxHash(txHash: string): PaymentProof | undefined {
    const proofId = this.txHashIndex.get(txHash);
    return proofId ? this.proofs.get(proofId) : undefined;
  }

  /**
   * 更新支付证明状态
   */
  updateProofStatus(proofId: string, status: PaymentStatus, blockNumber?: string): PaymentProof | undefined {
    const proof = this.proofs.get(proofId);
    if (!proof) {
      return undefined;
    }

    proof.status = status;
    if (status === 'confirmed' && blockNumber) {
      proof.blockNumber = blockNumber;
      proof.confirmedAt = new Date().toISOString();
    }

    return proof;
  }

  /**
   * 模拟链上验证（实际实现需要替换为真实的区块链RPC调用）
   */
  private async simulateChainValidation(proof: PaymentProof): Promise<boolean> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 基础验证逻辑
    if (!proof.txHash.startsWith('0x') || proof.txHash.length !== 66) {
      return false;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(proof.fromAddr)) {
      return false;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(proof.toAddr)) {
      return false;
    }

    // 模拟交易确认检查
    return Math.random() > 0.1; // 90%成功率模拟
  }

  /**
   * 批量验证支付证明
   */
  async validateProofsBatch(proofIds: string[]): Promise<PaymentProofValidationResult[]> {
    const results: PaymentProofValidationResult[] = [];
    
    for (const proofId of proofIds) {
      const result = await this.validateProof(proofId);
      results.push(result);
    }
    
    return results;
  }

  /**
   * 获取所有支付证明
   */
  listProofs(): PaymentProof[] {
    return Array.from(this.proofs.values());
  }

  /**
   * 清理过期的支付证明（用于内存管理）
   */
  cleanupExpiredProofs(maxAgeHours: number = 24): number {
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [proofId, proof] of this.proofs.entries()) {
      const proofTime = new Date(proof.createdAt).getTime();
      if (proofTime < cutoffTime) {
        this.proofs.delete(proofId);
        this.orderProofIndex.delete(proof.orderId);
        this.txHashIndex.delete(proof.txHash);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}