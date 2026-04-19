import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const config = {
  // Base Mainnet
  base: {
    rpc: process.env.BASE_RPC || "https://mainnet.base.org",
    bridgeAddress: "0x076b3977561a8eDb6E92CCA479104DD62DdaFf7C",
    wsolenAddress: "0xFaa59fbA59E8dEb2e1264f3efcd5a3675F6986a9",
    relayerKey: process.env.DEPLOYER_PRIVATE_KEY!,
    chainId: 8453,
  },

  // Solen Mainnet
  solen: {
    rpc: "http://127.0.0.1:9944",
    ws: "ws://127.0.0.1:9944",
    chainId: 1,
    // Bridge vault address on Solen (system contract)
    vaultAddress: "0000000000000000000000000000000000000000000000000000000000000003",
    // Sequencer key for submitting release transactions on Solen
    sequencerSeed: process.env.SOLEN_SEQUENCER_SEED || "",
  },

  // Relayer settings
  pollIntervalMs: 5000,
  confirmations: 3, // Base mainnet confirmations before relaying
};
