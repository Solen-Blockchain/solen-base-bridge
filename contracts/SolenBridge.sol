// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IWrappedSOLEN {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

/**
 * @title SolenBridge
 * @notice Bridge contract for moving SOLEN between the Solen network and Base chain.
 *
 * Flow:
 *   Solen -> Base: User locks SOLEN in vault on Solen. Relayer calls relayDeposit() here to mint wSOLEN.
 *   Base -> Solen: User calls bridgeToSolen() here to burn wSOLEN. Relayer releases SOLEN from vault on Solen.
 *
 * Security:
 *   - Only authorized relayers can call relayDeposit()
 *   - Nonce tracking prevents replay of relay transactions
 *   - Daily volume cap limits damage from relayer compromise
 *   - Large transfers have a timelock delay
 *   - Owner can pause the bridge in emergencies
 */
contract SolenBridge is Ownable, ReentrancyGuard {
    IWrappedSOLEN public immutable wSOLEN;

    /// @notice Authorized relayer addresses.
    mapping(address => bool) public relayers;

    /// @notice Processed deposit nonces (Solen tx hash -> bool).
    mapping(bytes32 => bool) public processedDeposits;

    /// @notice Processed withdrawal nonces (incrementing).
    uint256 public withdrawalNonce;

    /// @notice Daily volume cap (in base units). 0 = unlimited.
    uint256 public dailyVolumeCap;

    /// @notice Volume used today.
    uint256 public dailyVolumeUsed;

    /// @notice Start of the current volume tracking day.
    uint256 public volumeDayStart;

    /// @notice Amount threshold for timelock (in base units). 0 = no timelock.
    uint256 public timelockThreshold;

    /// @notice Timelock delay in seconds.
    uint256 public timelockDelay;

    /// @notice Whether the bridge is paused.
    bool public paused;

    /// @notice Pending timelocked withdrawals.
    struct PendingWithdrawal {
        address recipient;
        uint256 amount;
        bytes32 solenRecipient;
        uint256 executeAfter;
        bool executed;
        bool cancelled;
    }
    mapping(uint256 => PendingWithdrawal) public pendingWithdrawals;
    uint256 public pendingWithdrawalCount;

    // --- Events ---

    /// @notice Emitted when wSOLEN is minted from a Solen deposit.
    event DepositRelayed(
        bytes32 indexed solenTxHash,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Emitted when a user burns wSOLEN to bridge back to Solen.
    event BridgeToSolen(
        uint256 indexed nonce,
        address indexed sender,
        bytes32 indexed solenRecipient,
        uint256 amount
    );

    /// @notice Emitted when a timelocked withdrawal is queued.
    event WithdrawalQueued(
        uint256 indexed id,
        address indexed sender,
        bytes32 solenRecipient,
        uint256 amount,
        uint256 executeAfter
    );

    event Paused(bool isPaused);
    event RelayerUpdated(address indexed relayer, bool authorized);
    event DailyVolumeCapUpdated(uint256 newCap);

    // --- Errors ---

    error NotRelayer();
    error BridgePaused();
    error AlreadyProcessed();
    error DailyVolumeLimitExceeded();
    error ZeroAmount();
    error InvalidRecipient();
    error WithdrawalNotReady();
    error WithdrawalAlreadyProcessed();

    // --- Constructor ---

    constructor(address _wSOLEN) Ownable(msg.sender) {
        wSOLEN = IWrappedSOLEN(_wSOLEN);
        volumeDayStart = block.timestamp;

        // Defaults
        dailyVolumeCap = 0; // unlimited initially
        timelockThreshold = 0; // no timelock initially
        timelockDelay = 1 hours;
    }

    // --- Modifiers ---

    modifier onlyRelayer() {
        if (!relayers[msg.sender]) revert NotRelayer();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert BridgePaused();
        _;
    }

    // --- Bridge: Solen -> Base ---

    /**
     * @notice Relay a deposit from Solen. Mints wSOLEN to the recipient.
     * @param solenTxHash Unique identifier for the Solen deposit (prevents replay).
     * @param recipient Address on Base to receive wSOLEN.
     * @param amount Amount in base units.
     */
    function relayDeposit(
        bytes32 solenTxHash,
        address recipient,
        uint256 amount
    ) external onlyRelayer whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert InvalidRecipient();
        if (processedDeposits[solenTxHash]) revert AlreadyProcessed();

        _checkVolume(amount);

        processedDeposits[solenTxHash] = true;
        wSOLEN.mint(recipient, amount);

        emit DepositRelayed(solenTxHash, recipient, amount);
    }

    // --- Bridge: Base -> Solen ---

    /**
     * @notice Burn wSOLEN and request release on Solen.
     * @param solenRecipient 32-byte Solen account ID to receive native SOLEN.
     * @param amount Amount to bridge (caller must have approved the bridge).
     */
    function bridgeToSolen(
        bytes32 solenRecipient,
        uint256 amount
    ) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (solenRecipient == bytes32(0)) revert InvalidRecipient();

        _checkVolume(amount);

        // If amount exceeds timelock threshold, queue instead of immediate burn.
        if (timelockThreshold > 0 && amount >= timelockThreshold) {
            uint256 id = pendingWithdrawalCount++;
            pendingWithdrawals[id] = PendingWithdrawal({
                recipient: msg.sender,
                amount: amount,
                solenRecipient: solenRecipient,
                executeAfter: block.timestamp + timelockDelay,
                executed: false,
                cancelled: false
            });
            // Transfer tokens to bridge (held until execution or cancellation).
            wSOLEN.burn(msg.sender, amount);
            emit WithdrawalQueued(id, msg.sender, solenRecipient, amount, block.timestamp + timelockDelay);
            return;
        }

        uint256 nonce = withdrawalNonce++;
        wSOLEN.burn(msg.sender, amount);

        emit BridgeToSolen(nonce, msg.sender, solenRecipient, amount);
    }

    /**
     * @notice Execute a timelocked withdrawal after the delay has passed.
     * @param id Withdrawal ID.
     */
    function executeTimelocked(uint256 id) external whenNotPaused nonReentrant {
        PendingWithdrawal storage w = pendingWithdrawals[id];
        if (w.executed || w.cancelled) revert WithdrawalAlreadyProcessed();
        if (block.timestamp < w.executeAfter) revert WithdrawalNotReady();

        w.executed = true;
        uint256 nonce = withdrawalNonce++;

        emit BridgeToSolen(nonce, w.recipient, w.solenRecipient, w.amount);
    }

    // --- Admin ---

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function setRelayer(address relayer, bool authorized) external onlyOwner {
        relayers[relayer] = authorized;
        emit RelayerUpdated(relayer, authorized);
    }

    function setDailyVolumeCap(uint256 cap) external onlyOwner {
        dailyVolumeCap = cap;
        emit DailyVolumeCapUpdated(cap);
    }

    function setTimelockThreshold(uint256 threshold) external onlyOwner {
        timelockThreshold = threshold;
    }

    function setTimelockDelay(uint256 delay) external onlyOwner {
        timelockDelay = delay;
    }

    /// @notice Cancel a pending timelocked withdrawal (emergency only).
    function cancelTimelocked(uint256 id) external onlyOwner {
        PendingWithdrawal storage w = pendingWithdrawals[id];
        if (w.executed || w.cancelled) revert WithdrawalAlreadyProcessed();
        w.cancelled = true;
        // Tokens were already burned — mint back to the original sender.
        wSOLEN.mint(w.recipient, w.amount);
    }

    // --- Internal ---

    function _checkVolume(uint256 amount) internal {
        if (dailyVolumeCap == 0) return; // unlimited

        // Reset daily counter if a new day started.
        if (block.timestamp >= volumeDayStart + 1 days) {
            volumeDayStart = block.timestamp;
            dailyVolumeUsed = 0;
        }

        if (dailyVolumeUsed + amount > dailyVolumeCap) {
            revert DailyVolumeLimitExceeded();
        }
        dailyVolumeUsed += amount;
    }

    // --- View ---

    function bridgeStats() external view returns (
        uint256 totalSupply,
        uint256 dailyUsed,
        uint256 dailyCap,
        bool isPaused,
        uint256 pendingCount
    ) {
        return (
            wSOLEN.totalSupply(),
            dailyVolumeUsed,
            dailyVolumeCap,
            paused,
            pendingWithdrawalCount
        );
    }
}
