/**
 * Cross-Chain Solver for Solen <> Base
 *
 * Watches for CrossChainSwap intents on Solen and fulfills them:
 *   1. User submits intent: "swap X SOLEN for Y USDC on Base"
 *   2. Solver checks Uniswap price on Base
 *   3. If profitable, solver fronts USDC to user on Base
 *   4. Solver submits solution on Solen that locks user's SOLEN in bridge
 *   5. Relayer mints wSOLEN to solver on Base
 *   6. Solver sells wSOLEN to rebalance
 *
 * This is the Option A (Across-style) architecture:
 * - Solver takes inventory risk
 * - User gets instant execution on Base
 * - L1 only verifies the SOLEN lock
 */

import { ethers } from "ethers";
import { ed25519 } from "@noble/curves/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { config } from "./config";

// USDC on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

// Uniswap V3 Quoter on Base
const QUOTER_ADDRESS = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
];

interface PendingIntent {
  id: number;
  sender: string;
  constraints: any[];
  max_fee: string;
  expiry_height: number;
  tip: string;
}

interface CrossChainSwapConstraint {
  input_amount: string;
  min_output: string;
  destination_chain: number;
  destination_address: string;
  output_token: string;
}

export async function startCrossChainSolver() {
  if (!config.solen.sequencerSeed) {
    console.log("[solver] No sequencer seed — cross-chain solver disabled");
    return;
  }

  const seedBytes = hexToBytes(config.solen.sequencerSeed);
  const solverPubKey = ed25519.getPublicKey(seedBytes);
  const solverAddress = bytesToHex(solverPubKey);
  console.log(`[solver] Cross-chain solver address: ${solverAddress}`);

  const baseProvider = new ethers.JsonRpcProvider(config.base.rpc);
  const baseSigner = new ethers.Wallet(config.base.relayerKey, baseProvider);
  console.log(`[solver] Base wallet: ${baseSigner.address}`);

  // Check USDC balance
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, baseSigner);
  const usdcBalance = await usdc.balanceOf(baseSigner.address);
  console.log(`[solver] USDC balance: ${ethers.formatUnits(usdcBalance, USDC_DECIMALS)}`);

  // Poll for cross-chain intents
  setInterval(async () => {
    try {
      await pollAndSolve(seedBytes, solverPubKey, baseSigner, usdc);
    } catch (err: any) {
      console.error("[solver] Poll error:", err.message || err);
    }
  }, config.pollIntervalMs);

  console.log("[solver] Cross-chain solver running");
}

