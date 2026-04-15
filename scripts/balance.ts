import { ethers } from "hardhat";

async function main() {
  const wSOLEN = await ethers.getContractAt("WrappedSOLEN", "0x2774FF63879Ae11CC6763538Ec1133d2907fCe8F");
  const addr = "0x082FC99040BEA444C823b29B3C67df9e18C03672";

  const balance = await wSOLEN.balanceOf(addr);
  const supply = await wSOLEN.totalSupply();

  console.log(`wSOLEN balance of ${addr}: ${ethers.formatUnits(balance, 8)} SOLEN`);
  console.log(`wSOLEN total supply: ${ethers.formatUnits(supply, 8)} SOLEN`);
}

main().catch(console.error);
