// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LeverageGuard {
    // =========================
    // 🔹 事件定义
    // =========================
    event PositionLiquidated(address indexed user, uint256 leverageRatio, string reason);
    event Payout(address indexed user, uint256 amount);
    event FundsAdded(address indexed owner, uint256 amount);
    event Withdrawal(address indexed owner, uint256 amount);
    event UserWhitelisted(address indexed user);
    event UserRemovedFromWhitelist(address indexed user);
    event UserBlacklisted(address indexed user);
    event UserRemovedFromBlacklist(address indexed user);
    event ThresholdUpdated(uint256 newThreshold);
    event OwnerChanged(address indexed newOwner);
    event FeeUpdated(uint256 newFee);
    event ContractPaused(address indexed admin);
    event ContractUnpaused(address indexed admin);
    event BalanceSynced(uint256 newBalance);

    // 链上验证事件（扩展参数）
    event PayoutVerified(
        address indexed user,
        uint256 indexed orderId,
        uint256 principal,
        uint256 leverage,
        uint256 insuranceRate,
        uint256 payoutAmount,
        bool verified
    );

    // 新增：赔付申请提交事件
    event ClaimSubmitted(
        address indexed user,
        uint256 indexed orderId,
        uint256 principal,
        uint256 leverage,
        uint256 insuranceRate
    );

    // 新增：多签事件
    event MultiSigExecuted(address indexed executor, string action);

    // =========================
    // 🔹 状态变量
    // =========================
    address public owner;
    uint256 public liquidationThreshold; // 百分比
    uint256 public feePercentage;        // 百分比
    mapping(address => bool) public whitelistedUsers;
    mapping(address => bool) public blacklistedUsers;
    uint256 public contractBalance;

    bool internal locked; // 防重入
    bool public paused = false; // 合约暂停状态

    // 多签治理：多签钱包地址数组和最小签名数
    address[] public multiSigWallets;
    uint256 public minSignatures = 3; // 默认3/ N 多签

    // 用户历史赔付记录 - 优化数据结构
    struct UserPayouts {
        PayoutRecord[] records;
        mapping(uint256 => uint256) orderIdToIndex; // orderId 到 records 索引的映射
    }
    struct PayoutRecord {
        uint256 orderId;
        uint256 amount;
        uint256 timestamp;
        bool verified;
    }
    mapping(address => UserPayouts) public userPayouts;

    // 防重复赔付 - 用户 -> orderId -> 已申请
    mapping(address => mapping(uint256 => bool)) public claimedOrders;

    // =========================
    // 🔹 修饰器
    // =========================
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyMultiSig() {
        bool isMultiSig = false;
        for (uint256 i = 0; i < multiSigWallets.length; i++) {
            if (msg.sender == multiSigWallets[i]) {
                isMultiSig = true;
                break;
            }
        }
        require(isMultiSig, "Not multi-sig wallet");
        _;
    }

    modifier whitelistedOnly() {
        require(whitelistedUsers[msg.sender], "User not whitelisted");
        require(!blacklistedUsers[msg.sender], "User is blacklisted");
        _;
    }

    modifier noReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }

    modifier whenPaused() {
        require(paused, "Contract not paused");
        _;    }

    // =========================
    // 🔹 构造函数
    // =========================
    constructor(address[] memory _multiSigWallets) {
        require(_multiSigWallets.length >= minSignatures, "Insufficient multi-sig wallets");
        owner = msg.sender;
        liquidationThreshold = 80; // 默认80%
        feePercentage = 5;          // 默认5%
        multiSigWallets = _multiSigWallets;
    }

    // =========================
    // 🔹 多签管理
    // =========================
    function updateMultiSigWallets(address[] memory _newWallets) external onlyOwner {
        require(_newWallets.length >= minSignatures, "Insufficient multi-sig wallets");
        multiSigWallets = _newWallets;
    }

    function updateMinSignatures(uint256 _min) external onlyOwner {
        require(_min > 0 && _min <= multiSigWallets.length, "Invalid min signatures");
        minSignatures = _min;
    }

    // =========================
    // 🔹 紧急暂停功能
    // =========================
    function pause() external onlyOwner {
        paused = true;
        emit ContractPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit ContractUnpaused(msg.sender);
    }

    // =========================
    // 🔹 资金管理（多签保护）
    // =========================
    function addFunds() external payable onlyOwner {
        contractBalance += msg.value;
        emit FundsAdded(msg.sender, msg.value);
    }

    function withdraw(uint256 _amount) external onlyMultiSig noReentrant {
        require(_amount <= contractBalance, "Insufficient contract balance");
        contractBalance -= _amount;
        (bool success, ) = owner.call{value: _amount}("");
        require(success, "Withdrawal failed");
        emit Withdrawal(owner, _amount);
        emit MultiSigExecuted(msg.sender, "Withdraw");
    }

    // 新增：余额验证和同步
    function verifyBalance() external view returns (bool) {
        return contractBalance == address(this).balance;
    }

    function syncBalance() external onlyOwner {
        contractBalance = address(this).balance;
        emit BalanceSynced(contractBalance);
    }

    // =========================
    // 🔹 爆仓标记（Owner即可）
    // =========================
    function markLiquidation(address _user, uint256 _leverageRatio, string calldata _reason) external onlyOwner {
        require(!blacklistedUsers[_user], "User is blacklisted");
        require(_leverageRatio > liquidationThreshold, "Leverage below threshold");
        emit PositionLiquidated(_user, _leverageRatio, _reason);
    }

    // 新增：用户提交赔付申请（链上存证）
    function submitClaim(
        uint256 _orderId,
        uint256 _principal,
        uint256 _leverage,
        uint256 _insuranceRate // 百分比
    ) external whitelistedOnly noReentrant whenNotPaused {
        require(!claimedOrders[msg.sender][_orderId], "Order already claimed");
        require(_principal > 0 && _leverage > liquidationThreshold, "Invalid params");
        require(_insuranceRate > 0 && _insuranceRate <= 100, "Invalid insurance rate");

        // 记录防重复
        claimedOrders[msg.sender][_orderId] = true;

        // 计算预估赔付：principal * insuranceRate% * (leverage - threshold)/100
        // 优化计算精度，扩大基数
        uint256 estimatedPayout = (_principal * _insuranceRate * (_leverage - liquidationThreshold)) / 10000;

        // 初始记录为未验证
        uint256 index = userPayouts[msg.sender].records.length;
        userPayouts[msg.sender].records.push(PayoutRecord({
            orderId: _orderId,
            amount: estimatedPayout,
            timestamp: block.timestamp,
            verified: false
        }));
        // 更新映射以便快速查找
        userPayouts[msg.sender].orderIdToIndex[_orderId] = index;

        emit ClaimSubmitted(msg.sender, _orderId, _principal, _leverage, _insuranceRate);
        emit PayoutVerified(msg.sender, _orderId, _principal, _leverage, _insuranceRate, estimatedPayout, false);
    }

    // =========================
    // 🔹 链上验证 + 历史记录（多签保护）
    // =========================
    function updateVerification(
        address _user,
        uint256 _orderId,
        uint256 _principal,
        uint256 _leverage,
        uint256 _insuranceRate, // 百分比
        bool _verified
    ) external onlyMultiSig whenNotPaused {
        require(claimedOrders[_user][_orderId], "Order not claimed");

        // 使用映射快速查找记录，避免遍历
        uint256 index = userPayouts[_user].orderIdToIndex[_orderId];
        require(index < userPayouts[_user].records.length, "Order record not found");
        require(userPayouts[_user].records[index].orderId == _orderId, "Order ID mismatch");

        // 更新记录
        uint256 payoutAmount = (userPayouts[_user].records[index].amount * _insuranceRate) / 100; // 公式调整
        userPayouts[_user].records[index].verified = _verified;
        userPayouts[_user].records[index].amount = payoutAmount;
        
        emit PayoutVerified(_user, _orderId, _principal, _leverage, _insuranceRate, payoutAmount, _verified);
        emit MultiSigExecuted(msg.sender, "UpdateVerification");
    }

    // =========================
    // 🔹 执行真实赔付（多签 + 金额验证）
    // =========================
    function executePayout(address _user, uint256 _orderId) external onlyMultiSig noReentrant whenNotPaused {
        require(whitelistedUsers[_user], "User not whitelisted");
        require(!blacklistedUsers[_user], "User is blacklisted");
        require(claimedOrders[_user][_orderId], "Order not claimed");

        // 使用映射快速查找记录
        uint256 index = userPayouts[_user].orderIdToIndex[_orderId];
        require(index < userPayouts[_user].records.length, "Order record not found");
        require(userPayouts[_user].records[index].orderId == _orderId, "Order ID mismatch");
        require(userPayouts[_user].records[index].verified, "Not verified");
        
        uint256 payoutCap = userPayouts[_user].records[index].amount;
        require(payoutCap > 0, "Invalid payout amount");
        require(payoutCap <= contractBalance, "Insufficient contract balance");

        uint256 fee = (payoutCap * feePercentage) / 100;
        uint256 payoutAmount = payoutCap - fee;

        // 仅扣除实际转账金额
        contractBalance -= payoutAmount;
        (bool success, ) = _user.call{value: payoutAmount}("");
        require(success, "Payout failed");

        emit Payout(_user, payoutAmount);
        emit MultiSigExecuted(msg.sender, "ExecutePayout");
    }

    // =========================
    // 🔹 白名单/黑名单管理（Owner即可）
    // =========================
    function addToWhitelist(address _user) external onlyOwner {
        require(_user != address(0), "Invalid address");
        whitelistedUsers[_user] = true;
        emit UserWhitelisted(_user);
    }

    function removeFromWhitelist(address _user) external onlyOwner {
        whitelistedUsers[_user] = false;
        emit UserRemovedFromWhitelist(_user);
    }

    function addToBlacklist(address _user) external onlyOwner {
        blacklistedUsers[_user] = true;
        emit UserBlacklisted(_user);
    }

    function removeFromBlacklist(address _user) external onlyOwner {
        blacklistedUsers[_user] = false;
        emit UserRemovedFromBlacklist(_user);
    }

    // =========================
    // 🔹 参数更新（多签保护）
    // =========================
    function updateThreshold(uint256 _newThreshold) external onlyMultiSig {
        require(_newThreshold > 0 && _newThreshold < 100, "Invalid threshold");
        liquidationThreshold = _newThreshold;
        emit ThresholdUpdated(_newThreshold);
        emit MultiSigExecuted(msg.sender, "UpdateThreshold");
    }

    function updateFee(uint256 _newFee) external onlyMultiSig {
        require(_newFee <= 5, "Invalid fee"); // 上限5%
        feePercentage = _newFee;
        emit FeeUpdated(_newFee);
        emit MultiSigExecuted(msg.sender, "UpdateFee");
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
        emit OwnerChanged(_newOwner);
    }

    // =========================
    // 🔹 查询用户历史赔付
    // =========================
    function getUserPayouts(address _user) external view returns (PayoutRecord[] memory) {
        PayoutRecord[] memory result = new PayoutRecord[](userPayouts[_user].records.length);
        for (uint256 i = 0; i < userPayouts[_user].records.length; i++) {
            result[i] = userPayouts[_user].records[i];
        }
        return result;
    }

    // 查询订单是否已申请
    function isOrderClaimed(address _user, uint256 _orderId) external view returns (bool) {
        return claimedOrders[_user][_orderId];
    }

    // =========================
    // 🔹 接收ETH
    // =========================
    receive() external payable whenNotPaused {
        contractBalance += msg.value;
    }

    // 新增：获取多签钱包数量
    function getMultiSigWalletCount() external view returns (uint256) {
        return multiSigWallets.length;
    }

    // 新增：获取指定索引的多签钱包
    function getMultiSigWallet(uint256 _index) external view returns (address) {
        require(_index < multiSigWallets.length, "Index out of bounds");
        return multiSigWallets[_index];
    }

    // 新增：获取合约地址余额
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}