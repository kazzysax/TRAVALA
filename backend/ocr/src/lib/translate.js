// Uses MyMemory (mymemory.translated.net) - free, no API key, no signup, no
// credit card. Anonymous quota is 5,000 chars/day; setting MYMEMORY_EMAIL (a
// free courtesy registration, not a paid account) raises that to 50,000/day.
// Swap this file for DeepL/Google/a self-hosted LibreTranslate instance if
// you outgrow MyMemory's quota later - src/routes/scan.js doesn't need to
// change either way.
async function translateLines(lines, targetLanguage) {
  if (lines.length === 0) return [];

  const translations = [];
  for (const line of lines) {
    const params = new URLSearchParams({
      q: line,
      langpair: `autodetect|${targetLanguage}`,
    });
    if (process.env.MYMEMORY_EMAIL) params.set("de", process.env.MYMEMORY_EMAIL);

    const res = await fetch(`https://api.mymemory.translated.net/get?${params}`);
    if (!res.ok) throw new Error(`MyMemory translate failed: ${res.status}`);
    const data = await res.json();
    if (data.responseStatus && Number(data.responseStatus) >= 400) {
      throw new Error(`MyMemory translate error: ${data.responseDetails || data.responseStatus}`);
    }
    translations.push(data?.responseData?.translatedText ?? line);
  }
  return translations;
}

module.exports = { translateLines };
