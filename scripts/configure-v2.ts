import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const wSOLENAddress = "0x14C84e576EDDb3e24b3dA3659843b585285f9fD9";
  const bridgeAddress = "0x67c369a8FC8fd099158df035F1bE9A8cc29f66Ea";

  const wSOLEN = await ethers.getContractAt("WrappedSOLEN", wSOLENAddress);
  const bridge = await ethers.getContractAt("SolenBridge", bridgeAddress);

  // Check if bridge is already set
  const currentBridge = await wSOLEN.bridge();
  console.log("Current bridge:", currentBridge);

  if (currentBridge === "0x0000000000000000000000000000000000000000") {
    console.log("Setting initial bridge...");
    const tx1 = await wSOLEN.setInitialBridge(bridgeAddress);
    await tx1.wait();
    console.log("Bridge set to:", bridgeAddress);
  }

  // Check if relayer is set
  const isRelayer = await bridge.relayers(deployer.address);
  console.log("Relayer set:", isRelayer);

  if (!isRelayer) {
    console.log("Setting relayer...");
    const tx2 = await bridge.setRelayer(deployer.address, true);
    await tx2.wait();
    console.log("Relayer set to:", deployer.address);
  }

  console.log("\n=== Configuration Complete ===");
  console.log("WrappedSOLEN:", wSOLENAddress);
  console.log("SolenBridge: ", bridgeAddress);
}

main().catch(console.error);
