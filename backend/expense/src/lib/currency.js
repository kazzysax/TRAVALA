// REQUIRES: EXCHANGE_RATE_API_BASE_URL / EXCHANGE_RATE_API_KEY - written
// against the common "base URL + access_key query param, rates in response.rates"
// shape shared by most providers (exchangerate.host, openexchangerates.org,
// currencylayer). Adjust the query param name / response field below to
// match whichever provider you pick; this is not runnable against a
// specific live API until you do.

async function getConversionRate(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1;

  const { EXCHANGE_RATE_API_BASE_URL, EXCHANGE_RATE_API_KEY } = process.env;
  if (!EXCHANGE_RATE_API_BASE_URL || !EXCHANGE_RATE_API_KEY) {
    throw new Error("EXCHANGE_RATE_API_BASE_URL / EXCHANGE_RATE_API_KEY not set - see .env.example");
  }

  const url = `${EXCHANGE_RATE_API_BASE_URL}?access_key=${EXCHANGE_RATE_API_KEY}&base=${fromCurrency}&symbols=${toCurrency}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`exchange rate lookup failed: ${res.status}`);
  const data = await res.json();
  const rate = data?.rates?.[toCurrency];
  if (!rate) throw new Error(`no rate returned for ${fromCurrency}->${toCurrency}`);
  return rate;
}

async function convert(amount, fromCurrency, toCurrency) {
  const rate = await getConversionRate(fromCurrency, toCurrency);
  return Math.round(amount * rate * 100) / 100;
}

module.exports = { convert, getConversionRate };
