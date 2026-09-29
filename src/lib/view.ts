import { computeTotals } from "./calc";
import type { Company, Customer, QuotationItem, QuotationSettings, TaxMode, Totals } from "./types";

/** Everything needed to render a quotation (HTML preview and PDF share this). */
export interface QuotationView {
  /** Logo width ÷ height, measured when rendering the PDF (lets wide logos use more width) */
  logo_aspect?: number | null;
  quotation_no: string;
  is_draft_number: boolean;
  quotation_date: string;
  valid_until: string | null;
  reference: string;
  subject: string;
  customer: Customer;
  items: QuotationItem[];
  tax_mode: TaxMode;
  terms_conditions: string;
  notes: string;
  totals: Totals;
  company: Company;
  settings: QuotationSettings;
}

export function buildView(args: {
  quotation_no: string | null;
  previewNumber?: string;
  quotation_date: string;
  valid_until: string | null;
  reference: string;
  subject: string;
  customer: Customer;
  items: QuotationItem[];
  tax_mode: TaxMode;
  terms_conditions: string;
  notes: string;
  company: Company;
  settings: QuotationSettings;
}): QuotationView {
  return {
    ...args,
    quotation_no: args.quotation_no ?? args.previewNumber ?? "DRAFT",
    is_draft_number: !args.quotation_no,
    totals: computeTotals(args.items, args.tax_mode, args.settings.round_off_total),
  };
}

export function companyAddressLines(c: Company): string[] {
  const cityLine = [c.city, c.district].filter(Boolean).join(", ");
  const stateLine = [c.state, c.pincode].filter(Boolean).join(" - ");
  return [
    [c.address_line1, c.address_line2].filter(Boolean).join(", "),
    [c.area, cityLine].filter(Boolean).join(", "),
    stateLine,
  ].filter(Boolean);
}

export function companyContactLine(c: Company): string {
  return [c.phone && `Ph: ${c.phone}`, c.email && `Email: ${c.email}`, c.website].filter(Boolean).join("  |  ");
}

export function companyTaxLine(c: Company): string {
  return [c.gstin && `GSTIN: ${c.gstin}`, c.pan && `PAN: ${c.pan}`].filter(Boolean).join("  |  ");
}

export const companyTitle = (c: Company) => (c.display_name || c.company_name).trim();

/** Short monogram used when a company has no logo */
export const monogram = (c: Company) =>
  (c.quotation_prefix ||
    c.company_name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
  )
    .toUpperCase()
    .slice(0, 6);

export const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);

export const termsFor = (v: Pick<QuotationView, "terms_conditions" | "company" | "settings">) =>
  v.terms_conditions.trim() || v.company.terms_conditions.trim() || v.settings.default_terms.trim();

export const footerFor = (v: Pick<QuotationView, "company" | "settings">) =>
  v.company.footer_text.trim() || v.settings.default_footer.trim();

export const hasBankDetails = (c: Company) => Object.values(c.bank_details ?? {}).some((x) => String(x).trim());

/** Number of small text lines under the company name in the header. */
export function companyDetailLines(c: Company): number {
  const title = companyTitle(c);
  const legal = c.company_name.trim();
  return (
    companyAddressLines(c).length +
    (companyContactLine(c) ? 1 : 0) +
    (companyTaxLine(c) ? 1 : 0) +
    (c.additional_info.trim() ? 1 : 0) +
    (legal && legal.toLowerCase() !== title.toLowerCase() ? 1 : 0)
  );
}

/**
 * Sizes the header logo to the height of the company text block beside it.
 * The width follows the logo's aspect ratio (wide logos get more room), capped at `maxWidthShare` of the row.
 * Units are whatever the caller uses (pt for the PDF).
 */
export function headerLogoSize(
  c: Company,
  aspect: number | null | undefined,
  o: { rowWidth: number; gap: number; nameSize: number; nameLineHeight: number; lineHeight: number; maxWidthShare?: number },
): { width: number; height: number } {
  const title = companyTitle(c);
  const ratio = aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const maxW = o.rowWidth * (o.maxWidthShare ?? 0.34);
  const details = companyDetailLines(c) * o.lineHeight;
  let width = Math.min(maxW, 70 * ratio);
  let blockH = 0;
  // Two passes: the logo width changes how the name wraps, which changes the block height.
  for (let pass = 0; pass < 2; pass++) {
    const textW = o.rowWidth - width - o.gap;
    const charsPerLine = Math.max(8, textW / (o.nameSize * 0.64)); // bold caps ≈ 0.64em each
    const nameLines = Math.max(1, Math.ceil(title.length / charsPerLine));
    blockH = Math.max(40, nameLines * o.nameSize * o.nameLineHeight + details);
    width = Math.min(maxW, blockH * ratio);
  }
  return { width, height: Math.min(blockH, width / ratio) };
}
