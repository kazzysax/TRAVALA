import { VM } from "@ethereumjs/vm";
import { Common, Chain, Hardfork } from "@ethereumjs/common";
import { LegacyTransaction } from "@ethereumjs/tx";
import { Account, Address, hexToBytes, privateToAddress } from "@ethereumjs/util";
import { ethers } from "ethers";
import fs from "fs";

const LegacyTx = LegacyTransaction;
const art = JSON.parse(fs.readFileSync("ServiceRating.artifact.json", "utf8"));
const iface = new ethers.Interface(art.abi);

const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Cancun });
const vm = await VM.create({ common });

// fund an admin/deployer account
const pk = hexToBytes("0x" + "11".repeat(32));
const sender = new Address(privateToAddress(pk));
await vm.stateManager.putAccount(sender, new Account(0n, 10n ** 20n));

let nonce = 0n;
async function send(to, data, value = 0n) {
  const tx = LegacyTx.fromTxData({
    to: to || undefined,
    data: hexToBytes(data),
    gasLimit: 8_000_000n,
    gasPrice: 100n,
    value,
    nonce: nonce++,
  }).sign(pk);
  const res = await vm.runTx({ tx });
  if (res.execResult.exceptionError) {
    throw new Error("EVM revert: " + JSON.stringify(res.execResult.exceptionError));
  }
  return res;
}

async function call(to, data) {
  const res = await vm.evm.runCall({
    to: new Address(hexToBytes(to)),
    caller: sender,
    origin: sender,
    data: hexToBytes(data),
    gasLimit: 8_000_000n,
  });
  return "0x" + Buffer.from(res.execResult.returnValue).toString("hex");
}

// ---- deploy: constructor(admin, treasury) ----
const treasury = "0x00000000000000000000000000000000000000AA";
const deployData = art.bytecode + iface.encodeDeploy([sender.toString(), treasury]).slice(2);
const dep = await send(null, deployData);
const contractAddr = dep.createdAddress.toString();
console.log("Deployed ServiceRating at", contractAddr);

const cid = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const CITY_LIS = cid("Lisbon,Portugal");
const CITY_TOK = cid("Tokyo,Japan");
const SVC_MIGUEL = cid("miguel-airport-transfer");
const SVC_TABERNA = cid("taberna-rua-das-flores");
const FEE = ethers.parseEther("0.1");

// helper to submit a rating from the sender wallet (manual path)
async function rate(city, svc, val, tag) {
  const data = iface.encodeFunctionData("submitRating", [city, svc, val, tag]);
  await send(contractAddr, data, FEE);
}

console.log("\n--- submitting ratings ---");
// sender rates Miguel (Lisbon) 5, Taberna (Lisbon) 4, and a Tokyo service 3
await rate(CITY_LIS, SVC_MIGUEL, 5, "on time");
await rate(CITY_LIS, SVC_MIGUEL, 4, "friendly");   // second rating for same city+service
await rate(CITY_LIS, SVC_TABERNA, 5, "great food");
await rate(CITY_TOK, SVC_MIGUEL, 3, "");           // same serviceId but DIFFERENT city
console.log("submitted 4 ratings");

function decode(fn, ret) { return iface.decodeFunctionResult(fn, ret); }

// ---- 1. city-level count: Lisbon should have 3, Tokyo 1 ----
let r = await call(contractAddr, iface.encodeFunctionData("getCityRatingCount", [CITY_LIS]));
const lisCount = decode("getCityRatingCount", r)[0];
r = await call(contractAddr, iface.encodeFunctionData("getCityRatingCount", [CITY_TOK]));
const tokCount = decode("getCityRatingCount", r)[0];
console.log(`\n[1] Lisbon city ratings = ${lisCount} (expect 3), Tokyo = ${tokCount} (expect 1)`);

// ---- 2. city+service average: Miguel in Lisbon = (5+4)/2 = 4.5 -> 450 ----
r = await call(contractAddr, iface.encodeFunctionData("getCityServiceAverage", [CITY_LIS, SVC_MIGUEL]));
const [avg, cnt] = decode("getCityServiceAverage", r);
console.log(`[2] Miguel@Lisbon avg x100 = ${avg} (expect 450), count = ${cnt} (expect 2)`);

// ---- 3. same serviceId in Tokyo is separate: Miguel@Tokyo = 3.0 -> 300, count 1 ----
r = await call(contractAddr, iface.encodeFunctionData("getCityServiceAverage", [CITY_TOK, SVC_MIGUEL]));
const [avgT, cntT] = decode("getCityServiceAverage", r);
console.log(`[3] Miguel@Tokyo avg x100 = ${avgT} (expect 300), count = ${cntT} (expect 1)  <- city scoping works`);

// ---- 4. "check a stamp": this wallet's ratings in Lisbon only = 3 ----
r = await call(contractAddr, iface.encodeFunctionData("getRaterCityRatingCount", [sender.toString(), CITY_LIS]));
const raterLis = decode("getRaterCityRatingCount", r)[0];
r = await call(contractAddr, iface.encodeFunctionData("getRaterCityRatingCount", [sender.toString(), CITY_TOK]));
const raterTok = decode("getRaterCityRatingCount", r)[0];
console.log(`[4] This wallet's Lisbon ratings = ${raterLis} (expect 3), Tokyo = ${raterTok} (expect 1)  <- stamp view`);

// ---- 5. read back the actual rating rows for the stamp view ----
r = await call(contractAddr, iface.encodeFunctionData("getRaterCityRatings", [sender.toString(), CITY_LIS, 0, 10]));
const rows = decode("getRaterCityRatings", r)[0];
console.log(`[5] Lisbon rating rows for this wallet:`);
for (const row of rows) {
  console.log(`     - value ${row.value}, tag "${row.tag}", serviceId ${row.serviceId.slice(0,10)}…`);
}

// ---- assertions ----
let pass = true;
function check(name, got, want){ const ok = got.toString()===want.toString(); if(!ok)pass=false; console.log(`   ${ok?"PASS":"FAIL"} ${name}`);}
console.log("\n--- assertions ---");
check("Lisbon count=3", lisCount, 3);
check("Tokyo count=1", tokCount, 1);
check("Miguel@Lisbon avg=450", avg, 450);
check("Miguel@Lisbon count=2", cnt, 2);
check("Miguel@Tokyo avg=300 (separate)", avgT, 300);
check("wallet Lisbon ratings=3", raterLis, 3);
check("wallet Tokyo ratings=1", raterTok, 1);
check("stamp view returned 3 rows", rows.length, 3);

console.log(pass ? "\n✅ ALL CHECKS PASSED — city+service linkage works" : "\n❌ SOME CHECKS FAILED");
process.exit(pass?0:1);
