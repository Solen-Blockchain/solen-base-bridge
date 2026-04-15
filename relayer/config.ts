import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const config = {
  // Base Sepolia
  base: {
    rpc: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
    bridgeAddress: "0x114E53baa3A49A3D1F28DCaBdF27EF13EF19bbAD",
    wsolenAddress: "0x2774FF63879Ae11CC6763538Ec1133d2907fCe8F",
    relayerKey: process.env.DEPLOYER_PRIVATE_KEY!,
    chainId: 84532,
  },

  // Solen Testnet
  solen: {
    rpc: "https://testnet-rpc.solenchain.io",
    ws: "wss://testnet-rpc.solenchain.io",
    chainId: 9000,
    // Bridge vault address on Solen (system contract)
    vaultAddress: "0000000000000000000000000000000000000000000000000000000000000003",
    // Sequencer key for submitting release transactions on Solen
    sequencerSeed: process.env.SOLEN_SEQUENCER_SEED || "",
  },

  // Relayer settings
  pollIntervalMs: 5000,
  confirmations: 1, // Base Sepolia confirmations before relaying
};
