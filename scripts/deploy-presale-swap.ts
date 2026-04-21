import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  const PRESALE_TOKEN = "0xe1a388d7682c98908b798352e3d415a386cb96b8";

  console.log("\nDeploying PresaleSwap...");
  const PresaleSwap = await ethers.getContractFactory("PresaleSwap");
  const swap = await PresaleSwap.deploy(PRESALE_TOKEN);
  await swap.waitForDeployment();
  const swapAddress = await swap.getAddress();
  console.log("PresaleSwap deployed at:", swapAddress);

  console.log("\n=== Deployment Complete ===");
  console.log("PresaleSwap:", swapAddress);
  console.log("Presale Token:", PRESALE_TOKEN);
  console.log("\nHolders approve this contract, then call swap(solenAddress, amount)");
}

main().catch(console.error);
