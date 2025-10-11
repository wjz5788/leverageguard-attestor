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
    event UserBlacklisted(address indexed user);
    event ThresholdUpdated(uint256 newThreshold);
    event OwnerChanged(address indexed newOwner);
    event FeeUpdated(uint256 newFee);

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

    // 用户历史赔付记录
    struct PayoutRecord {
        uint256 orderId;
        uint256 amount;
        uint256 timestamp;
        bool verified;
    }
    mapping(address => PayoutRecord[]) public userPayouts;

    // 新增：防重复赔付 - 用户 -> orderId -> 已申请
    mapping(address => mapping(uint256 => bool)) public claimedOrders;

    // =========================
    // 🔹 修饰器
    // =========================
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
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

    // =========================
    // 🔹 构造函数
    // =========================
    constructor() {
        owner = msg.sender;
        liquidationThreshold = 80; // 默认80%
        feePercentage = 5;          // 默认5%
    }

    // =========================
    // 🔹 资金管理
    // =========================
    function addFunds() external payable onlyOwner {
        contractBalance += msg.value;
        emit FundsAdded(msg.sender, msg.value);
    }

    function withdraw(uint256 _amount) external onlyOwner noReentrant {
        require(_amount <= contractBalance, "Insufficient contract balance");
        contractBalance -= _amount;
        (bool success, ) = owner.call{value: _amount}("");
        require(success, "Withdrawal failed");
        emit Withdrawal(owner, _amount);
    }

    // =========================
    // 🔹 爆仓标记
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
    ) external whitelistedOnly noReentrant {
        require(!claimedOrders[msg.sender][_orderId], "Order already claimed");
        require(_principal > 0 && _leverage > liquidationThreshold, "Invalid params");
        require(_insuranceRate > 0 && _insuranceRate <= 100, "Invalid insurance rate");

        // 记录防重复
        claimedOrders[msg.sender][_orderId] = true;

        // 计算预估赔付：principal * insuranceRate% * (leverage - threshold)/100
        uint256 estimatedPayout = (_principal * _insuranceRate * (_leverage - liquidationThreshold)) / 10000;

        // 初始记录为未验证
        userPayouts[msg.sender].push(PayoutRecord({
            orderId: _orderId,
            amount: estimatedPayout,
            timestamp: block.timestamp,
            verified: false
        }));

        emit ClaimSubmitted(msg.sender, _orderId, _principal, _leverage, _insuranceRate);
        emit PayoutVerified(msg.sender, _orderId, _principal, _leverage, _insuranceRate, estimatedPayout, false);
    }

    // =========================
    // 🔹 链上验证 + 历史记录（Owner更新验证状态）
    // =========================
    function updateVerification(
        address _user,
        uint256 _orderId,
        uint256 _principal,
        uint256 _leverage,
        uint256 _insuranceRate, // 百分比
        bool _verified
    ) external onlyOwner {
        require(claimedOrders[_user][_orderId], "Order not claimed");

        // 更新最后一条匹配记录的verified（简化）
        uint256 len = userPayouts[_user].length;
        require(len > 0, "No record");
        for (uint256 i = len; i > 0; ) {
            unchecked { --i; }
            if (userPayouts[_user][i].orderId == _orderId) {
                uint256 payoutAmount = (userPayouts[_user][i].amount * _insuranceRate) / 100; // 公式调整
                userPayouts[_user][i].verified = _verified;
                userPayouts[_user][i].amount = payoutAmount;
                emit PayoutVerified(_user, _orderId, _principal, _leverage, _insuranceRate, payoutAmount, _verified);
                return;
            }
        }
        revert("Order mismatch");
    }

    // =========================
    // 🔹 执行真实赔付
    // =========================
    function executePayout(address _user, uint256 _orderId, uint256 _amount) external onlyOwner noReentrant {
        require(whitelistedUsers[_user], "User not whitelisted");
        require(!blacklistedUsers[_user], "User is blacklisted");
        require(claimedOrders[_user][_orderId], "Order not claimed");
        require(_amount > 0, "Amount must be > 0");
        require(_amount <= contractBalance, "Insufficient contract balance");

        // 检查最后匹配记录verified
        uint256 len = userPayouts[_user].length;
        require(len > 0, "No record");
        bool foundVerified = false;
        for (uint256 i = len; i > 0; ) {
            unchecked { --i; }
            if (userPayouts[_user][i].orderId == _orderId && userPayouts[_user][i].verified) {
                foundVerified = true;
                break;
            }
        }
        require(foundVerified, "Not verified");

        uint256 fee = (_amount * feePercentage) / 100;
        uint256 payoutAmount = _amount - fee;

        // 修复：仅扣除实际转账金额
        contractBalance -= payoutAmount;
        (bool success, ) = _user.call{value: payoutAmount}("");
        require(success, "Payout failed");

        emit Payout(_user, payoutAmount);
    }

    // =========================
    // 🔹 白名单/黑名单管理
    // =========================
    function addToWhitelist(address _user) external onlyOwner {
        require(_user != address(0), "Invalid address");
        whitelistedUsers[_user] = true;
        emit UserWhitelisted(_user);
    }

    function removeFromWhitelist(address _user) external onlyOwner {
        whitelistedUsers[_user] = false;
    }

    function addToBlacklist(address _user) external onlyOwner {
        blacklistedUsers[_user] = true;
        emit UserBlacklisted(_user);
    }

    function removeFromBlacklist(address _user) external onlyOwner {
        blacklistedUsers[_user] = false;
    }

    // =========================
    // 🔹 参数更新
    // =========================
    function updateThreshold(uint256 _newThreshold) external onlyOwner {
        require(_newThreshold > 0 && _newThreshold < 100, "Invalid threshold");
        liquidationThreshold = _newThreshold;
        emit ThresholdUpdated(_newThreshold);
    }

    function updateFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= 5, "Invalid fee"); // 上限5%
        feePercentage = _newFee;
        emit FeeUpdated(_newFee);
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
        return userPayouts[_user];
    }

    // 新增：查询订单是否已申请
    function isOrderClaimed(address _user, uint256 _orderId) external view returns (bool) {
        return claimedOrders[_user][_orderId];
    }

    // =========================
    // 🔹 接收ETH
    // =========================
    receive() external payable {
        contractBalance += msg.value;
    }
}