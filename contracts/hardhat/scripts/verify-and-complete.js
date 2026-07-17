const hre = require("hardhat");

const CREDENTIAL_ADDR = "0x6be2D7472Ea14f4B6404a37dCF5BC65FD7790006";
const RATING_ADDR = "0x654971896ad56d86A4826c08b6175477c53caFa6";
const SESSION_ADDR = "0xa855E24A4405eFb75044CF541484759529Fbb7e7";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;

  console.log("Checking deployed bytecode exists on-chain...");
  for (const [name, addr] of [
    ["TravelerCredential", CREDENTIAL_ADDR],
    ["ServiceRating", RATING_ADDR],
    ["SessionPermission", SESSION_ADDR],
  ]) {
    const code = await provider.getCode(addr);
    console.log(` ${name} @ ${addr}: ${code === "0x" ? "NOT DEPLOYED" : `deployed (${(code.length - 2) / 2} bytes)`}`);
    if (code === "0x") throw new Error(`${name} has no code at ${addr} - deployment did not land`);
  }

  const credential = await hre.ethers.getContractAt("TravelerCredential", CREDENTIAL_ADDR);
  const rating = await hre.ethers.getContractAt("ServiceRating", RATING_ADDR);

  const backendMinter = process.env.BACKEND_MINTER_ADDRESS;
  const MINTER_ROLE = await credential.MINTER_ROLE();
  const hasMinter = await credential.hasRole(MINTER_ROLE, backendMinter);
  console.log(`\nBACKEND_MINTER_ADDRESS has MINTER_ROLE: ${hasMinter}`);

  const RELAYER_ROLE = await rating.RELAYER_ROLE();
  const hasRelayer = await rating.hasRole(RELAYER_ROLE, SESSION_ADDR);
  console.log(`SessionPermission has RELAYER_ROLE: ${hasRelayer}`);

  if (!hasMinter) {
    console.log("\nGranting MINTER_ROLE to BACKEND_MINTER_ADDRESS...");
    const tx = await credential.connect(deployer).grantRole(MINTER_ROLE, backendMinter);
    await tx.wait();
    console.log("Granted. tx:", tx.hash);
  }

  if (!hasRelayer) {
    console.log("\nGranting RELAYER_ROLE to SessionPermission...");
    const tx = await rating.connect(deployer).grantRelayer(SESSION_ADDR);
    await tx.wait();
    console.log("Granted. tx:", tx.hash);
  }

  console.log("\nFinal state:");
  console.log("BACKEND_MINTER_ADDRESS has MINTER_ROLE:", await credential.hasRole(MINTER_ROLE, backendMinter));
  console.log("SessionPermission has RELAYER_ROLE:", await rating.hasRole(RELAYER_ROLE, SESSION_ADDR));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
