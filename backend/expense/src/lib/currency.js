// REQUIRES: EXCHANGE_RATE_API_BASE_URL / EXCHANGE_RATE_API_KEY - written
// against Currencylayer's /live endpoint (the actual API behind
// exchangerate.host as of 2026, not its marketing homepage - that distinction
// cost a debugging round, so it's worth stating plainly: BASE_URL must be
// something like https://api.currencylayer.com/live, not the bare domain).
//
// Currencylayer's free tier only allows USD as the source currency - asking
// for an arbitrary "source" requires a paid plan. So every call fetches USD
// quotes for both currencies involved and computes the cross rate locally,
// which works on the free tier and costs nothing extra on a paid one either.

async function fetchUsdQuotes() {
  const { EXCHANGE_RATE_API_BASE_URL, EXCHANGE_RATE_API_KEY } = process.env;
  if (!EXCHANGE_RATE_API_BASE_URL || !EXCHANGE_RATE_API_KEY) {
    throw new Error("EXCHANGE_RATE_API_BASE_URL / EXCHANGE_RATE_API_KEY not set - see .env.example");
  }

  const url = `${EXCHANGE_RATE_API_BASE_URL}?access_key=${EXCHANGE_RATE_API_KEY}`;
  const res = await fetch(url);
  const text = await res.text();
  console.log(`[currency] ${res.status} from ${EXCHANGE_RATE_API_BASE_URL} - body starts: ${text.slice(0, 150)}`);
  if (!res.ok) throw new Error(`exchange rate lookup failed: ${res.status}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `exchange rate API returned non-JSON (status ${res.status}) - check EXCHANGE_RATE_API_BASE_URL is the actual API endpoint (e.g. https://api.currencylayer.com/live), not a docs/homepage URL`
    );
  }
  if (!data.success || !data.quotes) {
    throw new Error(`exchange rate API error: ${JSON.stringify(data.error || data).slice(0, 200)}`);
  }
  return data.quotes; // e.g. { USDGBP: 0.79, USDEUR: 0.92, ... }
}

async function getConversionRate(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1;

  const quotes = await fetchUsdQuotes();
  const usdToFrom = fromCurrency === "USD" ? 1 : quotes[`USD${fromCurrency}`];
  const usdToTarget = toCurrency === "USD" ? 1 : quotes[`USD${toCurrency}`];
  if (!usdToFrom || !usdToTarget) {
    throw new Error(`no USD quote for ${fromCurrency} or ${toCurrency}`);
  }
  return usdToTarget / usdToFrom;
}

async function convert(amount, fromCurrency, toCurrency) {
  const rate = await getConversionRate(fromCurrency, toCurrency);
  return Math.round(amount * rate * 100) / 100;
}

module.exports = { convert, getConversionRate };
