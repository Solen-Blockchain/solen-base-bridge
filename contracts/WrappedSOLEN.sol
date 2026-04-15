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
 */
contract WrappedSOLEN is ERC20, Ownable {
    /// @notice The bridge contract authorized to mint/burn.
    address public bridge;

    /// @notice Total amount ever minted (for audit trail).
    uint256 public totalMinted;

    /// @notice Total amount ever burned (for audit trail).
    uint256 public totalBurned;

    event BridgeUpdated(address indexed oldBridge, address indexed newBridge);

    error OnlyBridge();
    error ZeroAddress();

    modifier onlyBridge() {
        if (msg.sender != bridge) revert OnlyBridge();
        _;
    }

    constructor() ERC20("Wrapped SOLEN", "wSOLEN") Ownable(msg.sender) {}

    /// @notice Set the bridge contract address. Only callable by owner.
    function setBridge(address _bridge) external onlyOwner {
        if (_bridge == address(0)) revert ZeroAddress();
        emit BridgeUpdated(bridge, _bridge);
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
    /// @param from Address to burn from (must have approved the bridge).
    /// @param amount Amount to burn.
    function burn(address from, uint256 amount) external onlyBridge {
        totalBurned += amount;
        _burn(from, amount);
    }

    /// @notice Returns 8 decimals to match Solen's native token precision.
    function decimals() public pure override returns (uint8) {
        return 8;
    }
}
