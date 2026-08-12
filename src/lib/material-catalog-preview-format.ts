const BUSINESS_TIME_ZONE = "America/New_York";
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NONNEGATIVE_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function decimal(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function formatMaterialCatalogDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "Not provided";
  const isDateOnly = DATE_ONLY_PATTERN.test(raw);
  const date = new Date(isDateOnly ? `${raw}T00:00:00.000Z` : raw);
  if (Number.isNaN(date.getTime())) return "Not provided";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: isDateOnly ? "UTC" : BUSINESS_TIME_ZONE,
  }).format(date);
}

export function formatMaterialCatalogMoney(amount: unknown, currency: unknown) {
  const rawAmount = decimal(amount);
  const currencyCode = text(currency);
  if (!rawAmount || !currencyCode) return "Not provided";
  if (!NONNEGATIVE_DECIMAL_PATTERN.test(rawAmount)) return "Not provided";
  return `${currencyCode} ${rawAmount}`;
}
