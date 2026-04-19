import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const config = {
  // Base Mainnet
  base: {
    rpc: process.env.BASE_RPC || "https://mainnet.base.org",
    bridgeAddress: "0x67c369a8FC8fd099158df035F1bE9A8cc29f66Ea",
    wsolenAddress: "0x14C84e576EDDb3e24b3dA3659843b585285f9fD9",
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
