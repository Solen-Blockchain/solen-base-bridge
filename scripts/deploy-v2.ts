import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy new WrappedSOLEN (with timelock + allowance checks)
  console.log("\nDeploying WrappedSOLEN v2...");
  const WrappedSOLEN = await ethers.getContractFactory("WrappedSOLEN");
  const wSOLEN = await WrappedSOLEN.deploy();
  await wSOLEN.waitForDeployment();
  const wSOLENAddress = await wSOLEN.getAddress();
  console.log("WrappedSOLEN deployed at:", wSOLENAddress);

  // Deploy new SolenBridge
  console.log("\nDeploying SolenBridge...");
  const SolenBridge = await ethers.getContractFactory("SolenBridge");
  const bridge = await SolenBridge.deploy(wSOLENAddress);
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("SolenBridge deployed at:", bridgeAddress);

  // Set initial bridge (one-time, no timelock needed for first set)
  console.log("\nSetting initial bridge...");
  const tx1 = await wSOLEN.setInitialBridge(bridgeAddress);
  await tx1.wait();
  console.log("Bridge set to:", bridgeAddress);

  // Set relayer
  console.log("Setting relayer...");
  const tx2 = await bridge.setRelayer(deployer.address, true);
  await tx2.wait();
  console.log("Relayer set to:", deployer.address);

  console.log("\n=== Deployment Complete ===");
  console.log("WrappedSOLEN:", wSOLENAddress);
  console.log("SolenBridge: ", bridgeAddress);
  console.log("Relayer:     ", deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
