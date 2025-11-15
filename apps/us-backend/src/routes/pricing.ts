import express from 'express';
import { ethers } from 'ethers';
import { z } from 'zod';

const router = express.Router();

// 私钥用于签名（生产环境应该从环境变量获取）
const PRICER_PRIVATE_KEY = process.env.PRICER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// 合约地址（应该与前端一致）
const POLICY_ADDR = process.env.CHECKOUT_CONTRACT_ADDRESS || process.env.CHECKOUT_ADDR || process.env.POLICY_ADDR || '0xC423C34b57730Ba87FB74b99180663913a345D68';

/**
 * POST /api/v1/pricing/quote
 * 定价报价接口 - 返回EIP-712签名报价
 */
const quoteSchema = z.object({
  principal: z.number().positive(),
  leverage: z.number().positive(),
  durationHours: z.number().int().positive().optional(),
  skuId: z.number().int().positive().optional(),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

router.post('/quote', async (req, res) => {
  try {
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'INVALID_REQUEST', issues: parsed.error.issues });
    }
    const { principal, leverage, durationHours, skuId, wallet } = parsed.data;

    // 计算保费（简化版，实际应该根据产品逻辑计算）
    const baseFee = Math.min(0.15, 0.05 + (leverage - 20) * 0.001 + (principal / 500) * 0.02);
    const feeRatio = Math.min(0.15, baseFee);
    const price = Math.round(principal * feeRatio * 1_000_000); // 转换为6位小数
    
    const maxPayout = Math.round(principal * Math.min(0.5, Math.max(0.1, 0.25 + (leverage - 50) * 0.005 - (principal / 500) * 0.1)) * 1_000_000);

    // 生成唯一ID
    const quoteId = ethers.hexlify(ethers.randomBytes(32));
    const inputHash = ethers.keccak256(ethers.toUtf8Bytes(`${wallet}-${principal}-${leverage}-${Date.now()}`));
    
    // 设置过期时间（5分钟）
    const deadline = Math.floor(Date.now() / 1000) + 300;
    
    // 构建报价数据
    const quote = {
      wallet: wallet.toLowerCase(),
      inputHash,
      price: price.toString(),
      maxPayout: maxPayout.toString(),
      durationHours: durationHours || 24,
      quoteId,
      deadline: deadline.toString(),
      chainId: '8453', // Base主网
      contractAddr: POLICY_ADDR,
      skuId: skuId || 101
    };

    // EIP-712域数据
    const domain = {
      name: 'LiqPass',
      version: '1',
      chainId: 8453,
      verifyingContract: POLICY_ADDR
    };

    // 报价类型定义
    const types = {
      Quote: [
        { name: 'wallet', type: 'address' },
        { name: 'inputHash', type: 'bytes32' },
        { name: 'price', type: 'uint96' },
        { name: 'maxPayout', type: 'uint96' },
        { name: 'durationHours', type: 'uint32' },
        { name: 'quoteId', type: 'bytes32' },
        { name: 'deadline', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
        { name: 'contractAddr', type: 'address' }
      ]
    };

    // 创建签名者
    const signer = new ethers.Wallet(PRICER_PRIVATE_KEY);
    
    // 生成EIP-712签名
    const quoteSig = await signer.signTypedData(domain, types, quote);

    // 生成幂等键
    const idempotencyKey = ethers.hexlify(ethers.randomBytes(16));

    // 与前端约定：直接返回顶层 quote/quoteSig，便于消费
    res.json({ success: true, idempotencyKey, quote, quoteSig });

  } catch (error: any) {
    console.error('定价报价失败:', error);
    res.status(500).json({ ok: false, error: error.message || '定价报价失败' });
  }
});

export default router;
/**
 * 追加：临时quoteHash注册接口
 * 用于在支付前由合约owner注册一个短期有效的quoteHash，满足合约校验
 */
const quoteHashSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amountUSDC: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  ttlSec: z.number().int().positive().max(3600).optional()
});

router.post('/quote-hash', async (req, res) => {
  try {
    const parsed = quoteHashSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'INVALID_REQUEST', issues: parsed.error.issues });
    }
    const { wallet, amountUSDC, ttlSec } = parsed.data;

    const rpc = process.env.BASE_RPC;
    const ownerPk = process.env.CHECKOUT_OWNER_PRIVATE_KEY || process.env.ISSUER_PRIVATE_KEY;
    const checkoutAddr = process.env.CHECKOUT_CONTRACT_ADDRESS || process.env.CHECKOUT_ADDR || process.env.POLICY_ADDR || '0xC423C34b57730Ba87FB74b99180663913a345D68';

    if (!rpc || !ownerPk) {
      return res.status(500).json({ ok: false, error: 'SERVER_CONFIG_MISSING', hint: '需要配置 BASE_RPC 与 ISSUER_PRIVATE_KEY' });
    }

    const provider = new ethers.JsonRpcProvider(rpc);
    const signer = new ethers.Wallet(ownerPk, provider);

    const checkoutAbi = [
      'function registerQuoteHash(bytes32 quoteHash,uint256 expiryTime) external',
      'function isValidQuoteHash(bytes32 quoteHash) view returns (bool)'
    ];
    const checkout = new ethers.Contract(checkoutAddr, checkoutAbi, signer);

    const nowSec = Math.floor(Date.now() / 1000);
    const expiry = nowSec + (ttlSec ?? 600);

    const salt = ethers.hexlify(ethers.randomBytes(16));
    const amtStr = (amountUSDC ?? '').toString();
    const quoteHash = ethers.keccak256(ethers.toUtf8Bytes(`${wallet.toLowerCase()}:${amtStr}:${salt}:${nowSec}`));

    const tx = await checkout.registerQuoteHash(quoteHash, expiry);
    const receipt = await tx.wait();

    const valid = await checkout.isValidQuoteHash(quoteHash);
    if (!valid) {
      return res.status(500).json({ ok: false, error: 'REGISTER_FAILED' });
    }

    return res.json({ ok: true, data: { quoteHash, expiry, txHash: receipt?.hash ?? tx.hash } });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || 'quote-hash 注册失败' });
  }
});
