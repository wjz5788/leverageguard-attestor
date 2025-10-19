export const helpSections = [
  {
    id: 'overview',
    title: { zh: '概述', en: 'Overview' },
    summary: [
      {
        zh: '爆仓保（LiqPass）是为散户提供的链上爆仓保险。通过“保费—赔付”机制，让原本风险厌恶的用户也可以在 Base 主网上进行高杠杆交易。',
        en: 'LiqPass delivers on-chain liquidation insurance for retail traders. A premium-for-payout model helps risk-averse users participate in high-leverage trading on Base Mainnet.'
      },
      {
        zh: '当前产品聚焦 Binance / OKX / Bybit 等流动性领先的交易所接口，通过只读授权验证爆仓事件并生成 Merkle 摘要上链公开可验。',
        en: 'The product focuses on leading venues such as Binance, OKX, and Bybit. Read-only API grants validate liquidation events and publish Merkle summaries on-chain for public auditing.'
      }
    ],
    subsections: [
      {
        heading: { zh: '为什么选择这些交易所', en: 'Why these exchanges' },
        paragraphs: [
          {
            zh: '优先集成流动性与成交量最高的平台，确保爆仓字段标准化、接口稳定，可复算验证流程。首个版本以 OKX 为样本，后续扩展至 Binance 与 Gate.io。',
            en: 'We integrate the most liquid derivative venues first so liquidation flags and APIs stay consistent. The initial sample uses OKX and expands to Binance and Gate.io next.'
          }
        ]
      },
      {
        heading: { zh: '用户为什么愿意绑定交易所', en: 'Why connect a CEX account' },
        paragraphs: [
          {
            zh: '用户仅需绑定一家交易所的只读 API，用于核对订单是否真实、参数是否匹配以及确为用户本人爆仓。建议将保障账户与主账户隔离，减少资产风险。',
            en: 'A single read-only API key lets LiqPass confirm whether an order exists, matches the submitted parameters, and belongs to the claimant. We recommend isolating the insurance account from the main trading account to reduce risk.'
          },
          {
            zh: '数据仅在申赔时访问，不进行后台监听；用户可以随时解绑并删除授权信息。',
            en: 'APIs are queried only during claim review, never continuously polled, and users can revoke the API key at any time.'
          }
        ]
      }
    ]
  },
  {
    id: 'flow',
    title: { zh: '使用流程', en: 'Usage Flow' },
    summary: [
      {
        zh: 'LiqPass 提供基于本金与杠杆倍数的定额爆仓保障，采用被动理赔机制。',
        en: 'LiqPass offers fixed-sum liquidation coverage based on margin and leverage, operating as a claim-on-demand service.'
      }
    ],
    subsections: [
      {
        heading: { zh: '购买流程', en: 'Purchase steps' },
        list: [
          { zh: '连接 Base 主网钱包并完成登录签名。', en: 'Connect a Base Mainnet wallet and sign the login message.' },
          { zh: '选择一家交易所并填写只读授权信息。', en: 'Select one exchange and provide a read-only API credential.' },
          { zh: '录入本金与杠杆参数，系统即时生成保费与赔付额。', en: 'Enter margin and leverage to calculate premium and coverage automatically.' },
          { zh: '确认订单并支付保费，保单即时生效。', en: 'Confirm the order, pay the premium, and activate the policy instantly.' }
        ]
      },
      {
        heading: { zh: '理赔流程', en: 'Claim steps' },
        paragraphs: [
          {
            zh: '爆仓保采用被动申赔：用户在爆仓后提交订单号或 JSON 文件，系统离线比对订单字段与保单。如果自动核对失败，可提交截图与说明由人工复核。',
            en: 'Claims are passive: after a liquidation, the user submits an order ID or JSON payload. LiqPass matches the data offline against the policy. If automated checks fail, users can upload screenshots for manual review.'
          },
          {
            zh: '核对通过后生成 Merkle Root 上链，赔付通过智能合约发放。',
            en: 'Once validated, a Merkle root is published on-chain and the payout is released via smart contract.'
          }
        ]
      }
    ]
  },
  {
    id: 'faq',
    title: { zh: '常见问题（FAQ）', en: 'FAQ' },
    subsections: [
      {
        heading: { zh: '我可以绑定多家交易所吗？', en: 'Can I link multiple exchanges?' },
        paragraphs: [
          {
            zh: '一次仅需绑定一家。若常用账户在 OKX，建议用 Binance 作为保障账户，反之亦然。可随时解绑重绑。',
            en: 'Only one exchange is required. If you mainly trade on OKX, use Binance as the insured account and vice versa. You can rebind whenever needed.'
          }
        ]
      },
      {
        heading: { zh: '是否会持续读取我的交易数据？', en: 'Do you constantly read my trading data?' },
        paragraphs: [
          {
            zh: '不会。只有在提交理赔时才调用只读接口，并且只保存核对所需的摘要。',
            en: 'No. Read-only APIs are queried solely during claims, and only verification hashes are stored.'
          }
        ]
      },
      {
        heading: { zh: '理赔失败会怎样？', en: 'What if a claim fails?' },
        paragraphs: [
          {
            zh: '系统会返回核对详情，用户可以补充截图、说明材料，由人工团队再次复核。',
            en: 'The app surfaces validation details so you can provide screenshots or notes for manual review if automation fails.'
          }
        ]
      }
    ]
  },
  {
    id: 'compliance',
    title: { zh: '接口与隐私 / 合规说明', en: 'Interfaces & Privacy / Compliance' },
    summary: [
      {
        zh: '系统遵循最小必要授权原则，接口调用仅覆盖核验所需范围，并配合合规要求保留公开审计线索。',
        en: 'We follow a least-privilege approach, only invoking APIs required for verification while preserving auditable trails for compliance.'
      }
    ],
    subsections: [
      {
        heading: { zh: '数据安全', en: 'Data security' },
        list: [
          { zh: '前端传输使用加密通道，仅存储密文。', en: 'Encrypted front-end transport with ciphertext-only storage.' },
          { zh: '不保留完整交易明细，仅保留核对摘要。', en: 'No full trade logs are stored—only verification summaries.' },
          { zh: '理赔完成后将摘要生成 Merkle Root 上链公开验证。', en: 'Post-claim, a Merkle root is anchored on-chain for public verification.' }
        ]
      },
      {
        heading: { zh: '合约与合规', en: 'Contracts & compliance' },
        paragraphs: [
          {
            zh: 'Base 主网合约地址为 0x9552b58d323993f84d01e3744f175f47a9462f94，所有赔付在链上完成。',
            en: 'The Base Mainnet contract lives at 0x9552b58d323993f84d01e3744f175f47a9462f94 and settles every payout on-chain.'
          },
          {
            zh: '遵循本地监管的 KYC / 反洗钱指引，如需人工复核会额外提示用户补充材料。',
            en: 'We comply with local KYC and AML guidelines and will request extra documents during manual reviews when mandated.'
          }
        ]
      },
      {
        heading: { zh: '联系方式', en: 'Contact' },
        list: [
          { zh: '邮箱：zmshyc@gmail.com', en: 'Email: zmshyc@gmail.com' },
          { zh: '官网：https://wjz5788.com', en: 'Website: https://wjz5788.com' },
          { zh: '仓库：https://github.com/wjz5788/leverageguard-attestor', en: 'Repository: https://github.com/wjz5788/leverageguard-attestor' }
        ]
      }
    ]
  }
];

export const tocOrder = helpSections.map((section) => ({
  id: section.id,
  label: section.title,
}));
