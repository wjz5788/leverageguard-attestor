// OKX 验证薄代理路由
import express, { type RequestHandler } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { evidenceStorage } from '../utils/evidenceStorage.js';

const router = express.Router();

// jp-verify 服务配置
const JP_VERIFY_BASE_URL = process.env.JP_VERIFY_BASE_URL || 'http://127.0.0.1:8082';

interface VerifyOkxRequest {
  ordId: string;
  instId: string;
  live?: boolean;
  fresh?: boolean;
  noCache?: boolean;
  keyMode?: 'inline' | 'alias';
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
  uid?: string;
  keyAlias?: string;
  exchange?: string;
  clientMeta?: {
    source: string;
    requestId: string;
  };
}

/**
 * OKX 订单验证薄代理 - 转发到 jp-verify 服务
 */
const handleVerify: RequestHandler = async (req, res) => {
  try {
    const request: VerifyOkxRequest = req.body;
    const exchange = (request.exchange || 'okx').toLowerCase();
    const keyMode = request.keyMode ?? 'inline';
    const requestId = uuidv4();
    
    console.log(`[${requestId}] 收到 OKX 验证请求:`, {
      ordId: request.ordId,
      instId: request.instId,
      exchange,
      keyMode
    });

    // 验证必填字段
    if (exchange !== 'okx') {
      return res.status(400).json({
        error: {
          code: 'UNSUPPORTED_EXCHANGE',
          msg: `暂不支持 ${exchange} 交易所的订单验证`,
          hint: '请确认 exchange 字段是否正确'
        }
      });
    }

    if (!request.ordId || !request.instId) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          msg: 'ordId 和 instId 是必填字段',
          hint: '请提供有效的订单ID和交易对'
        }
      });
    }

    if (keyMode === 'inline' && !(request.apiKey && request.secretKey && request.passphrase)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          msg: 'inline 模式下需要提供完整的 API 密钥信息',
          hint: '请提供 apiKey、secretKey 和 passphrase'
        }
      });
    }

    // 构建转发请求
    const jpVerifyRequest = {
      exchange: 'okx',
      ordId: request.ordId,
      instId: request.instId,
      live: request.live ?? true,
      fresh: request.fresh ?? true,
      noCache: request.noCache ?? true,
      keyMode,
      apiKey: request.apiKey,
      secretKey: request.secretKey,
      passphrase: request.passphrase,
      uid: request.uid,
      keyAlias: request.keyAlias,
      clientMeta: {
        source: 'us-backend',
        requestId: requestId
      }
    };

    // 生成证据ID
    const evidenceId = evidenceStorage.generateEvidenceId();

    console.log(`[${requestId}] 转发到 jp-verify: ${JP_VERIFY_BASE_URL}/api/verify`);

    // 转发请求到 jp-verify
    const response = await axios.post(
      `${JP_VERIFY_BASE_URL}/api/verify`,
      jpVerifyRequest,
      {
        timeout: 30000, // 30秒超时
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`[${requestId}] jp-verify 响应状态: ${response.status}`);

    // 保存证据到文件系统
    const evidenceData = {
      evidenceId,
      requestId,
      request: jpVerifyRequest,
      response: response.data,
      timestamp: new Date().toISOString(),
      status: response.status
    };

    try {
      const evidencePath = evidenceStorage.saveEvidence(evidenceId, evidenceData);
      console.log(`[${requestId}] 证据已保存: ${evidencePath}`);
    } catch (saveError) {
      console.error(`[${requestId}] 保存证据失败:`, saveError);
    }

    // 返回 jp-verify 的响应（包含证据ID）
    const responseWithEvidence = {
      ...response.data,
      evidenceId: evidenceId
    };
    
    res.status(response.status).json(responseWithEvidence);

  } catch (error: any) {
    console.error('OKX 验证代理错误:', error);

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          msg: 'jp-verify 服务不可用',
          hint: '请检查 jp-verify 服务是否已启动在端口 8082'
        }
      });
    }

    if (error.response) {
      // jp-verify 返回的错误
      return res.status(error.response.status).json(error.response.data);
    }

    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        error: {
          code: 'TIMEOUT',
          msg: '请求超时',
          hint: '请稍后重试或检查网络连接'
        }
      });
    }

    // 其他错误
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        msg: '内部服务器错误',
        hint: '请稍后重试'
      }
    });
  }
};

/**
 * POST /api/v1/verify/okx
 * POST /api/verify
 */
router.post('/', handleVerify);
router.post('/okx', handleVerify);

/**
 * GET /api/v1/verify/health
 * 检查 jp-verify 服务健康状态
 */
router.get('/health', async (req, res) => {
  try {
    const response = await axios.get(`${JP_VERIFY_BASE_URL}/healthz`, {
      timeout: 5000
    });

    res.json({
      service: 'jp-verify',
      status: 'healthy',
      response: response.data
    });

  } catch (error: any) {
    console.error('检查 jp-verify 健康状态失败:', error);

    res.status(503).json({
      service: 'jp-verify',
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
