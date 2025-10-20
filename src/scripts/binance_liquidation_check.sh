#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PYTHON_SCRIPT="${SCRIPT_DIR}/binance_liquidation_checker.py"
ENV_FILE="${REPO_ROOT}/env/binance.env"
DEFAULT_EVIDENCE_DIR="${REPO_ROOT}/data/evidence"

# 检查参数
if [ $# -ne 2 ]; then
    echo "使用方法: $0 <订单ID> <交易对>"
    echo "示例: $0 123456789 BTCUSDT"
    echo "注意: 请先在 env/binance.env 文件或环境变量中设置正确的API密钥"
    exit 1
fi

ORDER_ID=$1
SYMBOL=$2
shift 2

# 检查是否有额外参数
if [ $# -gt 0 ]; then
    echo "错误: 不支持额外参数"
    echo "使用方法: $0 <订单ID> <交易对>"
    echo "注意: 请先在 env/binance.env 文件或环境变量中设置正确的API密钥"
    exit 1
fi

# 显示信息
echo "==================================="
echo "币安实盘爆仓逻辑验证器"
echo "==================================="
echo "验证订单ID: $ORDER_ID"
echo "交易对: $SYMBOL"
echo "使用实盘API环境"
echo "API凭证文件: ${ENV_FILE}"
echo "==================================="

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3，请安装后再试"
    exit 1
fi

# 检查脚本是否存在
if [ ! -f "${PYTHON_SCRIPT}" ]; then
    echo "错误: 未找到验证脚本 ${PYTHON_SCRIPT}"
    exit 1
fi

# 加载binance.env文件（如果存在）
if [ -f "${ENV_FILE}" ]; then
    echo "加载 ${ENV_FILE} 中的币安实盘API凭证..."
    # shellcheck disable=SC1090
    set -a && source "${ENV_FILE}" && set +a
fi

# 验证必要的环境变量是否已设置
if [ -z "${BINANCE_API_KEY:-}" ] || [ -z "${BINANCE_SECRET_KEY:-}" ]; then
    echo "错误: 未检测到 BINANCE_API_KEY/BINANCE_SECRET_KEY"
    echo "请在环境变量或 ${ENV_FILE} 中设置正确的API密钥"
    exit 1
fi

# 安装依赖（如果需要）
echo "检查依赖..."
python3 -m pip install --quiet requests python-dotenv

# 执行验证
echo "开始执行验证..."
python3 "${PYTHON_SCRIPT}" --ordId "$ORDER_ID" --symbol "$SYMBOL" --verbose

# 检查结果
if [ $? -eq 0 ]; then
    echo "==================================="
    echo "验证完成！"
    echo "结果保存在: ${DEFAULT_EVIDENCE_DIR}/binance_${ORDER_ID}/"
    echo "==================================="
else
    echo "==================================="
    echo "验证失败，请查看错误信息"
    echo "==================================="
    exit 1
fi