async function pollAndSolve(
  seedBytes: Uint8Array,
  solverPubKey: Uint8Array,
  baseSigner: ethers.Wallet,
  usdc: ethers.Contract,
) {
  // Fetch pending intents
  const resp = await fetch(config.solen.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "solen_getPendingIntents",
      params: [50],
    }),
  });
  const json = await resp.json() as any;
  const intents: PendingIntent[] = json.result || [];

  for (const intent of intents) {
    // Find CrossChainSwap constraints
    const swapConstraint = intent.constraints.find(
      (c: any) => c.type === "CrossChainSwap"
    ) as CrossChainSwapConstraint | undefined;

    if (!swapConstraint) continue;
    if (swapConstraint.destination_chain !== 8453) continue; // Only Base for now

    console.log(`[solver] Found cross-chain intent #${intent.id}: ${swapConstraint.input_amount} SOLEN -> min ${swapConstraint.min_output} output`);

    // Check if output token is USDC
    const outputTokenHex = swapConstraint.output_token.replace(/^0+/, "").toLowerCase();
    const usdcHex = USDC_ADDRESS.slice(2).toLowerCase();
    if (outputTokenHex !== usdcHex) {
      console.log(`[solver] Unsupported output token: ${swapConstraint.output_token}`);
      continue;
    }

    // Get wSOLEN -> USDC price from Uniswap
    const inputAmount = BigInt(swapConstraint.input_amount);
    const minOutput = BigInt(swapConstraint.min_output);

    let expectedOutput: bigint;
    try {
      expectedOutput = await getUniswapQuote(
        baseSigner.provider!,
        config.base.wsolenAddress,
        USDC_ADDRESS,
        inputAmount,
      );
    } catch (err: any) {
      console.log(`[solver] Quote failed: ${err.message}`);
      continue;
    }

    console.log(`[solver] Uniswap quote: ${inputAmount} wSOLEN -> ${expectedOutput} USDC (min: ${minOutput})`);

    // Check if profitable (output > min_output + our margin)
    if (expectedOutput < minOutput) {
      console.log(`[solver] Quote below min output, skipping`);
      continue;
    }

    // Check we have enough USDC to front
    const ourBalance = await usdc.balanceOf(baseSigner.address);
    if (ourBalance < minOutput) {
      console.log(`[solver] Insufficient USDC balance to front: have ${ourBalance}, need ${minOutput}`);
      continue;
    }

    // Front USDC to user on Base
    const destAddress = "0x" + swapConstraint.destination_address.replace(/^0+/, "");
    console.log(`[solver] Fronting ${minOutput} USDC to ${destAddress} on Base`);

    try {
      const tx = await usdc.transfer(destAddress, minOutput);
      const receipt = await tx.wait();
      console.log(`[solver] USDC fronted in tx: ${receipt.hash}`);
    } catch (err: any) {
      console.error(`[solver] USDC transfer failed: ${err.message}`);
      continue;
    }

    // Submit solution on Solen: lock user's SOLEN in bridge vault
    try {
      await submitSolution(
        seedBytes,
        solverPubKey,
        intent,
        inputAmount,
        swapConstraint,
      );
    } catch (err: any) {
      console.error(`[solver] Solution submission failed: ${err.message}`);
    }
  }
}

async function getUniswapQuote(
  provider: ethers.Provider,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
): Promise<bigint> {
  const quoter = new ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI, provider);
  const params = {
    tokenIn,
    tokenOut,
    amountIn,
    fee: 3000, // 0.3% pool
    sqrtPriceLimitX96: 0,
  };

  const result = await quoter.quoteExactInputSingle.staticCall(params);
  return result.amountOut;
}

async function submitSolution(
  seedBytes: Uint8Array,
  solverPubKey: Uint8Array,
  intent: PendingIntent,
  inputAmount: bigint,
  constraint: CrossChainSwapConstraint,
) {
  const senderBytes = hexToBytes(intent.sender);
  const bridgeAddr = new Uint8Array(32);
  bridgeAddr.fill(0xFF, 0, 31);
  bridgeAddr[31] = 0x03; // BRIDGE_ADDRESS

  // Solution: transfer user's SOLEN to bridge vault
  const solution = {
    intent_id: intent.id,
    solver: Array.from(solverPubKey),
    operations: [{
      sender: Array.from(senderBytes),
      nonce: 0,
      actions: [{
        Transfer: {
          to: Array.from(bridgeAddr),
          amount: Number(inputAmount),
        }
      }],
      max_fee: Number(intent.max_fee),
      signature: [],
    }],
    claimed_tip: Math.floor(Number(intent.tip) * 0.5), // claim 50% of tip
    score: 100,
    signature: [],
  };

  // Sign the solution: intent_id[8] + solver[32] + claimed_tip[16]
  const sigMsg = new Uint8Array(56);
  const view = new DataView(sigMsg.buffer);
  view.setBigUint64(0, BigInt(intent.id), true);
  sigMsg.set(solverPubKey, 8);
  view.setBigUint64(40, BigInt(solution.claimed_tip), true);
  // upper 8 bytes of claimed_tip are 0

  const sig = ed25519.sign(sigMsg, seedBytes);
  solution.signature = Array.from(sig);

  // Submit to Solen
  const resp = await fetch(config.solen.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "solen_submitSolution",
      params: [solution],
    }),
  });
  const result = await resp.json() as any;

  if (result.result?.accepted) {
    console.log(`[solver] Solution accepted for intent #${intent.id}`);
  } else {
    const error = result.result?.error || result.error?.message || JSON.stringify(result);
    console.error(`[solver] Solution rejected: ${error}`);
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
