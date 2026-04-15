import { ethers } from "hardhat";

const BRIDGE_ADDRESS = "0x114E53baa3A49A3D1F28DCaBdF27EF13EF19bbAD";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Setting relayer with:", deployer.address);

  const bridge = await ethers.getContractAt("SolenBridge", BRIDGE_ADDRESS);

  const tx = await bridge.setRelayer(deployer.address, true);
  await tx.wait();
  console.log("Relayer set. TX:", tx.hash);

  // Verify
  const isRelayer = await bridge.relayers(deployer.address);
  console.log("Verified relayer:", isRelayer);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
