import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const wSOLENAddress = "0xFaa59fbA59E8dEb2e1264f3efcd5a3675F6986a9";
  const bridgeAddress = "0x076b3977561a8eDb6E92CCA479104DD62DdaFf7C";

  console.log("Configuring with:", deployer.address);

  const wSOLEN = await ethers.getContractAt("WrappedSOLEN", wSOLENAddress);
  const bridge = await ethers.getContractAt("SolenBridge", bridgeAddress);

  // Set bridge on wSOLEN
  console.log("Setting bridge on wSOLEN...");
  const tx1 = await wSOLEN.setBridge(bridgeAddress);
  await tx1.wait();
  console.log("Done. Bridge set to:", bridgeAddress);

  // Set relayer
  console.log("Setting relayer...");
  const tx2 = await bridge.setRelayer(deployer.address, true);
  await tx2.wait();
  console.log("Done. Relayer set to:", deployer.address);

  console.log("\n=== Configuration Complete ===");
}

main().catch(console.error);
