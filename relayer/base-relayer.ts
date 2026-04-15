/**
 * Relay Solen deposits to Base chain.
 *
 * When a deposit is detected on Solen (SOLEN locked in vault),
 * this module calls relayDeposit() on the Base bridge contract
 * to mint wSOLEN to the recipient.
 */

import { ethers } from "ethers";
import { SolenDeposit } from "./solen-watcher";

export async function relayToBase(
  bridge: ethers.Contract,
  deposit: SolenDeposit,
): Promise<void> {
  try {
    // Convert txHash to bytes32 for the bridge contract
    const txHashBytes = ethers.id(deposit.txHash);

    // Check if already processed
    const already = await bridge.processedDeposits(txHashBytes);
    if (already) {
      console.log(`[base-relay] Already processed: ${deposit.txHash}`);
      return;
    }

    console.log(`[base-relay] Relaying deposit:`);
    console.log(`  txHash:    ${deposit.txHash}`);
    console.log(`  recipient: ${deposit.recipient}`);
    console.log(`  amount:    ${deposit.amount} base units`);

    const tx = await bridge.relayDeposit(
      txHashBytes,
      deposit.recipient,
      deposit.amount,
    );
    console.log(`[base-relay] TX submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[base-relay] Confirmed in block ${receipt.blockNumber}`);
  } catch (err: any) {
    console.error(`[base-relay] Failed to relay deposit ${deposit.txHash}:`, err.message || err);
  }
}
