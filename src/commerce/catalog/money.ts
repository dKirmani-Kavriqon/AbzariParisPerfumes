/**
 * Money helpers. Amounts are integers in the currency's minor unit (paise for INR, cents for
 * USD, whole yen for JPY). Conversions are done on strings, never with floating point.
 * Safe for browser and server code.
 */

/** Largest amount the database column (int4) can hold, in minor units. */
export const MAX_MINOR_AMOUNT = 2_000_000_000

let supported: Set<string> | undefined
function supportedCurrencies() {
  if (!supported) {
    const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : []
    supported = new Set(list)
  }
  return supported
}

/** True for ISO 4217 codes the runtime knows (e.g. "INR", "USD"). */
export function isValidCurrency(code: string) {
  if (!/^[A-Z]{3}$/.test(code)) return false
  const known = supportedCurrencies()
  return known.size === 0 || known.has(code)
}

/** Number of digits after the decimal point for a currency: INR 2, JPY 0, KWD 3. */
export function minorUnitDigits(currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

/**
 * Parses a human amount ("1,499.50", "1499", "1499.5") into minor units (149950 for INR).
 * Returns null for anything that is not a plain non-negative amount with at most the
 * currency's number of decimals.
 */
export function parseMoney(input: string, currency: string): number | null {
  const digits = minorUnitDigits(currency)
  const clean = input.trim().replace(/[,\s]/g, '')
  const re = digits > 0 ? new RegExp(`^(\\d{1,10})(?:\\.(\\d{0,${digits}}))?$`) : /^(\d{1,12})$/
  const m = re.exec(clean)
  if (!m) return null
  const whole = m[1]
  const frac = (m[2] ?? '').padEnd(digits, '0')
  const minor = Number(whole + frac)
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR_AMOUNT ? minor : null
}

/** Minor units to a plain decimal string for form fields: 149950 → "1499.50". */
export function toDecimalString(minor: number, currency: string) {
  const digits = minorUnitDigits(currency)
  if (digits === 0) return String(minor)
  const s = String(minor).padStart(digits + 1, '0')
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`
}

/** Minor units to a display string, e.g. formatMoney(149950, 'INR', 'en-IN') → "₹1,499.50". */
export function formatMoney(minor: number, currency: string, locale = 'en-IN') {
  const digits = minorUnitDigits(currency)
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: digits }).format(minor / 10 ** digits)
}
