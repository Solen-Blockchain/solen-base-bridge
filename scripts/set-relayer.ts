import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const bridgeAddress = "0x076b3977561a8eDb6E92CCA479104DD62DdaFf7C";
  const bridge = await ethers.getContractAt("SolenBridge", bridgeAddress);

  console.log("Setting relayer to:", deployer.address);
  const tx = await bridge.setRelayer(deployer.address, true);
  await tx.wait();
  console.log("Relayer set successfully.");
}

main().catch(console.error);
