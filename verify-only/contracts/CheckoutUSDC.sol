// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20}          from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}       from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable}         from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable}        from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CheckoutUSDC - 简化版结算合约（approve + transferFrom）
/// @notice 责任单一：把保费从买家直接划入 TREASURY，并发 PremiumPaid 事件供后端回填订单
/// @dev 不做订单状态存储；事件即事实。配合后端监听器实现幂等与对账。
contract CheckoutUSDC is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Base USDC 合约（构造时设定后不可变）
    IERC20 public immutable USDC;

    /// @notice 收保费的金库地址（可由 owner 更新）
    address public treasury;

    /// @dev 下单支付事件：后端只信本事件做"已支付"回填
    event PremiumPaid(
        bytes32 indexed orderId,
        address indexed buyer,
        uint256 amount,
        bytes32 indexed quoteHash   // ✅ 索引 quoteHash，便于检索
    );
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event EmergencyWithdraw(address indexed to, address indexed token, uint256 amount);

    /// @param usdc_ Base 主网 USDC 地址
    /// @param treasury_ 初始金库地址（你控制私钥的地址）
    constructor(address usdc_, address treasury_) Ownable(msg.sender) {
        require(usdc_ != address(0) && treasury_ != address(0), "zero addr");
        USDC = IERC20(usdc_);
        treasury = treasury_;
    }

    /// @notice 更新金库地址（热切换，无需停机）
    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "zero addr");
        address old = treasury;
        treasury = newTreasury;                         // ✅ 先更新
        emit TreasuryUpdated(old, newTreasury);         // ✅ 再事件
    }

    /// @notice 管理暂停/恢复（前端据此禁用支付按钮）
    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice 验证USDC金额是否有效（6位精度，步长1e-6）
    /// @param amount 要验证的金额
    function isValidAmount(uint256 amount) public pure returns (bool) {
        return amount > 0 && amount % (10 ** 6) == 0;
    }

    /// @notice 用户先对 USDC 执行 approve(CheckoutUSDC, amount)，再调用本函数完成支付
    /// @param orderId   订单ID（建议 keccak(UUID)，传 bytes32）
    /// @param amount    USDC 数量（6 位精度）
    /// @param quoteHash 报价快照哈希（后端生成，承诺买家/金额/金库/有效期等）
    function buyPolicy(bytes32 orderId, uint256 amount, bytes32 quoteHash)
        external
        nonReentrant
        whenNotPaused
    {
        require(isValidAmount(amount), "invalid amount");
        // 直接转入金库，不在合约囤资
        USDC.safeTransferFrom(msg.sender, treasury, amount);
        emit PremiumPaid(orderId, msg.sender, amount, quoteHash);
    }

    /// @notice 安全兜底：若有误存代币，可由 owner 取回（不含 ETH）
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero to");
        IERC20(token).safeTransfer(to, amount);         // ✅ 使用 SafeERC20
        emit EmergencyWithdraw(to, token, amount);
    }

    /// @notice 拒收 ETH（防误转）
    receive() external payable { revert("no-eth"); }    // ✅
    fallback() external payable { revert("no-eth"); }   // ✅

    /// @notice 合约版本标识（便于前端/后端校验）
    function version() external pure returns (string memory) {
        return "checkout-usdc/1.0.1";                  // ✅ 小版本号
    }
}