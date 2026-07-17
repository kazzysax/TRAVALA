// One-off generator: reads the verified master roster and writes a
// content-api data file for every city marked researched:true, using the
// roster's own real data (emergency numbers, entry/visa rules, transport,
// public holidays, major events) - not fabricated. Re-run any time the
// roster gains newly-researched cities; existing hand-authored fields
// (etiquette/neighborhoods/phrases/scams) are preserved if a file already
// exists and already has them.

const fs = require("fs");
const path = require("path");

const ROSTER_PATH = path.join(__dirname, "..", "data", "city-roster.json");
const CITIES_DIR = path.join(__dirname, "..", "data", "cities");

function humanizeKey(key) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizeEmergency(emergencyObj) {
  return Object.entries(emergencyObj).map(([key, value]) => ({
    label: humanizeKey(key),
    number: String(value),
  }));
}

function main() {
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, "utf8"));
  let written = 0;

  for (const [, countries] of Object.entries(roster.continents)) {
    for (const [countryKey, entries] of Object.entries(countries)) {
      for (const entry of entries) {
        if (!entry.researched || !entry.data) continue;

        let city = entry.city;
        let country = countryKey;
        if (entry.cityId_source_string) {
          const [srcCity, srcCountry] = entry.cityId_source_string.split(",").map((s) => s.trim());
          if (srcCity) city = srcCity;
          if (srcCountry) country = srcCountry;
        }
        const slug = `${city}-${country}`.toLowerCase().trim().replace(/\s+/g, "-");
        const dir = path.join(CITIES_DIR, slug);
        const filePath = path.join(dir, "v1.json");

        let existing = {};
        if (fs.existsSync(filePath)) {
          existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
        }

        const data = {
          version: existing.version || 1,
          city,
          country,
          etiquette: existing.etiquette || [],
          neighborhoods: existing.neighborhoods || [],
          dailyRhythm: existing.dailyRhythm || [],
          gettingAround: existing.gettingAround || [],
          phrases: existing.phrases || [],
          transportFares: existing.transportFares || [],
          scams: existing.scams || [],
          translateTargetLanguage: existing.translateTargetLanguage || "en",
          // Real, verified fields straight from the roster:
          emergency: normalizeEmergency(entry.data.emergency),
          entryRequirements: entry.data.entry
            ? { visaNote: entry.data.entry.visa_note, officialSource: entry.data.entry.official_source }
            : null,
          transportInfo: entry.data.transport
            ? {
                paymentCard: entry.data.transport.payment_card,
                mainSystems: entry.data.transport.main_systems || [],
                note: entry.data.transport.note,
              }
            : null,
          publicHolidays2026: entry.data.public_holidays_2026 || null,
          majorEventsNote: entry.data.major_events_note || null,
          rankGlobalArrivals: entry.rank_global_arrivals,
          sourceVerified: true,
        };

        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
        console.log(`Wrote ${slug}/v1.json`);
        written++;
      }
    }
  }
  console.log(`\nDone - ${written} researched cities written.`);
}

main();
