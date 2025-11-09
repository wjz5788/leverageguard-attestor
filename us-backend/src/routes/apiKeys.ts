import express, { type RequestHandler } from 'express';
import ApiKeyService, { ApiKeyServiceError } from '../services/apiKeyService.js';
import type { CreateApiKeyRequest, VerifyApiKeyRequest, ExchangeType } from '../models/apiKey.js';

const router = express.Router();

/**
 * 获取当前用户ID的辅助函数
 * 从认证中间件中获取用户ID
 */
function getCurrentUserId(req: express.Request): string | null {
  const authUser = (req as any).auth;
  // EnhancedAuth 中间件格式
  if (authUser && authUser.authInfo && authUser.authInfo.type === 'user') {
    return authUser.authInfo.id as string;
  }
  // 传统 AuthMiddleware（AuthenticatedUser）格式
  if (authUser && typeof authUser.userId === 'string') {
    return authUser.userId as string;
  }
  return null;
}

/**
 * POST /api/api-keys
 * 保存或更新API密钥（幂等操作）
 */
const saveApiKey: RequestHandler = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: '需要有效身份凭证' }
      });
    }
    const request: CreateApiKeyRequest = req.body;

    // 验证请求体
    if (!request.exchange || !request.api_key || !request.secret || !request.passphrase) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'exchange、api_key、secret和passphrase都是必填字段'
        }
      });
    }

    const apiKeyService = new ApiKeyService();
    const result = await apiKeyService.saveApiKey(userId, request);

    res.status(200).json({
      success: true,
      message: 'API密钥保存成功',
      data: {
        id: result.id,
        exchange: result.exchange,
        status: result.status,
        created_at: result.created_at,
        updated_at: result.updated_at
      }
    });

  } catch (error: any) {
    console.error('保存API密钥失败:', error);

    if (error instanceof ApiKeyServiceError) {
      return res.status(400).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: '内部服务器错误'
      }
    });
  }
};

/**
 * GET /api/api-keys
 * 获取用户的API密钥列表（脱敏）
 */
const getApiKeys: RequestHandler = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: '需要有效身份凭证' }
      });
    }
    const apiKeyService = new ApiKeyService();
    const apiKeys = await apiKeyService.getUserApiKeys(userId);

    res.status(200).json({
      success: true,
      data: apiKeys
    });

  } catch (error: any) {
    console.error('获取API密钥列表失败:', error);

    if (error instanceof ApiKeyServiceError) {
      return res.status(400).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: '内部服务器错误'
      }
    });
  }
};

/**
 * POST /api/api-keys/verify
 * 验证API密钥（调用jp-verify服务）
 */
const verifyApiKey: RequestHandler = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: '需要有效身份凭证' }
      });
    }
    const request: VerifyApiKeyRequest = req.body;

    // 验证请求体
    if (!request.exchange) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'exchange是必填字段'
        }
      });
    }

    const apiKeyService = new ApiKeyService();
    const result = await apiKeyService.verifyApiKey(userId, request);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('验证API密钥失败:', error);

    if (error instanceof ApiKeyServiceError) {
      return res.status(400).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: '内部服务器错误'
      }
    });
  }
};

/**
 * DELETE /api/api-keys/:exchange
 * 删除指定交易所的API密钥
 */
const deleteApiKey: RequestHandler = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: '需要有效身份凭证' }
      });
    }
    const exchange = req.params.exchange;

    if (!exchange) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'exchange参数是必填的'
        }
      });
    }

    const apiKeyService = new ApiKeyService();
    const deleted = await apiKeyService.deleteApiKey(userId, exchange as ExchangeType);

    if (deleted) {
      res.status(200).json({
        success: true,
        message: 'API密钥删除成功'
      });
    } else {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: '未找到要删除的API密钥'
        }
      });
    }

  } catch (error: any) {
    console.error('删除API密钥失败:', error);

    if (error instanceof ApiKeyServiceError) {
      return res.status(400).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: '内部服务器错误'
      }
    });
  }
};

// 注册路由
router.post('/', saveApiKey);
router.get('/', getApiKeys);
router.post('/verify', verifyApiKey);
router.delete('/:exchange', deleteApiKey);

export default router;
