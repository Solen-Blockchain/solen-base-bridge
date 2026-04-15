import { ethers } from "hardhat";

async function main() {
  const bridge = await ethers.getContractAt("SolenBridge", "0x114E53baa3A49A3D1F28DCaBdF27EF13EF19bbAD");
  const wSOLEN = await ethers.getContractAt("WrappedSOLEN", "0x2774FF63879Ae11CC6763538Ec1133d2907fCe8F");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Bridge owner:", await bridge.owner());
  console.log("wSOLEN bridge:", await wSOLEN.bridge());
  console.log("Is relayer:", await bridge.relayers(deployer.address));
}

main().catch(console.error);
