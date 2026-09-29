/**
 * GST engine. Tax always flows:
 *   Material (gst_rate, tax_type) → quotation line (gst_rate saved on the line) → line tax → GST summary by rate
 * Nothing here depends on specific material names; rates come from configuration.
 */
import type { GstSummaryRow, Material, QuotationItem, TaxLine, TaxMode, Totals } from "./types";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Common Indian GST slabs offered as quick picks; any other percentage is still allowed. */
export const GST_SLABS = [0, 5, 12, 18, 28];

/** GST % a material carries (exempt supplies are always 0%). */
export function materialGstRate(m: Pick<Material, "gst_rate" | "tax_type">): number {
  if (m.tax_type === "EXEMPT") return 0;
  return Number.isFinite(m.gst_rate) ? m.gst_rate : 0;
}

export interface LineAmounts {
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** Total GST on the line */
  tax: number;
  /** Taxable value + GST */
  total: number;
}

type LineInput = Pick<QuotationItem, "quantity" | "rate" | "discount_pct" | "gst_rate">;

/** Line-level tax. CGST and SGST are each rounded to paise, so the line GST equals CGST + SGST. */
export function lineAmounts(item: LineInput, taxMode: TaxMode = "CGST_SGST"): LineAmounts {
  const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
  const rate = Number.isFinite(item.rate) ? item.rate : 0;
  const gstRate = Number.isFinite(item.gst_rate) ? item.gst_rate : 0;
  const gross = round2(qty * rate);
  const discount = round2((gross * (item.discount_pct || 0)) / 100);
  const taxable = round2(gross - discount);
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (taxMode === "CGST_SGST") {
    cgst = round2((taxable * gstRate) / 200);
    sgst = cgst;
  } else if (taxMode === "IGST") {
    igst = round2((taxable * gstRate) / 100);
  }
  const tax = round2(cgst + sgst + igst);
  return { gross, discount, taxable, cgst, sgst, igst, tax, total: round2(taxable + tax) };
}

/** Totals are the sum of line amounts, so the item table and the GST summary always reconcile. */
export function computeTotals(items: LineInput[], taxMode: TaxMode, roundOff = true): Totals {
  let subtotal = 0;
  let discount_total = 0;
  let taxable_total = 0;
  const byRate = new Map<number, GstSummaryRow>();

  for (const item of items) {
    const a = lineAmounts(item, taxMode);
    subtotal += a.gross;
    discount_total += a.discount;
    taxable_total += a.taxable;
    if (taxMode === "NONE") continue;
    const rate = Number.isFinite(item.gst_rate) ? item.gst_rate : 0;
    const row = byRate.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
    row.taxable = round2(row.taxable + a.taxable);
    row.cgst = round2(row.cgst + a.cgst);
    row.sgst = round2(row.sgst + a.sgst);
    row.igst = round2(row.igst + a.igst);
    row.tax = round2(row.tax + a.tax);
    byRate.set(rate, row);
  }

  const gst_summary = [...byRate.values()].sort((a, b) => a.rate - b.rate);
  const tax_lines: TaxLine[] = [];
  for (const r of gst_summary) {
    if (r.tax === 0) continue;
    if (taxMode === "CGST_SGST") {
      tax_lines.push({ label: "CGST", rate: r.rate / 2, amount: r.cgst });
      tax_lines.push({ label: "SGST", rate: r.rate / 2, amount: r.sgst });
    } else {
      tax_lines.push({ label: "IGST", rate: r.rate, amount: r.igst });
    }
  }

  const tax_total = round2(gst_summary.reduce((s, r) => s + r.tax, 0));
  const exact = round2(taxable_total + tax_total);
  const grand_total = roundOff ? Math.round(exact) : exact;

  return {
    subtotal: round2(subtotal),
    discount_total: round2(discount_total),
    taxable_total: round2(taxable_total),
    tax_total,
    tax_lines,
    gst_summary,
    round_off: round2(grand_total - exact),
    grand_total,
  };
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** First two digits of a GSTIN are the state code (33 = Tamil Nadu). */
export const gstinStateCode = (gstin: string | null | undefined) => {
  const g = (gstin ?? "").trim().toUpperCase();
  return GSTIN.test(g) ? g.slice(0, 2) : null;
};

/**
 * Place-of-supply rule of thumb: same state → CGST + SGST, different state → IGST.
 * Returns null when either GSTIN is missing/invalid (the user picks the tax type).
 */
export function suggestTaxMode(companyGstin: string, customerGstin: string): Exclude<TaxMode, "NONE"> | null {
  const a = gstinStateCode(companyGstin);
  const b = gstinStateCode(customerGstin);
  if (!a || !b) return null;
  return a === b ? "CGST_SGST" : "IGST";
}
