/**
 * Solen <> Base Bridge Relayer
 *
 * Watches both chains for bridge events and relays them:
 *   - Solen deposit (lock SOLEN) -> mint wSOLEN on Base
 *   - Base burn (bridgeToSolen)  -> release SOLEN on Solen
 */

import { ethers } from "ethers";
import { config } from "./config";
import { watchSolenDeposits } from "./solen-watcher";
import { watchBaseBurns } from "./base-watcher";
import { relayToBase } from "./base-relayer";
import { relayToSolen } from "./solen-relayer";

const BRIDGE_ABI = [
  "function relayDeposit(bytes32 solenTxHash, address recipient, uint256 amount) external",
  "function processedDeposits(bytes32) view returns (bool)",
  "event BridgeToSolen(uint256 indexed nonce, address indexed sender, bytes32 indexed solenRecipient, uint256 amount)",
  "function bridgeStats() view returns (uint256 totalSupply, uint256 dailyUsed, uint256 dailyCap, bool isPaused, uint256 pendingCount)",
];

const WSOLEN_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  console.log("=== Solen <> Base Bridge Relayer ===");
  console.log(`Base RPC:  ${config.base.rpc}`);
  console.log(`Solen RPC: ${config.solen.rpc}`);
  console.log(`Bridge:    ${config.base.bridgeAddress}`);
  console.log(`wSOLEN:    ${config.base.wsolenAddress}`);
  console.log();

  // Set up Base provider and signer
  const baseProvider = new ethers.JsonRpcProvider(config.base.rpc);
  const baseSigner = new ethers.Wallet(config.base.relayerKey, baseProvider);
  console.log(`Base relayer address: ${baseSigner.address}`);

  const bridge = new ethers.Contract(config.base.bridgeAddress, BRIDGE_ABI, baseSigner);
  const wSOLEN = new ethers.Contract(config.base.wsolenAddress, WSOLEN_ABI, baseProvider);

  // Print initial stats
  const stats = await bridge.bridgeStats();
  console.log(`wSOLEN supply: ${ethers.formatUnits(stats.totalSupply, 8)} SOLEN`);
  console.log(`Bridge paused: ${stats.isPaused}`);
  console.log();

  // Start watchers
  console.log("Starting Solen deposit watcher...");
  watchSolenDeposits(async (deposit) => {
    console.log(`[Solen->Base] Deposit detected: ${deposit.amount} from ${deposit.sender} (tx: ${deposit.txHash})`);
    await relayToBase(bridge, deposit);
  });

  console.log("Starting Base burn watcher...");
  watchBaseBurns(baseProvider, config.base.bridgeAddress, BRIDGE_ABI, async (burn) => {
    console.log(`[Base->Solen] Burn detected: ${burn.amount} to ${burn.solenRecipient} (nonce: ${burn.nonce})`);
    await relayToSolen(burn);
  });

  console.log("\nRelayer running. Press Ctrl+C to stop.\n");

  // Keep alive
  process.on("SIGINT", () => {
    console.log("\nShutting down relayer...");
    process.exit(0);
  });

  // Periodic stats logging
  setInterval(async () => {
    try {
      const s = await bridge.bridgeStats();
      const supply = ethers.formatUnits(s.totalSupply, 8);
      console.log(`[stats] wSOLEN supply: ${supply} | daily volume: ${ethers.formatUnits(s.dailyUsed, 8)}`);
    } catch (e) {
      // ignore
    }
  }, 60000);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
