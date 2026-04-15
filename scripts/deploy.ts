import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy WrappedSOLEN
  console.log("\nDeploying WrappedSOLEN...");
  const WrappedSOLEN = await ethers.getContractFactory("WrappedSOLEN");
  const wSOLEN = await WrappedSOLEN.deploy();
  await wSOLEN.waitForDeployment();
  const wSOLENAddress = await wSOLEN.getAddress();
  console.log("WrappedSOLEN deployed at:", wSOLENAddress);

  // Deploy SolenBridge
  console.log("\nDeploying SolenBridge...");
  const SolenBridge = await ethers.getContractFactory("SolenBridge");
  const bridge = await SolenBridge.deploy(wSOLENAddress);
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("SolenBridge deployed at:", bridgeAddress);

  // Configure: set bridge as authorized minter on wSOLEN
  console.log("\nConfiguring...");
  const tx1 = await wSOLEN.setBridge(bridgeAddress);
  await tx1.wait();
  console.log("wSOLEN bridge set to:", bridgeAddress);

  // Set deployer as relayer
  const tx2 = await bridge.setRelayer(deployer.address, true);
  await tx2.wait();
  console.log("Relayer set to:", deployer.address);

  console.log("\n=== Deployment Complete ===");
  console.log("WrappedSOLEN:", wSOLENAddress);
  console.log("SolenBridge: ", bridgeAddress);
  console.log("Relayer:     ", deployer.address);
  console.log("\nSave these addresses for the relayer config.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
