// Reads .env.render.local itself (never surfaced to the assistant via a Read
// tool) and pushes each value directly to Render's API. Prints only key
// names and per-key success/failure - actual values never appear in output.

const fs = require("fs");
const os = require("os");
const path = require("path");

const SERVICE_IDS = {
  AUTH: "srv-d9cnbdfavr4c73a2hdag",
  RELAYER: "srv-d9cnbfe7r5hc738ttjp0",
  EXPENSE: "srv-d9cnbgj7uimc73emf8j0",
  OCR: "srv-d9cnbhvavr4c73a2ho70",
  INDEXER: "srv-d9cnbkvlk1mc73f9l4m0",
};

function loadCliKey() {
  const raw = fs.readFileSync(path.join(os.homedir(), ".render", "cli.yaml"), "utf8");
  const match = raw.match(/^\s*key:\s*(\S+)\s*$/m);
  if (!match) throw new Error("could not find api.key in ~/.render/cli.yaml - is `render login` still active?");
  return match[1];
}

function parseEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const entries = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!value) continue; // skip blanks the user hasn't filled in
    entries.push([key, value]);
  }
  return entries;
}

async function setEnvVar(apiKey, serviceId, envKey, value) {
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars/${envKey}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  return res.ok;
}

async function main() {
  const filePath = path.join(__dirname, ".env.render.local");
  if (!fs.existsSync(filePath)) {
    console.error("Missing backend/.env.render.local - copy .env.render.local.example and fill it in first.");
    process.exit(1);
  }

  const apiKey = loadCliKey();
  const entries = parseEnvFile(filePath);
  if (entries.length === 0) {
    console.log("No filled-in values found - nothing to export.");
    return;
  }

  console.log(`Found ${entries.length} filled-in value(s). Pushing to Render...\n`);

  for (const [prefixedKey, value] of entries) {
    const [prefix, ...rest] = prefixedKey.split("__");
    const envKey = rest.join("__");
    const serviceId = SERVICE_IDS[prefix];
    if (!serviceId) {
      console.log(`SKIP   ${prefixedKey} - unknown service prefix "${prefix}"`);
      continue;
    }
    const ok = await setEnvVar(apiKey, serviceId, envKey, value);
    console.log(`${ok ? "OK    " : "FAILED"} ${prefix}/${envKey}`);
  }

  console.log("\nDone. Verify in each service's Environment tab, then delete .env.render.local.");
}

main().catch((e) => console.error("Error:", e.message));
