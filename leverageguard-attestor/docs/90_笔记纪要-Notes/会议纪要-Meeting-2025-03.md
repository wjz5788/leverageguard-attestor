# 讨论3\n\n这是讨论��内容。
结论先说：**用这段代码，OKX 的“订单详情 + 成交历史”是可以拿到的**（前提：API Key 权限正确、签名无误、IP 白名单匹配）。不过你这份脚本里有几处“上线就容易出问题/判断不准”的点，建议立刻改一改——我给你点对点地标出来，并附上可直接替换的关键函数。

---

## 先提醒（非常重要）

你把 **API_KEY / API_SECRET / PASSPHRASE** 明文贴出来了。**请立即到 OKX 后台把这组 Key 删除并重新生成仅“只读权限 + 绑定固定出口 IP”的新 Key。**
以后用**环境变量**加载，别写进代码。否则不管你只读还是交易权限，泄漏了都很危险。

---

## 这份代码能用，但有 6 个“上线级问题”

1. **签名拼接的 query 未 URL 编码 & 未与真实请求 100% 一致**
   你手动 `"&".join([f"{k}={v}"])`，一旦参数值里出现需要编码的字符（或顺序不一致），就会出现 `Invalid Sign`。

2. **成交“价值”计算不对**
   OKX SWAP 的 `fillSz` 通常是**合约张数**，不是币的数量；要用 **ctVal（合约面值）** 折算：
   **名义价值（USDT）≈ fillSz × ctVal × fillPx**。否则你用 `fillSz * fillPx` 会把“是否达到 MIN_VALUE_USDT”的判断完全搞偏。

3. **“爆仓”判断逻辑不准**
   “盈亏为负”≠“爆仓”。应至少叠加以下信号之一：

* 私有订单/账单里出现**清算/强平/ADL** 类目；
* 同时段**公共清算流**有该合约清算洪峰（用于侧证）；
* 持仓快照从>0 → 0，且账单出现强平费用/触发记录。
  （你的脚本现在只是看了 `fillPnl < 0`。）

4. **未做分页**
   `fills-history` 限制条数（你设了 `limit=100`）。大单/高频单常常超过 100 条，你需要基于 `before/after` 游标分页拉全，否则统计不完整。

5. **并发限频不稳**
   `ThreadPoolExecutor + 每单末尾 sleep` 不够精细。建议按**每秒请求数**做全局限速，或者对每个端点设桶（token bucket），避免偶发 429/限频封禁。

6. **明文写 Key**
   前面说了，必须换成环境变量 + .env + 只读 + IP 白名单。

---

## 直接替换：更稳的 4 个关键函数

### A. 安全加载配置 & 统一编码签名

```python
import os, json, hmac, base64, hashlib
from urllib.parse import urlencode

BASE_URL = "https://www.okx.com"
API_KEY = os.getenv("OKX_API_KEY")
API_SECRET = os.getenv("OKX_SECRET")
PASSPHRASE = os.getenv("OKX_PASSPHRASE")

def get_iso_timestamp():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")

def okx_sign(ts, method, path_with_query, body, secret_key):
    prehash = f"{ts}{method.upper()}{path_with_query}{body or ''}"
    mac = hmac.new(secret_key.encode(), prehash.encode(), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode()

def okx_request(method, request_path, params=None, body_dict=None, timeout=10):
    # 1) 用 urlencode 生成和实际请求一致的 query
    query = ""
    if params:
        query = "?" + urlencode(params, doseq=True, safe=":/")
    path_with_query = request_path + query

    body = json.dumps(body_dict) if (body_dict and method.upper() != "GET") else ""
    ts = get_iso_timestamp()
    sign = okx_sign(ts, method, path_with_query, body, API_SECRET)

    headers = {
        "OK-ACCESS-KEY": API_KEY,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": PASSPHRASE,
        "Content-Type": "application/json",
        # "x-simulated-trading": "1",  # 如需模拟盘可开启
    }
    import requests
    url = BASE_URL + path_with_query
    r = requests.request(method, url, headers=headers, data=body, timeout=timeout)
    try:
        return r.json()
    except Exception:
        return {"code": "error", "msg": r.text}
```

### B. 获取 `ctVal` 并缓存（用于正确计算名义价值）

```python
_ctval_cache = {}

def get_ctval(inst_id):
    if inst_id in _ctval_cache:
        return _ctval_cache[inst_id]
    data = okx_request("GET", "/api/v5/public/instruments", params={"instType":"SWAP", "instId": inst_id})
    if data.get("code") == "0" and data.get("data"):
        ctval = float(data["data"][0]["ctVal"])  # 合约面值（以标的计价）
        # 线性合约通常 ctVal * price ≈ USDT 面值
        _ctval_cache[inst_id] = ctval
        return ctval
    # 兜底：如果取不到，先按 1 处理，避免崩溃（但会低估名义）
    _ctval_cache[inst_id] = 1.0
    return 1.0
```

### C. 成交分页拉取（避免漏单）

```python
def list_fills_all(inst_id, order_id, page_limit=100, max_pages=20):
    fills = []
    after = None
    for _ in range(max_pages):
        params = {"instType":"SWAP", "instId":inst_id, "ordId":order_id, "limit": page_limit}
        if after: params["after"] = after
        data = okx_request("GET", "/api/v5/trade/fills-history", params=params)
        if data.get("code") != "0":  # 失败
            return fills, data.get("msg", "Unknown error")
        batch = data.get("data", [])
        if not batch:
            break
        fills.extend(batch)
        # OKX 翻页用 before/after（返回里通常有 ts 或 id），简单用最后一条的 ts 作为游标
        after = batch[-1].get("ts")
        if len(batch) < page_limit:
            break
    return fills, None
```

