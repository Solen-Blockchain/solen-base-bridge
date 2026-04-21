// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title PresaleSwap
 * @notice Allows BSC presale token holders to swap for mainnet SOLEN.
 *
 * Flow:
 *   1. Holder approves this contract to spend their presale tokens
 *   2. Holder calls swap() with their Solen mainnet address
 *   3. Contract takes presale tokens (burned by holding them)
 *   4. Relayer detects SwapRequested event and sends SOLEN on mainnet
 *
 * Conversion: 1 presale token (18 decimals) = 1 SOLEN (8 decimals)
 *   So 1e18 presale units = 1e8 SOLEN base units
 */
contract PresaleSwap is Ownable, ReentrancyGuard {
    IERC20 public immutable presaleToken;

    /// @notice Whether swaps are currently enabled.
    bool public swapEnabled;

    /// @notice Total presale tokens received (for tracking).
    uint256 public totalSwapped;

    /// @notice Processed swaps (prevent double-processing by relayer).
    uint256 public swapCount;

    event SwapRequested(
        uint256 indexed swapId,
        address indexed sender,
        bytes32 solenRecipient,
        uint256 presaleAmount,
        uint256 solenAmount
    );

    event SwapEnabled(bool enabled);

    error SwapsDisabled();
    error ZeroAmount();
    error InvalidRecipient();
    error TransferFailed();
    error DustAmount();

    constructor(address _presaleToken) Ownable(msg.sender) {
        presaleToken = IERC20(_presaleToken);
        swapEnabled = true;
    }

    /**
     * @notice Swap presale tokens for mainnet SOLEN.
     * @param solenRecipient 32-byte Solen mainnet address to receive SOLEN.
     * @param amount Amount of presale tokens to swap (18 decimals).
     */
    function swap(bytes32 solenRecipient, uint256 amount) external nonReentrant {
        if (!swapEnabled) revert SwapsDisabled();
        if (amount == 0) revert ZeroAmount();
        if (solenRecipient == bytes32(0)) revert InvalidRecipient();

        // Convert: 1e18 presale = 1e8 SOLEN
        // Minimum swap: 1e10 presale units = 1 SOLEN base unit (0.00000001 SOLEN)
        uint256 solenAmount = amount / 1e10;
        if (solenAmount == 0) revert DustAmount();

        // Take presale tokens
        if (!presaleToken.transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }

        uint256 swapId = swapCount++;
        totalSwapped += amount;

        emit SwapRequested(swapId, msg.sender, solenRecipient, amount, solenAmount);
    }

    /// @notice Enable or disable swaps.
    function setSwapEnabled(bool enabled) external onlyOwner {
        swapEnabled = enabled;
        emit SwapEnabled(enabled);
    }

    /// @notice Withdraw presale tokens (to burn address or keep).
    function withdrawTokens(address to) external onlyOwner {
        uint256 balance = presaleToken.balanceOf(address(this));
        presaleToken.transfer(to, balance);
    }
}
