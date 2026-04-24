/**
 * Centralised formatters.
 * Locale defaults to en-AU — set NEXT_PUBLIC_LOCALE or LOCALE env
 * to override if ever reporting to a non-AU audience.
 */

const LOCALE = process.env.LOCALE || process.env.NEXT_PUBLIC_LOCALE || "en-AU";
const CURRENCY =
  process.env.CURRENCY || process.env.NEXT_PUBLIC_CURRENCY || "AUD";

/**
 * Format a currency amount. Hides cents when the value is >= $1,000
 * to keep KPI cards readable.
 */
export function formatCurrency(value, { compact = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  const n = Number(value);
  const opts = {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: Math.abs(n) >= 1000 || compact ? 0 : 2,
    minimumFractionDigits: Math.abs(n) >= 1000 || compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  };
  return new Intl.NumberFormat(LOCALE, opts).format(n);
}

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat(LOCALE).format(Number(value));
}

export function formatRatio(value, { decimals = 2 } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Number(value).toFixed(decimals)}×`;
}

export function formatPercent(value, { decimals = 1 } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${(Number(value) * 100).toFixed(decimals)}%`;
}

/**
 * Date helpers. All ISO dates are interpreted in the Melbourne timezone
 * so day boundaries align with how campaigns and contracts are reported.
 */
export function isoDate(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  return isoDate(new Date());
}

export function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

/**
 * Render a yyyy-mm-dd (or Date) as a short Australian-formatted date,
 * e.g. "12 Mar 2026". Returns em-dash for null/invalid input.
 */
export function formatDate(value) {
  if (!value) return "—";
  const d =
    value instanceof Date
      ? value
      : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Render a pacing "days difference" (days needed − days remaining in contract).
 *   Positive → behind (e.g. "+12d behind")
 *   Negative → ahead  (e.g. "-8d ahead")
 *   0        → on track
 *   null     → em-dash
 */
export function formatDiffDays(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  const n = Math.round(Number(value));
  if (n === 0) return "on track";
  if (n > 0) return `+${n}d behind`;
  return `${n}d ahead`;
}

/**
 * Safe division — returns null (rendered as em-dash) instead of NaN/Infinity.
 * This matters for CPL/CPR when a builder has spend but no leads yet.
 */
export function safeDivide(numerator, denominator) {
  if (!denominator || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return null;
  }
  const result = numerator / denominator;
  if (!Number.isFinite(result)) return null;
  return result;
}
