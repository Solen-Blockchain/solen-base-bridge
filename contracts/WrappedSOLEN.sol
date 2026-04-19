// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WrappedSOLEN (wSOLEN)
 * @notice ERC-20 representation of SOLEN on Base chain.
 *         Minted when SOLEN is locked on the Solen network.
 *         Burned when bridging back to Solen.
 *
 * @dev Only the bridge contract can mint and burn.
 *      Total supply of wSOLEN should always equal SOLEN locked in the vault.
 *
 * Security:
 *   - Bridge address changes require a 48-hour timelock
 *   - burn() checks allowances — the bridge cannot burn tokens
 *     without the holder's explicit approval
 */
contract WrappedSOLEN is ERC20, Ownable {
    /// @notice The bridge contract authorized to mint/burn.
    address public bridge;

    /// @notice Total amount ever minted (for audit trail).
    uint256 public totalMinted;

    /// @notice Total amount ever burned (for audit trail).
    uint256 public totalBurned;

    /// @notice Proposed new bridge address (timelock).
    address public pendingBridge;

    /// @notice Timestamp after which the pending bridge can be executed.
    uint256 public bridgeTimelockExpiry;

    /// @notice Timelock duration for bridge changes (48 hours).
    uint256 public constant BRIDGE_TIMELOCK = 48 hours;

    event BridgeUpdateProposed(address indexed newBridge, uint256 executeAfter);
    event BridgeUpdateCancelled(address indexed cancelledBridge);
    event BridgeUpdated(address indexed oldBridge, address indexed newBridge);

    error OnlyBridge();
    error ZeroAddress();
    error NoPendingBridge();
    error TimelockNotExpired();
    error InsufficientAllowance();

    modifier onlyBridge() {
        if (msg.sender != bridge) revert OnlyBridge();
        _;
    }

    constructor() ERC20("Wrapped SOLEN", "wSOLEN") Ownable(msg.sender) {}

    /// @notice Propose a new bridge address. Takes effect after 48-hour timelock.
    function proposeBridge(address _bridge) external onlyOwner {
        if (_bridge == address(0)) revert ZeroAddress();
        pendingBridge = _bridge;
        bridgeTimelockExpiry = block.timestamp + BRIDGE_TIMELOCK;
        emit BridgeUpdateProposed(_bridge, bridgeTimelockExpiry);
    }

    /// @notice Execute a pending bridge update after the timelock has expired.
    function executeBridgeUpdate() external onlyOwner {
        if (pendingBridge == address(0)) revert NoPendingBridge();
        if (block.timestamp < bridgeTimelockExpiry) revert TimelockNotExpired();
        emit BridgeUpdated(bridge, pendingBridge);
        bridge = pendingBridge;
        pendingBridge = address(0);
        bridgeTimelockExpiry = 0;
    }

    /// @notice Cancel a pending bridge update.
    function cancelBridgeUpdate() external onlyOwner {
        if (pendingBridge == address(0)) revert NoPendingBridge();
        emit BridgeUpdateCancelled(pendingBridge);
        pendingBridge = address(0);
        bridgeTimelockExpiry = 0;
    }

    /// @notice Set the initial bridge address. Can only be called once (when bridge is unset).
    function setInitialBridge(address _bridge) external onlyOwner {
        require(bridge == address(0), "Bridge already set - use proposeBridge()");
        if (_bridge == address(0)) revert ZeroAddress();
        emit BridgeUpdated(address(0), _bridge);
        bridge = _bridge;
    }

    /// @notice Mint wSOLEN to a recipient. Only callable by the bridge.
    /// @param to Recipient address on Base.
    /// @param amount Amount in base units (1 SOLEN = 1e8 base units).
    function mint(address to, uint256 amount) external onlyBridge {
        totalMinted += amount;
        _mint(to, amount);
    }

    /// @notice Burn wSOLEN from a holder. Only callable by the bridge.
    /// @dev Requires the holder to have approved the bridge for the burn amount.
    /// @param from Address to burn from.
    /// @param amount Amount to burn.
    function burn(address from, uint256 amount) external onlyBridge {
        uint256 currentAllowance = allowance(from, msg.sender);
        if (currentAllowance < amount) revert InsufficientAllowance();
        _spendAllowance(from, msg.sender, amount);
        totalBurned += amount;
        _burn(from, amount);
    }

    /// @notice Returns 8 decimals to match Solen's native token precision.
    function decimals() public pure override returns (uint8) {
        return 8;
    }
}
