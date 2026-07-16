// REQUIRES: TRANSLATE_API_KEY. Written against Google Cloud Translate v2's
// REST API (no SDK needed) - see .env.example for swapping providers.

async function translateLines(lines, targetLanguage) {
  const { TRANSLATE_API_KEY } = process.env;
  if (!TRANSLATE_API_KEY) throw new Error("TRANSLATE_API_KEY not set - see .env.example");
  if (lines.length === 0) return [];

  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${TRANSLATE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: lines, target: targetLanguage, format: "text" }),
  });
  if (!res.ok) throw new Error(`translate API failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  return data.data.translations.map((t) => t.translatedText);
}

module.exports = { translateLines };
