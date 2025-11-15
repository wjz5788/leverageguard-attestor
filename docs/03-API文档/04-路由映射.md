# 按钮 → 路由 → 接口对照清单

| 按钮/入口 | 所在位置 | 前端路由 | 触达/调用的后端接口 |
| --- | --- | --- | --- |
| Products | 顶栏导航 | `/products` | （静态页，无直接接口调用） |
| Verify | 顶栏导航 | `/verify`（API 设置页） | `GET /api/v1/min/api-accounts`、`POST /api/v1/min/api-accounts`、`POST /api/verify` |
| Transparency | 顶栏导航 | `/transparency` | （静态数据占位） |
| Help | 顶栏导航 | `/help` | （静态数据占位） |
| API 设置 | 个人中心卡片、账号菜单 | `/settings/api` | `GET /api/v1/min/api-accounts`、`POST /api/v1/min/api-accounts`、`POST /api/verify` |
| 查看订单 | 订单列表卡片按钮 | `/orders/:id` | `GET /api/v1/orders`（用于详情回填） |
| 发起理赔 | 订单列表卡片按钮 | `/claims/new?orderId=:id` | 预留，前端表单占位（待对接理赔接口） |
| 赔付列表 | 赔付页顶部切换 | `/claims` | （模拟数据，占位） |
| 发起赔付 | 赔付页顶部切换 | `/claims/new` | （模拟数据，占位） |
| 验证（API 设置卡片） | API 设置页账号卡片 | 留在当前页面 | `POST /api/verify`（OKX 回显）、`GET /api/v1/min/api-accounts`（刷新状态） |
| 刷新 | API 设置页页眉按钮 | 留在当前页面 | `GET /api/v1/min/api-accounts` |
| 新建账号 | API 设置页页眉按钮 | 抽屉表单 | `POST /api/v1/min/api-accounts` |

> 说明：目前仅开放 OKX 的 API 校验流程。其它交易所账号可创建但"验证"按钮会提示"暂不支持"，等待后端能力接入。