import { describe, expect, it } from "vitest";
import { amountInWords, computeTotals, formatINR, lineAmounts, unitLabel } from "./calc";
import type { QuotationItem } from "./types";

const item = (p: Partial<QuotationItem>): QuotationItem => ({
  id: "x", material_id: null, material_name: "M", description: "", hsn_code: "", quantity: 1, unit_id: null,
  unit_code: "MT", unit_name: "", rate: 0, discount_pct: 0, gst_rate: 0, gst_overridden: false, ...p,
});

describe("totals", () => {
  it("matches the spec example (Flyash 20 MT @2500 + P Sand Dry 10 M3 @1200, 18% GST)", () => {
    const t = computeTotals([item({ quantity: 20, rate: 2500, gst_rate: 18 }), item({ quantity: 10, rate: 1200, gst_rate: 18 })], "CGST_SGST");
    expect(t.subtotal).toBe(62000);
    expect(t.tax_total).toBe(11160);
    expect(t.grand_total).toBe(73160);
    expect(t.tax_lines).toEqual([
      { label: "CGST", rate: 9, amount: 5580 },
      { label: "SGST", rate: 9, amount: 5580 },
    ]);
  });

  it("groups IGST by rate and applies discounts before tax", () => {
    const t = computeTotals([item({ quantity: 3, rate: 100, discount_pct: 10, gst_rate: 5 }), item({ quantity: 1, rate: 1000, gst_rate: 18 })], "IGST", false);
    expect(t.discount_total).toBe(30);
    expect(t.taxable_total).toBe(1270);
    expect(t.tax_lines).toEqual([
      { label: "IGST", rate: 5, amount: 13.5 },
      { label: "IGST", rate: 18, amount: 180 },
    ]);
    expect(t.gst_summary).toEqual([
      { rate: 5, taxable: 270, cgst: 0, sgst: 0, igst: 13.5, tax: 13.5 },
      { rate: 18, taxable: 1000, cgst: 0, sgst: 0, igst: 180, tax: 180 },
    ]);
    expect(t.grand_total).toBe(1463.5);
    expect(t.round_off).toBe(0);
  });

  it("rounds the grand total and records the round-off", () => {
    const t = computeTotals([item({ quantity: 3, rate: 33.2, gst_rate: 5 })], "CGST_SGST");
    // 99.60 + CGST 2.49 + SGST 2.49 = 104.58 -> 105
    expect(t.grand_total).toBe(105);
    expect(t.round_off).toBe(0.42);
  });

  it("ignores GST when tax mode is NONE", () => {
    expect(computeTotals([item({ quantity: 2, rate: 50, gst_rate: 18 })], "NONE").grand_total).toBe(100);
  });

  it("treats invalid numbers as zero", () => {
    expect(lineAmounts(item({ quantity: NaN, rate: 10 })).total).toBe(0);
  });
});

describe("formatting", () => {
  it("formats rupees in Indian grouping", () => expect(formatINR(7316050.5)).toBe("₹73,16,050.50"));
  it("words: lakh / crore / paise", () => {
    expect(amountInWords(73160)).toBe("Indian Rupees Seventy Three Thousand One Hundred Sixty Only");
    expect(amountInWords(12345678.05)).toBe("Indian Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Five Paise Only");
    expect(amountInWords(0)).toBe("Indian Rupees Zero Only");
  });
  it("unit labels", () => {
    expect(unitLabel({ name: "Metric Tons", code: "MT" })).toBe("MT (Metric Tons)");
    expect(unitLabel({ name: "Unit", code: "UNIT" })).toBe("UNIT");
  });
});
