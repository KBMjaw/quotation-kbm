import { describe, expect, it } from "vitest";
import { emptyCompany } from "./defaults";
import { contentBounds } from "./logoFit";
import type { Company } from "./types";
import { headerLogoSize } from "./view";

const kipipl = {
  ...emptyCompany(),
  id: "k", created_at: "", updated_at: "",
  company_name: "Kannan Infra Projects India Private Limited",
  display_name: "KANNAN INFRA PROJECTS INDIA PRIVATE LIMITED",
  address_line1: "165/1, East Pudupalaym, M.Tholuvu, Chennimalai",
  city: "Erode", state: "Tamil Nadu", pincode: "638051",
  phone: "9842830590", website: "www.kipipl.com", gstin: "33AAJCK1677M1Z4",
} as Company;
const pdf = { rowWidth: 523.28, gap: 14, nameSize: 16, nameLineHeight: 1.2, lineHeight: 8.5 * 1.35 };

describe("header logo size", () => {
  it("matches the text block height for a square logo", () => {
    const { width, height } = headerLogoSize(kipipl, 1, pdf);
    // name (1–2 lines) + 5 detail lines ≈ 77–96pt
    expect(height).toBeGreaterThan(70);
    expect(height).toBeLessThan(100);
    expect(width).toBeCloseTo(height, 5);
  });
  it("gives a wide logo more width but never more than a third of the row", () => {
    const wide = headerLogoSize(kipipl, 2.4, pdf);
    expect(wide.width).toBeLessThanOrEqual(523.28 * 0.34 + 0.01);
    expect(wide.width / wide.height).toBeCloseTo(2.4, 5);
    expect(wide.height).toBeGreaterThan(55);
  });
  it("keeps a sensible size when a company has few details", () => {
    const bare = headerLogoSize({ ...kipipl, address_line1: "", city: "", state: "", pincode: "", phone: "", website: "", gstin: "" }, 1, pdf);
    expect(bare.height).toBeGreaterThanOrEqual(40);
  });
});

describe("logo trimming", () => {
  it("finds the artwork inside transparent and white margins", () => {
    const w = 10, h = 6, data = new Uint8ClampedArray(w * h * 4);
    const px = (x: number, y: number, rgba: number[]) => data.set(rgba, (y * w + x) * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x, y, [255, 255, 255, 255]); // white background
    px(2, 1, [230, 120, 20, 255]);
    px(7, 4, [20, 20, 20, 255]);
    expect(contentBounds(data, w, h)).toEqual({ left: 2, top: 1, width: 6, height: 4 });
    expect(contentBounds(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull();
  });
});
