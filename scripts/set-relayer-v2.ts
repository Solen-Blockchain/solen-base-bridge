import { ethers } from "hardhat";
async function main() {
  const [deployer] = await ethers.getSigners();
  const bridge = await ethers.getContractAt("SolenBridge", "0x67c369a8FC8fd099158df035F1bE9A8cc29f66Ea");
  console.log("Setting relayer...");
  const tx = await bridge.setRelayer(deployer.address, true);
  await tx.wait();
  console.log("Relayer set to:", deployer.address);
}
main().catch(console.error);
