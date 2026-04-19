import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const wSOLENAddress = "0x14C84e576EDDb3e24b3dA3659843b585285f9fD9";

  console.log("Deploying SolenBridge...");
  const SolenBridge = await ethers.getContractFactory("SolenBridge");
  const bridge = await SolenBridge.deploy(wSOLENAddress);
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("SolenBridge deployed at:", bridgeAddress);

  console.log("Setting initial bridge on wSOLEN...");
  const wSOLEN = await ethers.getContractAt("WrappedSOLEN", wSOLENAddress);
  const tx1 = await wSOLEN.setInitialBridge(bridgeAddress);
  await tx1.wait();
  console.log("Bridge set.");

  console.log("Setting relayer...");
  const tx2 = await bridge.setRelayer(deployer.address, true);
  await tx2.wait();
  console.log("Relayer set.");

  console.log("\n=== Done ===");
  console.log("WrappedSOLEN:", wSOLENAddress);
  console.log("SolenBridge: ", bridgeAddress);
}

main().catch(console.error);
