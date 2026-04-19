/**
 * Watch the Solen chain for bridge deposit events.
 *
 * When a user locks SOLEN in the bridge vault on Solen, we detect it
 * and trigger a mint of wSOLEN on Base.
 *
 * Detection method: poll Solen blocks for transactions to the bridge
 * vault address, looking for transfer events with the vault as recipient.
 */

import { config } from "./config";

export interface SolenDeposit {
  txHash: string;
  sender: string;       // Solen account (hex)
  recipient: string;    // Base address (extracted from memo/args)
  amount: bigint;       // Base units
  blockHeight: number;
}

type DepositCallback = (deposit: SolenDeposit) => Promise<void>;

let lastProcessedHeight = 0;
const processedTxs = new Set<string>();

const STATE_FILE = "/tmp/relayer-solen-height.txt";

export function watchSolenDeposits(onDeposit: DepositCallback) {
  pollSolenHeight().then((height) => {
    // Try to load saved height, otherwise look back 100 blocks
    try {
      const saved = parseInt(require("fs").readFileSync(STATE_FILE, "utf8").trim());
      if (saved > 0 && saved <= height) {
        lastProcessedHeight = saved;
      } else {
        lastProcessedHeight = Math.max(0, height - 100);
      }
    } catch {
      lastProcessedHeight = Math.max(0, height - 100);
    }
    console.log(`[solen-watcher] Starting from height ${lastProcessedHeight} (current: ${height})`);
    setInterval(() => pollForDeposits(onDeposit), config.pollIntervalMs);
  });
}

function saveHeight(h: number) {
  try { require("fs").writeFileSync(STATE_FILE, h.toString()); } catch {}
}

async function pollSolenHeight(): Promise<number> {
  try {
    const resp = await fetch(config.solen.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "solen_chainStatus", params: [],
      }),
    });
    const json = await resp.json() as any;
    return json.result?.height || 0;
  } catch {
    return 0;
  }
}

async function getBlock(height: number): Promise<any> {
  const resp = await fetch(config.solen.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "solen_getBlock", params: [height],
    }),
  });
  const json = await resp.json() as any;
  return json.result;
}

async function getBlockTxs(height: number): Promise<any[]> {
  // Use the explorer API to get transactions with events
  const apiUrl = config.solen.rpc.replace(":9944", ":9955");
  try {
    const resp = await fetch(`${apiUrl}/api/blocks/${height}/txs`);
    if (!resp.ok) return [];
    return await resp.json() as any[];
  } catch {
    return [];
  }
}

async function pollForDeposits(onDeposit: DepositCallback) {
  try {
    const currentHeight = await pollSolenHeight();
    if (currentHeight <= lastProcessedHeight) return;

    // Stay 2 blocks behind chain tip to give the indexer time to process.
    // This prevents the race condition where we scan a block before
    // the explorer API has indexed its events.
    const safeHeight = Math.max(0, currentHeight - 2);
    if (safeHeight <= lastProcessedHeight) return;

    // Process up to 50 blocks at a time (catch-up mode)
    const startHeight = lastProcessedHeight + 1;
    const endHeight = Math.min(safeHeight, startHeight + 50);

    for (let h = startHeight; h <= endHeight; h++) {
      const txs = await getBlockTxs(h);

      for (const tx of txs) {
        if (!tx.success) continue;
        const events = tx.events || [];

        for (const event of events) {
          // Detect bridge_deposit events from the bridge system contract.
          // Event data: sender[32] + base_recipient[20] + amount[16] = 68 bytes = 136 hex chars
          if (event.topic === "bridge_deposit") {
            console.log(`[solen-watcher] Found bridge_deposit at height ${h}, data length: ${event.data?.length}`);
          }
          if (event.topic === "bridge_deposit" && event.data && event.data.length >= 136) {
            const txHash = `${h}-${tx.tx_index || 0}`;
            if (processedTxs.has(txHash)) continue;

            const senderHex = event.data.substring(0, 64);
            const baseRecipient = "0x" + event.data.substring(64, 104);
            const amount = parseLEu128(event.data.substring(104, 136));

            const deposit: SolenDeposit = {
              txHash,
              sender: senderHex,
              recipient: baseRecipient,
              amount,
              blockHeight: h,
            };

            if (deposit.amount > 0n && deposit.recipient) {
              processedTxs.add(txHash);
              await onDeposit(deposit);
            }
          }
        }
      }
    }

    lastProcessedHeight = endHeight;
    saveHeight(endHeight);
  } catch (err) {
    console.error("[solen-watcher] Poll error:", err);
  }
}

function parseLEu128(hex: string): bigint {
  let val = 0n;
  for (let i = hex.length - 2; i >= 0; i -= 2) {
    val = (val << 8n) | BigInt(parseInt(hex.substring(i, i + 2), 16));
  }
  return val;
}
