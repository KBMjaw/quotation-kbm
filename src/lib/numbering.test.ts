import { describe, expect, it } from "vitest";
import { financialYear, formatQuotationNumber } from "./numbering";

describe("quotation numbers", () => {
  it("uses the company prefix", () => {
    expect(formatQuotationNumber("{PREFIX}-QTN-{SEQ}", "KBM", 1, 4, "2026-09-29")).toBe("KBM-QTN-0001");
    expect(formatQuotationNumber("{PREFIX}-QTN-{SEQ}", "krmc", 25, 4, "2026-09-29")).toBe("KRMC-QTN-0025");
  });
  it("supports date and financial-year tokens", () => {
    expect(formatQuotationNumber("{PREFIX}/{FY}/{SEQ}", "KIPIPL", 7, 3, "2027-02-01")).toBe("KIPIPL/26-27/007");
    expect(formatQuotationNumber("{PREFIX}-{YYYY}{MM}-{SEQ}", "KBM", 12, 2, "2026-09-29")).toBe("KBM-202609-12");
  });
  it("financial year boundaries", () => {
    expect(financialYear("2026-03-31")).toBe("25-26");
    expect(financialYear("2026-04-01")).toBe("26-27");
  });
});
