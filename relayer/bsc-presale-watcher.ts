/**
 * BSC Presale Swap Watcher
 *
 * Watches the PresaleSwap contract on BSC for SwapRequested events
 * and sends mainnet SOLEN to the recipient.
 */

import { ethers } from "ethers";
import { ed25519 } from "@noble/curves/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { config } from "./config";

const PRESALE_SWAP_ADDRESS = "0x040454717475D979E55309A53115B6473b0Ef646";
const BSC_RPC = "https://bsc-dataseed.binance.org";

const SWAP_ABI = [
  "event SwapRequested(uint256 indexed swapId, address indexed sender, bytes32 indexed solenRecipient, uint256 presaleAmount, uint256 solenAmount)",
  "function swapCount() view returns (uint256)",
];

const STATE_FILE = "/tmp/relayer-bsc-presale-block.txt";
const processedSwaps = new Set<string>();

let sequencerPubKey: Uint8Array | null = null;

function initSequencer(): boolean {
  if (!config.solen.sequencerSeed) return false;
  const seedBytes = hexToBytes(config.solen.sequencerSeed);
  sequencerPubKey = ed25519.getPublicKey(seedBytes);
  console.log(`[bsc-presale] Sequencer: ${bytesToHex(sequencerPubKey).slice(0, 16)}...`);
  return true;
}

export async function startPresaleWatcher() {
  if (!initSequencer()) {
    console.log("[bsc-presale] No sequencer seed — presale watcher disabled");
    return;
  }

  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const contract = new ethers.Contract(PRESALE_SWAP_ADDRESS, SWAP_ABI, provider);

  // Load last processed block
  let lastBlock: number;
  try {
    const saved = require("fs").readFileSync(STATE_FILE, "utf8").trim();
    lastBlock = parseInt(saved);
  } catch {
    // Start from recent blocks
    lastBlock = await provider.getBlockNumber() - 1000;
  }

  console.log(`[bsc-presale] Watching from block ${lastBlock}`);

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastBlock) return;

      const fromBlock = lastBlock + 1;
      const toBlock = Math.min(currentBlock, fromBlock + 500); // max 500 blocks per query

      const events = await contract.queryFilter("SwapRequested", fromBlock, toBlock);

      for (const event of events) {
        const log = event as ethers.EventLog;
        const swapId = log.args[0].toString();
        const sender = log.args[1];
        const solenRecipient = log.args[2]; // bytes32
        const presaleAmount = log.args[3];
        const solenAmount = log.args[4];

        const key = `${swapId}-${log.transactionHash}`;
        if (processedSwaps.has(key)) continue;
        processedSwaps.add(key);

        console.log(`[bsc-presale] Swap #${swapId}: ${ethers.formatUnits(presaleAmount, 18)} presale -> ${solenAmount} SOLEN base units`);
        console.log(`[bsc-presale]   From: ${sender}`);
        console.log(`[bsc-presale]   To: ${solenRecipient}`);

        // Send SOLEN on mainnet
        await sendSolen(solenRecipient, BigInt(solenAmount.toString()));
      }

      lastBlock = toBlock;
      try { require("fs").writeFileSync(STATE_FILE, lastBlock.toString()); } catch {}
    } catch (err: any) {
      console.error("[bsc-presale] Poll error:", err.message || err);
    }
  }, 10000); // poll every 10 seconds

  console.log("[bsc-presale] Presale watcher running");
}

async function sendSolen(recipientBytes32: string, amount: bigint) {
  if (!sequencerPubKey) return;

  // recipientBytes32 is a hex string like 0x...
  const recipientHex = recipientBytes32.replace("0x", "");
  console.log(`[bsc-presale] Sending ${amount} base units to ${recipientHex.slice(0, 16)}...`);

  try {
    const seedBytes = hexToBytes(config.solen.sequencerSeed);
    const sequencerAddress = bytesToHex(sequencerPubKey!);

    // Get nonce
    const nonceResp = await fetch(config.solen.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "solen_getNextNonce",
        params: [sequencerAddress],
      }),
    });
    const nonceJson = await nonceResp.json() as any;
    const nonce = nonceJson.result || 0;

    // Build transfer action
    const recipientArray = Array.from(hexToBytes(recipientHex));
    const rustActions = [{
      Transfer: {
        to: recipientArray,
        amount: Number(amount),
      }
    }];

    const maxFee = 100000;
    const chainId = config.solen.chainId;

    // Build signing message: chain_id[8] + sender[32] + nonce[8] + max_fee[16] + blake3(actions)[32]
    const msg = new Uint8Array(96);
    const view = new DataView(msg.buffer);
    view.setBigUint64(0, BigInt(chainId), true);
    msg.set(sequencerPubKey!, 8);
    view.setBigUint64(40, BigInt(nonce), true);
    view.setBigUint64(48, BigInt(maxFee), true);

    const actionsJson = JSON.stringify(rustActions);
    const actionsHash = blake3(new TextEncoder().encode(actionsJson));
    msg.set(actionsHash.slice(0, 32), 64);

    const signature = ed25519.sign(msg, seedBytes);

    const operation = {
      sender: Array.from(sequencerPubKey!),
      nonce,
      actions: rustActions,
      max_fee: maxFee,
      signature: Array.from(signature),
    };

    const resp = await fetch(config.solen.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "solen_submitOperation",
        params: [operation],
      }),
    });
    const result = await resp.json() as any;

    if (result.result?.accepted) {
      console.log(`[bsc-presale] SOLEN transfer submitted`);
    } else {
      const error = result.result?.error || result.error?.message || JSON.stringify(result);
      console.error(`[bsc-presale] Transfer rejected: ${error}`);
    }
  } catch (err: any) {
    console.error(`[bsc-presale] Send failed:`, err.message || err);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
