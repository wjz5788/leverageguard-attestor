// React 和 ReactDOM
    const React = window.React;
    const { useState, useEffect, useRef, createContext, useContext } = React;
    const { createRoot } = ReactDOM;

    // 工具函数
    // 移除未使用的classNames函数定义
    const formatMessage = (template, vars = {}) => {
      return template.replace(/\{([^{}]+)\}/g, (_, key) => vars[key] || `{${key}}`);
    };
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const isValidAddress = (address) => /^0x[a-fA-F0-9]{40}$/.test(address);

    // 管理标志检测
    const ADMIN_QS_KEY = 'admin';
    const ADMIN_TRUE_VALUES = ['true', '1'];
    const detectAdminFlag = () => {
      try {
        const url = new URL(window.location.href);
        const adminParam = url.searchParams.get(ADMIN_QS_KEY);
        return ADMIN_TRUE_VALUES.includes(adminParam?.toLowerCase());
      } catch (e) {
        return false;
      }
    };

    // 本地化
    const SUPPORTED_LOCALES = ['zh-CN', 'en-US'];
    const LANGUAGE_LABELS = {
      'zh-CN': '中文',
      'en-US': 'English'
    };
    
    // MetaMask钱包连接相关
    const METAMASK_PROVIDER_ID = 'metamask';
    const ETH_CHAIN_ID = '0x1'; // Ethereum Mainnet
    const ETH_CHAIN_NAME = 'Ethereum Mainnet';
    const ETH_RPC_URL = 'https://mainnet.infura.io/v3';
    const ETH_BLOCK_EXPLORER_URL = 'https://etherscan.io';
    const ETH_SYMBOL = 'ETH';

    // 检查MetaMask是否已安装
    function isMetaMaskInstalled() {
      return typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask;
    }

    // 获取MetaMask提供者
    function getMetaMaskProvider() {
      return isMetaMaskInstalled() ? window.ethereum : null;
    }

      // 钱包上下文定义
      const WalletContext = React.createContext({
        isConnected: false,
        account: null,
        balance: null,
        isConnecting: false,
        error: null,
        network: null,
        connectWallet: async () => {},
        disconnectWallet: () => {}
      });

      // 钱包上下文使用钩子
      const useWallet = () => {
        const context = React.useContext(WalletContext);
        if (!context) {
          throw new Error('useWallet must be used within a WalletProvider');
        }
        return {
          account: context.account,
          isConnected: context.isConnected,
          isConnecting: context.isConnecting,
          walletError: context.error,
          handleConnectWallet: context.connectWallet,
          handleDisconnectWallet: context.disconnectWallet
        };
      };
      
      // 钱包提供者组件
      const WalletProvider = ({ children }) => {
        const [isConnected, setIsConnected] = React.useState(false);
        const [account, setAccount] = React.useState(null);
        const [balance, setBalance] = React.useState(null);
        const [isConnecting, setIsConnecting] = React.useState(false);
        const [error, setError] = React.useState(null);
        const [network, setNetwork] = React.useState(null);

        // 初始化时检查已连接的钱包
        React.useEffect(() => {
          const checkConnection = async () => {
            if (isMetaMaskInstalled()) {
              try {
                const accounts = await window.ethereum.request({
                  method: 'eth_accounts'
                });
                
                if (accounts.length > 0) {
                  setAccount(accounts[0]);
                  setIsConnected(true);
                  updateBalance(accounts[0]);
                  
                  // 获取网络信息
                  const chainId = await window.ethereum.request({
                    method: 'eth_chainId'
                  });
                  setNetwork(chainId);
                }
              } catch (err) {
                console.error('检查钱包连接状态时出错:', err);
              }
            }
          };
          
          checkConnection();
          
          // 设置事件监听器
          if (isMetaMaskInstalled()) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);
          }
          
          return () => {
            // 清理事件监听器
            if (isMetaMaskInstalled()) {
              window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
              window.ethereum.removeListener('chainChanged', handleChainChanged);
            }
          };
        }, []);

        // 处理账户变更
        const handleAccountsChanged = (accounts) => {
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            setIsConnected(true);
            updateBalance(accounts[0]);
          } else {
            setAccount(null);
            setIsConnected(false);
            setBalance(null);
          }
        };

        // 处理网络变更
        const handleChainChanged = (chainId) => {
          setNetwork(chainId);
          if (account) {
            updateBalance(account);
          }
        };

        // 更新账户余额
        const updateBalance = async (accountAddress) => {
          try {
            const provider = new ethers.providers.Web3Provider(window.ethereum);
            const balance = await provider.getBalance(accountAddress);
            setBalance(ethers.utils.formatEther(balance));
          } catch (err) {
            console.error('获取账户余额时出错:', err);
          }
        };

        // 连接钱包
        const connectWallet = async () => {
          if (!isMetaMaskInstalled()) {
            setError('请安装MetaMask钱包');
            return;
          }
          
          setIsConnecting(true);
          setError(null);
          
          try {
            const accounts = await window.ethereum.request({
              method: 'eth_requestAccounts'
            });
            
            if (accounts.length > 0) {
              setAccount(accounts[0]);
              setIsConnected(true);
              updateBalance(accounts[0]);
              
              // 获取网络信息
              const chainId = await window.ethereum.request({
                method: 'eth_chainId'
              });
              setNetwork(chainId);
            }
          } catch (err) {
            console.error('连接钱包时出错:', err);
            setError('钱包连接失败');
          } finally {
            setIsConnecting(false);
          }
        };

        // 断开连接
        const disconnectWallet = () => {
          setAccount(null);
          setIsConnected(false);
          setBalance(null);
          setNetwork(null);
        };

        const contextValue = {
          isConnected,
          account,
          balance,
          isConnecting,
          error,
          network,
          connectWallet,
          disconnectWallet
        };

        return React.createElement(
          WalletContext.Provider,
          { value: contextValue },
          children
        );
      };

      // 钱包连接组件
      const WalletConnect = ({ className }) => {
        const { isConnected, account, isConnecting, error, connectWallet, disconnectWallet } = useWallet();
        console.log('WalletConnect component rendering:', { isConnected, account, isConnecting, error });
        const localeContext = useLocale();
        const locale = localeContext?.locale || 'zh-CN';
        const langKey = locale === 'en-US' ? 'en' : 'zh';
        const t = i18n[langKey];
        
        // 格式化地址显示
        const formatAddress = (addr) => {
          if (!addr || addr.length < 10) return addr;
          return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
        };
        
        return React.createElement('div', { className: `wallet-connect ${className || ''} relative z-20 p-1` },
          !isMetaMaskInstalled() ? (
            React.createElement('div', { className: 'flex flex-col items-center justify-center gap-2 p-4 bg-yellow-900/20 rounded-lg border border-yellow-700/30' },
              React.createElement('p', { className: 'text-sm text-yellow-300' }, t?.wallet_metamask_not_installed || '请安装MetaMask钱包'),
              React.createElement('a', {
                href: 'https://metamask.io/download.html',
                target: '_blank',
                rel: 'noopener noreferrer',
                onClick: (e) => {
                  e.stopPropagation();
                  console.log('Download button clicked');
                },
                className: 'px-5 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-full text-sm font-medium hover:from-indigo-600 hover:to-violet-600 transition-colors shadow-lg shadow-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-white/50 transform hover:scale-105'
              }, t?.wallet_download_metamask || '下载MetaMask')
            )
          ) : isConnected ? (
            React.createElement('div', { className: 'flex items-center gap-3 p-2 bg-green-900/30 rounded-full border border-green-700' },
              React.createElement('div', { className: 'wallet-info' },
                React.createElement('div', { className: 'flex items-center gap-2' },
                  React.createElement('span', { className: 'text-sm font-medium text-green-400' }, t?.wallet_connected || '已连接'),
                  React.createElement('span', { className: 'text-xs bg-white/10 text-white px-2 py-0.5 rounded-full' }, formatAddress(account))
                ),
                balance && React.createElement('div', { className: 'text-xs text-green-300' }, `${parseFloat(balance).toFixed(4)} ETH`)
              ),
              React.createElement('button', {
                onClick: (e) => {
                  e.stopPropagation();
                  console.log('Disconnect button clicked');
                  disconnectWallet();
                },
                className: 'px-3 py-1 text-xs bg-red-600/20 text-red-400 rounded-full hover:bg-red-600/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50'
              }, t?.wallet_disconnect || '断开连接')
            )
          ) : (
            React.createElement('div', { className: 'flex flex-col items-center gap-2' },
              React.createElement('button', {
                onClick: (e) => {
                  e.stopPropagation();
                  console.log('Connect button clicked');
                  connectWallet();
                },
                disabled: isConnecting,
                className: 'flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-full text-sm font-medium hover:from-indigo-600 hover:to-violet-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-white/50 transform hover:scale-105'
              },
                React.createElement('i', { className: 'fa fa-wallet' }),
                isConnecting ? (t?.wallet_connecting || '连接中...') : (t?.wallet_connect_metamask || '连接MetaMask钱包')
              ),
              error && React.createElement('p', { className: 'text-xs text-red-600' }, error)
            )
          )
        );
      };

      const LocaleContext = React.createContext({
      locale: 'zh-CN',
      setLocale: () => {},
      tr: (zh, en) => zh
    });

    const useLocale = () => {
      return useContext(LocaleContext);
    };

    const detectInitialLocale = () => {
      try {
        // 从 localStorage 获取
        const storedLocale = window.localStorage?.getItem('liqpass.locale');
        if (storedLocale && SUPPORTED_LOCALES.includes(storedLocale)) {
          return storedLocale;
        }
        // 从浏览器语言检测
        const browserLocale = navigator.language;
        if (SUPPORTED_LOCALES.includes(browserLocale)) {
          return browserLocale;
        }
        // 回退到中文
        return 'zh-CN';
      } catch (e) {
        return 'zh-CN';
      }
    };

    // 多语言字典
    const i18n = {
      zh: {
        brand: 'LiqPass',
        hero_title: '杠杆交易爆仓保障平台',
        hero_sub: '为杠杆交易提供安全保障，降低爆仓风险，保护交易资金',
        pill_okx: 'OKX 支持',
        pill_base: 'Base 网络',
        tab_quote: '获取报价',
        tab_claim: '提交理赔',
        tab_attest: '存证管理',
        tab_status: '状态查询',
        tab_appeal: '提交申诉',
        tab_help: '帮助文档',
        disclaimer: '免责声明：本平台仅提供技术服务，不构成投资建议。交易有风险，入市需谨慎。',
        // 报价页面
        quote_title: '获取爆仓保障报价',
        quote_desc: '输入交易参数，获取个性化爆仓保障方案',
        principal: '本金 (USDT)',
        leverage: '杠杆倍数',
        days: '保障天数',
        calculate_quote: '计算报价',
        premium: '保费',
        payout: '最大赔付',
        purchase_now: '立即投保',
        // 理赔页面
        claim_title: '提交理赔申请',
        claim_desc: '上传爆仓证据，提交理赔申请',
        claim_id: '理赔编号',
        upload_file: '上传交易记录',
        wallet_address: '钱包地址',
        submit_claim: '提交理赔',
        // 存证页面
        attest_title: '存证管理',
        btn_build_root: '生成 Root',
        btn_attest: '提交存证',
        root: 'Root',
        txhash: '交易哈希',
        // 状态页面
        status_title: '理赔状态查询',
        status_desc: '输入理赔编号，查询最新状态',
        check_status: '查询状态',
        // 申诉页面
        appeal_title: '提交申诉',
        appeal_desc: '如对理赔结果有异议，可提交申诉',
        appeal_reason: '申诉原因',
        appeal_evidence: '补充证据',
        submit_appeal: '提交申诉',
        // 帮助文档
        product_overview: '产品概述',
        workflow: '理赔流程',
        data_privacy: '数据隐私',
        pricing: '定价与风控',
        contact: '联系方式',
        // 产品概述
        product_desc: 'LiqPass 是一款为加密货币杠杆交易用户设计的爆仓保障产品。当用户遭遇交易所强制平仓（爆仓）时，可获得一定比例的资金赔付，降低交易风险。',
        key_features: '核心功能',
        feature_1: '**智能定价**: 根据杠杆倍数、交易金额等参数动态计算保费。',
        feature_2: '**自动校验**: 系统自动验证爆仓证据，快速完成理赔流程。',
        feature_3: '**区块链存证**: 所有交易记录和理赔数据上链存证，确保公平透明。',
        feature_4: '**多链支持**: 支持 Base、Optimism 等主流 Layer 2 网络。',
        feature_5: '**交易历史**: 记录用户交易和理赔历史，支持数据分析。',
        feature_6: '**费率优化**: 交易历史可获得个性化保险费率，活跃交易者享受优惠。',
        // 理赔流程
        workflow_desc: '产品与理赔流程如下：',
        step_1: '**报价**: 用户输入本金和杠杆比例，系统计算保费和赔付额，生成报价编号。',
        step_2: '**投保**: 用户支付保费，购买爆仓保障。',
        step_3: '**交易**: 用户在交易所进行杠杆交易。',
        step_4: '**触发**: 如发生爆仓，用户可在平台提交理赔申请。',
        step_5: '**校验**: 系统自动校验爆仓证据，验证交易真实性。',
        step_6: '**赔付**: 校验通过后，自动计算并发放赔付金。',
        step_7: '**申诉**: 如对校验结果有异议，可提交人工申诉。',
        // 数据隐私
        privacy_desc: '我们高度重视用户数据隐私保护，采取以下措施确保数据安全：',
        privacy_1: '**本地处理**: 敏感交易数据在用户本地进行哈希处理，不上传原始数据。',
        privacy_2: '**最小化收集**: 仅收集必要的交易数据用于校验和理赔，不收集无关个人信息。',
        privacy_3: '**加密存储**: 所有数据传输和存储均采用高强度加密技术。',
        privacy_4: '**用户控制**: 用户对自己的数据拥有完全控制权，可以随时查看和删除个人数据。',
        privacy_5: '**区块链存证**: 仅将交易哈希等不可逆向推导的信息上链，保护原始数据隐私。',
        // 定价与风控
        pricing_desc: '定价与风控说明：',
        pricing_1: '**基础费率**: 根据杠杆倍数和本金大小动态调整基础费率。杠杆越高，费率越高；本金越大，费率相对越低。',
        pricing_2: '**赔付比例**: 默认赔付比例为爆仓损失的 10%-50%，根据杠杆倍数和本金大小动态调整。',
        pricing_3: '**风控措施**: 对异常交易行为进行监控，包括频繁爆仓、操纵市场等行为。',
        pricing_4: '**限额管理**: 每个用户在一定时间内的最高赔付额度有限制，防止过度投保。',
        pricing_5: '**实时调整**: 系统会根据市场波动、用户行为等因素实时调整定价策略。',
        // 联系方式
        contact_desc: '如有任何问题或建议，请通过以下方式联系我们：',
        contact_website: '**官方网站**: https://wjz5788.com',
        contact_github: '**GitHub**: https://github.com/wjz5788/leverageguard-attestor',
        contact_twitter: '**Twitter**: @LiqPassOfficial',
        contact_email: '**Email**: support@wjz5788.com',
        // Wallet related
        wallet_connect: 'Connect Wallet',
        wallet_connected: 'Connected',
        wallet_connecting: 'Connecting...',
        wallet_disconnect: 'Disconnect',
        wallet_download_metamask: 'Download MetaMask',
        wallet_not_installed: 'MetaMask not installed',
        wallet_account: 'Wallet Address',
        wallet_balance: 'Balance',
        // Wallet related
        wallet_connect: 'Connect Wallet',
        wallet_connected: 'Connected',
        wallet_connecting: 'Connecting...',
        wallet_disconnect: 'Disconnect',
        wallet_download_metamask: 'Download MetaMask',
        wallet_not_installed: 'MetaMask not installed',
        wallet_account: 'Wallet Address',
        wallet_balance: 'Balance',
        // Wallet related
        wallet_connect: 'Connect Wallet',
        wallet_connected: 'Connected',
        wallet_connecting: 'Connecting...',
        wallet_disconnect: 'Disconnect',
        wallet_download_metamask: 'Download MetaMask',
        wallet_not_installed: 'MetaMask not installed',
        wallet_account: 'Wallet Address',
        wallet_balance: 'Balance',
        // Wallet related
        wallet_connect: 'Connect Wallet',
        wallet_connected: 'Connected',
        wallet_connecting: 'Connecting...',
        wallet_disconnect: 'Disconnect',
        wallet_download_metamask: 'Download MetaMask',
        wallet_not_installed: 'MetaMask not installed',
        wallet_account: 'Wallet Address',
        wallet_balance: 'Balance',
        // Wallet related
        wallet_connect: 'Connect Wallet',
        wallet_connected: 'Connected',
        wallet_connecting: 'Connecting...',
        wallet_disconnect: 'Disconnect',
        wallet_download_metamask: 'Download MetaMask',
        wallet_not_installed: 'MetaMask not installed',
        wallet_account: 'Wallet Address',
        wallet_balance: 'Balance',
        // 钱包相关
        wallet_connect: '连接钱包',
        wallet_connected: '已连接',
        wallet_connecting: '连接中...',
        wallet_disconnect: '断开连接',
        wallet_download_metamask: '下载MetaMask',
        wallet_not_installed: '未安装MetaMask',
        wallet_account: '钱包地址',
        wallet_balance: '余额'
      },
      en: {
        brand: 'LiqPass',
        hero_title: 'Leverage Trading Liquidation Protection',
        hero_sub: 'Secure your leveraged trading with comprehensive liquidation protection',
        pill_okx: 'OKX Support',
        pill_base: 'Base Network',
        tab_quote: 'Get Quote',
        tab_claim: 'File Claim',
        tab_attest: 'Attestation',
        tab_status: 'Claim Status',
        tab_appeal: 'Submit Appeal',
        tab_help: 'Help Center',
        disclaimer: 'Disclaimer: This platform provides technical services only and does not constitute investment advice. Trading involves risks, proceed with caution.',
        // Quote page
        quote_title: 'Get Liquidation Protection Quote',
        quote_desc: 'Enter trading parameters to get a personalized protection plan',
        principal: 'Principal (USDT)',
        leverage: 'Leverage',
        days: 'Protection Days',
        calculate_quote: 'Calculate Quote',
        premium: 'Premium',
        payout: 'Max Payout',
        purchase_now: 'Purchase Now',
        // Claim page
        claim_title: 'File Claim',
        claim_desc: 'Upload liquidation evidence to file your claim',
        claim_id: 'Claim ID',
        upload_file: 'Upload Trade Records',
        wallet_address: 'Wallet Address',
        submit_claim: 'Submit Claim',
        // Attestation page
        attest_title: 'Attestation Management',
        btn_build_root: 'Build Root',
        btn_attest: 'Submit Attestation',
        root: 'Root',
        txhash: 'Transaction Hash',
        // Status page
        status_title: 'Claim Status',
        status_desc: 'Enter your claim ID to check the latest status',
        check_status: 'Check Status',
        // Appeal page
        appeal_title: 'Submit Appeal',
        appeal_desc: 'If you disagree with the claim result, submit an appeal',
        appeal_reason: 'Appeal Reason',
        appeal_evidence: 'Additional Evidence',
        submit_appeal: 'Submit Appeal',
        // Help center
        product_overview: 'Product Overview',
        workflow: 'Claim Process',
        data_privacy: 'Data Privacy',
        pricing: 'Pricing & Risk Control',
        contact: 'Contact Us',
        // Product overview
        product_desc: 'LiqPass is a liquidation protection product designed for cryptocurrency leveraged traders. When users experience forced liquidation (margin call) on exchanges, they can receive a certain percentage of fund compensation, reducing trading risks.',
        key_features: 'Key Features',
        feature_1: '**Smart Pricing**: Dynamically calculates premium based on leverage, transaction amount, and other parameters.',
        feature_2: '**Auto Validation**: System automatically verifies liquidation evidence, completing the claim process quickly.',
        feature_3: '**Blockchain Attestation**: All transaction records and claim data are stored on-chain to ensure fairness and transparency.',
        feature_4: '**Multi-chain Support**: Supports mainstream Layer 2 networks like Base and Optimism.',
        feature_5: '**Transaction History**: Records user trading and claim history, supporting data analysis.',
        feature_6: '**Rate Optimization**: Trading history enables personalized insurance rates, potentially benefiting frequent traders with better pricing.',
        // Claim process
        workflow_desc: 'Product and claim process:',
        step_1: '**Quote**: User enters principal amount and leverage ratio, system calculates premium and payout amount, generates quote ID.',
        step_2: '**Purchase**: User pays premium to secure liquidation protection.',
        step_3: '**Trade**: User conducts leveraged trading on the exchange.',
        step_4: '**Trigger**: If liquidation occurs, user submits claim on the platform.',
        step_5: '**Validation**: System automatically verifies liquidation evidence and trade authenticity.',
        step_6: '**Payout**: After successful validation, automatically calculate and distribute payout.',
        step_7: '**Appeal**: If dissatisfied with validation result, user can submit manual appeal.',
        // Data privacy
        privacy_desc: 'We prioritize user data privacy with these protective measures:',
        privacy_1: '**Local Processing**: Sensitive transaction data is hashed locally before submission, with no raw data uploaded.',
        privacy_2: '**Minimal Collection**: Only necessary transaction data is collected for validation and claims processing.',
        privacy_3: '**Encrypted Storage**: All data transmission and storage use high-strength encryption.',
        privacy_4: '**User Control**: Users maintain full control over their data with options to view and delete information.',
        privacy_5: '**Blockchain Attestation**: Only non-reversible information like transaction hashes are recorded on-chain, protecting original data privacy.',
        // Pricing and risk control
        pricing_desc: 'Pricing and risk control explanation:',
        pricing_1: '**Base Rate**: Dynamically adjusted based on leverage and principal amount. Higher leverage results in higher rates; larger principal amounts receive relatively lower rates.',
        pricing_2: '**Payout Ratio**: Default payout ratio is 10%-50% of liquidation loss, dynamically adjusted based on leverage and principal.',
        pricing_3: '**Risk Monitoring**: System monitors for abnormal trading behaviors including frequent liquidations and market manipulation.',
        pricing_4: '**Limit Management**: Each user has a maximum payout limit within a specified period to prevent over-insurance.',
        pricing_5: '**Real-time Adjustment**: Pricing strategies are adjusted in real-time based on market volatility and user behavior.',
        // Contact
        contact_desc: 'For questions or suggestions, please contact us through:',
        contact_website: '**Official Website**: https://wjz5788.com',
        contact_github: '**GitHub**: https://github.com/wjz5788/leverageguard-attestor',
        contact_twitter: '**Twitter**: @LiqPassOfficial',
        contact_email: '**Email**: support@wjz5788.com',
        // Wallet related
        wallet_connect: 'Connect Wallet',
        wallet_connected: 'Connected',
        wallet_connecting: 'Connecting...',
        wallet_disconnect: 'Disconnect',
        wallet_download_metamask: 'Download MetaMask',
        wallet_not_installed: 'MetaMask not installed',
        wallet_account: 'Wallet Address',
        wallet_balance: 'Balance'
      }
    };

    // 图标组件
    const Calculator = (props) => React.createElement("i", { ...props, className: `fa fa-calculator ${props.className || ''}` });
    const Upload = (props) => React.createElement("i", { ...props, className: `fa fa-upload ${props.className || ''}` });
    const Hash = (props) => React.createElement("i", { ...props, className: `fa fa-hashtag ${props.className || ''}` });
    const ListChecks = (props) => React.createElement("i", { ...props, className: `fa fa-list-alt ${props.className || ''}` });
    const HelpCircle = (props) => React.createElement("i", { ...props, className: `fa fa-question-circle ${props.className || ''}` });
    const BookOpen = (props) => React.createElement("i", { ...props, className: `fa fa-book ${props.className || ''}` });
    const ExternalLink = (props) => React.createElement("i", { ...props, className: `fa fa-external-link ${props.className || ''}` });

    // 折叠面板组件
    const HelpSection = ({ title, id, children }) => {
      const [isOpen, setIsOpen] = useState(false);
      
      return React.createElement("div", { className: "border-b border-white/10 py-4" },
        React.createElement("button", {
          onClick: () => setIsOpen(!isOpen),
          className: "flex w-full items-center justify-between text-left py-2 focus:outline-none",
          id: id,
        },
          React.createElement("div", { className: "flex items-center gap-3" },
            React.createElement("div", { className: "rounded-full border border-indigo-500/30 bg-indigo-500/10 p-2 text-indigo-300" },
              React.createElement(BookOpen, { size: 20 })
            ),
            React.createElement("div", { className: "text-lg font-semibold" }, title)
          ),
          React.createElement("i", { className: `fa fa-chevron-down transition-transform ${isOpen ? 'rotate-180' : ''}` })
        ),
        isOpen && React.createElement("div", { className: "mt-4 pl-14" }, children)
      );
    };

    // 示例数据
    const mockClaims = [
      { id: 'LP20230615001', status: '已赔付', amount: 1250, date: '2023-06-15' },
      { id: 'LP20230610002', status: '审核中', amount: 3800, date: '2023-06-10' },
      { id: 'LP20230528003', status: '已拒绝', amount: 2100, date: '2023-05-28' },
      { id: 'LP20230515004', status: '已赔付', amount: 850, date: '2023-05-15' },
    ];

    // 主流程组件
    function PLFlow() {
      const isAdmin = detectAdminFlag();
      const [active, setActive] = useState('products'); // 默认显示产品页面
      const localeContext = useLocale();
      const locale = localeContext?.locale || 'zh-CN';
      const langKey = locale === 'en-US' ? 'en' : 'zh';
      const t = i18n[langKey];
      // 使用钱包上下文
      const { account, isConnected, handleConnectWallet, handleDisconnectWallet, walletError } = useWallet();
      
      // 产品和订单状态
      const [selectedProduct, setSelectedProduct] = useState(null);
      const [apiKey, setApiKey] = useState('');
      const [isApiKeyValid, setIsApiKeyValid] = useState(false);
      const [apiKeyError, setApiKeyError] = useState('');
      const [orders, setOrders] = useState([]);
      const [currentOrder, setCurrentOrder] = useState(null);
      const [orderStatus, setOrderStatus] = useState(''); // 'pending', 'success', 'error'
      const [orderMessage, setOrderMessage] = useState('');
      
      // 验证API密钥的函数
      const validateApiKey = async (key) => {
        if (!key || key.trim().length === 0) {
          setApiKeyError(locale === "en-US" ? "API key cannot be empty" : "API密钥不能为空");
          return false;
        }
        
        try {
          // 模拟API密钥验证请求
          console.log('Validating API key:', key);
          
          // 模拟延迟
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 简单的模拟验证逻辑：以"valid_"开头的密钥视为有效
          if (key.startsWith('valid_')) {
            setIsApiKeyValid(true);
            setApiKeyError('');
            console.log('API key validation successful');
            return true;
          } else {
            setIsApiKeyValid(false);
            setApiKeyError(locale === "en-US" ? "Invalid API key" : "无效的API密钥");
            return false;
          }
        } catch (error) {
          console.error('API key validation error:', error);
          setApiKeyError(locale === "en-US" ? "Validation failed" : "验证失败");
          return false;
        }
      };
      
      // 模拟产品数据
      const products = [
        {
          id: 1,
          name: "基础保险套餐",
          name_en: "Basic Insurance Plan",
          description: "为小额交易提供基础保障",
          description_en: "Basic protection for small transactions",
          price: "0.01 ETH",
          coverage: "交易金额的90%",
          coverage_en: "90% of transaction amount",
          image: "https://picsum.photos/seed/prod1/200/150"
        },
        {
          id: 2,
          name: "高级保险套餐",
          name_en: "Premium Insurance Plan",
          description: "为大额交易提供全面保障",
          description_en: "Comprehensive protection for large transactions",
          price: "0.05 ETH",
          coverage: "交易金额的100%",
          coverage_en: "100% of transaction amount",
          image: "https://picsum.photos/seed/prod2/200/150"
        },
        {
          id: 3,
          name: "企业保险方案",
          name_en: "Enterprise Insurance Scheme",
          description: "为企业级用户定制的保险方案",
          description_en: "Customized insurance scheme for enterprise users",
          price: "0.2 ETH",
          coverage: "无限交易保障",
          coverage_en: "Unlimited transaction protection",
          image: "https://picsum.photos/seed/prod3/200/150"
        },
        {
          id: 4,
          name: "DeFi保险包",
          name_en: "DeFi Insurance Package",
          description: "专为DeFi协议设计的保险方案",
          description_en: "Insurance scheme designed for DeFi protocols",
          price: "0.03 ETH",
          coverage: "智能合约安全保障",
          coverage_en: "Smart contract security protection",
          image: "https://picsum.photos/seed/prod4/200/150"
        }
      ];
      
      // 报价表单状态
      const [principal, setPrincipal] = useState('');
      const [leverage, setLeverage] = useState('');
      const [days, setDays] = useState(30);
      const [quote, setQuote] = useState(null);
      
      // 理赔表单状态
      const [claimId, setClaimId] = useState('');
      const [selectedFile, setSelectedFile] = useState(null);
      // 使用钱包地址作为默认值
      const [walletAddress, setWalletAddress] = useState(account || '');
      const [claimRes, setClaimRes] = useState(null);
      
      // 存证状态
      const [root, setRoot] = useState('');
      const [tx, setTx] = useState('');
      
      // 申诉表单状态
      const [appealId, setAppealId] = useState('');
      const [appealReason, setAppealReason] = useState('');
      const [appealEvidence, setAppealEvidence] = useState(null);
      
      // 计算报价
      const handleCalculateQuote = () => {
        if (!principal || !leverage || !days) return;
        
        const p = parseFloat(principal);
        const l = parseFloat(leverage);
        const d = parseInt(days);
        
        // 简单的报价计算逻辑
        const baseRate = 0.001; // 基础日费率
        const leverageFactor = Math.min(l / 10, 5); // 杠杆因子，最高5倍
        const principalFactor = Math.max(1 - p / 100000, 0.5); // 本金因子，最高0.5折
        
        const dailyPremium = p * baseRate * leverageFactor * principalFactor;
        const totalPremium = dailyPremium * d;
        const maxPayout = p * Math.min(l * 0.1, 0.5); // 最高赔付50%
        
        setQuote({
          premium: totalPremium.toFixed(2),
          payout: maxPayout.toFixed(2)
        });
      };
      
      // 提交理赔
      const handleSubmitClaim = () => {
        if (!claimId || !selectedFile || !walletAddress) return;
        
        // 模拟API调用
        setClaimRes({ res: { ok: true } });
      };
      
      // 监听钱包地址变化，自动更新理赔表单中的钱包地址
      useEffect(() => {
        if (account) {
          setWalletAddress(account);
        }
      }, [account]);
      
      // 生成Root
      const handleBuildRoot = async () => {
        // 模拟生成Root
        setRoot('0x' + Math.random().toString(16).slice(2, 34));
      };
      
      // 提交存证
      const handleAttest = async () => {
        if (!root) return;
        
        // 模拟交易提交
        setTx('0x' + Math.random().toString(16).slice(2, 66));
      };
      
      // 提交申诉
      const handleSubmitAppeal = () => {
        if (!appealId || !appealReason) return;
        
        // 模拟提交申诉
        alert(locale === 'en-US' ? 'Appeal submitted successfully!' : '申诉提交成功！');
      };
      
      // 处理购买
      const handlePurchase = async () => {
        if (!quote || !selectedProduct || !account) {
          setOrderStatus('error');
          setOrderMessage(locale === 'en-US' ? 'Please complete quote calculation and connect wallet' : '请完成报价计算并连接钱包');
          return;
        }
        
        try {
          setOrderStatus('pending');
          setOrderMessage(locale === 'en-US' ? 'Processing your order...' : '正在处理您的订单...');
          
          // 模拟订单处理延迟
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 创建新订单
          const newOrder = {
            id: 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            principal: principal,
            leverage: leverage,
            days: days,
            premium: quote.premium,
            maxPayout: quote.payout,
            walletAddress: account,
            timestamp: new Date().toISOString(),
            status: 'active'
          };
          
          // 更新订单状态
          setCurrentOrder(newOrder);
          setOrders(prev => [newOrder, ...prev]);
          setOrderStatus('success');
          setOrderMessage(locale === 'en-US' ? 'Order placed successfully!' : '订单创建成功！');
          
          console.log('New order created:', newOrder);
          
          // 模拟交易确认
          setTimeout(() => {
            setOrderStatus('');
            setOrderMessage('');
            // 可以选择跳转到订单状态页面
          }, 3000);
          
        } catch (error) {
          console.error('Purchase error:', error);
          setOrderStatus('error');
          setOrderMessage(locale === 'en-US' ? 'Failed to create order' : '订单创建失败');
        }
      };
      
      // 渲染各页面
      const quoteView = React.createElement("div", { className: "space-y-6" },
        React.createElement("div", { className: "card space-y-4" },
          React.createElement("h3", { className: "text-lg font-semibold" }, t.quote_title),
          React.createElement("p", { className: "text-white/70" }, t.quote_desc),
          React.createElement("div", { className: "grid gap-4 sm:grid-cols-2" },
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium" }, t.principal),
              React.createElement("input", {
                type: "number",
                min: "100",
                max: "1000000",
                value: principal,
                onChange: (e) => setPrincipal(e.target.value),
                className: "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
              })
            ),
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium" }, t.leverage),
              React.createElement("input", {
                type: "number",
                min: "2",
                max: "100",
                value: leverage,
                onChange: (e) => setLeverage(e.target.value),
                className: "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
              })
            ),
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium" }, t.days),
              React.createElement("input", {
                type: "range",
                min: "1",
                max: "90",
                value: days,
                onChange: (e) => setDays(e.target.value),
                className: "w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/20"
              }),
              React.createElement("div", { className: "text-right text-sm text-white/60" }, `${days} ${locale === 'en-US' ? 'days' : '天'}`)
            )
          ),
          React.createElement("div", { className: "flex justify-end gap-4" },
            React.createElement("button", {
              onClick: handleCalculateQuote,
              className: "btn-primary"
            }, t.calculate_quote)
          )
        ),
        quote && React.createElement("div", { className: "card space-y-4" },
          React.createElement("h4", { className: "text-md font-semibold" }, locale === 'en-US' ? 'Your Quote' : '报价详情'),
          React.createElement("div", { className: "grid gap-4 sm:grid-cols-2" },
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium text-white/70" }, t.premium),
              React.createElement("div", { className: "rounded-lg bg-white/5 p-3 text-xl font-bold" }, `${quote.premium} USDT`)
            ),
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium text-white/70" }, t.payout),
              React.createElement("div", { className: "rounded-lg bg-white/5 p-3 text-xl font-bold" }, `${quote.payout} USDT`)
            )
          ),
          React.createElement("div", { className: "space-y-4" },
            orderStatus && React.createElement(
              "div",
              { className: `rounded-lg p-3 text-sm ${orderStatus === 'error' ? 'bg-red-900/30 border border-red-500/30 text-red-300' : orderStatus === 'success' ? 'bg-green-900/30 border border-green-500/30 text-green-300' : 'bg-blue-900/30 border border-blue-500/30 text-blue-300'}` },
              orderMessage
            ),
            React.createElement("div", { className: "flex justify-end gap-4" },
              React.createElement("button", {
                className: "btn-secondary",
                onClick: handlePurchase,
                disabled: orderStatus === 'pending'
              }, orderStatus === 'pending' ? (locale === 'en-US' ? 'Processing...' : '处理中...') : t.purchase_now)
            )
          )
        )
      );
      
      const claimView = React.createElement("div", { className: "space-y-6" },
        React.createElement("div", { className: "card space-y-4" },
          React.createElement("h3", { className: "text-lg font-semibold" }, t.claim_title),
          React.createElement("p", { className: "text-white/70" }, t.claim_desc),
          React.createElement("div", { className: "space-y-4" },
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium" }, t.claim_id),
              React.createElement("input", {
                type: "text",
                value: claimId,
                onChange: (e) => setClaimId(e.target.value),
                className: "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
              })
            ),
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium" }, t.upload_file),
              React.createElement("div", {
                className: "flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 transition hover:border-white/40 hover:bg-white/10",
                onClick: () => document.getElementById('file-upload').click()
              },
                React.createElement("div", { className: "text-center" },
                  React.createElement(Upload, { size: 40, className: "mx-auto mb-2 text-white/40" }),
                  React.createElement("p", { className: "text-sm text-white/70" }, selectedFile ? selectedFile.name : locale === 'en-US' ? 'Click to upload file' : '点击上传文件'),
                  React.createElement("p", { className: "text-xs text-white/40 mt-1" }, locale === 'en-US' ? 'Supported formats: JSON, CSV, TXT' : '支持格式：JSON, CSV, TXT')
                )
              ),
              React.createElement("input", {
                id: "file-upload",
                type: "file",
                accept: ".json,.csv,.txt",
                onChange: (e) => setSelectedFile(e.target.files[0]),
                className: "hidden"
              })
            ),
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium" }, t.wallet_address),
              React.createElement("input", {
                type: "text",
                value: walletAddress,
                onChange: (e) => setWalletAddress(e.target.value),
                className: "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
              })
            )
          ),
          React.createElement("div", { className: "flex justify-end gap-4" },
            React.createElement("button", {
              onClick: handleSubmitClaim,
              className: "btn-primary"
            }, t.submit_claim)
          )
        )
      );
      
      const attestView = React.createElement("div", { className: "space-y-6" },
        React.createElement("div", { className: "grid gap-6 lg:grid-cols-[1.1fr,0.9fr]" },
          React.createElement("div", { className: "card space-y-4" },
            React.createElement("h3", { className: "text-lg font-semibold" }, t.attest_title),
            React.createElement("div", { className: "flex flex-wrap items-center gap-3" },
              React.createElement("button", {
                type: "button",
                onClick: handleBuildRoot,
                className: "btn-primary"
              }, t.btn_build_root),
              claimRes && claimRes.res && !claimRes.res.ok
                ? React.createElement("span", { className: "text-xs text-amber-300" }, locale === "en-US" ? "Fix validation issues before building a root." : "请先修正校验结果，再生成 Root。")
                : null
            ),
            root
              ? React.createElement("div", { className: "rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/80 break-all" }, `${t.root}：${root}`)
              : React.createElement("p", { className: "text-sm text-white/70" }, locale === "en-US" ? "Validate the claim first to prepare a Merkle leaf." : "请先完成证据校验，生成 Merkle leaf。"),
            React.createElement("div", { className: "flex flex-wrap items-center gap-3" },
              React.createElement("button", {
                type: "button",
                onClick: handleAttest,
                className: "rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-700/30 transition hover:bg-emerald-400" + 
                  ((!root || (claimRes && claimRes.res && !claimRes.res.ok)) ? " opacity-40 cursor-not-allowed" : ""),
                disabled: !root || (claimRes && claimRes.res && !claimRes.res.ok)
              }, t.btn_attest),
              tx
                ? React.createElement("div", { className: "text-xs text-white/70 break-all" },
                    React.createElement("span", null, `${t.txhash}：`),
                    React.createElement("a", {
                      href: `https://basescan.org/tx/${tx}`,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      className: "text-primary hover:underline"
                    },
                      React.createElement("span", null, tx.slice(0, 10)),
                      React.createElement(ExternalLink, { size: 10 })
                    )
                  )
                : null
            )
          ),
          React.createElement("div", { className: "card space-y-4" },
            React.createElement("h3", { className: "text-lg font-semibold" }, locale === "en-US" ? "Validation Results" : "校验结果"),
            React.createElement("div", { className: "rounded-xl bg-white/5 p-4 space-y-3" },
              React.createElement("div", { className: "flex items-center justify-between" },
                React.createElement("span", { className: "text-sm text-white/70" }, locale === "en-US" ? "File Format" : "文件格式"),
                React.createElement("span", { className: "text-xs font-medium text-emerald-400" }, locale === "en-US" ? "Valid" : "有效")
              ),
              React.createElement("div", { className: "flex items-center justify-between" },
                React.createElement("span", { className: "text-sm text-white/70" }, locale === "en-US" ? "Signature" : "签名验证"),
                React.createElement("span", { className: "text-xs font-medium text-emerald-400" }, locale === "en-US" ? "Passed" : "通过")
              ),
              React.createElement("div", { className: "flex items-center justify-between" },
                React.createElement("span", { className: "text-sm text-white/70" }, locale === "en-US" ? "Liquidation Event" : "爆仓事件"),
                React.createElement("span", { className: "text-xs font-medium text-emerald-400" }, locale === "en-US" ? "Confirmed" : "已确认")
              ),
              React.createElement("div", { className: "flex items-center justify-between" },
                React.createElement("span", { className: "text-sm text-white/70" }, locale === "en-US" ? "Coverage Period" : "保障期"),
                React.createElement("span", { className: "text-xs font-medium text-amber-400" }, locale === "en-US" ? "Warning" : "警告")
              )
          )
        )
      );
      
      const statusView = React.createElement("div", { className: "space-y-6" },
        React.createElement("div", { className: "card space-y-4" },
          React.createElement("h3", { className: "text-lg font-semibold" }, t.status_title),
          React.createElement("p", { className: "text-white/70" }, t.status_desc),
          React.createElement("div", { className: "flex flex-wrap gap-4" },
            React.createElement("input", {
              type: "text",
              placeholder: t.claim_id,
              className: "min-w-[240px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
            }),
            React.createElement("button", {
              className: "btn-primary whitespace-nowrap"
            }, t.check_status)
          )
        ),
        React.createElement("div", { className: "card space-y-4" },
          React.createElement("h4", { className: "text-md font-semibold" }, locale === "en-US" ? "Claim History" : "理赔历史"),
          React.createElement("div", { className: "overflow-x-auto" },
            React.createElement("table", { className: "min-w-full divide-y divide-white/10" },
              React.createElement("thead", {
                className: "bg-white/5"
              },
                React.createElement("tr", null,
                  React.createElement("th", { className: "py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider" }, locale === "en-US" ? "Claim ID" : "理赔编号"),
                  React.createElement("th", { className: "py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider" }, locale === "en-US" ? "Date" : "日期"),
                  React.createElement("th", { className: "py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider" }, locale === "en-US" ? "Amount" : "金额"),
                  React.createElement("th", { className: "py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider" }, locale === "en-US" ? "Status" : "状态")
                )
              ),
              React.createElement("tbody", { className: "divide-y divide-white/5" },
                mockClaims.map(claim => React.createElement("tr", { key: claim.id },
                  React.createElement("td", { className: "py-3 text-sm text-white" }, claim.id),
                  React.createElement("td", { className: "py-3 text-sm text-white/70" }, claim.date),
                  React.createElement("td", { className: "py-3 text-sm text-white" }, `${claim.amount} USDT`),
                  React.createElement("td", { className: "py-3 text-sm" },
                    React.createElement("span", {
                      className: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium " + 
                        (claim.status === '已赔付' || claim.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-300' :
                        claim.status === '审核中' || claim.status === 'Pending' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-red-500/20 text-red-300')
                    }, claim.status)
                  )
                ))
              )
            )
          )
        )
      );
      
      const appealView = React.createElement("div", { className: "space-y-6" },
        React.createElement("div", { className: "card space-y-4" },
          React.createElement("h3", { className: "text-lg font-semibold" }, t.appeal_title),
          React.createElement("p", { className: "text-white/70" }, t.appeal_desc),
          React.createElement("div", { className: "space-y-4" },
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium" }, t.claim_id),
              React.createElement("input", {
                type: "text",
                value: appealId,
                onChange: (e) => setAppealId(e.target.value),
                className: "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
              })
            ),
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium" }, t.appeal_reason),
              React.createElement("textarea", {
                value: appealReason,
                onChange: (e) => setAppealReason(e.target.value),
                rows: 4,
                className: "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
              })
            ),
            React.createElement("div", { className: "space-y-2" },
              React.createElement("label", { className: "block text-sm font-medium" }, t.appeal_evidence),
              React.createElement("div", {
                className: "flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 transition hover:border-white/40 hover:bg-white/10"
              },
                React.createElement("div", { className: "text-center" },
                  React.createElement(Upload, { size: 40, className: "mx-auto mb-2 text-white/40" }),
                  React.createElement("p", { className: "text-sm text-white/70" }, locale === 'en-US' ? 'Upload additional evidence' : '上传补充证据'),
                  React.createElement("p", { className: "text-xs text-white/40 mt-1" }, locale === 'en-US' ? 'PNG, JPG, PDF (Max 5MB)' : 'PNG, JPG, PDF (最大 5MB)')
                )
              )
            )
          ),
          React.createElement("div", { className: "flex justify-end gap-4" },
            React.createElement("button", {
              onClick: handleSubmitAppeal,
              className: "btn-primary"
            }, t.submit_appeal)
          )
        )
      );
      
      const helpView = React.createElement("div", { className: "card space-y-6" },
        React.createElement("h3", { className: "text-lg font-semibold" }, locale === "en-US" ? "Help Center" : "帮助中心"),
        
        React.createElement(HelpSection, { title: t.product_overview, id: "overview" },
          React.createElement("div", { className: "space-y-4" },
            React.createElement("p", null, t.product_desc),
            React.createElement("h4", { className: "font-medium text-indigo-300" }, t.key_features),
            React.createElement("ul", { className: "space-y-2 pl-4 list-disc" },
              React.createElement("li", null, t.feature_1),
              React.createElement("li", null, t.feature_2),
              React.createElement("li", null, t.feature_3),
              React.createElement("li", null, t.feature_4),
              React.createElement("li", null, t.feature_5),
              React.createElement("li", null, t.feature_6)
            )
          )
        ),
        
        React.createElement(HelpSection, { title: t.workflow, id: "workflow" },
          React.createElement("div", { className: "space-y-4" },
            React.createElement("p", null, locale === "en-US" ? t.workflow_desc : "产品与理赔流程如下："),
            React.createElement("ol", { className: "space-y-2 pl-4 list-decimal" },
              React.createElement("li", null, locale === "en-US" ? t.step_1 : "**报价**: 用户输入本金和杠杆比例，系统计算保费和赔付额，生成报价编号。"),
              React.createElement("li", null, locale === "en-US" ? t.step_2 : "**投保**: 用户支付保费，购买爆仓保障。"),
              React.createElement("li", null, locale === "en-US" ? t.step_3 : "**交易**: 用户在交易所进行杠杆交易。"),
              React.createElement("li", null, locale === "en-US" ? t.step_4 : "**触发**: 如发生爆仓，用户可在平台提交理赔申请。"),
              React.createElement("li", null, locale === "en-US" ? t.step_5 : "**校验**: 系统自动校验爆仓证据，验证交易真实性。"),
              React.createElement("li", null, locale === "en-US" ? t.step_6 : "**赔付**: 校验通过后，自动计算并发放赔付金。"),
              React.createElement("li", null, locale === "en-US" ? t.step_7 : "**申诉**: 如对校验结果有异议，可提交人工申诉。")
            )
          )
        ),
        
        React.createElement(HelpSection, { title: t.data_privacy, id: "privacy" },
          React.createElement("div", { className: "space-y-4" },
            React.createElement("p", null, locale === "en-US" ? t.privacy_desc : "我们高度重视用户数据隐私保护，采取以下措施确保数据安全："),
            React.createElement("ul", { className: "space-y-2 pl-4 list-disc" },
              React.createElement("li", null, locale === "en-US" ? t.privacy_1 : "**本地处理**: 敏感交易数据在用户本地进行哈希处理，不上传原始数据。"),
              React.createElement("li", null, locale === "en-US" ? t.privacy_2 : "**最小化收集**: 仅收集必要的交易数据用于校验和理赔，不收集无关个人信息。"),
              React.createElement("li", null, locale === "en-US" ? t.privacy_3 : "**加密存储**: 所有数据传输和存储均采用高强度加密技术。"),
              React.createElement("li", null, locale === "en-US" ? t.privacy_4 : "**用户控制**: 用户对自己的数据拥有完全控制权，可以随时查看和删除个人数据。"),
              React.createElement("li", null, locale === "en-US" ? t.privacy_5 : "**区块链存证**: 仅将交易哈希等不可逆向推导的信息上链，保护原始数据隐私。")
            )
          )
        ),
        
        React.createElement(HelpSection, { title: t.pricing, id: "pricing" },
          React.createElement("div", { className: "space-y-4" },
            React.createElement("p", null, locale === "en-US" ? t.pricing_desc : "定价与风控说明："),
            React.createElement("ul", { className: "space-y-2 pl-4 list-disc" },
              React.createElement("li", null, locale === "en-US" ? t.pricing_1 : "**基础费率**: 根据杠杆倍数和本金大小动态调整基础费率。杠杆越高，费率越高；本金越大，费率相对越低。"),
              React.createElement("li", null, locale === "en-US" ? t.pricing_2 : "**赔付比例**: 默认赔付比例为爆仓损失的 10%-50%，根据杠杆倍数和本金大小动态调整。"),
              React.createElement("li", null, locale === "en-US" ? t.pricing_3 : "**风控措施**: 对异常交易行为进行监控，包括频繁爆仓、操纵市场等行为。"),
              React.createElement("li", null, locale === "en-US" ? t.pricing_4 : "**限额管理**: 每个用户在一定时间内的最高赔付额度有限制，防止过度投保。"),
              React.createElement("li", null, locale === "en-US" ? t.pricing_5 : "**实时调整**: 系统会根据市场波动、用户行为等因素实时调整定价策略。")
            )
          )
        ),
        
        React.createElement(HelpSection, { title: t.contact, id: "contact" },
          React.createElement("div", { className: "space-y-4" },
            React.createElement("p", null, locale === "en-US" ? t.contact_desc : "如有任何问题或建议，请通过以下方式联系我们："),
            React.createElement("ul", { className: "space-y-2 pl-4 list-disc" },
              React.createElement("li", null, t.contact_website),
              React.createElement("li", null, t.contact_github),
              React.createElement("li", null, t.contact_twitter),
              React.createElement("li", null, t.contact_email)
            )
          )
        )
      );

      // 标签页配置
      const tabItems = [
        { key: "products", label: locale === "en-US" ? "Products" : "产品", icon: () => React.createElement("i", { className: "fa fa-shopping-bag" }) },
        { key: "quote", label: t.tab_quote, icon: Calculator },
        { key: "claim", label: t.tab_claim, icon: Upload },
        { key: "attest", label: t.tab_attest, icon: Hash, adminOnly: true },
        { key: "status", label: t.tab_status, icon: ListChecks },
        { key: "appeal", label: t.tab_appeal, icon: HelpCircle },
        { key: "help", label: t.tab_help, icon: BookOpen }
      ].filter(tab => !tab.adminOnly || isAdmin);

      // 产品浏览视图
      const productsView = React.createElement(
        "div",
        { className: "px-4 py-6" },
        React.createElement(
          "h2",
          { className: "text-2xl font-bold text-white mb-6" },
          locale === "en-US" ? "Available Insurance Products" : "可用保险产品"
        ),
        React.createElement(
          "div",
          { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" },
          products.map((product) => (
            React.createElement(
              "div",
              { key: product.id, className: "bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-indigo-500/50 transition-all duration-300 shadow-lg shadow-indigo-900/10 hover:shadow-indigo-900/20 transform hover:-translate-y-1" },
              React.createElement(
                "div",
                { className: "mb-4 rounded-lg overflow-hidden h-36 flex items-center justify-center bg-gradient-to-br from-indigo-900/30 to-violet-900/30" },
                React.createElement(
                  "img",
                  { 
                    src: product.image, 
                    alt: product.name,
                    className: "max-h-full object-cover rounded-lg"
                  }
                )
              ),
              React.createElement(
                "h3",
                { className: "text-lg font-bold text-white mb-2" },
                locale === "en-US" ? product.name_en : product.name
              ),
              React.createElement(
                "p",
                { className: "text-white/70 text-sm mb-4" },
                locale === "en-US" ? product.description_en : product.description
              ),
              React.createElement(
                "div",
                { className: "flex justify-between items-center mb-4" },
                React.createElement(
                  "div",
                  { className: "bg-indigo-500/20 px-3 py-1 rounded-full text-indigo-300 text-sm font-medium" },
                  product.price
                ),
                React.createElement(
                  "div",
                  { className: "bg-green-500/20 px-3 py-1 rounded-full text-green-300 text-sm font-medium" },
                  locale === "en-US" ? product.coverage_en : product.coverage
                )
              ),
              React.createElement(
                "button",
                {
                  onClick: () => {
                    console.log('Select product:', product.id);
                    setSelectedProduct(product);
                    // 选择产品后跳转到API密钥验证页面
                    setActive('api-validation');
                  },
                  className: "w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 rounded-lg font-medium hover:from-indigo-700 hover:to-violet-700 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500",
                  disabled: !isConnected
                },
                locale === "en-US" ? "Select Product" : "选择产品"
              ),
              !isConnected && React.createElement(
                "p",
                { className: "mt-2 text-xs text-amber-400 text-center" },
                locale === "en-US" ? "Please connect wallet first" : "请先连接钱包"
              )
            )
          ))
        )
      );
      
      // API密钥验证视图
      const apiKeyValidationView = React.createElement(
        "div",
        { className: "px-4 py-6" },
        React.createElement(
          "h2",
          { className: "text-2xl font-bold text-white mb-6" },
          locale === "en-US" ? "API Key Validation" : "API密钥验证"
        ),
        React.createElement(
          "div",
          { className: "max-w-md mx-auto bg-white/5 backdrop-blur-sm rounded-xl p-8 border border-white/10" },
          React.createElement(
            "p",
            { className: "text-white/80 mb-6" },
            locale === "en-US" ? 
              "Please enter your API key to continue with the product purchase. This ensures secure access to our services." : 
              "请输入您的API密钥以继续产品购买流程。这是为了确保您能够安全访问我们的服务。"
          ),
          React.createElement(
            "div",
            { className: "space-y-4" },
            React.createElement(
              "div",
              { className: "space-y-2" },
              React.createElement(
                "label",
                { className: "block text-sm font-medium text-white" },
                locale === "en-US" ? "API Key" : "API密钥"
              ),
              React.createElement(
                "input",
                {
                  type: "text",
                  value: apiKey,
                  onChange: (e) => {
                    setApiKey(e.target.value);
                    if (apiKeyError) setApiKeyError('');
                  },
                  className: `w-full px-4 py-3 rounded-lg bg-white/5 border ${apiKeyError ? 'border-red-500' : 'border-white/10'} text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500`
                }
              ),
              apiKeyError && React.createElement(
                "p",
                { className: "text-red-400 text-xs mt-1" },
                apiKeyError
              )
            ),
            React.createElement(
              "div",
              { className: "flex gap-4" },
              React.createElement(
                "button",
                {
                  onClick: async () => {
                    const isValid = await validateApiKey(apiKey);
                    if (isValid) {
                      // 验证通过后跳转到报价页面
                      setActive('quote');
                    }
                  },
                  className: "w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-3 rounded-lg font-medium hover:from-indigo-700 hover:to-violet-700 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed",
                  disabled: !apiKey.trim()
                },
                locale === "en-US" ? "Validate API Key" : "验证API密钥"
              )
            ),
            React.createElement(
              "div",
              { className: "text-center text-xs text-white/60 mt-4" },
              locale === "en-US" ? 
                "Don't have an API key? Contact support to request one." : 
                "没有API密钥？联系客服申请获取。"
            )
          )
        )
      );
      
      // 渲染当前内容
      const renderContent = () => {
        switch (active) {
          case "products": return productsView;
          case "api-validation": return apiKeyValidationView;
          case "quote": return quoteView;
          case "claim": return claimView;
          case "attest": return attestView;
          case "status": return statusView;
          case "appeal": return appealView;
          case "help": return helpView;
          default: return productsView;
        }
      };

      // 钱包连接功能直接实现
      
      // 主界面渲染
      return React.createElement("div", { className: "w-full max-w-6xl mx-auto px-4 py-8" },
        React.createElement("header", { className: "mb-8" },
          React.createElement("div", { className: "flex flex-col sm:flex-row items-center justify-between gap-4" },
            React.createElement("div", { className: "text-center sm:text-left" },
              React.createElement("h1", { className: "text-4xl font-bold tracking-tight text-white mb-2" }, t.brand),
              React.createElement("div", { className: "flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-4" },
                React.createElement("span", { className: "rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-200" }, t.pill_okx),
                React.createElement("span", { className: "rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-200" }, t.pill_base)
              )
            ),
            React.createElement("div", { className: "w-16" }),
            // 钱包连接功能移至固定位置
          ),
          React.createElement("p", { className: "text-lg text-white/60 text-center" }, t.hero_title),
          React.createElement("p", { className: "text-sm text-white/40 max-w-3xl mx-auto mt-2 text-center" }, t.hero_sub),
          walletError && React.createElement("p", { className: "mt-2 text-center text-sm text-red-400" }, walletError)
        ),
        
        React.createElement("div", { className: "mb-6 overflow-x-auto" },
          React.createElement("nav", { className: "flex space-x-2 px-1" },
            tabItems.map((tab) => {
              const isActive = active === tab.key;
              const Icon = tab.icon;
              return React.createElement("button", {
                key: tab.key,
                onClick: () => setActive(tab.key),
                className: "rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap flex items-center gap-2 transition-all" + 
                  (isActive ? " bg-white/10 text-white shadow-lg shadow-white/5" : " bg-white/5 text-white/70 hover:bg-white/8 hover:text-white/90")
              },
                React.createElement(Icon, { size: 16 }),
                tab.label
              );
            })
          )
        ),
        
        renderContent(),
        
        React.createElement("footer", { className: "mt-10 pt-6 border-t border-white/10 text-center text-xs text-white/40" },
          React.createElement("p", null, t.disclaimer)
        )
      );
    }

    // 主应用组件
    function App() {
      const initialLocale = detectInitialLocale() || "zh-CN";
      const [locale, setLocale] = useState(initialLocale);

      useEffect(() => {
        try {
          window.localStorage?.setItem("liqpass.locale", locale);
        } catch (_) {}
      }, [locale]);

      return React.createElement(LocaleContext.Provider, { value: { locale, setLocale } },
        React.createElement(WalletProvider, null,
          React.createElement("div", { className: "min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 relative" },
            React.createElement("div", { className: "absolute top-4 right-4 z-10 flex flex-col gap-2" },
              React.createElement("select", {
                className: "rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-sm text-white focus:border-indigo-400 focus:outline-none",
                value: locale,
                onChange: (e) => setLocale(e.target.value)
              },
                SUPPORTED_LOCALES.map((loc) => React.createElement("option", { key: loc, value: loc }, LANGUAGE_LABELS[loc]))
              ),
              // 钱包连接按钮 - 放置在右上角
              React.createElement(
                "button",
                {
                  onClick: () => {
                    console.log('Top wallet connect button clicked');
                    if (typeof window !== 'undefined' && window.ethereum) {
                      console.log('MetaMask detected, connecting...');
                      window.ethereum.request({ method: 'eth_requestAccounts' })
                        .then(async (accounts) => {
                          const walletAddress = accounts[0];
                          console.log('Connected to account:', walletAddress);
                          
                          // 保存钱包连接信息到数据库
                          try {
                            await saveWalletConnectionToDatabase(walletAddress);
                            console.log('Wallet connection saved to database successfully');
                          } catch (error) {
                            console.error('Failed to save wallet connection to database:', error);
                          }
                          
                          // 这里可以触发账户更新逻辑
                          if (typeof window !== 'undefined' && window.location) {
                            window.location.reload(); // 强制刷新以更新状态
                          }
                        })
                        .catch((error) => {
                          console.error('Connection error:', error);
                        });
                    } else {
                      console.log('MetaMask not detected, opening download page');
                      window.open('https://metamask.io/download.html', '_blank');
                    }
                  },
                  className: "bg-gradient-to-r from-indigo-600 to-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-indigo-900/30 hover:from-indigo-700 hover:to-violet-800 transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer whitespace-nowrap",
                  style: {
                    boxShadow: '0 4px 12px -2px rgba(99, 102, 241, 0.5)',
                    userSelect: 'none',
                    pointerEvents: 'auto',
                    touchAction: 'manipulation'
                  },
                  onMouseDown: (e) => {
                    e.stopPropagation();
                    console.log('Mouse down on top button');
                  },
                  onTouchStart: (e) => {
                    e.stopPropagation();
                    console.log('Touch start on top button');
                  }
                },
                React.createElement("i", { className: "fa fa-wallet mr-2" }),
                "连接钱包"
              )
            ),
            React.createElement(PLFlow)
          )
        )
      );
    }

    // 保存钱包连接信息到数据库的函数
    async function saveWalletConnectionToDatabase(walletAddress) {
      // 模拟API调用 - 实际实现时应替换为真实的后端API
      const connectionData = {
        wallet_address: walletAddress,
        connected_at: new Date().toISOString(),
        browser_info: navigator.userAgent,
        ip_address: '127.0.0.1' // 在真实环境中，这应该从后端获取
      };
      
      try {
        // 模拟API请求延迟
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 模拟成功响应
        console.log('Would send to database API:', JSON.stringify(connectionData));
        
        // 实际API调用示例（注释掉，因为是模拟环境）
        /*
        const response = await fetch('/api/wallet/connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(connectionData),
        });
        
        if (!response.ok) {
          throw new Error('Failed to save wallet connection');
        }
        
        return await response.json();
        */
        
        return { success: true, wallet_address: walletAddress };
      } catch (error) {
        console.error('Database save error:', error);
        throw error;
      }
    }

    // 渲染应用
    if (typeof window !== "undefined") {
      const rootElement = document.getElementById("root");
      if (rootElement) {
        ReactDOM.createRoot(rootElement).render(React.createElement(App));
      }
    }