#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PYTHON_SCRIPT="${SCRIPT_DIR}/okx_liquidation_verifier.py"
DEFAULT_OUT_DIR="${REPO_ROOT}/data/evidence"
ENV_FILE="${REPO_ROOT}/env/okx.env"

# 设置OKX API凭证
# 请在运行前替换为您的实际API凭证
if [ -f "${ENV_FILE}" ]; then
    # shellcheck disable=SC1090
    set -a && source "${ENV_FILE}" && set +a
fi

# 使用说明
if [ $# -lt 1 ]; then
    echo "使用方法: $0 <ordId> [instId] [输出目录]"
    echo "例如: $0 123456789"
    echo "      $0 123456789 BTC-USDT-SWAP"
    echo "      $0 123456789 BTC-USDT-SWAP /root/evidence"
    exit 1
fi

ORD_ID=$1
INST_ID=${2:-}
OUT_DIR=${3:-"${DEFAULT_OUT_DIR}/${ORD_ID}"}

# 创建输出目录
mkdir -p "$OUT_DIR"

if [ -z "$INST_ID" ]; then
    echo "开始验证订单: $ORD_ID (将自动检测合约类型)"
else
    echo "开始验证订单: $ORD_ID, 合约: $INST_ID"
fi
echo "输出目录: $OUT_DIR"

echo "正在运行验证器..."

# 构建命令，根据是否提供了instId
if [ -z "$INST_ID" ]; then
    python3 "${PYTHON_SCRIPT}" \
        --ordId "$ORD_ID" \
        --out "$OUT_DIR" \
        --csv "$OUT_DIR/verification_summary.csv"
else
    python3 "${PYTHON_SCRIPT}" \
        --ordId "$ORD_ID" \
        --instId "$INST_ID" \
        --out "$OUT_DIR" \
        --csv "$OUT_DIR/verification_summary.csv"
fi

if [ $? -eq 0 ]; then
    echo "验证成功完成!"
    echo "验证结果文件:"
    echo "- 摘要: $OUT_DIR/summary.json"
    echo "- 索引: $OUT_DIR/index.json"
    echo "- Merkle根: $OUT_DIR/merkle.json"
    echo "- CSV摘要: $OUT_DIR/verification_summary.csv"
    echo "- 错误信息(如果有): $OUT_DIR/error.json"
    
    # 显示Merkle根（验证结果的关键）
    if [ -f "$OUT_DIR/merkle.json" ]; then
        echo "\nMerkle根信息:"
        cat "$OUT_DIR/merkle.json" | grep merkleRoot
    fi
    
    # 显示验证结果
    if [ -f "$OUT_DIR/index.json" ]; then
        echo "\n验证结果摘要:"
        cat "$OUT_DIR/index.json"
    fi
else
    echo "验证失败，请查看错误信息。"
    if [ -f "$OUT_DIR/error.json" ]; then
        echo "错误详情:"
        cat "$OUT_DIR/error.json"
    fi
fi
