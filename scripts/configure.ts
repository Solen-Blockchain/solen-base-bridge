import { ethers } from "hardhat";

const WSOLEN_ADDRESS = "0x2774FF63879Ae11CC6763538Ec1133d2907fCe8F";
const BRIDGE_ADDRESS = "0x114E53baa3A49A3D1F28DCaBdF27EF13EF19bbAD";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Configuring with:", deployer.address);

  const wSOLEN = await ethers.getContractAt("WrappedSOLEN", WSOLEN_ADDRESS);
  const bridge = await ethers.getContractAt("SolenBridge", BRIDGE_ADDRESS);

  // Set bridge as authorized minter on wSOLEN
  console.log("Setting bridge on wSOLEN...");
  const tx1 = await wSOLEN.setBridge(BRIDGE_ADDRESS);
  await tx1.wait();
  console.log("Done. TX:", tx1.hash);

  // Set deployer as relayer
  console.log("Setting relayer...");
  const tx2 = await bridge.setRelayer(deployer.address, true);
  await tx2.wait();
  console.log("Done. TX:", tx2.hash);

  console.log("\n=== Configuration Complete ===");
  console.log("WrappedSOLEN:", WSOLEN_ADDRESS);
  console.log("SolenBridge: ", BRIDGE_ADDRESS);
  console.log("Relayer:     ", deployer.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
