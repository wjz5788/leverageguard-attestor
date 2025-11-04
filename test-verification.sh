#!/bin/bash

# LiqPass 订单验证系统自测脚本
# 测试完整闭环流程：前端→后端→jp-verify→OKX

echo "=== LiqPass 订单验证系统自测脚本 ==="
echo ""

# 检查端口占用情况
echo "1. 检查服务端口占用情况..."
if lsof -i :8080 > /dev/null 2>&1; then
    echo "✅ us-backend (8080) 端口已被占用"
else
    echo "❌ us-backend (8080) 端口未启动"
fi

if lsof -i :8082 > /dev/null 2>&1; then
    echo "✅ jp-verify (8082) 端口已被占用"
else
    echo "❌ jp-verify (8082) 端口未启动"
fi

if lsof -i :5173 > /dev/null 2>&1; then
    echo "✅ us-frontend (5173) 端口已被占用"
else
    echo "❌ us-frontend (5173) 端口未启动"
fi

echo ""

# 测试 jp-verify 健康检查
echo "2. 测试 jp-verify 健康检查..."
JP_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8082/healthz)
if [ "$JP_HEALTH" = "200" ]; then
    echo "✅ jp-verify 健康检查通过"
else
    echo "❌ jp-verify 健康检查失败 (HTTP: $JP_HEALTH)"
fi

echo ""

# 测试 us-backend 健康检查
echo "3. 测试 us-backend 健康检查..."
US_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/v1/health)
if [ "$US_HEALTH" = "200" ]; then
    echo "✅ us-backend 健康检查通过"
else
    echo "❌ us-backend 健康检查失败 (HTTP: $US_HEALTH)"
fi

echo ""

# 测试 us-backend 的 jp-verify 代理健康检查
echo "4. 测试 us-backend 的 jp-verify 代理健康检查..."
PROXY_HEALTH=$(curl -s http://127.0.0.1:8080/api/v1/verify/health | jq -r '.status' 2>/dev/null || echo "error")
if [ "$PROXY_HEALTH" = "healthy" ]; then
    echo "✅ jp-verify 代理健康检查通过"
else
    echo "❌ jp-verify 代理健康检查失败 ($PROXY_HEALTH)"
fi

echo ""

# 测试前端页面可访问性
echo "5. 测试前端页面可访问性..."
FRONTEND_ACCESS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/verify/order)
if [ "$FRONTEND_ACCESS" = "200" ]; then
    echo "✅ 前端验证页面可访问"
else
    echo "⚠️  前端验证页面访问状态: $FRONTEND_ACCESS (可能正在构建)"
fi

echo ""

# 测试订单验证 API（使用模拟数据）
echo "6. 测试订单验证 API（模拟请求）..."
TEST_REQUEST='{
  "ordId": "2940071038556348417",
  "instId": "BTC-USDT-SWAP",
  "live": true,
  "fresh": true,
  "noCache": true,
  "keyMode": "inline",
  "apiKey": "test-key",
  "secretKey": "test-secret",
  "passphrase": "test-passphrase"
}'

RESPONSE=$(curl -s -X POST http://127.0.0.1:8080/api/v1/verify/okx \
  -H "Content-Type: application/json" \
  -d "$TEST_REQUEST" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 订单验证 API 请求成功"
    # 检查响应结构
    if echo "$RESPONSE_BODY" | jq -e '.error' > /dev/null 2>&1; then
        ERROR_MSG=$(echo "$RESPONSE_BODY" | jq -r '.error.msg')
        echo "⚠️  API 返回错误: $ERROR_MSG (这是预期的，因为使用了测试密钥)"
    else
        echo "✅ API 响应结构正常"
    fi
else
    echo "❌ 订单验证 API 请求失败 (HTTP: $HTTP_CODE)"
    echo "响应: $RESPONSE_BODY"
fi

echo ""

# 检查证据文件目录
echo "7. 检查证据文件目录..."
if [ -d "reports/evidence" ]; then
    echo "✅ 证据文件目录存在"
    TODAY=$(date +%Y-%m-%d)
    if [ -d "reports/evidence/$TODAY" ]; then
        echo "✅ 今日证据目录存在"
        FILE_COUNT=$(find "reports/evidence/$TODAY" -name "*.json" | wc -l)
        echo "   今日证据文件数量: $FILE_COUNT"
    else
        echo "⚠️  今日证据目录尚未创建"
    fi
else
    echo "❌ 证据文件目录不存在"
fi

echo ""

# 检查数据库文件
echo "8. 检查数据库文件..."
if [ -f "liqpass-backend/db.sqlite" ]; then
    echo "✅ SQLite 数据库文件存在"
    # 检查表结构
    if command -v sqlite3 > /dev/null 2>&1; then
        TABLES=$(sqlite3 liqpass-backend/db.sqlite ".tables" 2>/dev/null | wc -l)
        echo "   数据库表数量: $TABLES"
    else
        echo "⚠️  sqlite3 命令未安装，无法检查表结构"
    fi
else
    echo "❌ SQLite 数据库文件不存在"
fi

echo ""

echo "=== 自测完成 ==="
echo ""
echo "下一步操作建议:"
echo "1. 启动所有服务: cd jp-verify && ./start.sh (后台) 和 cd liqpass-backend && npm run dev"
echo "2. 访问前端验证页面: http://127.0.0.1:5173/verify/order"
echo "3. 使用真实的 OKX API 密钥进行测试"
echo "4. 检查证据文件: ls -la reports/evidence/$(date +%Y-%m-%d)/"
echo ""

# 提供快速启动命令
echo "快速启动命令:"
echo "# 终端1 - 启动 jp-verify"
echo "cd /Users/zhaomosheng/Desktop/LiqPass-clean/jp-verify && ./start.sh"
echo ""
echo "# 终端2 - 启动 us-backend"
echo "cd /Users/zhaomosheng/Desktop/LiqPass-clean/liqpass-backend && npm run dev"
echo ""
echo "# 终端3 - 启动 us-frontend (如果未运行)"
echo "cd /Users/zhaomosheng/Desktop/LiqPass-clean/liqpass-frontend && npm run dev"