### D. 更靠谱的“爆仓迹象”判断（账单/持仓 + 公共清算）

> 这里保持“轻量级 HTTP 版”。真正严谨建议后续接入 **私有 WS 的订单/持仓推送**，直接用 `category`/强平标识判断。

```python
def detect_liquidation_signals(inst_id, t_start_ms, t_end_ms, min_notional_usdt, fills):
    """
    返回：has_liq(bool), signals(list[str])
    - 账单中出现清算/ADL/强平费用
    - 同期公共清算有该 instId 的量
    - 持仓从>0 -> 0（需要你自行在主流程前后抓一次 positions）
    这里只给出“账单 + 公共清算”的 HTTP 版骨架。
    """
    signals = []

    # 1) 账单检查
    bills = okx_request("GET", "/api/v5/account/bills-archive", params={"instType":"SWAP","instId":inst_id,"limit":100})
    if bills.get("code") == "0":
        for b in bills.get("data", []):
            ts = int(b.get("ts", 0))
            # b["type"] / b["subType"] 中会出现 liquidation / adl / funding 等关键字（具体值以返回为准）
            typ = (b.get("type") or "") + "/" + (b.get("subType") or "")
            if t_start_ms <= ts <= t_end_ms and ("liq" in typ.lower() or "adl" in typ.lower()):
                signals.append(f"account bill: {typ} at {ts}")

    # 2) 公共清算侧证（OKX 有公共清算频道，HTTP 历史不稳定；这里留一个占位提示）
    # 你可以在后端同时订阅公共清算 WS，把该时间窗的摘要写入本地，再在这里读取对照。
    # signals.append("public liquidation peak matched")  # 匹配上再加

    # 3) 任一成交名义 >= min_notional_usdt（结合合约面值更准确）
    ctval = get_ctval(inst_id)
    for f in fills:
        notional = float(f["fillSz"]) * ctval * float(f["fillPx"])
        if notional >= min_notional_usdt and float(f.get("fillPnl", 0)) < 0:
            signals.append(f"big negative fill notional≈{int(notional)}")

    return (len(signals) > 0), signals
```

---

## 把你的主逻辑轻改一下（关键三处）

* 用 **`list_fills_all`** 取全成交；
* 用 **`ctVal`** 计算名义价值；
* 用 **`detect_liquidation_signals`** 辅助判断，而不是只看 `fillPnl<0`。

示例（节选你原函数 `verify_single_order` 内部逻辑）：

```python
order_details, order_error = check_order(order_id, inst_id)
if order_error:
    # ... 原样

fills, fills_error = list_fills_all(inst_id, order_id)
if fills_error:
    # ... 原样

# 统计与爆仓迹象
ctval = get_ctval(inst_id)
total_pnl = 0.0
liqs = []

for f in fills:
    ts = int(f["ts"])
    fill_sz = float(f["fillSz"])
    fill_px = float(f["fillPx"])
    pnl = float(f.get("fillPnl", 0) or 0)
    notional = fill_sz * ctval * fill_px  # ✅ 正确的名义（近似 USDT）
    total_pnl += pnl
    if pnl < 0 and notional >= MIN_VALUE_USDT:
        liqs.append({"ts": ts, "notional": round(notional,2), "pnl": pnl})

has_liq, liq_signals = detect_liquidation_signals(
    inst_id=inst_id,
    t_start_ms=min(int(f["ts"]) for f in fills),
    t_end_ms=max(int(f["ts"]) for f in fills),
    min_notional_usdt=MIN_VALUE_USDT,
    fills=fills
)

result = {
    # ...
    "trade_summary": {
        "total_fills": len(fills),
        "total_pnl": round(total_pnl, 4),
        "has_liquidations": has_liq,
        "liquidation_signals": liq_signals,
        "big_negative_fills": liqs
    },
}
```

---

## 并发与限频（简单稳一点的做法）

给 `okx_request` 外再套一个**全局速率限制**（例如每 200ms 执行一次实际请求），或给不同端点设不同的桶。最简版：

```python
import time, threading
RATE_LOCK = threading.Lock()
LAST_CALL = 0.0
MIN_INTERVAL = 0.25  # 4 QPS

def rate_limited_request(*args, **kwargs):
    global LAST_CALL
    with RATE_LOCK:
        now = time.time()
        wait = MIN_INTERVAL - (now - LAST_CALL)
        if wait > 0:
            time.sleep(wait)
        LAST_CALL = time.time()
    return okx_request(*args, **kwargs)
```

然后把你代码里对 `okx_request` 的调用替换成 `rate_limited_request`。

---

## 最后给你一份上线检查清单

* [ ] **删除并重建** OKX API Key：只读权限 + 绑定固定出口 IP（最多 20 个 IP，够用）
* [ ] `.env` 管理密钥：`OKX_API_KEY/OKX_SECRET/OKX_PASSPHRASE`
* [ ] **ctVal 折算**名义价值，别再用 `fillSz * fillPx`
* [ ] **分页**把成交拉全（`fills-history`）
* [ ] **爆仓判断**增加账单/公共清算侧证（后续接私有 WS 的 `category` 字段更稳）
* [ ] **全局速率限制**，避免偶发限频
* [ ] 报告里同时输出：`order_details`、`fills` 摘要、**证据哈希**（为以后上链 `merkleRoot` 做准备）

---

### 一句话回答你

> **可以**，这段代码能在 OKX 上拿到订单与成交数据；按我上面的 4 个函数替换 & 3 处轻改后，就能达到“可上线跑数据 + 可用于 Base Grants 演示”的稳定度。
> 要的话，我下一步直接给你**完整改好的一版脚本**（含 `.env`、分页、ctVal、限频、增强判断），你拷贝就能跑。
