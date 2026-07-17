const hre = require("hardhat");

const CREDENTIAL_ADDR = "0x6be2D7472Ea14f4B6404a37dCF5BC65FD7790006";
const NEW_MINTER_ADDR = "0x7629499376Df310D7f8f46A5fb220fF4815b4bC1"; // dedicated minter key for backend/auth

async function main() {
  const credential = await hre.ethers.getContractAt("TravelerCredential", CREDENTIAL_ADDR);
  const MINTER_ROLE = await credential.MINTER_ROLE();

  const already = await credential.hasRole(MINTER_ROLE, NEW_MINTER_ADDR);
  console.log(`${NEW_MINTER_ADDR} already has MINTER_ROLE: ${already}`);
  if (already) return;

  console.log("Granting MINTER_ROLE...");
  const tx = await credential.grantRole(MINTER_ROLE, NEW_MINTER_ADDR);
  await tx.wait();
  console.log("Granted. tx:", tx.hash);

  console.log("Verify:", await credential.hasRole(MINTER_ROLE, NEW_MINTER_ADDR));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
