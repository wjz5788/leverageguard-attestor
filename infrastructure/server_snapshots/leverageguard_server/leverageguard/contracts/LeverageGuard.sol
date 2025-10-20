// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LeverageGuard {
    // 事件定义
    event PositionLiquidated(address indexed user, uint256 amount, string reason);
    event Payout(address indexed user, uint256 amount);
    event FundsAdded(address indexed owner, uint256 amount);
    event Withdrawal(address indexed owner, uint256 amount);
    event UserWhitelisted(address indexed user);
    event UserBlacklisted(address indexed user);
    event ThresholdUpdated(uint256 newThreshold);
    event OwnerChanged(address indexed newOwner);
    event FeeUpdated(uint256 newFee);

    // 合约状态变量
    address public owner;
    uint256 public liquidationThreshold;
    uint256 public feePercentage;
    mapping(address => bool) public whitelistedUsers;
    mapping(address => bool) public blacklistedUsers;
    mapping(address => uint256) public userBalances;
    uint256 public contractBalance;

    // 修饰器
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whitelistedOnly() {
        require(whitelistedUsers[msg.sender], "User not whitelisted");
        require(!blacklistedUsers[msg.sender], "User is blacklisted");
        _;
    }

    // 构造函数
    constructor(uint256 _threshold, uint256 _fee) {
        owner = msg.sender;
        liquidationThreshold = _threshold; // 例如：80表示80%
        feePercentage = _fee; // 例如：1表示1%
    }

    // 添加资金到合约
    function addFunds() external payable onlyOwner {
        contractBalance += msg.value;
        emit FundsAdded(msg.sender, msg.value);
    }

    // 从合约提取资金
    function withdraw(uint256 _amount) external onlyOwner {
        require(_amount <= contractBalance, "Insufficient contract balance");
        contractBalance -= _amount;
        (bool success, ) = owner.call{value: _amount}("");
        require(success, "Withdrawal failed");
        emit Withdrawal(owner, _amount);
    }

    // 标记用户仓位被清算
    function markLiquidation(address _user, uint256 _leverageRatio, string calldata _reason) external onlyOwner {
        require(!blacklistedUsers[_user], "User is blacklisted");
        require(_leverageRatio > liquidationThreshold, "Leverage ratio below threshold");
        emit PositionLiquidated(_user, _leverageRatio, _reason);
    }

    // 执行赔付
    function executePayout(address _user, uint256 _amount) external onlyOwner {
        require(_amount > 0, "Amount must be greater than 0");
        require(_amount <= contractBalance, "Insufficient contract balance");
        require(userBalances[_user] + _amount <= contractBalance, "Exceeds contract balance");

        // 计算手续费
        uint256 fee = (_amount * feePercentage) / 100;
        uint256 payoutAmount = _amount - fee;

        // 扣除手续费后执行转账
        contractBalance -= _amount;
        (bool success, ) = _user.call{value: payoutAmount}("");
        require(success, "Payout failed");

        // 更新用户余额记录
        userBalances[_user] += payoutAmount;
        
        emit Payout(_user, payoutAmount);
    }

    // 白名单管理
    function addToWhitelist(address _user) external onlyOwner {
        whitelistedUsers[_user] = true;
        emit UserWhitelisted(_user);
    }

    function removeFromWhitelist(address _user) external onlyOwner {
        whitelistedUsers[_user] = false;
    }

    // 黑名单管理
    function addToBlacklist(address _user) external onlyOwner {
        blacklistedUsers[_user] = true;
        emit UserBlacklisted(_user);
    }

    function removeFromBlacklist(address _user) external onlyOwner {
        blacklistedUsers[_user] = false;
    }

    // 更新清算阈值
    function updateThreshold(uint256 _newThreshold) external onlyOwner {
        require(_newThreshold > 0 && _newThreshold < 100, "Invalid threshold");
        liquidationThreshold = _newThreshold;
        emit ThresholdUpdated(_newThreshold);
    }

    // 更新手续费
    function updateFee(uint256 _newFee) external onlyOwner {
        require(_newFee >= 0 && _newFee <= 5, "Invalid fee");
        feePercentage = _newFee;
        emit FeeUpdated(_newFee);
    }

    // 转移所有权
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
        emit OwnerChanged(_newOwner);
    }

    // 查询用户余额
    function getUserBalance(address _user) external view returns (uint256) {
        return userBalances[_user];
    }

    // 合约接收以太币
    receive() external payable {
        contractBalance += msg.value;
    }
}