export const DEFAULT_NUMBER_FORMAT = "{PREFIX}-QTN-{SEQ}";

/** Indian financial year (April–March) for a date, e.g. 2026-09-29 -> "26-27" */
export function financialYear(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

/**
 * Builds a quotation number from the configured format.
 * Supported tokens: {PREFIX} {SEQ} {YYYY} {YY} {MM} {FY}
 */
export function formatQuotationNumber(
  format: string,
  prefix: string,
  seq: number,
  padding: number,
  dateISO: string,
): string {
  const [yyyy, mm] = dateISO.split("-");
  const fmt = format?.trim() || DEFAULT_NUMBER_FORMAT;
  return fmt
    .replaceAll("{PREFIX}", (prefix || "QTN").trim().toUpperCase())
    .replaceAll("{SEQ}", String(seq).padStart(Math.max(1, Math.min(padding || 4, 10)), "0"))
    .replaceAll("{YYYY}", yyyy)
    .replaceAll("{YY}", yyyy.slice(-2))
    .replaceAll("{MM}", mm)
    .replaceAll("{FY}", financialYear(dateISO));
}
