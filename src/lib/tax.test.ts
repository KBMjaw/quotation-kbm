import { describe, expect, it } from "vitest";
import { computeTotals, lineAmounts, materialGstRate, suggestTaxMode } from "./tax";

const line = (quantity: number, rate: number, gst_rate: number, discount_pct = 0) => ({ quantity, rate, gst_rate, discount_pct });

describe("product-level GST", () => {
  // Spec acceptance: Cement 10 × ₹500 @18% + P Sand Dry 10 × ₹1,200 @5%
  const items = [line(10, 500, 18), line(10, 1200, 5)];

  it("calculates GST per line", () => {
    expect(lineAmounts(items[0], "CGST_SGST")).toMatchObject({ taxable: 5000, cgst: 450, sgst: 450, tax: 900, total: 5900 });
    expect(lineAmounts(items[1], "CGST_SGST")).toMatchObject({ taxable: 12000, cgst: 300, sgst: 300, tax: 600, total: 12600 });
    expect(lineAmounts(items[0], "IGST")).toMatchObject({ igst: 900, cgst: 0, tax: 900 });
  });

  it("totals 17,000 taxable + 1,500 GST = 18,500 with a summary per rate", () => {
    const t = computeTotals(items, "CGST_SGST");
    expect(t.taxable_total).toBe(17000);
    expect(t.tax_total).toBe(1500);
    expect(t.grand_total).toBe(18500);
    expect(t.gst_summary).toEqual([
      { rate: 5, taxable: 12000, cgst: 300, sgst: 300, igst: 0, tax: 600 },
      { rate: 18, taxable: 5000, cgst: 450, sgst: 450, igst: 0, tax: 900 },
    ]);
    expect(t.tax_lines.map((x) => `${x.label}@${x.rate}=${x.amount}`)).toEqual([
      "CGST@2.5=300", "SGST@2.5=300", "CGST@9=450", "SGST@9=450",
    ]);
  });

  it("reported scenario: P Sand Dry 25,000 @5% + Flyash 6,000 @18% = 33,330", () => {
    const t = computeTotals([line(10, 2500, 5), line(2, 3000, 18)], "CGST_SGST");
    expect(t.taxable_total).toBe(31000);
    expect(t.gst_summary).toEqual([
      { rate: 5, taxable: 25000, cgst: 625, sgst: 625, igst: 0, tax: 1250 },
      { rate: 18, taxable: 6000, cgst: 540, sgst: 540, igst: 0, tax: 1080 },
    ]);
    expect(t.tax_total).toBe(2330);
    expect(t.grand_total).toBe(33330);
  });

  it("IGST for inter-state supply", () => {
    const t = computeTotals(items, "IGST");
    expect(t.tax_lines).toEqual([
      { label: "IGST", rate: 5, amount: 600 },
      { label: "IGST", rate: 18, amount: 900 },
    ]);
    expect(t.grand_total).toBe(18500);
  });

  it("line GST always reconciles with the summary (paise rounding per line)", () => {
    const odd = [line(3, 33.33, 5), line(7, 11.11, 5), line(1, 0.99, 18)];
    const t = computeTotals(odd, "CGST_SGST", false);
    const lineTax = odd.reduce((s, i) => s + lineAmounts(i, "CGST_SGST").tax, 0);
    expect(t.tax_total).toBeCloseTo(lineTax, 2);
    expect(t.gst_summary.reduce((s, r) => s + r.cgst + r.sgst, 0)).toBeCloseTo(t.tax_total, 2);
  });

  it("supports custom rates and exempt materials", () => {
    expect(computeTotals([line(1, 1000, 7.5)], "IGST", false).tax_total).toBe(75);
    expect(materialGstRate({ gst_rate: 18, tax_type: "EXEMPT" })).toBe(0);
    expect(materialGstRate({ gst_rate: 12, tax_type: "GST" })).toBe(12);
  });

  it("suggests CGST+SGST within a state and IGST across states from GSTINs", () => {
    expect(suggestTaxMode("33ACCPC2634C1ZI", "33AAJCK1677M1Z4")).toBe("CGST_SGST");
    expect(suggestTaxMode("33ACCPC2634C1ZI", "29AAJCK1677M1Z4")).toBe("IGST");
    expect(suggestTaxMode("", "29AAJCK1677M1Z4")).toBeNull();
  });
});
