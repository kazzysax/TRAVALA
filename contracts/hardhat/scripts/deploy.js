const hre = require("hardhat");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Network:", hre.network.name);

  const treasuryAddress = requireEnv("TREASURY_ADDRESS");
  const backendMinterAddress = requireEnv("BACKEND_MINTER_ADDRESS");

  // --- TravelerCredential ---
  const Credential = await hre.ethers.getContractFactory("TravelerCredential");
  const credential = await Credential.deploy(deployer.address); // admin
  await credential.waitForDeployment();
  console.log("TravelerCredential deployed to:", await credential.getAddress());

  // --- ServiceRating ---
  const Rating = await hre.ethers.getContractFactory("ServiceRating");
  const rating = await Rating.deploy(deployer.address, treasuryAddress);
  await rating.waitForDeployment();
  console.log("ServiceRating deployed to:", await rating.getAddress());

  // --- SessionPermission (scoped auto-sign forwarder) ---
  const Session = await hre.ethers.getContractFactory("SessionPermission");
  const session = await Session.deploy(await rating.getAddress());
  await session.waitForDeployment();
  console.log("SessionPermission deployed to:", await session.getAddress());

  // --- wire up roles ---
  const MINTER_ROLE = await credential.MINTER_ROLE();
  await (await credential.grantRole(MINTER_ROLE, backendMinterAddress)).wait();
  console.log("Granted MINTER_ROLE to backend minter service");

  // Only SessionPermission gets RELAYER_ROLE - the auto-sign path never
  // reaches ServiceRating through a raw backend EOA. SessionPermission's own
  // bytecode has no path to anything except submitRatingFor, so this is the
  // full extent of what auto-sign can ever do onchain.
  await (await rating.grantRelayer(await session.getAddress())).wait();
  console.log("Granted RELAYER_ROLE to SessionPermission (scoped auto-sign)");

  console.log("\nDone. Save these addresses - your backend needs them:");
  console.log("TRAVELER_CREDENTIAL_ADDRESS=", await credential.getAddress());
  console.log("SERVICE_RATING_ADDRESS=", await rating.getAddress());
  console.log("SESSION_PERMISSION_ADDRESS=", await session.getAddress());
  console.log(
    "\nReminder: delete your local .env now if this was the last command you needed it for."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
