import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const wSOLENAddress = "0xFaa59fbA59E8dEb2e1264f3efcd5a3675F6986a9";

  // Deploy SolenBridge
  console.log("\nDeploying SolenBridge...");
  const SolenBridge = await ethers.getContractFactory("SolenBridge");
  const bridge = await SolenBridge.deploy(wSOLENAddress);
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log("SolenBridge deployed at:", bridgeAddress);

  // Configure wSOLEN
  const wSOLEN = await ethers.getContractAt("WrappedSOLEN", wSOLENAddress);
  const tx1 = await wSOLEN.setBridge(bridgeAddress);
  await tx1.wait();
  console.log("wSOLEN bridge set to:", bridgeAddress);

  // Set relayer
  const tx2 = await bridge.setRelayer(deployer.address, true);
  await tx2.wait();
  console.log("Relayer set to:", deployer.address);

  console.log("\n=== Deployment Complete ===");
  console.log("WrappedSOLEN:", wSOLENAddress);
  console.log("SolenBridge: ", bridgeAddress);
}

main().catch(console.error);
