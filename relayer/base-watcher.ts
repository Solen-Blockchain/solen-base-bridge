/**
 * Watch Base chain for BridgeToSolen burn events.
 *
 * When a user calls bridgeToSolen() on the Base bridge contract,
 * wSOLEN is burned and an event is emitted. We detect this and
 * trigger a release of native SOLEN on the Solen network.
 */

import { ethers } from "ethers";
import { config } from "./config";

export interface BaseBurn {
  nonce: bigint;
  sender: string;        // Base address
  solenRecipient: string; // 32-byte Solen account (hex)
  amount: bigint;
  txHash: string;
  blockNumber: number;
}

type BurnCallback = (burn: BaseBurn) => Promise<void>;

let lastProcessedBlock = 0;
const processedNonces = new Set<string>();

export function watchBaseBurns(
  provider: ethers.JsonRpcProvider,
  bridgeAddress: string,
  bridgeAbi: string[],
  onBurn: BurnCallback,
) {
  const bridge = new ethers.Contract(bridgeAddress, bridgeAbi, provider);

  // Get current block, then start polling
  provider.getBlockNumber().then((blockNum) => {
    lastProcessedBlock = blockNum - 500; // look back to catch missed burns
    console.log(`[base-watcher] Starting from block ${lastProcessedBlock} (current: ${blockNum})`);

    setInterval(async () => {
      try {
        const currentBlock = await provider.getBlockNumber();
        if (currentBlock <= lastProcessedBlock) return;

        // Query BridgeToSolen events
        const filter = bridge.filters.BridgeToSolen();
        const events = await bridge.queryFilter(
          filter,
          lastProcessedBlock + 1,
          currentBlock,
        );

        for (const event of events) {
          const log = event as ethers.EventLog;
          const nonce = log.args[0] as bigint;
          const sender = log.args[1] as string;
          const solenRecipient = log.args[2] as string;
          const amount = log.args[3] as bigint;

          const nonceKey = nonce.toString();
          if (processedNonces.has(nonceKey)) continue;

          const burn: BaseBurn = {
            nonce,
            sender,
            solenRecipient,
            amount,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          };

          processedNonces.add(nonceKey);
          await onBurn(burn);
        }

        lastProcessedBlock = currentBlock;
      } catch (err) {
        console.error("[base-watcher] Poll error:", err);
      }
    }, config.pollIntervalMs);
  });
}
