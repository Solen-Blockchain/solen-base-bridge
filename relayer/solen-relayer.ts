/**
 * Relay Base burns to Solen chain.
 *
 * When wSOLEN is burned on Base (bridgeToSolen), this module
 * builds, signs, and submits a bridge_from_base release transaction
 * on the Solen network using ed25519.
 */

import { ed25519 } from "@noble/curves/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { config } from "./config";
import { BaseBurn } from "./base-watcher";

let sequencerPubKey: Uint8Array | null = null;
let sequencerAddress: string | null = null;

function initSequencer(): boolean {
  if (!config.solen.sequencerSeed) return false;
  const seedBytes = hexToBytes(config.solen.sequencerSeed);
  sequencerPubKey = ed25519.getPublicKey(seedBytes);
  sequencerAddress = bytesToHex(sequencerPubKey);
  console.log(`[solen-relay] Sequencer address: ${sequencerAddress}`);
  return true;
}

export async function relayToSolen(burn: BaseBurn): Promise<void> {
  if (!sequencerPubKey) {
    const ok = initSequencer();
    if (!ok) {
      console.log(`[solen-relay] No sequencer seed — skipping release.`);
      return;
    }
  }

  const recipientHex = burn.solenRecipient.replace("0x", "");
  console.log(`[solen-relay] Releasing ${burn.amount} to ${recipientHex.slice(0, 8)}...`);

  try {
    // Get nonce
    const nonce = await getNextNonce(sequencerAddress!);

    // Build args: recipient[32] + amount[16] + base_tx_hash[32]
    const amountLE = bigintToLE16(burn.amount);
    const baseTxHashBytes = hexToBytes(burn.txHash.replace("0x", "").padEnd(64, "0"));
    const args = new Uint8Array(80);
    args.set(hexToBytes(recipientHex), 0);
    args.set(amountLE, 32);
    args.set(baseTxHashBytes, 48);

    const bridgeAddr = hexToBytes("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff03");

    // Build the Rust action format (must match serde JSON exactly)
    const rustActions = [{
      Call: {
        target: Array.from(bridgeAddr),
        method: "bridge_from_base",
        args: Array.from(args),
      }
    }];

    const maxFee = 100000;
    const chainId = config.solen.chainId;

    // Build signing message: chain_id[8] + sender[32] + nonce[8] + max_fee[16] + blake3(actions_json)[32]
    const msg = new Uint8Array(96);
    const view = new DataView(msg.buffer);
    view.setBigUint64(0, BigInt(chainId), true);
    msg.set(sequencerPubKey!, 8);
    view.setBigUint64(40, BigInt(nonce), true);
    view.setBigUint64(48, BigInt(maxFee), true);
    // blake3 of JSON-serialized actions
    const actionsJson = JSON.stringify(rustActions);
    const actionsHash = blake3(new TextEncoder().encode(actionsJson));
    msg.set(actionsHash.slice(0, 32), 64);

    // Sign with ed25519
    const seedBytes = hexToBytes(config.solen.sequencerSeed);
    const signature = ed25519.sign(msg, seedBytes);

    // Build UserOperation
    const operation = {
      sender: Array.from(sequencerPubKey!),
      nonce,
      actions: rustActions,
      max_fee: maxFee,
      signature: Array.from(signature),
    };

    // Submit to Solen
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
      console.log(`[solen-relay] Release submitted for burn nonce ${burn.nonce}`);
    } else {
      const error = result.result?.error || result.error?.message || JSON.stringify(result);
      console.error(`[solen-relay] Release rejected: ${error}`);
    }
  } catch (err: any) {
    console.error(`[solen-relay] Failed:`, err.message || err);
  }
}

async function getNextNonce(address: string): Promise<number> {
  const resp = await fetch(config.solen.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "solen_getNextNonce",
      params: [address],
    }),
  });
  const json = await resp.json() as any;
  return json.result || 0;
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

function bigintToLE16(val: bigint): Uint8Array {
  const bytes = new Uint8Array(16);
  let v = val;
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number(v & 0xFFn);
    v >>= 8n;
  }
  return bytes;
}
