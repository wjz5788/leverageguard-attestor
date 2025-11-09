import express from 'express';
import { ethers } from 'ethers';
import { isAddress } from 'ethers';

const router = express.Router();

// 私钥用于签名（生产环境应该从环境变量获取）
const ISSUER_PRIVATE_KEY = process.env.ISSUER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// 合约地址（应该与前端一致）
const POLICY_ADDR = process.env.POLICY_ADDR || '0x0000000000000000000000000000000000000000';

/**
 * POST /api/v1/voucher/issue
 * 凭证发放接口 - 返回EIP-712签名凭证
 */
router.post('/issue', async (req, res) => {
  try {
    const { 
      wallet, 
      quoteId, 
      inputHash, 
      price, 
      maxPayout, 
      durationHours, 
      deadline, 
      chainId, 
      contractAddr,
      skuId,
      quoteSig 
    } = req.body;
    
    // 验证必填字段
    const requiredFields = ['wallet', 'quoteId', 'inputHash', 'price', 'maxPayout', 'durationHours', 'deadline', 'chainId', 'contractAddr', 'quoteSig'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `缺少必要参数: ${missingFields.join(', ')}`
      });
    }

    // 验证钱包地址
    if (!isAddress(wallet)) {
      return res.status(400).json({
        error: '无效的钱包地址'
      });
    }

    // 验证合约地址
    if (!isAddress(contractAddr)) {
      return res.status(400).json({
        error: '无效的合约地址'
      });
    }

    // 验证报价签名（可选，根据业务需求）
    // 这里可以添加报价签名的验证逻辑

    // 生成凭证ID
    const voucherId = ethers.hexlify(ethers.randomBytes(32));
    
    // 设置凭证过期时间（24小时）
    const voucherDeadline = Math.floor(Date.now() / 1000) + 86400;
    
    // 构建凭证数据
    const voucher = {
      wallet: wallet.toLowerCase(),
      quoteId,
      inputHash,
      price,
      maxPayout,
      durationHours: parseInt(durationHours),
      voucherId,
      deadline: voucherDeadline.toString(),
      chainId,
      contractAddr,
      skuId: skuId || 101
    };

    // EIP-712域数据
    const domain = {
      name: 'LiqPass',
      version: '1',
      chainId: parseInt(chainId),
      verifyingContract: contractAddr
    };

    // 凭证类型定义
    const types = {
      Voucher: [
        { name: 'wallet', type: 'address' },
        { name: 'quoteId', type: 'bytes32' },
        { name: 'inputHash', type: 'bytes32' },
        { name: 'price', type: 'uint96' },
        { name: 'maxPayout', type: 'uint96' },
        { name: 'durationHours', type: 'uint32' },
        { name: 'voucherId', type: 'bytes32' },
        { name: 'deadline', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
        { name: 'contractAddr', type: 'address' }
      ]
    };

    // 创建签名者
    const signer = new ethers.Wallet(ISSUER_PRIVATE_KEY);
    
    // 生成EIP-712签名
    const voucherSig = await signer.signTypedData(domain, types, voucher);

    // 生成幂等键
    const idempotencyKey = ethers.hexlify(ethers.randomBytes(16));

    res.json({
      success: true,
      data: {
        idempotencyKey,
        voucher,
        voucherSig
      }
    });

  } catch (error: any) {
    console.error('凭证发放失败:', error);
    res.status(500).json({
      error: error.message || '凭证发放失败'
    });
  }
});

/**
 * GET /api/v1/voucher/verify
 * 凭证验证接口 - 验证凭证有效性
 */
router.get('/verify', async (req, res) => {
  try {
    const { voucherId, voucherSig } = req.query;
    
    if (!voucherId || !voucherSig) {
      return res.status(400).json({
        error: '缺少凭证ID或签名'
      });
    }

    // 这里可以添加凭证验证逻辑
    // 例如检查凭证是否过期、是否已被使用等
    
    res.json({
      success: true,
      data: {
        valid: true,
        message: '凭证有效'
      }
    });

  } catch (error: any) {
    console.error('凭证验证失败:', error);
    res.status(500).json({
      error: error.message || '凭证验证失败'
    });
  }
});

export default router;