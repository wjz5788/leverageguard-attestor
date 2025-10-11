# LeverSafe 爆仓保险计算器说明 (LeverSafe Liquidation Insurance Calculator)

本文档概述 `src/apps/leversafe_calculator/` 下的爆仓保险计算工具，包括文件结构、公式实现、使用方式与扩展建议，方便在更大系统中集成或复用。

## 1. 文件结构 (File Structure)

- `leversafe_calculator.py`：Python 计算核心与 CLI 输出 (`src/apps/leversafe_calculator/leversafe_calculator.py`)
- `insurance_calc.html`：纯前端静态页面，包含等价的 JavaScript 计算逻辑 (`src/apps/leversafe_calculator/insurance_calc.html`)
- `README_leversafe_calculator.md`：项目内嵌说明 (`src/apps/leversafe_calculator/README_leversafe_calculator.md`)

## 2. 计算模型 (Computation Model)

### 2.1 保费 (Premium)

```
premium_ratio = min(0.15, 0.05 + (leverage - 20) * 0.001 + (principal / 500) * 0.02)
premium = premium_ratio * principal
```

- 基础费率 5%
- 杠杆每 +1 ⇒ 费率 +0.1%
- 本金每 +500 ⇒ 费率 +2%
- 保费比例上限 15%

### 2.2 赔付比例 (Payout Ratio)

```
base = 0.25 + (leverage - 50) * 0.005 - (principal / 500) * 0.1
payout_ratio = min(0.5, max(0.1, base))
payout = payout_ratio * principal
```

- 赔付比例下限 10%，上限 50%
- 50 倍杠杆基线 25%
- 杠杆每 +1 ⇒ 比例 +0.5%
- 本金每 +500 ⇒ 比例 −10%

### 2.3 同步实现 (Parity Between Frontend & Backend)

前端 `calculateInsurance()` 与 Python 后端 `calculate_premium()`/`calculate_payout_ratio()`/`calculate_payout()` 按同一公式实现，确保任一端计算结果一致。

```python
# src/apps/leversafe_calculator/leversafe_calculator.py
def calculate_premium(principal: float, leverage: float) -> Tuple[float, float]:
    rate = 0.05 + (leverage - 20) * 0.001 + (principal / 500) * 0.02
    rate = min(0.15, max(0.0, rate))
    return round(rate * principal, 2), round(rate * 100, 2)

def calculate_payout(principal: float, leverage: float) -> Tuple[float, float]:
    ratio = 0.25 + (leverage - 50) * 0.005 - (principal / 500) * 0.1
    ratio = max(0.1, min(0.5, ratio))
    return round(ratio * 100, 2), round(ratio * principal, 2)
```

```javascript
// src/apps/leversafe_calculator/insurance_calc.html
const basePremiumRatio = 0.05 + (leverage - 20) * 0.001 + (principal / 500) * 0.02;
const premiumRatio = Math.min(0.15, basePremiumRatio);
const premium = Math.max(premiumRatio, 0) * principal;

const basePayoutRatio = 0.25 + (leverage - 50) * 0.005 - (principal / 500) * 0.1;
const payoutRatio = Math.min(0.5, Math.max(0.1, basePayoutRatio));
const payout = payoutRatio * principal;
```

## 3. 使用指南 (Usage)

### 3.1 Python CLI

```bash
cd src/apps/leversafe_calculator
python leversafe_calculator.py                  # 运行预设案例
python leversafe_calculator.py --principal 120 --leverage 35
```

输出包括本金、杠杆、保费、赔付比例与赔付金额。参数超出区间 (本金 50–500, 杠杆 1–200) 会触发 `ValidationError`。

### 3.2 前端页面

1. 打开 `insurance_calc.html`
2. 输入本金、杠杆
3. 点击“计算保险”或按 Enter
4. 页面即刻显示保费、赔付比例、赔付金额

## 4. 预设测试 (Preset Cases)

| Principal (USDT) | Leverage | Premium (USDT) | Payout Ratio | Payout (USDT) |
|------------------|----------|----------------|--------------|---------------|
| 100              | 20       | 5.40           | 10.0%        | 10.00         |
| 500              | 100      | 75.00          | 40.0%        | 200.00        |
| 100              | 100      | 13.40          | 48.0%        | 48.00         |

## 5. 注意事项 (Notes)

1. 本金限制 50–500 USDT，杠杆 1–200 倍
2. 前端只进行静态计算，无需依赖后端即可演示
3. Python 模块可作为 REST API 或微服务的核心逻辑
4. 需要持久化或多用户管理时，可在现有计算函数外封装服务层

## 6. 后续扩展 (Extensions)

1. 忠诚度或会员等级影响保费、赔付比例
2. 更复杂的保险模型（阶梯费率、历史表现加权）
3. 交易所 API 集成，自动获取用户仓位数据
4. 使用 React / Vue / Svelte 重构 UI，提供历史记录与图表
5. 将计算逻辑抽象为共享模块，供后续智能合约或风控服务调用
